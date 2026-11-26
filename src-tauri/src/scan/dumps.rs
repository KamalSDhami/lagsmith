//! Lists minidumps by name, time and size. Listing needs no admin; the files are never opened.

use crate::model::*;
use std::time::UNIX_EPOCH;

pub fn list() -> Result<Vec<CrashDump>, String> {
    let windir = std::env::var("WINDIR").map_err(|_| "Couldn't find the Windows folder".to_string())?;
    let dir = std::path::Path::new(&windir).join("Minidump");
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(format!("Couldn't list crash dumps: {e}")),
    };
    let mut dumps: Vec<(i64, CrashDump)> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("dmp")))
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            let secs = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs() as i64;
            let file = e.file_name().to_string_lossy().into_owned();
            Some((secs, CrashDump { file, time: super::rfc3339_from_unix(secs), bytes: meta.len() }))
        })
        .collect();
    dumps.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(dumps.into_iter().map(|(_, d)| d).collect())
}
