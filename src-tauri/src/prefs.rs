//! App settings (settings.json) and the "start with Windows" Run entry. The file is tolerant on load
//! (a bad value falls back to its default) and strict on save (`validate`).

use crate::appdata;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Mutex;
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};

pub const MIN_THRESHOLD: u8 = 60;
pub const MAX_THRESHOLD: u8 = 95;
const DEFAULT_THRESHOLD: u8 = 85;
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const RUN_VALUE: &str = "Lagsmith";

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AutoClean {
    pub enabled: bool,
    pub threshold_percent: u8,
}

impl Default for AutoClean {
    fn default() -> Self {
        Self { enabled: false, threshold_percent: DEFAULT_THRESHOLD }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: Theme,
    pub sidebar_collapsed: bool,
    pub start_with_windows: bool,
    pub auto_clean: AutoClean,
}

impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        let t = self.auto_clean.threshold_percent;
        if !(MIN_THRESHOLD..=MAX_THRESHOLD).contains(&t) {
            return Err(format!("Auto-clean threshold must be between {MIN_THRESHOLD}% and {MAX_THRESHOLD}%"));
        }
        Ok(())
    }
}

/// A damaged file or an out-of-range value never blocks the app: it falls back to the default.
pub fn parse(bytes: &[u8]) -> Settings {
    let mut s: Settings = serde_json::from_slice(bytes).unwrap_or_default();
    if s.validate().is_err() {
        s.auto_clean.threshold_percent = DEFAULT_THRESHOLD;
    }
    s
}

/// Settings from disk. `start_with_windows` is whatever the Run key says right now.
pub fn load() -> Settings {
    let mut s = appdata::file("settings.json").ok().and_then(|p| std::fs::read(p).ok()).map_or_else(Settings::default, |b| parse(&b));
    s.start_with_windows = startup_enabled();
    s
}

pub fn save(new: Settings) -> Result<Settings, String> {
    new.validate()?;
    let _guard = LOCK.lock().unwrap_or_else(|p| p.into_inner());
    if new.start_with_windows != startup_enabled() {
        set_startup(new.start_with_windows)?;
    }
    appdata::save_json(&appdata::file("settings.json")?, &new)?;
    Ok(new)
}

// ---------- Start with Windows (per-user Run entry, no admin)

/// The Run value for `exe`: only a file named lagsmith.exe at an absolute path, quoted.
pub fn run_command(exe: &Path) -> Result<String, String> {
    let name = exe.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase());
    let text = exe.to_string_lossy();
    if name.as_deref() != Some("lagsmith.exe") || !exe.is_absolute() || text.contains('"') {
        return Err("Start with Windows only works from the installed Lagsmith app".into());
    }
    Ok(format!("\"{text}\""))
}

fn current_command() -> Result<String, String> {
    run_command(&std::env::current_exe().map_err(|e| format!("Couldn't find Lagsmith's folder: {e}"))?)
}

fn startup_enabled() -> bool {
    let Ok(cmd) = current_command() else { return false };
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(RUN_KEY, KEY_READ)
        .and_then(|k| k.get_value::<String, _>(RUN_VALUE))
        .is_ok_and(|v| v == cmd)
}

fn set_startup(on: bool) -> Result<(), String> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE)
        .map_err(|e| format!("Couldn't open the startup list: {e}"))?;
    if on {
        key.set_value(RUN_VALUE, &current_command()?).map_err(|e| format!("Couldn't add Lagsmith to startup: {e}"))
    } else {
        match key.delete_value(RUN_VALUE) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("Couldn't remove Lagsmith from startup: {e}")),
            _ => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_fills_defaults_and_survives_garbage() {
        assert_eq!(parse(b"{}"), Settings::default());
        assert_eq!(parse(b"not json"), Settings::default());
        assert_eq!(parse(br#"{"theme":"purple"}"#), Settings::default());
        let s = parse(br#"{"theme":"dark","sidebarCollapsed":true,"autoClean":{"enabled":true,"thresholdPercent":70}}"#);
        assert_eq!((s.theme, s.sidebar_collapsed, s.auto_clean.enabled, s.auto_clean.threshold_percent), (Theme::Dark, true, true, 70));
        assert_eq!(parse(br#"{"autoClean":{"thresholdPercent":5}}"#).auto_clean.threshold_percent, 85);
        assert_eq!(parse(br#"{"autoClean":{"thresholdPercent":200}}"#).auto_clean.threshold_percent, 85);
    }

    #[test]
    fn defaults_are_off_and_85() {
        let d = Settings::default();
        assert!(!d.auto_clean.enabled && !d.start_with_windows);
        assert_eq!((d.auto_clean.threshold_percent, d.theme), (85, Theme::System));
    }

    #[test]
    fn threshold_bounds() {
        let with = |t: u8| Settings { auto_clean: AutoClean { enabled: true, threshold_percent: t }, ..Default::default() };
        for ok in [60, 85, 95] {
            assert!(with(ok).validate().is_ok(), "{ok}");
        }
        for bad in [0, 59, 96, 100, 255] {
            assert!(with(bad).validate().is_err(), "{bad}");
        }
    }

    #[test]
    fn set_rejects_unknown_values_at_deserialize() {
        assert!(serde_json::from_str::<Settings>(r#"{"theme":"sepia"}"#).is_err());
        assert!(serde_json::from_str::<Settings>(r#"{"autoClean":{"thresholdPercent":999}}"#).is_err()); // u8 overflow
    }

    #[test]
    fn run_command_only_for_lagsmith_exe() {
        assert_eq!(run_command(Path::new(r"C:\Program Files\Lagsmith\lagsmith.exe")).unwrap(), r#""C:\Program Files\Lagsmith\lagsmith.exe""#);
        assert!(run_command(Path::new(r"C:\Program Files\Lagsmith\Lagsmith.EXE")).is_ok());
        for bad in [r"C:\x\cmd.exe", r"C:\x\lagsmith-helper.exe", r"lagsmith.exe", r"C:\x\lagsmith.exe.bat"] {
            assert!(run_command(Path::new(bad)).is_err(), "{bad}");
        }
    }
}
