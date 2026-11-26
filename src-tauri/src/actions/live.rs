//! Live action tests. They call apply_one/undo_one directly, below the anti-cheat gate (Vanguard's
//! tray is always running on the dev PC) and without touching the real History file.
//! `cargo test -j 3 actions::live -- --ignored --nocapture --test-threads=1`

use super::settings::{self, CAPTURE, CAPTURE_STORE, GAME_MODE, read_dword, write_dword};
use super::{apply_one, undo_one};
use crate::model::*;
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_WRITE};

const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVED_RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
const TEST_ENTRY: &str = "LagsmithTestEntry";

fn done(items: Vec<ChangeItem>) -> ChangeItem {
    let item = items.into_iter().next().expect("one item");
    assert_eq!(item.status, "done", "{}: {}", item.description, item.detail);
    item
}

fn test_entry() -> Option<StartupApp> {
    crate::scan::startup::read().expect("startup").into_iter().find(|a| a.id == format!("HKCU Run|{TEST_ENTRY}"))
}

struct RemoveTestEntry;
impl Drop for RemoveTestEntry {
    fn drop(&mut self) {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for path in [RUN, APPROVED_RUN] {
            if let Ok(k) = hkcu.open_subkey_with_flags(path, KEY_READ | KEY_WRITE) {
                let _ = k.delete_value(TEST_ENTRY);
            }
        }
    }
}

#[test]
#[ignore]
fn startup_toggle_and_undo_on_own_test_entry() {
    let _cleanup = RemoveTestEntry;
    let (run, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey_with_flags(RUN, KEY_READ | KEY_WRITE).expect("Run key");
    run.set_value(TEST_ENTRY, &"notepad.exe").expect("create test entry");

    let entry = test_entry().expect("test entry listed");
    assert!(entry.enabled && entry.can_toggle);

    let off = done(apply_one(&ChangeRequest::StartupEnabled { id: entry.id.clone(), enabled: false }));
    assert!(!test_entry().expect("listed").enabled, "now disabled");
    let raw = RegKey::predef(HKEY_CURRENT_USER).open_subkey(APPROVED_RUN).and_then(|k| k.get_raw_value(TEST_ENTRY)).expect("approved value");
    assert_eq!((raw.bytes.len(), raw.bytes[0]), (12, 3));
    println!("disabled: {:02x?}", &raw.bytes[..]);

    let back = undo_one(off.undo.as_ref().expect("undo data"));
    assert_eq!(back.status, "done", "{}", back.detail);
    assert!(test_entry().expect("listed").enabled, "enabled again");
    // A toggle never deletes the Run value.
    assert_eq!(run.get_value::<String, _>(TEST_ENTRY).expect("still there"), "notepad.exe");
}

/// Puts Game Mode, Game Bar and the power overlay back exactly as found, even if the test fails.
struct Restore {
    game_mode: Option<u32>,
    capture: Option<u32>,
    store: Option<u32>,
    overlay: windows::core::GUID,
}
impl Drop for Restore {
    fn drop(&mut self) {
        let _ = write_dword(GAME_MODE, self.game_mode);
        let _ = write_dword(CAPTURE, self.capture);
        let _ = write_dword(CAPTURE_STORE, self.store);
        let _ = settings::set_overlay(self.overlay);
    }
}

#[test]
#[ignore]
fn gaming_settings_apply_and_undo_exactly() {
    let snapshot = || {
        (
            read_dword(GAME_MODE).expect("game mode"),
            read_dword(CAPTURE).expect("capture"),
            read_dword(CAPTURE_STORE).expect("store"),
            settings::actual_overlay().expect("overlay"),
        )
    };
    let original = snapshot();
    println!("original (restore by hand if killed): {original:?}");
    let _restore = Restore { game_mode: original.0, capture: original.1, store: original.2, overlay: original.3 };

    let gm_on = original.0.is_none_or(|v| v != 0);
    let cap_on = original.1.is_some_and(|v| v != 0);
    let mode = crate::scan::system::overlay_mode(&original.3);
    let other = if mode == "balanced" { "best_performance" } else { "balanced" };

    let undo: Vec<UndoData> = [
        ChangeRequest::GameMode { on: !gm_on },
        ChangeRequest::GameBarCapture { on: !cap_on },
        ChangeRequest::PowerMode { mode: other.into() },
    ]
    .iter()
    .map(|c| done(apply_one(c)).undo.expect("undo data"))
    .collect();
    let changed = snapshot();
    println!("changed: {changed:?}");
    assert_ne!(changed, original);
    assert_eq!(crate::scan::system::overlay_mode(&changed.3), other);

    for u in undo.iter().rev() {
        let r = undo_one(u);
        assert_eq!(r.status, "done", "{}: {}", r.description, r.detail);
    }
    assert_eq!(snapshot(), original, "undo must restore every value exactly");
}
