//! C8: move a WSL distro's disk to another drive with `wsl.exe --manage <distro> --move <folder>`
//! (WSL 2.3 or newer). `wsl.exe` is run by its full System32 path, with a fixed argument shape and no
//! shell. The distro must be one the WSL scan lists, and the folder must be an absolute path on a
//! different local fixed drive with enough free space, empty or newly created. Game and anti-cheat
//! folders are refused on both ends. Undo moves the disk back to where it was.

use super::item;
use crate::model::*;
use crate::scan::{storage, system};
use std::path::{Path, PathBuf};
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};

const LXSS: &str = r"Software\Microsoft\Windows\CurrentVersion\Lxss";
const MIN_VERSION: (u32, u32) = (2, 3);
/// Free space needed beyond the disk's own size (the move copies first, then deletes).
const SLACK: u64 = 1 << 30;
const MAX_PATH_LEN: usize = 200;

/// Folder names (matched anywhere in the path, case-insensitive) that are never a source or target.
const NEVER: &[&str] = &[
    "riot", "vanguard", "valorant", "anticheat", "anti-cheat", "battleye", "beservice", "faceit", "league of legends",
    "steamapps", "epic games", "windowsapps", "program files", "programdata",
];
const RESERVED: &[&str] = &["con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "lpt1", "lpt2", "lpt3"];

// ---------- Pure checks (unit-tested)

/// "WSL version: 2.3.26.0" (decoded output of `wsl --version`) -> (2, 3, 26).
pub(crate) fn parse_version(text: &str) -> Option<(u32, u32, u32)> {
    let line = text.lines().find(|l| l.chars().any(|c| c.is_ascii_digit()))?;
    let token = line.split(|c: char| !(c.is_ascii_digit() || c == '.')).find(|t| t.matches('.').count() >= 2)?;
    let mut n = token.split('.').map(|p| p.parse::<u32>().ok());
    Some((n.next()??, n.next()??, n.next().flatten().unwrap_or(0)))
}

pub(crate) fn version_supported(v: (u32, u32, u32)) -> bool {
    (v.0, v.1) >= MIN_VERSION
}

const UPDATE_MESSAGE: &str =
    "Moving a WSL distro needs WSL 2.3 or newer. Update it with \"wsl --update\" in a terminal, then try again. Nothing was changed.";

/// `wsl.exe` writes UTF-16LE when piped; fall back to UTF-8.
pub(crate) fn decode(bytes: &[u8]) -> String {
    let nuls = bytes.iter().skip(1).step_by(2).filter(|b| **b == 0).count();
    let s = if bytes.len() >= 2 && nuls * 2 >= bytes.len() / 2 {
        let u: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&u)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    };
    s.trim_start_matches('\u{feff}').to_string()
}

/// The name must be one the WSL scan listed. Exact match; never something that could read as an option.
pub(crate) fn valid_distro<'a>(name: &str, known: &'a [String]) -> Result<&'a str, String> {
    let err = || "That isn't a WSL distro Lagsmith found".to_string();
    if name.is_empty() || name.starts_with('-') || name.chars().any(|c| c.is_control()) {
        return Err(err());
    }
    known.iter().find(|k| k.as_str() == name).map(String::as_str).ok_or_else(err)
}

/// "D:\WSL\Ubuntu" -> ("D:", ["WSL", "Ubuntu"]). Absolute drive-letter paths only: no UNC, no `\\?\`,
/// no relative parts, no odd characters.
pub(crate) fn split_path(raw: &str) -> Result<(String, Vec<String>), String> {
    let bad = |m: &str| Err(format!("{m}. Use a full path like D:\\WSL\\Ubuntu"));
    let p = raw.trim();
    let p = p.strip_suffix('\\').unwrap_or(p); // one trailing backslash is fine
    if p.len() > MAX_PATH_LEN {
        return bad("That path is too long");
    }
    let b = p.as_bytes();
    if b.len() < 4 || !b[0].is_ascii_alphabetic() || b[1] != b':' || b[2] != b'\\' {
        return bad("The folder must be an absolute path on a drive");
    }
    let drive = format!("{}:", (b[0] as char).to_ascii_uppercase());
    let mut parts = Vec::new();
    for part in p[3..].split('\\') {
        if part.is_empty() {
            return bad("The folder path has an empty part");
        }
        if part == "." || part == ".." || part.ends_with('.') || part.ends_with(' ') || part.starts_with(' ') {
            return bad("The folder path has a part Windows doesn't allow");
        }
        if part.chars().any(|c| c.is_control() || "<>:\"/|?*".contains(c)) {
            return bad("The folder path has a character Windows doesn't allow");
        }
        let stem = part.split('.').next().unwrap_or("").to_ascii_lowercase();
        if RESERVED.contains(&stem.as_str()) {
            return bad("The folder path has a reserved Windows name");
        }
        parts.push(part.to_string());
    }
    if parts.is_empty() {
        return bad("Choose a folder, not the whole drive");
    }
    Ok((drive, parts))
}

