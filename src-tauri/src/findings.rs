//! Findings store for "Resolved" markers (docs/LAYOUT-SPEC.md section 10). The UI derives findings and
//! reports each scan with `record_scan`; this module owns the state machine and the file.
//! A finding becomes Resolved only when a later scan evaluated it and found the condition gone.
//! Nothing here is ever set by a click, and a check that failed to run can never resolve anything.

use crate::appdata;
use crate::model::{ChangeSet, UndoData};
use crate::scan::rfc3339_from_unix;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// The finding ids `derive.ts` emits. Anything else is refused.
const IDS: [&str; 9] = ["crashes", "valorant-req", "disk", "power-efficiency", "gpu-pref", "ram", "startup", "battery-worn", "hvci"];
const MAX_EVIDENCE: usize = 300;
const KEEP_RESOLVED_SECS: i64 = 30 * 86_400;

static LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Open,
    Resolved,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub id: String,
    pub state: State,
    pub first_seen: String,
    pub last_seen: String, // last scan that found it Open
    pub last_evidence: String,
    pub resolved_at: Option<String>,
    pub resolved_evidence: Option<String>,
    pub came_back: bool, // was Resolved, then Open again
    /// Newest History change that touched this finding after it first appeared (and before it resolved).
    /// Context only: it never decides Resolved. Computed on read, not stored.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fix_applied_at: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Evidence {
    pub id: String,
    pub evidence: String,
}

/// One scan. `open`: conditions present. `clear`: conditions that were checked successfully and are absent.
/// An id in neither list was not checked this time (its read failed) and keeps its state.
#[derive(Deserialize, Clone, Debug)]
pub struct ScanReport {
    pub open: Vec<Evidence>,
    pub clear: Vec<Evidence>,
}

fn validate(report: &ScanReport) -> Result<(), String> {
    let mut seen = Vec::new();
    for e in report.open.iter().chain(&report.clear) {
        if !IDS.contains(&e.id.as_str()) {
            return Err(format!("Unknown finding: {}", e.id.chars().take(40).collect::<String>()));
        }
        if e.evidence.chars().count() > MAX_EVIDENCE {
            return Err("Finding evidence is too long".into());
        }
        if seen.contains(&e.id.as_str()) {
            return Err(format!("Finding {} is listed twice", e.id));
        }
        seen.push(&e.id);
    }
    Ok(())
}

/// Applies one scan to the stored findings. Pure: `now` is seconds since 1970.
pub(crate) fn apply(records: &mut Vec<Finding>, report: &ScanReport, now: i64) {
    let stamp = rfc3339_from_unix(now);
    for e in &report.open {
        match records.iter_mut().find(|r| r.id == e.id) {
            Some(r) => {
                r.came_back |= r.state == State::Resolved;
                r.state = State::Open;
                r.last_seen = stamp.clone();
                r.last_evidence = e.evidence.clone();
                r.resolved_at = None;
                r.resolved_evidence = None;
            }
            None => records.push(Finding {
                id: e.id.clone(),
                state: State::Open,
                first_seen: stamp.clone(),
                last_seen: stamp.clone(),
                last_evidence: e.evidence.clone(),
                resolved_at: None,
                resolved_evidence: None,
                came_back: false,
                fix_applied_at: None,
            }),
        }
    }
    for e in &report.clear {
        // Only a finding that was Open can resolve. The first scan after install has no record, so it can't know.
        if let Some(r) = records.iter_mut().find(|r| r.id == e.id && r.state == State::Open) {
            r.state = State::Resolved;
            r.resolved_at = Some(stamp.clone());
            r.resolved_evidence = Some(e.evidence.clone());
        }
    }
    let cutoff = rfc3339_from_unix(now - KEEP_RESOLVED_SECS);
    records.retain(|r| r.state == State::Open || r.resolved_at.as_deref().is_some_and(|t| t >= cutoff.as_str()));
}

/// True if `set` has a change that touched the finding `id`. Matches on what the change did, not on its title.
fn touches(id: &str, set: &ChangeSet) -> bool {
    set.items.iter().filter(|i| i.status == "done").any(|i| match (id, &i.undo) {
        ("disk", u) => i.freed_bytes > 0 || i.reinstall_pfn.is_some() || matches!(u, Some(UndoData::WslMove { .. })),
        ("power-efficiency", Some(UndoData::PowerMode { .. })) => true,
        ("gpu-pref", Some(UndoData::GpuPreference { .. })) => true,
        ("startup", Some(UndoData::StartupEnabled { .. })) => true,
        _ => false,
    })
}

/// Time of the newest kept change that touched `f`, between its first sighting and its resolution.
pub(crate) fn fix_applied_at(f: &Finding, history: &[ChangeSet]) -> Option<String> {
    history
        .iter()
        .filter(|s| !s.undone && !s.title.starts_with("Undo:") && touches(&f.id, s))
        .filter(|s| s.time >= f.first_seen && f.resolved_at.as_ref().is_none_or(|r| s.time <= *r))
        .map(|s| s.time.clone())
        .max()
}

fn path() -> Result<std::path::PathBuf, String> {
    appdata::file("findings.json")
}

fn with_fixes(mut records: Vec<Finding>) -> Vec<Finding> {
    let history = crate::actions::get_history().unwrap_or_default();
    for r in &mut records {
        r.fix_applied_at = fix_applied_at(r, &history);
    }
    records
}

pub fn get() -> Result<Vec<Finding>, String> {
    let _guard = LOCK.lock().unwrap_or_else(|p| p.into_inner());
    Ok(with_fixes(appdata::load_json(&path()?)?.unwrap_or_default()))
}

