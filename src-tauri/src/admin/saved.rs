//! What the app keeps after an admin task: the last dump analysis (so "Analyze dumps" survives a
//! restart) and a History entry for the standby purge.

use crate::appdata;
use crate::model::{AdminResult, SavedDumpAnalysis};
use crate::scan::rfc3339_from_unix;

fn path() -> Result<std::path::PathBuf, String> {
    appdata::file("dump-analysis.json")
}

pub fn load_dumps() -> Result<Option<SavedDumpAnalysis>, String> {
    appdata::load_json(&path()?)
}

pub(super) fn after_task(r: &AdminResult) -> Result<(), String> {
    match (r.task.as_str(), r.outcome.as_str()) {
        ("analyze-dumps", "analyzed") => {
            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64;
            appdata::save_json(&path()?, &SavedDumpAnalysis { analyzed_at: rfc3339_from_unix(now), dumps: r.dumps.clone() })
        }
        ("purge-standby", "purged") => crate::actions::record("Memory cleaned (standby list)".into(), vec![crate::actions::item(r.message.clone(), Ok(None))]),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn result(task: &str, outcome: &str) -> AdminResult {
        AdminResult { task: task.into(), ok: true, outcome: outcome.into(), message: String::new(), exit_code: None, dumps: Vec::new() }
    }

    #[test]
    fn ignores_tasks_that_save_nothing() {
        for (t, o) in [("sfc", "no_problems"), ("restore-point", "created"), ("analyze-dumps", "no_dumps"), ("analyze-dumps", "failed"), ("purge-standby", "failed")] {
            assert_eq!(after_task(&result(t, o)), Ok(()));
        }
    }
}
