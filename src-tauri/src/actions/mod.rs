//! Reversible changes. Every request is re-validated here, refused while a protected game or
//! anti-cheat process runs, and recorded in History for undo. Arguments from the UI and the
//! history file are both treated as untrusted.

mod clean;
mod settings;
#[cfg(test)]
mod live;

use crate::model::*;
use crate::scan::{protected, rfc3339_from_unix, storage, utf16_to_string};
use settings::{CAPTURE, CAPTURE_STORE, GAME_MODE, as_bool, from_bool, read_dword, write_dword};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS};

pub(crate) const GATE_MESSAGE: &str = "Close VALORANT and other anti-cheat games first. Lagsmith doesn't change anything while they run.";
const MAX_CHANGES: usize = 50;
const MAX_HISTORY: usize = 200;

// One change or undo at a time, and one read-modify-write of the history file at a time.
static LOCK: Mutex<()> = Mutex::new(());

pub fn apply_changes(title: String, changes: Vec<ChangeRequest>) -> Result<ChangeSet, String> {
    gate(&process_names()?)?;
    if changes.is_empty() || changes.len() > MAX_CHANGES {
        return Err(format!("Expected between 1 and {MAX_CHANGES} changes"));
    }
    let _guard = LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let path = history_path()?;
    let mut history = load_history(&path)?;
    let items = changes.iter().flat_map(apply_one).collect();
    let set = new_set(clean_title(&title), items);
    history.push(set.clone());
    save_history(&path, &history)?;
    Ok(set)
}

pub fn undo_change(id: String) -> Result<ChangeSet, String> {
    gate(&process_names()?)?;
    let _guard = LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let path = history_path()?;
    let mut history = load_history(&path)?;
    let original = history.iter_mut().find(|s| s.id == id).ok_or("That change isn't in History")?;
    if original.undone {
        return Err("That change was already undone".into());
    }
    let items: Vec<ChangeItem> =
        original.items.iter().rev().filter(|i| i.status == "done").filter_map(|i| i.undo.as_ref()).map(undo_one).collect();
    // Only marked undone when every step went back; otherwise the user can retry.
    if items.iter().all(|i| i.status != "failed") {
        original.undone = true;
    }
    let returned = original.clone();
    // The log also gets its own "Undo:" entry showing what was reverted; the UI re-reads History.
    history.push(new_set(format!("Undo: {}", returned.title), items));
    save_history(&path, &history)?;
    Ok(returned)
}

pub fn get_history() -> Result<Vec<ChangeSet>, String> {
    let _guard = LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let mut h = load_history(&history_path()?)?;
    h.reverse();
    Ok(h)
}

// ---------- Gate

/// Refuses while a protected game session is running (the game or its in-game anti-cheat), not merely a tray icon.
pub(crate) fn gate(running: &[String]) -> Result<(), String> {
    if running.iter().any(|n| protected::is_game_session(n)) { Err(GATE_MESSAGE.into()) } else { Ok(()) }
}

/// Process names from a snapshot. No process is ever opened.
fn process_names() -> Result<Vec<String>, String> {
    let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) }.map_err(|e| format!("Couldn't list running programs: {e}"))?;
    let mut names = Vec::new();
    let mut entry = PROCESSENTRY32W { dwSize: size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
    let mut more = unsafe { Process32FirstW(snap, &mut entry) }.is_ok();
    while more {
        names.push(utf16_to_string(&entry.szExeFile));
        more = unsafe { Process32NextW(snap, &mut entry) }.is_ok();
    }
    let _ = unsafe { CloseHandle(snap) };
    Ok(names)
}

// ---------- Validation (pure, so it can be tested with fake data)

/// The startup entry a request may change: it must be one `get_startup` returns right now, with can_toggle.
pub(crate) fn toggleable<'a>(id: &str, current: &'a [StartupApp]) -> Result<&'a StartupApp, String> {
    let entry = current.iter().find(|a| a.id == id).ok_or("That startup entry no longer exists")?;
    if !entry.can_toggle {
        return Err(format!("{} can't be changed by Lagsmith", entry.name));
    }
    Ok(entry)
}

