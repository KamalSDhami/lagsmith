use super::{utf16_to_string, wide};
use crate::model::*;
use std::fs;
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};
use windows::Win32::Storage::FileSystem::{GetDiskFreeSpaceExW, GetDriveTypeW, GetLogicalDrives, GetLongPathNameW};
use windows::Win32::UI::Shell::{FOLDERID_LocalAppData, FOLDERID_Profile, FOLDERID_Windows};
use windows::core::{GUID, PCWSTR};

const DRIVE_FIXED: u32 = 3;
const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;

// (id, name, known folder, sub path, group). Measuring and cleaning both resolve roots through
// `cache_root`, from known folders rather than environment variables.
pub(crate) const CACHES: [(&str, &str, &GUID, &str, CacheGroup); 8] = [
    ("npm", "npm cache", &FOLDERID_LocalAppData, "npm-cache", CacheGroup::DevCache),
    ("gradle", "Gradle caches", &FOLDERID_Profile, r".gradle\caches", CacheGroup::DevCache),
    ("uv", "uv package cache", &FOLDERID_LocalAppData, r"uv\cache", CacheGroup::DevCache),
    ("dart", "Dart analysis server", &FOLDERID_LocalAppData, ".dartServer", CacheGroup::DevCache),
    ("pip", "pip cache", &FOLDERID_LocalAppData, r"pip\cache", CacheGroup::DevCache),
    ("cargo", "Cargo registry cache", &FOLDERID_Profile, r".cargo\registry\cache", CacheGroup::DevCache),
    ("wu", "Windows Update downloads", &FOLDERID_Windows, r"SoftwareDistribution\Download", CacheGroup::SystemTemp),
    ("temp", "Your temp folder", &FOLDERID_LocalAppData, "Temp", CacheGroup::SystemTemp),
];

/// The allow-listed cache's folder, or None for an id that isn't on the list.
pub(crate) fn cache_root(id: &str) -> Option<PathBuf> {
    let (_, _, base, sub, _) = CACHES.iter().find(|c| c.0 == id)?;
    Some(long_path(&super::known_folder(base)?.join(sub)))
}

pub fn read() -> Result<Storage, String> {
    Ok(Storage { drives: drives()? })
}

fn drives() -> Result<Vec<Drive>, String> {
    let windir = std::env::var("WINDIR").or_else(|_| std::env::var("SystemRoot")).unwrap_or_default();
    let system = windir.get(..2).unwrap_or("C:").to_ascii_uppercase();
    let mask = unsafe { GetLogicalDrives() };
    if mask == 0 {
        return Err("Couldn't list drives".into());
    }
    let mut out = Vec::new();
    for i in 0..26u8 {
        if mask & (1 << i) == 0 {
            continue;
        }
        let letter = format!("{}:", (b'A' + i) as char);
        let root = wide(&format!("{letter}\\"));
        if unsafe { GetDriveTypeW(PCWSTR(root.as_ptr())) } != DRIVE_FIXED {
            continue;
        }
        let (mut total, mut free) = (0u64, 0u64);
        if unsafe { GetDiskFreeSpaceExW(PCWSTR(root.as_ptr()), None, Some(&mut total), Some(&mut free)) }.is_err() {
            continue;
        }
        out.push(Drive { is_system: letter == system, letter, total_bytes: total, free_bytes: free });
    }
    Ok(out)
}

pub fn caches() -> Result<Vec<CacheItem>, String> {
    let profile = super::known_folder(&FOLDERID_Profile).map(|p| long_path(&p)).unwrap_or_default();
    let found: Vec<_> = CACHES
        .iter()
        .filter_map(|&(id, name, _, _, group)| {
            let path = cache_root(id)?;
            // A cache that is itself a junction or symlink points somewhere else; leave it out.
            let meta = fs::symlink_metadata(&path).ok()?;
            (meta.is_dir() && meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0)
                .then_some((id, name, group, path))
        })
        .collect();

    std::thread::scope(|s| {
        let handles: Vec<_> = found
            .iter()
            .map(|(id, name, group, path)| {
                let profile = &profile;
                s.spawn(move || CacheItem {
                    id: id.to_string(),
                    name: name.to_string(),
                    display_path: display_path(path, profile),
                    bytes: folder_size(path),
                    group: *group,
                })
            })
            .collect();
        handles.into_iter().map(|h| h.join().map_err(|_| "Measuring a cache folder crashed".to_string())).collect()
    })
}

/// Expands 8.3 short names (e.g. `KAMALS~1` in %TEMP%) so the profile prefix matches.
pub(crate) fn long_path(p: &Path) -> PathBuf {
    let w = wide(&p.to_string_lossy());
    let mut buf = vec![0u16; 1024];
    let n = unsafe { GetLongPathNameW(PCWSTR(w.as_ptr()), Some(&mut buf)) } as usize;
    if n == 0 || n >= buf.len() {
        return p.to_path_buf();
    }
    PathBuf::from(utf16_to_string(&buf[..n]))
}

pub(crate) fn display_path(path: &Path, profile: &Path) -> String {
    let p = path.to_string_lossy().trim_end_matches('\\').to_string();
    let prof = profile.to_string_lossy().trim_end_matches('\\').to_string();
    if !prof.is_empty()
        && let (Some(head), Some(rest)) = (p.get(..prof.len()), p.get(prof.len()..))
        && head.eq_ignore_ascii_case(&prof)
        && (rest.is_empty() || rest.starts_with('\\'))
    {
        return format!("~{rest}");
    }
    p
}

/// Sums file sizes without ever following reparse points; unreadable entries are skipped.
pub(crate) fn folder_size(root: &Path) -> u64 {
    let mut total = 0;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            // DirEntry::metadata doesn't follow links on Windows.
            let Ok(meta) = entry.metadata() else { continue };
            if meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                continue;
            }
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_path_shortens_profile() {
        let prof = Path::new(r"C:\Users\Kamal");
        assert_eq!(display_path(Path::new(r"c:\users\kamal\AppData\Local\npm-cache"), prof), r"~\AppData\Local\npm-cache");
        assert_eq!(display_path(Path::new(r"C:\Users\Kamala\x"), prof), r"C:\Users\Kamala\x");
        assert_eq!(display_path(Path::new(r"C:\WINDOWS\SoftwareDistribution\Download"), prof), r"C:\WINDOWS\SoftwareDistribution\Download");
    }
}
