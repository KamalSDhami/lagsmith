//! The individual reversible settings: startup entries, Game Mode, Game Bar capture, power mode.
//! Callers validate first; these only write HKCU values and the power overlay.

use crate::model::StartupApp;
use crate::scan::gpuprefs::{GPU_PREFS_KEY, is_anticheat_binary, is_exe_path, parse_gpu_pref, set_gpu_pref_token};
use crate::scan::startup::{HKCU_FOLDER, HKCU_RUN};
use crate::scan::storage::long_path;
use std::borrow::Cow;
use std::path::Path;
use windows::Win32::System::SystemInformation::GetSystemTimeAsFileTime;
use windows::core::GUID;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, RegType};
use winreg::{RegKey, RegValue};

const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";
pub(crate) const GAME_MODE: (&str, &str) = (r"Software\Microsoft\GameBar", "AutoGameModeEnabled");
pub(crate) const CAPTURE: (&str, &str) = (r"Software\Microsoft\Windows\CurrentVersion\GameDVR", "AppCaptureEnabled");
pub(crate) const CAPTURE_STORE: (&str, &str) = (r"System\GameConfigStore", "GameDVR_Enabled");

// ---------- Startup

/// Task Manager's encoding: 12 bytes; enabled = 02 then zeros, disabled = 03 00 00 00 then the FILETIME it was disabled.
pub(crate) fn approved_bytes(enabled: bool, filetime: u64) -> [u8; 12] {
    let mut b = [0u8; 12];
    b[0] = if enabled { 0x02 } else { 0x03 };
    if !enabled {
        b[4..].copy_from_slice(&filetime.to_le_bytes());
    }
    b
}

/// Writes the StartupApproved value for an entry that the caller has already matched against
/// `get_startup` and checked `can_toggle`. Never touches the Run value or the file itself.
pub(crate) fn set_startup(entry: &StartupApp, enabled: bool) -> Result<(), String> {
    let (prefix, value) = entry.id.split_once('|').ok_or("Malformed startup id")?;
    let sub = match prefix {
        HKCU_RUN => "Run",
        HKCU_FOLDER => "StartupFolder",
        _ => return Err("Only your own startup entries can be changed".into()),
    };
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey_with_flags(format!(r"{APPROVED}\{sub}"), KEY_READ | KEY_WRITE)
        .map_err(|e| format!("Couldn't open the startup settings: {e}"))?;
    let now = unsafe { GetSystemTimeAsFileTime() };
    let ft = ((now.dwHighDateTime as u64) << 32) | now.dwLowDateTime as u64;
    let v = RegValue { bytes: Cow::Owned(approved_bytes(enabled, ft).to_vec()), vtype: RegType::REG_BINARY };
    key.set_raw_value(value, &v).map_err(|e| format!("Couldn't change {}: {e}", entry.name))
}

// ---------- HKCU DWORDs (Game Mode, Game Bar)

pub(crate) fn read_dword((path, name): (&str, &str)) -> Result<Option<u32>, String> {
    match RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(path, KEY_READ) {
        Ok(k) => match k.get_value::<u32, _>(name) {
            Ok(v) => Ok(Some(v)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("Couldn't read {name}: {e}")),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Couldn't read {name}: {e}")),
    }
}

/// Some(v) writes the DWORD; None deletes the value, restoring "never set".
pub(crate) fn write_dword((path, name): (&str, &str), value: Option<u32>) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match value {
        Some(v) => {
            let (k, _) = hkcu.create_subkey_with_flags(path, KEY_READ | KEY_WRITE).map_err(|e| format!("Couldn't open {path}: {e}"))?;
            k.set_value(name, &v).map_err(|e| format!("Couldn't set {name}: {e}"))
        }
        None => match hkcu.open_subkey_with_flags(path, KEY_READ | KEY_WRITE) {
            Ok(k) => match k.delete_value(name) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("Couldn't reset {name}: {e}")),
                _ => Ok(()),
            },
            Err(_) => Ok(()),
        },
    }
}

pub(crate) fn as_bool(v: Option<u32>) -> Option<bool> {
    v.map(|v| v != 0)
}

pub(crate) fn from_bool(b: Option<bool>) -> Option<u32> {
    b.map(u32::from)
}

// ---------- Power mode (the Settings > Power slider)

windows::core::link!("powrprof.dll" "system" fn PowerSetActiveOverlayScheme(overlayschemeguid: GUID) -> u32);
// The configured overlay; the effective one can differ (battery saver). Undo restores this one.
windows::core::link!("powrprof.dll" "system" fn PowerGetActualOverlayScheme(actualoverlayguid: *mut GUID) -> u32);

pub(crate) const MODES: [&str; 3] = ["best_performance", "balanced", "best_efficiency"];