pub(crate) fn valid_mode(mode: &str) -> Result<&'static str, String> {
    settings::MODES.iter().copied().find(|m| *m == mode).ok_or_else(|| "Unknown power mode".to_string())
}

pub(crate) fn valid_cache(id: &str) -> Result<(), String> {
    storage::CACHES.iter().any(|c| c.0 == id).then_some(()).ok_or_else(|| "That isn't one of the caches Lagsmith cleans".to_string())
}

// ---------- Applying

fn item(description: String, result: Result<Option<UndoData>, String>) -> ChangeItem {
    match result {
        Ok(undo) => ChangeItem { description, status: "done".into(), detail: String::new(), undo, freed_bytes: 0 },
        Err(e) => ChangeItem { description, status: "failed".into(), detail: e, undo: None, freed_bytes: 0 },
    }
}

fn skipped(description: String, why: &str) -> ChangeItem {
    ChangeItem { description, status: "skipped".into(), detail: why.into(), undo: None, freed_bytes: 0 }
}

fn on_off(on: bool) -> &'static str {
    if on { "on" } else { "off" }
}

/// Applies one request below the gate. Used by apply_changes and the live tests.
pub(crate) fn apply_one(change: &ChangeRequest) -> Vec<ChangeItem> {
    match change {
        ChangeRequest::StartupEnabled { id, enabled } => vec![startup(id, *enabled, true)],
        ChangeRequest::GameMode { on } => vec![game_mode(Some(*on), true)],
        ChangeRequest::GameBarCapture { on } => vec![game_bar(Some(*on), Some(*on), true)],
        ChangeRequest::PowerMode { mode } => vec![power(mode, true)],
        ChangeRequest::CleanCaches { ids } => {
            if ids.is_empty() || ids.len() > storage::CACHES.len() {
                return vec![skipped("Clean caches".into(), "No caches chosen")];
            }
            ids.iter().map(|id| clean_cache(id)).collect()
        }
    }
}

/// Reverses one history item, re-validating it as if it were a new request.
pub(crate) fn undo_one(undo: &UndoData) -> ChangeItem {
    match undo {
        UndoData::StartupEnabled { id, enabled } => startup(id, *enabled, false),
        UndoData::GameMode { previous } => game_mode(*previous, false),
        UndoData::GameBarCapture { previous, previous_store } => game_bar(*previous, *previous_store, false),
        UndoData::PowerMode { previous } => power(previous, false),
    }
}

fn startup(id: &str, enabled: bool, record_undo: bool) -> ChangeItem {
    let current = match crate::scan::startup::read() {
        Ok(c) => c,
        Err(e) => return item("Change a startup app".into(), Err(e)),
    };
    let entry = match toggleable(id, &current) {
        Ok(e) => e,
        Err(e) => return item("Change a startup app".into(), Err(e)),
    };
    let description = format!("Turned {} {} at startup", on_off(enabled), entry.name);
    if entry.enabled == enabled {
        return skipped(description, &format!("Already {}", on_off(enabled)));
    }
    let undo = record_undo.then(|| UndoData::StartupEnabled { id: entry.id.clone(), enabled: entry.enabled });
    item(description, settings::set_startup(entry, enabled).map(|()| undo))
}

/// `on` None means "remove the value" (restoring Windows' default); only undo passes None.
fn game_mode(on: Option<bool>, record_undo: bool) -> ChangeItem {
    let description = match on {
        Some(b) => format!("Turned Game Mode {}", on_off(b)),
        None => "Reset Game Mode to the Windows default".into(),
    };
    let result = (|| {
        let previous = as_bool(read_dword(GAME_MODE)?);
        write_dword(GAME_MODE, from_bool(on))?;
        Ok(record_undo.then_some(UndoData::GameMode { previous }))
    })();
    item(description, result)
}

