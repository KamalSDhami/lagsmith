//! Deletes the contents of one cache folder, defensively.
//!
//! - Every folder, from the root down, is opened with FILE_FLAG_OPEN_REPARSE_POINT and classified from
//!   that handle, never from the enumeration record or the path. Its contents are listed from the handle.
//! - Folder handles are held without FILE_SHARE_DELETE while their children are processed, so no folder
//!   on the current path can be renamed or swapped for a junction mid-walk.
//! - A link (junction, symlink, any reparse point) is deleted as the link itself, never followed.
//! - Files in use are skipped and counted. The root folder itself is never deleted.

use crate::scan::wide;
use std::path::Path;
use windows::Win32::Foundation::{CloseHandle, ERROR_NO_MORE_FILES, HANDLE};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, DELETE, FILE_ATTRIBUTE_DIRECTORY, FILE_ATTRIBUTE_REPARSE_POINT, FILE_ATTRIBUTE_TAG_INFO, FILE_BASIC_INFO,
    FILE_DISPOSITION_FLAG_DELETE, FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE, FILE_DISPOSITION_FLAG_POSIX_SEMANTICS,
    FILE_DISPOSITION_INFO_EX, FILE_FLAG_BACKUP_SEMANTICS, FILE_FLAG_OPEN_REPARSE_POINT, FILE_ID_BOTH_DIR_INFO,
    FILE_LIST_DIRECTORY, FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_MODE, FILE_SHARE_READ, FILE_SHARE_WRITE,
    FILE_STANDARD_INFO, FileAttributeTagInfo, FileBasicInfo, FileDispositionInfoEx, FileIdBothDirectoryInfo,
    FileIdBothDirectoryRestartInfo, FileStandardInfo, GetFileInformationByHandleEx, OPEN_EXISTING,
    SetFileInformationByHandle, SYNCHRONIZE,
};
use windows::Win32::System::SystemInformation::GetSystemTimeAsFileTime;
use windows::core::PCWSTR;

pub(crate) struct Options {
    /// Skip anything created or modified more recently than this (100 ns FILETIME units).
    pub min_age: Option<i64>,
    /// Skip entries whose name contains any of these (lowercase).
    pub skip_names: &'static [&'static str],
    /// Skip files with more than one hard link: deleting them frees nothing (uv's cache).
    pub skip_hard_links: bool,
}

pub(crate) const DAY: i64 = 24 * 3600 * 10_000_000;

#[derive(Default, Debug)]
pub(crate) struct Stats {
    pub freed_bytes: u64,
    pub deleted: u64,
    pub in_use: u64,
    pub kept: u64, // recent, hard-linked, skipped by name, or a non-empty folder
}

struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.0) };
    }
}

pub(crate) fn clean(root: &Path, opts: &Options) -> Result<Stats, String> {
    let dir = open(root, false).map_err(|e| format!("Couldn't open {}: {e}", root.display()))?;
    let tag = info::<FILE_ATTRIBUTE_TAG_INFO>(&dir, FileAttributeTagInfo).ok_or("Couldn't read the folder's attributes")?;
    if tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0 {
        return Err(format!("{} is a link to somewhere else, so it was left alone", root.display()));
    }
    if tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY.0 == 0 {
        return Err(format!("{} isn't a folder", root.display()));
    }
    let now = unsafe { GetSystemTimeAsFileTime() };
    let now = ((now.dwHighDateTime as i64) << 32) | now.dwLowDateTime as i64;
    let mut stats = Stats::default();
    walk(&dir, root, opts, now, &mut stats);
    Ok(stats)
}

