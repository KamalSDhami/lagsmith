//! Per-app Windows graphics preference (`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`).
//! Reads existing Windows graphics preferences and Uninstall `DisplayIcon` registry metadata only;
//! never walks game/anti-cheat install folders and never targets anti-cheat services (docs/ANTI-CHEAT.md).

use crate::model::GpuAppPreference;
use std::collections::HashSet;
use std::path::Path;
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};

pub(crate) const GPU_PREFS_KEY: &str = r"Software\Microsoft\DirectX\UserGpuPreferences";

pub fn read() -> Result<Vec<GpuAppPreference>, String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(GPU_PREFS_KEY, KEY_READ) {
        for (name, _) in key.enum_values().flatten() {
            let exe = name.trim();
            if !is_exe_path(exe) || is_anticheat_binary(exe) {
                continue;
            }
            let raw = key.get_value::<String, _>(&name).unwrap_or_default();
            if seen.insert(exe.to_ascii_lowercase()) {
                out.push(GpuAppPreference {
                    name: exe_stem(exe),
                    exe: exe.to_string(),
                    preference: parse_gpu_pref(&raw).to_string(),
                    source: "Windows graphics settings".into(),
                });
            }
        }
    }

    // Add installed apps whose Uninstall DisplayIcon points directly to an exe (pure registry read).
    for k in super::anticheat::uninstall_keys() {
        if k.get_value::<u32, _>("SystemComponent").unwrap_or(0) == 1 {
            continue;
        }
        let Ok(display_name) = k.get_value::<String, _>("DisplayName") else { continue };
        let Ok(icon) = k.get_value::<String, _>("DisplayIcon") else { continue };
        let Some(exe) = clean_icon_exe(&icon) else { continue };
        if is_uninstaller_exe(&exe) || is_anticheat_binary(&exe) {
            continue;
        }
        if seen.insert(exe.to_ascii_lowercase()) {
            out.push(GpuAppPreference {
                name: display_name.trim().to_string(),
                exe,
                preference: "auto".into(),
                source: "Installed app".into(),
            });
        }
    }

    out.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
    Ok(out)
}

pub(crate) fn parse_gpu_pref(raw: &str) -> &'static str {
    for part in raw.split(';') {
        if let Some((k, v)) = part.trim().split_once('=')
            && k.trim().eq_ignore_ascii_case("GpuPreference")
        {
            return match v.trim() {
                "1" => "power_saving",
                "2" => "high_performance",
                _ => "auto",
            };
        }
    }
    "auto"
}

pub(crate) fn pref_code(pref: &str) -> Option<&'static str> {
    match pref {
        "auto" => Some("0"),
        "power_saving" => Some("1"),
        "high_performance" => Some("2"),
        _ => None,
    }
}

/// Replaces or inserts `GpuPreference=N;` while preserving any sibling tokens (e.g. AutoHDREnable).
pub(crate) fn set_gpu_pref_token(existing: Option<&str>, pref: &str) -> Option<String> {
    let code = pref_code(pref)?;
    let mut parts: Vec<String> = existing
        .unwrap_or("")
        .split(';')
        .map(str::trim)
        .filter(|p| !p.is_empty() && !p.split_once('=').is_some_and(|(k, _)| k.trim().eq_ignore_ascii_case("GpuPreference")))
        .map(ToString::to_string)
        .collect();
    parts.insert(0, format!("GpuPreference={code}"));
    Some(format!("{};", parts.join(";")))
}

pub(crate) fn is_exe_path(p: &str) -> bool {
    let p = p.trim();
    p.len() >= 6
        && p.as_bytes().get(1) == Some(&b':')
        && matches!(p.as_bytes().get(2), Some(b'\\') | Some(b'/'))
        && p.to_ascii_lowercase().ends_with(".exe")
}

/// True for anti-cheat services/launchers/tray tools that must never be modified.
/// Actual game executables (e.g. VALORANT-Win64-Shipping.exe) are allowed per docs/ANTI-CHEAT.md.
pub(crate) fn is_anticheat_binary(exe_or_path: &str) -> bool {
    let norm = exe_or_path.replace('/', "\\").to_ascii_lowercase();
    let file = Path::new(&norm)
        .file_name()
        .map(|f| f.to_string_lossy().into_owned())
        .unwrap_or_else(|| norm.clone());
    matches!(
        file.as_str(),
        "vgc.exe"
            | "vgtray.exe"
            | "vgm.exe"
            | "vgk.sys"
            | "easyanticheat.exe"
            | "easyanticheat_eos.exe"
            | "eaanticheat.gameservice.exe"
            | "beservice.exe"
            | "beservice_x64.exe"
            | "faceit.exe"
            | "faceitclient.exe"
            | "faceitservice.exe"
            | "esea client.exe"
            | "eseaclient.exe"
            | "xigncode.exe"
            | "xxd-0.xem"
            | "gamemon.des"
            | "gamemon64.des"
    ) || file.starts_with("riotclient")
        || file.contains("anticheat")
        || norm.contains(r"\riot vanguard\")
        || norm.contains(r"\easyanticheat\")
        || norm.contains(r"\battleye\")
}

fn exe_stem(exe: &str) -> String {
    Path::new(exe)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| exe.to_string())
}

pub(crate) fn clean_icon_exe(icon: &str) -> Option<String> {
    let trimmed = icon.trim();
    let without_idx = trimmed.rsplit_once(',').and_then(|(left, right)| right.trim().parse::<i32>().ok().map(|_| left)).unwrap_or(trimmed);
    let path = without_idx.trim().trim_matches('"').trim();
    is_exe_path(path).then(|| path.to_string())
}

fn is_uninstaller_exe(exe: &str) -> bool {
    let lower = Path::new(exe).file_name().map(|f| f.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    lower.starts_with("unins") || lower.contains("uninstall") || lower == "setup.exe"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_updates_gpu_pref_tokens() {
        assert_eq!(parse_gpu_pref("GpuPreference=2;"), "high_performance");
        assert_eq!(parse_gpu_pref("AutoHDREnable=2;GpuPreference=1;"), "power_saving");
        assert_eq!(parse_gpu_pref("GpuPreference=0;"), "auto");
        assert_eq!(parse_gpu_pref(""), "auto");

        assert_eq!(set_gpu_pref_token(None, "high_performance").as_deref(), Some("GpuPreference=2;"));
        assert_eq!(
            set_gpu_pref_token(Some("GpuPreference=1;AutoHDREnable=2;"), "high_performance").as_deref(),
            Some("GpuPreference=2;AutoHDREnable=2;")
        );
        assert!(set_gpu_pref_token(None, "turbo").is_none());
    }

    #[test]
    fn cleans_display_icon_and_filters_anticheat() {
        assert_eq!(clean_icon_exe(r#""C:\Games\App\game.exe",0"#).as_deref(), Some(r"C:\Games\App\game.exe"));
        assert_eq!(clean_icon_exe(r"C:\Icons\app.ico"), None);
        assert!(is_anticheat_binary(r"C:\Program Files\Riot Vanguard\vgc.exe"));
        assert!(is_anticheat_binary("EasyAntiCheat_EOS.exe"));
        assert!(!is_anticheat_binary(r"D:\Riot Games\VALORANT\live\ShooterGame\Binaries\Win64\VALORANT-Win64-Shipping.exe"));
    }
}
