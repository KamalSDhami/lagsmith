//! RAM cleaner: EmptyWorkingSet on normal user apps, by hand or from the auto-clean watcher.
//! Never opens a game, anti-cheat or system process: the name check comes before OpenProcess
//! (docs/ANTI-CHEAT.md rules 1 and 4). Refused while a game session runs. The standby-list purge
//! is a separate admin helper task and never runs automatically.

use crate::model::*;
use crate::scan::{memory, protected};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::ProcessStatus::K32EmptyWorkingSet;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA};

/// Never trimmed even though they aren't games: Windows' own core and shell processes, and Lagsmith.
const NEVER: &[&str] = &[
    "system", "registry", "memory compression", "secure system", "smss.exe", "csrss.exe", "wininit.exe", "services.exe",
    "lsass.exe", "lsaiso.exe", "winlogon.exe", "fontdrvhost.exe", "dwm.exe", "explorer.exe", "svchost.exe", "audiodg.exe",
    "msmpeng.exe", "securityhealthservice.exe",
];

const CHECK_EVERY: Duration = Duration::from_secs(30);
const COOLDOWN_SECS: u64 = 10 * 60;
const REARM_BELOW: u8 = 10; // points under the threshold use must fall before another auto-clean

// One clean at a time, manual or automatic.
static RUN: Mutex<()> = Mutex::new(());

/// True if `exe` is an ordinary user app we may trim. Pure, by name only.
pub(crate) fn may_trim(exe: &str) -> bool {
    let e = exe.to_ascii_lowercase();
    !protected::is_protected(&e) && !NEVER.contains(&e.as_str()) && !e.starts_with("lagsmith")
}

pub fn clean(automatic: bool) -> Result<MemoryClean, String> {
    let _run = RUN.lock().unwrap_or_else(|p| p.into_inner());
    // One snapshot: the game check and the trim list come from the same list of processes.
    let procs = protected::processes()?;
    protected::gate(&procs.iter().map(|p| p.1.clone()).collect::<Vec<_>>())?;
    let before = memory::status()?.ullAvailPhys;
    let (mut trimmed, mut skipped_protected, mut skipped_other) = (0u32, 0u32, 0u32);
    let me = std::process::id();
    for (pid, name) in &procs {
        if *pid == 0 || *pid == 4 || *pid == me {
            continue;
        }
        if !may_trim(name) {
            skipped_protected += 1;
        } else if trim(*pid) {
            trimmed += 1;
        } else {
            skipped_other += 1; // access denied (elevated or another user's process) or already gone
        }
    }
    std::thread::sleep(Duration::from_millis(300)); // let Windows move the trimmed pages to the standby list
    let after = memory::status()?.ullAvailPhys;
    let result = MemoryClean { before_available_bytes: before, after_available_bytes: after, trimmed, skipped_protected, skipped_other };
    let title = if automatic { "Memory cleaned (automatic)" } else { "Memory cleaned" };
    let _ = super::record(title.into(), vec![super::item(
        format!("Trimmed {trimmed} apps. Available memory {} to {}", gb(before), gb(after)),
        Ok(None),
    )]);
    Ok(result)
}

fn gb(bytes: u64) -> String {
    format!("{:.1} GB", bytes as f64 / (1u64 << 30) as f64)
}

fn trim(pid: u32) -> bool {
    let Ok(h) = (unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SET_QUOTA, false, pid) }) else { return false };
    let ok = unsafe { K32EmptyWorkingSet(h) }.as_bool();
    let _ = unsafe { CloseHandle(h) };
    ok
}

// ---------- Auto-clean watcher

/// Decides when the watcher fires. Pure: the caller supplies the clock.
#[derive(Debug)]
pub(crate) struct Watch {
    armed: bool,
    last_clean: Option<u64>,
}

impl Watch {
    pub(crate) fn new() -> Self {
        Self { armed: true, last_clean: None }
    }