pub fn record_scan(report: ScanReport) -> Result<Vec<Finding>, String> {
    validate(&report)?;
    let _guard = LOCK.lock().unwrap_or_else(|p| p.into_inner());
    let path = path()?;
    let mut records: Vec<Finding> = appdata::load_json(&path)?.unwrap_or_default();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
    apply(&mut records, &report, now);
    appdata::save_json(&path, &records)?;
    Ok(with_fixes(records))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ChangeItem;

    const DAY: i64 = 86_400;
    const T0: i64 = 1_800_000_000;

    fn ev(id: &str, evidence: &str) -> Evidence {
        Evidence { id: id.into(), evidence: evidence.into() }
    }
    fn scan(open: &[(&str, &str)], clear: &[(&str, &str)]) -> ScanReport {
        ScanReport { open: open.iter().map(|(i, e)| ev(i, e)).collect(), clear: clear.iter().map(|(i, e)| ev(i, e)).collect() }
    }

    #[test]
    fn open_then_clear_resolves_and_returning_marks_came_back() {
        let mut r = Vec::new();
        apply(&mut r, &scan(&[("disk", "12.2 GB free")], &[]), T0);
        assert_eq!((r[0].state, r[0].first_seen.as_str()), (State::Open, rfc3339_from_unix(T0).as_str()));
        apply(&mut r, &scan(&[], &[("disk", "46.7 GB free")]), T0 + DAY);
        assert_eq!(r[0].state, State::Resolved);
        assert_eq!(r[0].resolved_evidence.as_deref(), Some("46.7 GB free"));
        assert_eq!(r[0].last_evidence, "12.2 GB free");
        apply(&mut r, &scan(&[("disk", "9 GB free")], &[]), T0 + 2 * DAY);
        assert_eq!((r[0].state, r[0].came_back, r[0].resolved_at.clone()), (State::Open, true, None));
        assert_eq!(r[0].first_seen, rfc3339_from_unix(T0));
    }

    #[test]
    fn first_scan_cannot_resolve_and_unchecked_ids_keep_state() {
        let mut r = Vec::new();
        apply(&mut r, &scan(&[], &[("disk", "46.7 GB free")]), T0);
        assert!(r.is_empty());
        apply(&mut r, &scan(&[("crashes", "2 blue screens"), ("disk", "12 GB")], &[]), T0);
        apply(&mut r, &scan(&[], &[("disk", "40 GB")]), T0 + DAY); // crashes read failed: absent from both lists
        let by = |id: &str| r.iter().find(|f| f.id == id).unwrap().state;
        assert_eq!((by("crashes"), by("disk")), (State::Open, State::Resolved));
    }

    #[test]
    fn resolved_are_dropped_after_30_days_open_ones_never() {
        let mut r = Vec::new();
        apply(&mut r, &scan(&[("disk", "a"), ("startup", "b")], &[]), T0);
        apply(&mut r, &scan(&[], &[("disk", "c")]), T0 + DAY);
        apply(&mut r, &scan(&[], &[]), T0 + DAY + 29 * DAY);
        assert_eq!(r.len(), 2);
        apply(&mut r, &scan(&[], &[]), T0 + DAY + 31 * DAY);
        assert_eq!(r.iter().map(|f| f.id.as_str()).collect::<Vec<_>>(), ["startup"]);
    }

    #[test]
    fn validation_rejects_unknown_duplicate_and_long() {
        assert!(validate(&scan(&[("disk", "x")], &[("startup", "y")])).is_ok());
        assert!(validate(&scan(&[("nope", "x")], &[])).is_err());
        assert!(validate(&scan(&[("disk", "x")], &[("disk", "y")])).is_err());
        assert!(validate(&scan(&[("disk", "x"), ("disk", "x")], &[])).is_err());
        assert!(validate(&scan(&[("disk", &"a".repeat(301))], &[])).is_err());
        assert!(validate(&scan(&[("disk", &"a".repeat(300))], &[])).is_ok());
    }

    fn set(time: i64, title: &str, undone: bool, item: ChangeItem) -> ChangeSet {
        ChangeSet { id: time.to_string(), time: rfc3339_from_unix(time), title: title.into(), items: vec![item], undone }
    }
    fn done(undo: Option<UndoData>, freed: u64) -> ChangeItem {
        ChangeItem { description: String::new(), status: "done".into(), detail: String::new(), undo, freed_bytes: freed, reinstall_pfn: None }
    }

    #[test]
    fn fix_date_comes_from_matching_history_between_first_seen_and_resolved() {
        let mut r = Vec::new();
        apply(&mut r, &scan(&[("power-efficiency", "x"), ("disk", "y")], &[]), T0);
        apply(&mut r, &scan(&[], &[("power-efficiency", "z")]), T0 + 3 * DAY);
        let power = UndoData::PowerMode { previous: "best_efficiency".into() };
        let history = vec![
            set(T0 - DAY, "Gaming optimization", false, done(Some(power.clone()), 0)), // before it appeared
            set(T0 + DAY, "Gaming optimization", false, done(Some(power.clone()), 0)),
            set(T0 + 2 * DAY, "Gaming optimization", true, done(Some(power.clone()), 0)), // undone
            set(T0 + 2 * DAY, "Undo: Gaming optimization", false, done(Some(power), 0)),
            set(T0 + 4 * DAY, "Cleanup", false, done(None, 5_000_000)),
        ];
        assert_eq!(fix_applied_at(&r[0], &history), Some(rfc3339_from_unix(T0 + DAY)));
        assert_eq!(fix_applied_at(&r[1], &history), Some(rfc3339_from_unix(T0 + 4 * DAY))); // disk: freed bytes, still open
        let mut startup = r[1].clone();
        startup.id = "startup".into();
        assert_eq!(fix_applied_at(&startup, &history), None);
    }
}
