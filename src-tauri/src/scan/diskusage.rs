//! What fills the drive. Folder sizes use storage's walker, which never follows reparse points.
//! Game and anti-cheat folders are never walked (docs/ANTI-CHEAT.md rule 6).

use super::storage::{display_path, folder_size, long_path};
use crate::model::*;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use windows::Win32::UI::Shell::{FOLDERID_Desktop, FOLDERID_Documents, FOLDERID_Downloads, FOLDERID_Pictures, FOLDERID_Profile, FOLDERID_Videos};
use super::known_folder;
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};

const WORKERS: usize = 4;

pub fn read() -> Result<DiskUsage, String> {
    let profile = known_folder(&FOLDERID_Profile)
        .or_else(|| std::env::var("USERPROFILE").ok().map(PathBuf::from))
        .ok_or("Couldn't find your user folder")?;
    let profile = long_path(&profile);

    let mut user: Vec<(String, PathBuf)> = [
        ("Downloads", FOLDERID_Downloads),
        ("Documents", FOLDERID_Documents),
        ("Desktop", FOLDERID_Desktop),
        ("Videos", FOLDERID_Videos),
        ("Pictures", FOLDERID_Pictures),
    ]
    .iter()
    .filter_map(|(n, id)| Some((n.to_string(), known_folder(id)?)))
    .collect();
    user.push((".cache".into(), profile.join(".cache")));

    let mut app: Vec<(String, PathBuf)> = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        for sub in ["Packages", "Programs"] {
            let Ok(entries) = std::fs::read_dir(Path::new(&local).join(sub)) else { continue };
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().into_owned();
                if e.file_type().is_ok_and(|t| t.is_dir()) && !is_game_folder(&name) {
                    app.push((name, e.path()));
                }
            }
        }
    }

    let mut user_folders = sized(&user, &profile);
    let mut app_data = sized(&app, &profile);
    for list in [&mut user_folders, &mut app_data] {
        list.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    }
    app_data.truncate(10);

    Ok(DiskUsage { programs: programs(&profile), wsl_disks: wsl_disks(&profile), app_data, user_folders })
}

fn is_game_folder(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    ["riot", "vanguard", "valorant", "league of legends", "anticheat", "battleye", "faceit"].iter().any(|g| n.contains(g))
}

/// Sizes folders on a few worker threads (there can be hundreds of Packages folders).
fn sized(items: &[(String, PathBuf)], profile: &Path) -> Vec<SizedItem> {
    let next = Mutex::new(0usize);
    let out = Mutex::new(Vec::new());
    std::thread::scope(|s| {
        for _ in 0..WORKERS {
            s.spawn(|| loop {
                let i = {
                    let mut n = next.lock().unwrap_or_else(|p| p.into_inner());
                    *n += 1;
                    *n - 1
                };
                let Some((name, path)) = items.get(i) else { break };
                if !path.is_dir() {
                    continue;
                }
                let item = SizedItem { name: name.clone(), display_path: display_path(path, profile), bytes: folder_size(path) };
                out.lock().unwrap_or_else(|p| p.into_inner()).push(item);
            });
        }
    });
    out.into_inner().unwrap_or_else(|p| p.into_inner())
}

fn programs(profile: &Path) -> Vec<SizedItem> {
    let mut list: Vec<SizedItem> = super::anticheat::uninstall_keys()
        .into_iter()
        .filter(|k| k.get_value::<u32, _>("SystemComponent").unwrap_or(0) != 1)
        .filter_map(|k| {
            let name = k.get_value::<String, _>("DisplayName").ok()?;
            let kb = k.get_value::<u32, _>("EstimatedSize").ok()?;
            let location = k.get_value::<String, _>("InstallLocation").unwrap_or_default();
            let display = if location.is_empty() { String::new() } else { display_path(Path::new(location.trim_matches('"')), profile) };
            Some(SizedItem { name, display_path: display, bytes: kb as u64 * 1024 })
        })
        .collect();
    list.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    list.dedup_by(|a, b| a.name == b.name);
    list.truncate(15);
    list
}

fn wsl_disks(profile: &Path) -> Vec<SizedItem> {
    let Ok(lxss) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Lxss", KEY_READ) else {
        return Vec::new();
    };
    lxss.enum_keys()
        .flatten()
        .filter_map(|sub| {
            let k = lxss.open_subkey_with_flags(sub, KEY_READ).ok()?;
            let name = k.get_value::<String, _>("DistributionName").ok()?;
            let base = k.get_value::<String, _>("BasePath").ok()?;
            let vhd = k.get_value::<String, _>("VhdFileName").unwrap_or_else(|_| "ext4.vhdx".into());
            let path = Path::new(base.trim_start_matches(r"\\?\")).join(vhd);
            // Metadata only; the disk image is never opened.
            let bytes = std::fs::metadata(&path).ok()?.len();
            Some(SizedItem { name, display_path: display_path(&path, profile), bytes })
        })
        .collect()
}