fn game_bar(capture: Option<bool>, store: Option<bool>, record_undo: bool) -> ChangeItem {
    let description = match capture.or(store) {
        Some(b) => format!("Turned Game Bar capture {}", on_off(b)),
        None => "Reset Game Bar capture to the Windows default".into(),
    };
    let result = (|| {
        let previous = as_bool(read_dword(CAPTURE)?);
        let previous_store = as_bool(read_dword(CAPTURE_STORE)?);
        write_dword(CAPTURE, from_bool(capture))?;
        if let Err(e) = write_dword(CAPTURE_STORE, from_bool(store)) {
            let _ = write_dword(CAPTURE, from_bool(previous)); // don't leave it half-changed
            return Err(e);
        }
        Ok(record_undo.then_some(UndoData::GameBarCapture { previous, previous_store }))
    })();
    item(description, result)
}

fn power(mode: &str, record_undo: bool) -> ChangeItem {
    let mode = match valid_mode(mode) {
        Ok(m) => m,
        Err(e) => return item("Change the power mode".into(), Err(e)),
    };
    let description = format!("Set power mode to {}", mode.replace('_', " "));
    let result = (|| {
        let previous = crate::scan::system::overlay_mode(&settings::actual_overlay()?);
        if record_undo && valid_mode(previous).is_err() {
            return Err("The current power mode is a custom one, so it couldn't be undone; nothing was changed".to_string());
        }
        settings::set_overlay(settings::mode_guid(mode).ok_or("Unknown power mode")?)?;
        Ok(record_undo.then(|| UndoData::PowerMode { previous: previous.into() }))
    })();
    item(description, result)
}

fn clean_cache(id: &str) -> ChangeItem {
    if let Err(e) = valid_cache(id) {
        return item("Clean a cache".into(), Err(e));
    }
    let name = storage::CACHES.iter().find(|c| c.0 == id).map_or(id, |c| c.1);
    let Some(root) = storage::cache_root(id) else { return skipped(format!("Cleared {name}"), "Folder not found") };
    if !root.exists() {
        return skipped(format!("Cleared {name}"), "Folder not found");
    }
    let opts = clean::Options {
        // On 25 Nov wiping all of %TEMP% removed a running tool's files: keep anything recent, and our own and Claude's folders.
        min_age: (id == "temp").then_some(clean::DAY),
        skip_names: if id == "temp" { &["lagsmith", "claude"] } else { &[] },
        skip_hard_links: id == "uv",
    };
    match clean::clean(&root, &opts) {
        Ok(s) => ChangeItem {
            description: format!("Cleared {name} ({})", human_bytes(s.freed_bytes)),
            status: "done".into(),
            detail: if s.in_use + s.kept > 0 { format!("{} in use, {} kept", s.in_use, s.kept) } else { String::new() },
            undo: None, // caches refill on their own
            freed_bytes: s.freed_bytes,
        },
        Err(e) => item(format!("Cleared {name}"), Err(e)),
    }
}

fn human_bytes(b: u64) -> String {
    match b {
        b if b >= 1 << 30 => format!("{:.1} GB", b as f64 / (1u64 << 30) as f64),
        b if b >= 1 << 20 => format!("{:.0} MB", b as f64 / (1u64 << 20) as f64),
        b => format!("{} KB", b / 1024),
    }
}

fn clean_title(t: &str) -> String {
    let t: String = t.chars().filter(|c| !c.is_control()).take(80).collect();
    if t.trim().is_empty() { "Changes".into() } else { t.trim().to_string() }
}

fn new_set(title: String, items: Vec<ChangeItem>) -> ChangeSet {
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    ChangeSet { id: format!("{}", now.as_nanos()), time: rfc3339_from_unix(now.as_secs() as i64), title, items, undone: false }
}

// ---------- History file

fn history_path() -> Result<PathBuf, String> {
    let base = crate::scan::known_folder(&windows::Win32::UI::Shell::FOLDERID_LocalAppData).ok_or("Couldn't find your app data folder")?;
    Ok(base.join("io.github.kamalsdhami.lagsmith").join("history.json"))
}

