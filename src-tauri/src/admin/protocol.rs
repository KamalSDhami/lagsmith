//! Shared by the app and lagsmith-helper (included there with #[path]): the action allow-list,
//! argument checks, exit codes and the JSON-lines messages on the pipe.

use crate::model::{AdminEvent, AdminResult};
use serde::{Deserialize, Serialize};

pub const ACTIONS: [&str; 4] = ["analyze-dumps", "sfc", "dism-restorehealth", "restore-point"];

// Helper exit codes when it never got as far as sending a result.
pub const EXIT_BAD_ARGS: u32 = 2;
pub const EXIT_GAME_RUNNING: u32 = 3;
pub const EXIT_PIPE_REFUSED: u32 = 4; // pipe missing, or its server isn't lagsmith.exe beside the helper
pub const EXIT_SYSTEM_DLL: u32 = 5;

#[derive(Serialize, Deserialize, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HelperMessage {
    Progress(AdminEvent),
    Done(AdminResult),
}

pub fn valid_action(a: &str) -> bool {
    ACTIONS.contains(&a)
}

/// Exactly `\.\pipe\lagsmith-` followed by 32 lowercase hex digits.
pub fn valid_pipe_name(p: &str) -> bool {
    p.strip_prefix(r"\.\pipe\lagsmith-").is_some_and(|hex| hex.len() == 32 && hex.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
}

/// The helper's whole command line: exactly `<action-id> <pipe-name>`.
pub fn parse_args(args: &[String]) -> Option<(&str, &str)> {
    match args {
        [action, pipe] if valid_action(action) && valid_pipe_name(pipe) => Some((action, pipe)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PIPE: &str = r"\.\pipe\lagsmith-0123456789abcdef0123456789abcdef";

    fn args(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn accepts_only_exact_arguments() {
        assert_eq!(parse_args(&args(&["sfc", PIPE])), Some(("sfc", PIPE)));
        for a in ACTIONS {
            assert!(parse_args(&args(&[a, PIPE])).is_some());
        }
        let bad: &[&[&str]] = &[
            &[],
            &["sfc"],
            &["sfc", PIPE, "extra"],
            &["SFC", PIPE],
            &["sfc /scannow", PIPE],
            &["format-c", PIPE],
            &[r"..\..\cmd.exe", PIPE],
            &["sfc", r"\.\pipe\lagsmith-0123456789ABCDEF0123456789ABCDEF"],
            &["sfc", r"\.\pipe\lagsmith-0123456789abcdef0123456789abcde"],
            &["sfc", r"\.\pipe\lagsmith-0123456789abcdef0123456789abcdef0"],
            &["sfc", r"\evil\pipe\lagsmith-0123456789abcdef0123456789abcdef"],
            &["sfc", r"C:\Users\x\lagsmith-0123456789abcdef0123456789abcdef"],
            &["sfc", r"\.\pipe\lagsmith-0123456789abcdef0123456789abcde\"],
            &["sfc", r"\.\pipe\other-0123456789abcdef0123456789abcdef"],
            &["sfc", r"\.\pipe\lagsmith-../../0123456789abcdef0123456789ab"],
        ];
        for b in bad {
            assert!(parse_args(&args(b)).is_none(), "{b:?}");
        }
    }

    #[test]
    fn messages_round_trip() {
        let m = HelperMessage::Progress(AdminEvent { stage: "Verification 45% complete".into(), percent: Some(45.0) });
        let line = serde_json::to_string(&m).expect("json");
        assert_eq!(serde_json::from_str::<HelperMessage>(&line).expect("parse"), m);
    }
}