fn walk(dir: &Handle, path: &Path, opts: &Options, now: i64, stats: &mut Stats) {
    for (name, listed_as_dir) in list(dir) {
        let lower = name.to_lowercase();
        if opts.skip_names.iter().any(|s| lower.contains(s)) {
            stats.kept += 1;
            continue;
        }
        let child_path = path.join(&name);
        // Folders are pinned (no share-delete) while we're inside them; files allow it so
        // deleting them doesn't conflict with other readers.
        let Ok(child) = open(&child_path, !listed_as_dir) else {
            stats.in_use += 1;
            continue;
        };
        let (Some(tag), Some(basic)) =
            (info::<FILE_ATTRIBUTE_TAG_INFO>(&child, FileAttributeTagInfo), info::<FILE_BASIC_INFO>(&child, FileBasicInfo))
        else {
            stats.in_use += 1;
            continue;
        };
        if opts.min_age.is_some_and(|age| now - basic.CreationTime.max(basic.LastWriteTime) < age) {
            stats.kept += 1;
            continue;
        }
        let is_link = tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0;
        let is_dir = tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY.0 != 0;
        if is_link {
            // Removes the link itself; the handle was opened with FILE_FLAG_OPEN_REPARSE_POINT.
            if delete(&child) { stats.deleted += 1 } else { stats.in_use += 1 }
        } else if is_dir {
            if !listed_as_dir {
                stats.kept += 1; // changed type since it was listed; leave it
                continue;
            }
            walk(&child, &child_path, opts, now, stats);
            // Succeeds only if it's now empty.
            if delete(&child) { stats.deleted += 1 } else { stats.kept += 1 }
        } else {
            let Some(std_info) = info::<FILE_STANDARD_INFO>(&child, FileStandardInfo) else {
                stats.in_use += 1;
                continue;
            };
            if opts.skip_hard_links && std_info.NumberOfLinks > 1 {
                stats.kept += 1;
                continue;
            }
            if delete(&child) {
                stats.deleted += 1;
                stats.freed_bytes += std_info.EndOfFile.max(0) as u64;
            } else {
                stats.in_use += 1;
            }
        }
    }
}

fn open(path: &Path, share_delete: bool) -> windows::core::Result<Handle> {
    let w = wide(&path.to_string_lossy());
    let share: FILE_SHARE_MODE = if share_delete { FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE } else { FILE_SHARE_READ | FILE_SHARE_WRITE };
    let access = (FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | DELETE | SYNCHRONIZE).0;
    let h = unsafe {
        CreateFileW(PCWSTR(w.as_ptr()), access, share, None, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, None)
    }?;
    Ok(Handle(h))
}

fn info<T: Default>(h: &Handle, class: windows::Win32::Storage::FileSystem::FILE_INFO_BY_HANDLE_CLASS) -> Option<T> {
    let mut v = T::default();
    unsafe { GetFileInformationByHandleEx(h.0, class, (&raw mut v).cast(), size_of::<T>() as u32) }.ok()?;
    Some(v)
}

fn delete(h: &Handle) -> bool {
    // POSIX semantics: the name disappears at once, so the parent can be removed right after.
    let flags = FILE_DISPOSITION_FLAG_DELETE.0 | FILE_DISPOSITION_FLAG_POSIX_SEMANTICS.0 | FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE.0;
    let d = FILE_DISPOSITION_INFO_EX { Flags: windows::Win32::Storage::FileSystem::FILE_DISPOSITION_INFO_EX_FLAGS(flags) };
    unsafe { SetFileInformationByHandle(h.0, FileDispositionInfoEx, (&raw const d).cast(), size_of::<FILE_DISPOSITION_INFO_EX>() as u32) }.is_ok()
}