pub(crate) fn never_touch(path: &str) -> bool {
    let l = path.to_ascii_lowercase();
    NEVER.iter().any(|n| l.contains(n)) || l.contains(r":\windows")
}

pub(crate) struct Target {
    pub drive: String,
    pub path: PathBuf,
}

/// Everything about the target that needs no disk access.
pub(crate) fn check_target(raw: &str, source_dir: &str) -> Result<Target, String> {
    let (drive, parts) = split_path(raw)?;
    let path = format!("{drive}\\{}", parts.join("\\"));
    if never_touch(&path) {
        return Err("Lagsmith never moves WSL into game, anti-cheat, Windows or Program Files folders".into());
    }
    if never_touch(source_dir) {
        return Err("Lagsmith never touches game or anti-cheat folders".into());
    }
    let src_drive = source_dir.get(..2).unwrap_or("").to_ascii_uppercase();
    if src_drive == drive {
        return Err(format!("Choose a folder on a different drive than {src_drive}"));
    }
    Ok(Target { drive, path: PathBuf::from(path) })
}

pub(crate) fn check_space(free: u64, disk_bytes: u64) -> Result<(), String> {
    let need = disk_bytes.saturating_add(SLACK);
    if free < need {
        return Err(format!(
            "That drive has {:.1} GB free; the move needs about {:.1} GB (the disk plus 1 GB to work with)",
            free as f64 / (1u64 << 30) as f64,
            need as f64 / (1u64 << 30) as f64
        ));
    }
    Ok(())
}