pub(crate) fn mode_guid(mode: &str) -> Option<GUID> {
    use crate::scan::system::{OVERLAY_BEST_EFFICIENCY, OVERLAY_BEST_PERFORMANCE};
    match mode {
        "best_performance" => Some(OVERLAY_BEST_PERFORMANCE),
        "balanced" => Some(GUID::zeroed()),
        "best_efficiency" => Some(OVERLAY_BEST_EFFICIENCY),
        _ => None,
    }
}

pub(crate) fn actual_overlay() -> Result<GUID, String> {
    let mut g = GUID::zeroed();
    match unsafe { PowerGetActualOverlayScheme(&mut g) } {
        0 => Ok(g),
        e => Err(format!("Couldn't read the power mode (error {e})")),
    }
}

pub(crate) fn set_overlay(g: GUID) -> Result<(), String> {
    match unsafe { PowerSetActiveOverlayScheme(g) } {
        0 => Ok(()),
        e => Err(format!("Windows refused to change the power mode (error {e})")),
    }
}

// ---------- Per-app GPU preference (HKCU\Software\Microsoft\DirectX\UserGpuPreferences)

pub(crate) fn validate_gpu_exe(exe: &str) -> Result<String, String> {
    let trimmed = exe.trim().trim_matches('"').trim().replace('/', "\\");
    if trimmed.is_empty()
        || trimmed.len() > 512
        || trimmed.chars().any(|c| c.is_control() || c == ';' || c == '=')
        || !is_exe_path(&trimmed)
        || trimmed.contains("..")
    {
        return Err("Enter a full path to a .exe file".into());
    }
    let resolved = if Path::new(&trimmed).exists() {
        long_path(Path::new(&trimmed)).to_string_lossy().into_owned()
    } else {
        trimmed.clone()
    };
    if is_anticheat_binary(&trimmed) || is_anticheat_binary(&resolved) {
        return Err("Lagsmith never changes anti-cheat files".into());
    }
    Ok(trimmed)
}

pub(crate) fn read_gpu_pref_raw(exe: &str) -> Result<Option<String>, String> {
    match RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(GPU_PREFS_KEY, KEY_READ) {
        Ok(k) => match k.get_value::<String, _>(exe) {
            Ok(v) => Ok(Some(v)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("Couldn't read graphics preference: {e}")),
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Couldn't read graphics preference: {e}")),
    }
}

pub(crate) fn write_gpu_pref_raw(exe: &str, value: Option<&str>) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match value {
        Some(v) => {
            let (k, _) = hkcu.create_subkey_with_flags(GPU_PREFS_KEY, KEY_READ | KEY_WRITE).map_err(|e| format!("Couldn't open graphics settings: {e}"))?;
            k.set_value(exe, &v).map_err(|e| format!("Couldn't set graphics preference: {e}"))
        }
        None => match hkcu.open_subkey_with_flags(GPU_PREFS_KEY, KEY_READ | KEY_WRITE) {
            Ok(k) => match k.delete_value(exe) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("Couldn't reset graphics preference: {e}")),
                _ => Ok(()),
            },
            Err(_) => Ok(()),
        },
    }
}

pub(crate) enum GpuPrefApply {
    Applied { exe: String, previous: Option<String> },
    Skipped,
}

pub(crate) fn apply_gpu_pref(exe: &str, preference: &str) -> Result<GpuPrefApply, String> {
    let exe = validate_gpu_exe(exe)?;
    let previous = read_gpu_pref_raw(&exe)?;
    if previous.is_none() && !Path::new(&exe).is_file() {
        return Err("That .exe file wasn't found on disk".into());
    }
    let next = set_gpu_pref_token(previous.as_deref(), preference).ok_or_else(|| "Unknown GPU preference".to_string())?;
    if parse_gpu_pref(previous.as_deref().unwrap_or("")) == preference {
        return Ok(GpuPrefApply::Skipped);
    }
    write_gpu_pref_raw(&exe, Some(&next))?;
    Ok(GpuPrefApply::Applied { exe, previous })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_approved_encoding() {
        assert_eq!(approved_bytes(true, 0x0102_0304_0506_0708), [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        assert_eq!(approved_bytes(false, 0x0102_0304_0506_0708), [3, 0, 0, 0, 8, 7, 6, 5, 4, 3, 2, 1]);
    }

    #[test]
    fn power_modes_map_to_overlays() {
        for m in MODES {
            let g = mode_guid(m).expect("known mode");
            assert_eq!(crate::scan::system::overlay_mode(&g), m);
        }
        assert!(mode_guid("ultimate").is_none());
    }

    #[test]
    fn gpu_exe_validation() {
        assert_eq!(validate_gpu_exe(r#" "C:\Games\game.exe" "#).as_deref(), Ok(r"C:\Games\game.exe"));
        for bad in ["", "game.exe", r"C:\Games\..\evil.exe", r"C:\Games\a;b.exe", r"C:\Games\note.txt", r"C:\Program Files\Riot Vanguard\vgc.exe"] {
            assert!(validate_gpu_exe(bad).is_err(), "{bad}");
        }
    }
}
