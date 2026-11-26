use crate::model::*;
use std::path::PathBuf;
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_32KEY, KEY_WOW64_64KEY};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved";
// Id prefixes. Only the two HKCU ones can ever be toggled; HKLM needs admin.
pub(crate) const HKCU_RUN: &str = "HKCU Run";
pub(crate) const HKCU_FOLDER: &str = "HKCU Startup";
const STARTUP_DIR: &str = r"Microsoft\Windows\Start Menu\Programs\Startup";

pub fn read() -> Result<Vec<StartupApp>, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let mut apps = Vec::new();

    // HKCU\Software isn't redirected for 32-bit apps, so one view is enough there.
    run_key(&mut apps, &hkcu, KEY_READ, "Run", "HKCU Run", HKCU_RUN);
    run_key(&mut apps, &hklm, KEY_READ | KEY_WOW64_64KEY, "Run", "HKLM Run", "HKLM Run");
    run_key(&mut apps, &hklm, KEY_READ | KEY_WOW64_32KEY, "Run32", "HKLM Run", "HKLM Run32");

    if let Ok(dir) = std::env::var("APPDATA") {
        startup_folder(&mut apps, &hkcu, PathBuf::from(dir).join(STARTUP_DIR), HKCU_FOLDER);
    }
    if let Ok(dir) = std::env::var("ProgramData") {
        startup_folder(&mut apps, &hklm, PathBuf::from(dir).join(STARTUP_DIR), "Common Startup");
    }
    Ok(apps)
}

fn run_key(apps: &mut Vec<StartupApp>, root: &RegKey, flags: u32, approved: &str, source: &str, id_prefix: &str) {
    let Ok(key) = root.open_subkey_with_flags(RUN, flags) else { return };
    let approved = root.open_subkey_with_flags(format!(r"{APPROVED}\{approved}"), KEY_READ | KEY_WOW64_64KEY).ok();
    for (name, _) in key.enum_values().flatten() {
        let Ok(command) = key.get_value::<String, _>(&name) else { continue };
        if name.is_empty() {
            continue;
        }
        let enabled = approved_enabled(approved.as_ref(), &name);
        let can_toggle = id_prefix == HKCU_RUN && !never_toggle(&name, &command);
        apps.push(StartupApp { id: format!("{id_prefix}|{name}"), can_toggle, name, command, source: source.into(), enabled });
    }
}

fn startup_folder(apps: &mut Vec<StartupApp>, root: &RegKey, dir: PathBuf, id_prefix: &str) {
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    let approved = root.open_subkey_with_flags(format!(r"{APPROVED}\StartupFolder"), KEY_READ | KEY_WOW64_64KEY).ok();
    for entry in entries.flatten() {
        let file = entry.file_name().to_string_lossy().into_owned();
        if file.eq_ignore_ascii_case("desktop.ini") || entry.file_type().map_or(true, |t| t.is_dir()) {
            continue;
        }
        let path = entry.path();
        let name = path.file_stem().map_or(file.clone(), |s| s.to_string_lossy().into_owned());
        let command = path.to_string_lossy().into_owned();
        apps.push(StartupApp {
            id: format!("{id_prefix}|{file}"),
            can_toggle: id_prefix == HKCU_FOLDER && !never_toggle(&name, &command),
            name,
            command,
            source: "Startup folder".into(),
            // StartupApproved\StartupFolder is keyed by the full file name.
            enabled: approved_enabled(approved.as_ref(), &file),
        });
    }
}

/// Anti-cheat, game and security entries are never offered for switching off (docs/ANTI-CHEAT.md rule 5).
pub(crate) fn never_toggle(name: &str, command: &str) -> bool {
    const WORDS: [&str; 7] = ["riot", "vanguard", "valorant", "easyanticheat", "battleye", "faceit", "anticheat"];
    let text = format!("{name} {command}").to_ascii_lowercase();
    let exe = command.trim_matches('"').split('"').next().unwrap_or("").rsplit(['\\', '/']).next().unwrap_or("");
    name.eq_ignore_ascii_case("SecurityHealth")
        || WORDS.iter().any(|w| text.contains(w))
        || super::protected::is_protected(name)
        || super::protected::is_protected(exe.split_whitespace().next().unwrap_or(""))
}

fn approved_enabled(approved: Option<&RegKey>, name: &str) -> bool {
    let value = approved.and_then(|k| k.get_raw_value(name).ok());
    is_enabled(value.as_ref().map(|v| &v.bytes[..]))
}

/// Task Manager's rule: first byte even = enabled (02, 06), odd = disabled (03, 07); missing = enabled.
fn is_enabled(approved: Option<&[u8]>) -> bool {
    approved.and_then(|b| b.first()).is_none_or(|b| b % 2 == 0)
}

#[cfg(test)]
mod tests {
    use super::is_enabled;

    #[test]
    fn startup_approved_byte_rule() {
        assert!(is_enabled(None));
        assert!(is_enabled(Some(&[])));
        assert!(is_enabled(Some(&[0x02, 0, 0, 0])));
        assert!(is_enabled(Some(&[0x06, 0, 0, 0])));
        assert!(!is_enabled(Some(&[0x03, 0, 0, 0])));
        assert!(!is_enabled(Some(&[0x07, 0, 0, 0])));
    }
}