/// The folder may exist only if it is an empty, ordinary directory; no existing parent may be a link or a file.
fn check_folder(path: &Path) -> Result<(), String> {
    use std::os::windows::fs::MetadataExt;
    for anc in path.ancestors().filter(|a| a.components().count() > 1) {
        match std::fs::symlink_metadata(anc) {
            Ok(m) if m.file_attributes() & 0x400 != 0 || m.file_type().is_symlink() => {
                return Err("The folder is, or sits inside, a link. Pick a plain folder".into());
            }
            Ok(m) if !m.is_dir() => return Err("Part of that path is a file, not a folder".into()),
            _ => {}
        }
    }
    match std::fs::read_dir(path) {
        Ok(mut it) => match it.next() {
            None => Ok(()),
            Some(_) => Err("That folder isn't empty. Choose an empty or new folder".into()),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Couldn't read that folder: {e}")),
    }
}

// ---------- Windows side

struct Source {
    dir: String, // folder holding the disk, as stored by WSL (without \\?\)
    bytes: u64,  // size of the disk image (metadata only; never opened)
}

fn lookup(distro: &str) -> Result<Source, String> {
    let lxss = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(LXSS, KEY_READ).map_err(|_| "Couldn't read the WSL list")?;
    for sub in lxss.enum_keys().flatten() {
        let Ok(k) = lxss.open_subkey_with_flags(&sub, KEY_READ) else { continue };
        if k.get_value::<String, _>("DistributionName").ok().as_deref() != Some(distro) {
            continue;
        }
        let base: String = k.get_value("BasePath").map_err(|_| "WSL doesn't say where that distro's disk is")?;
        let dir = base.trim_start_matches(r"\\?\").trim_end_matches('\\').to_string();
        let vhd: String = k.get_value("VhdFileName").unwrap_or_else(|_| "ext4.vhdx".into());
        let bytes = std::fs::metadata(Path::new(&dir).join(vhd)).map_err(|_| "Couldn't find that distro's disk file")?.len();
        return Ok(Source { dir, bytes });
    }
    Err("That isn't a WSL distro Lagsmith found".into())
}

fn wsl_exe() -> Result<PathBuf, String> {
    let exe = system::system32_dir().ok_or("Couldn't find the Windows folder")?.join("wsl.exe");
    exe.is_file().then_some(exe).ok_or_else(|| "WSL isn't installed".to_string())
}

fn run_wsl(args: &[&str]) -> Result<(bool, String), String> {
    use std::os::windows::process::CommandExt;
    let out = std::process::Command::new(wsl_exe()?)
        .args(args)
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .stdin(std::process::Stdio::null())
        .output()
        .map_err(|e| format!("Couldn't run wsl.exe: {e}"))?;
    let mut text = decode(&out.stdout);
    text.push_str(&decode(&out.stderr));
    Ok((out.status.success(), text.trim().to_string()))
}

fn ensure_supported() -> Result<(), String> {
    match run_wsl(&["--version"]) {
        Ok((true, text)) if parse_version(&text).is_some_and(version_supported) => Ok(()),
        _ => Err(UPDATE_MESSAGE.into()),
    }
}

fn short(text: &str) -> String {
    let t = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if t.is_empty() { "WSL gave no reason".into() } else { t.chars().take(300).collect() }
}

/// Validates and runs one move. `Ok((original folder, note))` once WSL reported success; the note is set
/// when WSL's own list doesn't show the new location, but the move is still recorded so it can be undone.
fn do_move(distro: &str, target: &str) -> Result<(String, String), String> {
    let known = system::wsl_distros();
    let distro = valid_distro(distro, &known)?;
    let src = lookup(distro)?;
    let t = check_target(target, &src.dir)?;
    let drives = storage::read()?.drives;
    let drive = drives.iter().find(|d| d.letter == t.drive).ok_or("That drive isn't a local fixed drive")?;
    check_space(drive.free_bytes, src.bytes)?;
    check_folder(&t.path)?;
    ensure_supported()?;

    let created = !t.path.exists();
    if created {
        std::fs::create_dir_all(&t.path).map_err(|e| format!("Couldn't create the folder: {e}"))?;
    }
    let target_str = t.path.to_string_lossy().into_owned();
    // The user confirmed in the review sheet that the distro will be shut down first.
    let go = (|| {
        let (ok, text) = run_wsl(&["--terminate", distro])?;
        if !ok {
            return Err(format!("Couldn't shut down {distro}: {}", short(&text)));
        }
        let (ok, text) = run_wsl(&["--manage", distro, "--move", &target_str])?;
        if !ok {
            return Err(format!("WSL couldn't move {distro}: {}", short(&text)));
        }
        Ok(())
    })();
    if let Err(e) = go {
        if created {
            let _ = std::fs::remove_dir(&t.path); // only succeeds while empty
        }
        return Err(e);
    }
    let now = lookup(distro).map(|s| s.dir).unwrap_or_default();
    let note = if now.eq_ignore_ascii_case(&target_str) {
        String::new()
    } else {
        format!("WSL said it finished, but its list doesn't show {target_str} yet. Check with \"wsl --list --verbose\"")
    };
    Ok((src.dir, note))
}

pub(crate) fn move_distro(distro: &str, target: &str) -> ChangeItem {
    let label = format!("Moved WSL distro {distro} to {}", target.trim());
    match do_move(distro, target) {
        Ok((original, note)) => {
            let mut it = item(label, Ok(Some(UndoData::WslMove { distro: distro.into(), original })));
            it.detail = note;
            it
        }
        Err(e) => item(format!("Move WSL distro {distro}"), Err(e)),
    }
}

pub(crate) fn move_back(distro: &str, original: &str) -> ChangeItem {
    // The original path comes from History, which is untrusted: same rules as any new request.
    match do_move(distro, original) {
        Ok(_) => item(format!("Moved WSL distro {distro} back to {original}"), Ok(None)),
        Err(e) => item(format!("Move WSL distro {distro} back"), Err(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions() {
        assert_eq!(parse_version("WSL version: 2.3.26.0\nKernel version: 5.15"), Some((2, 3, 26)));
        assert_eq!(parse_version("WSL-Version: 2.4.8.0"), Some((2, 4, 8)));
        assert_eq!(parse_version("\u{feff}WSL version: 1.2.5.0"), Some((1, 2, 5)));
        assert_eq!(parse_version("no digits here"), None);
        assert!(version_supported((2, 3, 0)));
        assert!(version_supported((2, 4, 8)));
        assert!(version_supported((3, 0, 0)));
        assert!(!version_supported((2, 2, 4)));
        assert!(!version_supported((1, 2, 5)));
    }

    #[test]
    fn decodes_utf16_and_utf8() {
        let utf16: Vec<u8> = "WSL version: 2.3.26.0".encode_utf16().flat_map(|c| c.to_le_bytes()).collect();
        assert_eq!(parse_version(&decode(&utf16)), Some((2, 3, 26)));
        assert_eq!(decode(b"WSL version: 2.3.26.0"), "WSL version: 2.3.26.0");
    }

    #[test]
    fn distro_must_be_a_scanned_one() {
        let known = vec!["Ubuntu".to_string(), "Debian".to_string()];
        assert!(valid_distro("Ubuntu", &known).is_ok());
        for bad in ["ubuntu", "Ubuntu ", "Fedora", "", "--help", "-d", "Ubuntu\n"] {
            assert!(valid_distro(bad, &known).is_err(), "{bad:?}");
        }
        assert!(valid_distro("--help", &["--help".to_string()]).is_err(), "never an option, even if listed");
    }

    #[test]
    fn target_paths() {
        let src = r"C:\Users\k\AppData\Local\wsl\abc";
        let ok = check_target(r"D:\WSL\Ubuntu", src).unwrap();
        assert_eq!(ok.drive, "D:");
        assert_eq!(ok.path, PathBuf::from(r"D:\WSL\Ubuntu"));
        assert_eq!(check_target("d:\\WSL\\Ubuntu\\", src).unwrap().path, PathBuf::from(r"D:\WSL\Ubuntu"));
        for bad in [
            "", "D:", r"D:\", "D:WSL", r"WSL\Ubuntu", r"\\server\share\x", r"\\?\D:\WSL", r"D:\WSL\..\..\Windows", r"D:\.\x",
            r"D:\a\\b", "D:\\a|b", "D:\\a:b", "D:\\a?", "D:\\con", "D:\\WSL\\nul.txt", "D:\\trail.", "D:\\ space", "/mnt/d/wsl",
            r"C:\WSL\Ubuntu", // same drive as the source
            r"D:\Riot Games\wsl", r"D:\Program Files\wsl", r"E:\Windows\wsl", r"D:\SteamApps\x", r"D:\VALORANT\x", r"D:\EasyAntiCheat\x",
        ] {
            assert!(check_target(bad, src).is_err(), "{bad:?} should be refused");
        }
        assert!(check_target(r"D:\WSL\Ubuntu", r"C:\Riot Games\x").is_err(), "game source folder");
        assert!(check_target(&format!("D:\\{}", "a".repeat(250)), src).is_err(), "too long");
    }

    #[test]
    fn space_check() {
        let gb = 1u64 << 30;
        assert!(check_space(30 * gb, 18 * gb).is_ok());
        assert!(check_space(19 * gb + 1, 18 * gb).is_ok());
        assert!(check_space(18 * gb, 18 * gb).is_err());
        assert!(check_space(0, 0).is_err());
    }

    #[test]
    fn folder_must_be_empty_or_new() {
        let base = std::env::temp_dir().join(format!("lagsmith-wsl-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("full")).unwrap();
        std::fs::write(base.join("full").join("x.txt"), b"x").unwrap();
        std::fs::create_dir_all(base.join("empty")).unwrap();
        std::fs::write(base.join("file"), b"x").unwrap();
        assert!(check_folder(&base.join("full")).is_err());
        assert!(check_folder(&base.join("empty")).is_ok());
        assert!(check_folder(&base.join("new").join("deeper")).is_ok());
        assert!(check_folder(&base.join("file").join("sub")).is_err(), "parent is a file");
        let _ = std::fs::remove_dir_all(&base);
    }
}