    /// `now` in seconds; `used` is memory use in percent. Fires at most once per crossing, and never within the cooldown.
    pub(crate) fn should_clean(&mut self, now: u64, used: u8, threshold: u8, paused: bool) -> bool {
        if used.saturating_add(REARM_BELOW) <= threshold {
            self.armed = true;
        }
        if paused || !self.armed || used < threshold || self.last_clean.is_some_and(|t| now.saturating_sub(t) < COOLDOWN_SECS) {
            return false;
        }
        self.armed = false;
        self.last_clean = Some(now);
        true
    }
}

/// Starts the watcher thread. Only trims (never the standby purge) and only when the setting is on.
pub fn start_auto_clean() {
    std::thread::spawn(|| {
        let (start, mut watch) = (Instant::now(), Watch::new());
        loop {
            std::thread::sleep(CHECK_EVERY);
            let s = crate::prefs::load();
            if !s.auto_clean.enabled {
                watch = Watch::new();
                continue;
            }
            let Ok(ms) = memory::status() else { continue };
            // An unreadable process list counts as "a game may be running".
            let paused = protected::process_names().map_or(true, |n| protected::gate(&n).is_err());
            if watch.should_clean(start.elapsed().as_secs(), ms.dwMemoryLoad.min(100) as u8, s.auto_clean.threshold_percent, paused) {
                let _ = clean(true);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_only_ordinary_user_apps() {
        for ok in ["chrome.exe", "Discord.exe", "Code.exe", "steam.exe", "Spotify.exe"] {
            assert!(may_trim(ok), "{ok}");
        }
        for no in [
            "VALORANT-Win64-Shipping.exe", "vgc.exe", "vgtray.exe", "RiotClientServices.exe", "LeagueClient.exe", "EasyAntiCheat_EOS.exe",
            "BEService.exe", "FACEIT.exe", "SomeGameAntiCheat.exe", "System", "csrss.exe", "LSASS.EXE", "dwm.exe", "explorer.exe",
            "svchost.exe", "lagsmith.exe", "lagsmith-helper.exe",
        ] {
            assert!(!may_trim(no), "{no}");
        }
    }

    #[test]
    fn watcher_fires_once_per_crossing() {
        let mut w = Watch::new();
        assert!(!w.should_clean(0, 70, 85, false)); // below
        assert!(w.should_clean(30, 86, 85, false)); // crosses
        assert!(!w.should_clean(60, 90, 85, false)); // still above, not re-armed
        assert!(!w.should_clean(5000, 90, 85, false)); // long after the cooldown, still not re-armed
        assert!(!w.should_clean(5030, 80, 85, false)); // dipped but not 10 points below
        assert!(!w.should_clean(5060, 75, 85, false)); // re-armed here...
        assert!(w.should_clean(5090, 86, 85, false)); // ...and fires again past the cooldown
    }

    #[test]
    fn watcher_respects_cooldown_and_pause() {
        let mut w = Watch::new();
        assert!(!w.should_clean(0, 95, 85, true)); // paused: a game session
        assert!(w.should_clean(30, 95, 85, false));
        assert!(!w.should_clean(60, 70, 85, false)); // re-armed by a drop...
        assert!(!w.should_clean(120, 90, 85, false)); // ...but inside the 10 minute cooldown
        assert!(w.should_clean(30 + COOLDOWN_SECS, 90, 85, false));
    }

    #[test]
    fn watcher_threshold_is_inclusive_and_never_underflows() {
        let mut w = Watch::new();
        assert!(w.should_clean(0, 85, 85, false));
        let mut w = Watch::new();
        assert!(!w.should_clean(0, 84, 85, false));
        assert!(!Watch::new().should_clean(0, 0, 60, false));
    }

    /// Really trims this PC's user apps once. `cargo test -j 3 live_clean -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_clean() {
        println!("{:#?}", clean(false));
    }
}
