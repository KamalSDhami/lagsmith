//! Spots a repair that is already running (a Lagsmith helper from an earlier session, or sfc.exe/dism.exe
//! started by anything else). Process image names from a snapshot only: no process is ever opened.

use crate::scan::protected;

/// Display names of the repair tools in `names`, e.g. `["SFC"]`. The Lagsmith helper is listed only when
/// no tool is, so a helper that is running a different task (or just starting) still shows up.
pub fn detect(names: &[String]) -> Vec<String> {
    let has = |wanted: &[&str]| names.iter().any(|n| wanted.contains(&n.to_ascii_lowercase().as_str()));
    let mut found = Vec::new();
    if has(&["sfc.exe"]) {
        found.push("SFC".to_string());
    }
    if has(&["dism.exe", "dismhost.exe"]) {
        found.push("DISM".to_string());
    }
    if found.is_empty() && has(&["lagsmith-helper.exe"]) {
        found.push("Lagsmith admin helper".to_string());
    }
    found
}

/// Why a new SFC or DISM must not start now, if something is already running. Other tasks are fine.
pub fn conflict(task: &str, names: &[String]) -> Option<String> {
    if task != "sfc" && task != "dism-restorehealth" {
        return None;
    }
    let found = detect(names);
    if found.is_empty() {
        return None;
    }
    Some(format!(
        "{} is already running on this PC (started earlier by Lagsmith, or by another program). Wait for it to finish, then try again. System Repair shows the result when it does.",
        found.join(" and ")
    ))
}

/// For the System Repair banner.
pub fn background_repair() -> Result<Vec<String>, String> {
    Ok(detect(&protected::process_names()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn detects_repair_tools_by_name_ignoring_case() {
        assert!(detect(&n(&["explorer.exe", "chrome.exe"])).is_empty());
        assert_eq!(detect(&n(&["explorer.exe", "SFC.EXE"])), ["SFC"]);
        assert_eq!(detect(&n(&["Dism.exe", "DismHost.exe"])), ["DISM"]);
        assert_eq!(detect(&n(&["sfc.exe", "lagsmith-helper.exe", "dism.exe"])), ["SFC", "DISM"]);
        assert_eq!(detect(&n(&["lagsmith-helper.exe"])), ["Lagsmith admin helper"]);
    }

    #[test]
    fn only_sfc_and_dism_are_refused_while_a_repair_runs() {
        let running = n(&["sfc.exe"]);
        let msg = conflict("sfc", &running).expect("refused");
        assert!(msg.starts_with("SFC is already running"), "{msg}");
        assert!(conflict("dism-restorehealth", &running).is_some());
        assert!(conflict("restore-point", &running).is_none());
        assert!(conflict("analyze-dumps", &running).is_none());
        assert!(conflict("sfc", &n(&["explorer.exe"])).is_none());
    }
}