/// Names in a folder, read from its handle. The bool is "listed as a folder" (a hint only).
fn list(dir: &Handle) -> Vec<(String, bool)> {
    let mut out = Vec::new();
    let mut buf = vec![0u64; 8192]; // 64 KB, 8-byte aligned
    let mut class = FileIdBothDirectoryRestartInfo;
    loop {
        let r = unsafe { GetFileInformationByHandleEx(dir.0, class, buf.as_mut_ptr().cast(), (buf.len() * 8) as u32) };
        class = FileIdBothDirectoryInfo;
        if let Err(e) = r {
            if e.code() != ERROR_NO_MORE_FILES.to_hresult() {
                // Unreadable folder: treat as empty.
            }
            break;
        }
        let base = buf.as_ptr().cast::<u8>();
        let mut offset = 0usize;
        loop {
            // SAFETY: the API fills `buf` with a chain of FILE_ID_BOTH_DIR_INFO records linked by NextEntryOffset.
            let rec = unsafe { &*base.add(offset).cast::<FILE_ID_BOTH_DIR_INFO>() };
            let name_ptr = unsafe { base.add(offset + std::mem::offset_of!(FILE_ID_BOTH_DIR_INFO, FileName)).cast::<u16>() };
            let name = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(name_ptr, rec.FileNameLength as usize / 2) });
            if name != "." && name != ".." {
                out.push((name, rec.FileAttributes & FILE_ATTRIBUTE_DIRECTORY.0 != 0));
            }
            if rec.NextEntryOffset == 0 {
                break;
            }
            offset += rec.NextEntryOffset as usize;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::windows::fs::MetadataExt;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime};

    const NONE: Options = Options { min_age: None, skip_names: &[], skip_hard_links: false };

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let nanos = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).map_or(0, |d| d.as_nanos());
            let p = std::env::temp_dir().join(format!("lagsmith-test-{tag}-{nanos}"));
            fs::create_dir_all(&p).expect("create temp dir");
            TempDir(p)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// Creates a directory junction at `link` pointing at `target`, through FSCTL_SET_REPARSE_POINT.
    fn junction(link: &Path, target: &Path) {
        use windows::Win32::Storage::FileSystem::{FILE_FLAG_BACKUP_SEMANTICS, FILE_GENERIC_WRITE};
        use windows::Win32::System::IO::DeviceIoControl;
        fs::create_dir(link).expect("create link dir");
        let sub: Vec<u16> = format!(r"\??\{}", target.display()).encode_utf16().collect();
        let print: Vec<u16> = target.display().to_string().encode_utf16().collect();
        let mut path_buf: Vec<u16> = sub.iter().copied().chain([0]).chain(print.iter().copied()).chain([0]).collect();
        let data_len = 8 + path_buf.len() * 2;
        let mut buf: Vec<u8> = Vec::new();
        buf.extend_from_slice(&0xA000_0003u32.to_le_bytes()); // IO_REPARSE_TAG_MOUNT_POINT
        buf.extend_from_slice(&(data_len as u16).to_le_bytes());
        buf.extend_from_slice(&0u16.to_le_bytes());
        for v in [0u16, (sub.len() * 2) as u16, ((sub.len() + 1) * 2) as u16, (print.len() * 2) as u16] {
            buf.extend_from_slice(&v.to_le_bytes());
        }
        buf.extend(path_buf.drain(..).flat_map(u16::to_le_bytes));
        let w = wide(&link.to_string_lossy());
        let h = unsafe {
            CreateFileW(PCWSTR(w.as_ptr()), FILE_GENERIC_WRITE.0, FILE_SHARE_READ, None, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, None)
        }
        .expect("open link dir");
        let h = Handle(h);
        unsafe { DeviceIoControl(h.0, 0x0009_00A4, Some(buf.as_ptr().cast()), buf.len() as u32, None, 0, None, None) }.expect("set junction");
    }

    fn is_reparse(p: &Path) -> bool {
        fs::symlink_metadata(p).is_ok_and(|m| m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT.0 != 0)
    }

    #[test]
    fn cleans_tree_but_never_follows_a_junction() {
        let t = TempDir::new("clean");
        let root = t.0.join("cache");
        let keep = t.0.join("sibling");
        fs::create_dir_all(root.join(r"a\b\c")).expect("tree");
        fs::create_dir_all(&keep).expect("sibling");
        fs::write(keep.join("precious.txt"), b"keep me").expect("write");
        fs::write(root.join(r"a\b\c\deep.bin"), vec![7u8; 1000]).expect("write");
        fs::write(root.join("top.txt"), b"12345").expect("write");
        let ro = root.join("readonly.txt");
        fs::write(&ro, b"ro").expect("write");
        let mut perms = fs::metadata(&ro).expect("meta").permissions();
        perms.set_readonly(true);
        fs::set_permissions(&ro, perms).expect("readonly");
        junction(&root.join("link"), &keep);
        assert!(is_reparse(&root.join("link")), "the test junction must really be a reparse point");
        assert!(root.join(r"link\precious.txt").exists(), "junction must resolve before cleaning");

        let stats = clean(&root, &NONE).expect("clean");

        assert!(keep.join("precious.txt").exists(), "file behind the junction must survive");
        assert!(root.is_dir(), "root must survive");
        assert_eq!(fs::read_dir(&root).expect("read root").count(), 0, "root must be empty");
        assert_eq!(stats.freed_bytes, 1000 + 5 + 2);
        assert_eq!(stats.in_use, 0);
    }

    #[test]
    fn refuses_a_root_that_is_a_junction() {
        let t = TempDir::new("rootlink");
        let target = t.0.join("real");
        fs::create_dir_all(&target).expect("target");
        fs::write(target.join("x.txt"), b"x").expect("write");
        let root = t.0.join("cache");
        junction(&root, &target);
        assert!(is_reparse(&root));
        assert!(clean(&root, &NONE).is_err());
        assert!(target.join("x.txt").exists());
    }

    fn age(p: &Path, days: u64) {
        use std::os::windows::fs::FileTimesExt;
        let t = SystemTime::now() - Duration::from_secs(days * 24 * 3600);
        let times = fs::FileTimes::new().set_modified(t).set_created(t);
        fs::File::options().write(true).open(p).expect("open").set_times(times).expect("age");
    }

    #[test]
    fn skips_recent_files_named_folders_and_locked_files() {
        use std::os::windows::fs::OpenOptionsExt;
        let t = TempDir::new("temp");
        let root = t.0.join("Temp");
        fs::create_dir_all(root.join("claude-work")).expect("dir");
        fs::write(root.join(r"claude-work\old.txt"), b"x").expect("write");
        age(&root.join(r"claude-work\old.txt"), 3);
        let old = root.join("old.txt");
        fs::write(&old, b"old").expect("write");
        age(&old, 3);
        let modified_recently = root.join("new.txt");
        fs::write(&modified_recently, b"new").expect("write");
        let locked = root.join("locked.txt");
        fs::write(&locked, b"lock").expect("write");
        age(&locked, 3);
        // Held without FILE_SHARE_DELETE, like a program using its file.
        let _hold = fs::File::options().read(true).share_mode(FILE_SHARE_READ.0).open(&locked).expect("lock");

        let opts = Options { min_age: Some(DAY), skip_names: &["claude", "lagsmith"], skip_hard_links: false };
        let stats = clean(&root, &opts).expect("clean");

        assert!(!old.exists(), "old file is deleted");
        assert!(modified_recently.exists(), "recent file is kept");
        assert!(root.join(r"claude-work\old.txt").exists(), "named folder is kept");
        assert!(locked.exists(), "locked file is kept");
        assert_eq!((stats.in_use, stats.freed_bytes), (1, 3));
    }

    #[test]
    fn skips_hard_linked_files() {
        let t = TempDir::new("uv");
        let root = t.0.join("cache");
        fs::create_dir_all(&root).expect("dir");
        fs::write(t.0.join("original.bin"), b"shared").expect("write");
        fs::hard_link(t.0.join("original.bin"), root.join("linked.bin")).expect("hard link");
        let opts = Options { min_age: None, skip_names: &[], skip_hard_links: true };
        let stats = clean(&root, &opts).expect("clean");
        assert!(root.join("linked.bin").exists());
        assert_eq!(stats.freed_bytes, 0);
    }
}