pub(crate) fn load_history(path: &Path) -> Result<Vec<ChangeSet>, String> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("History is damaged and wasn't changed: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(format!("Couldn't read History: {e}")),
    }
}

/// Write to a temp file and rename it over the old one, so a crash never leaves half a file.
pub(crate) fn save_history(path: &Path, history: &[ChangeSet]) -> Result<(), String> {
    let keep = &history[history.len().saturating_sub(MAX_HISTORY)..];
    let dir = path.parent().ok_or("Bad History path")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("Couldn't create the History folder: {e}"))?;
    let json = serde_json::to_vec_pretty(keep).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("Couldn't save History: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Couldn't save History: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(id: &str, can_toggle: bool) -> StartupApp {
        StartupApp { name: id.into(), command: "x.exe".into(), source: "HKCU Run".into(), enabled: true, id: id.into(), can_toggle }
    }

    #[test]
    fn gate_blocks_protected_processes() {
        let names = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert!(gate(&names(&["explorer.exe", "chrome.exe"])).is_ok());
        assert_eq!(gate(&names(&["explorer.exe", "VALORANT-Win64-Shipping.exe"])), Err(GATE_MESSAGE.to_string()));
        assert!(gate(&names(&["vgtray.exe", "RiotClientServices.exe"])).is_ok()); // tray and launcher don't block
        assert!(gate(&names(&["vgc.exe"])).is_err());
        assert!(gate(&names(&["EasyAntiCheat_EOS.exe"])).is_err());
    }

    #[test]
    fn validation_rejects_untrusted_input() {
        let current = [app("HKCU Run|Discord", true), app("HKCU Run|RiotClient", false), app("HKLM Run|Riot Vanguard", false)];
        assert!(toggleable("HKCU Run|Discord", &current).is_ok());
        assert!(toggleable(r"C:\Windows\System32\drivers\vgk.sys", &current).is_err(), "a path");
        assert!(toggleable("HKCU Run|NotThere", &current).is_err(), "unknown id");
        assert!(toggleable("HKCU Run|RiotClient", &current).is_err(), "protected id");
        assert!(toggleable("HKLM Run|Riot Vanguard", &current).is_err(), "HKLM id");
        assert!(valid_mode("balanced").is_ok());
        assert!(valid_mode("ultimate").is_err());
        assert!(valid_cache("npm").is_ok());
        for bad in ["..", r"C:\Users", "npm/../..", "vanguard", ""] {
            assert!(valid_cache(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn can_toggle_rules() {
        use crate::scan::startup::never_toggle;
        assert!(never_toggle("RiotClient", r"D:\Game\Riot Games\Riot Client\RiotClientServices.exe"));
        assert!(never_toggle("Tray", r#""C:\Program Files\Riot Vanguard\vgtray.exe""#));
        assert!(never_toggle("SecurityHealth", r"%windir%\system32\SecurityHealthSystray.exe"));
        assert!(never_toggle("x", r"C:\Games\FACEIT\faceit.exe"));
        assert!(!never_toggle("Discord", r#""C:\Users\k\AppData\Local\Discord\Discord.exe" --processStart Discord.exe"#));
    }

    #[test]
    fn history_round_trip_is_atomic() {
        let dir = std::env::temp_dir().join(format!("lagsmith-history-{}", new_set(String::new(), vec![]).id));
        let path = dir.join("history.json");
        let set = new_set("Test".into(), vec![item("x".into(), Ok(Some(UndoData::GameBarCapture { previous: None, previous_store: Some(true) })))]);
        save_history(&path, std::slice::from_ref(&set)).expect("save");
        assert!(!path.with_extension("json.tmp").exists());
        let back = load_history(&path).expect("load");
        assert_eq!(back.len(), 1);
        assert!(matches!(back[0].items[0].undo, Some(UndoData::GameBarCapture { previous: None, previous_store: Some(true) })));
        std::fs::write(&path, b"{not json").expect("corrupt");
        assert!(load_history(&path).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }
}
