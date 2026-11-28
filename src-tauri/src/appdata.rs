//! Lagsmith's own files (History, settings, findings, dump analyses) in %LOCALAPPDATA%\io.github.kamalsdhami.lagsmith.

use serde::{Serialize, de::DeserializeOwned};
use std::path::{Path, PathBuf};

pub fn dir() -> Result<PathBuf, String> {
    let base = crate::scan::known_folder(&windows::Win32::UI::Shell::FOLDERID_LocalAppData).ok_or("Couldn't find your app data folder")?;
    Ok(base.join("io.github.kamalsdhami.lagsmith"))
}

pub fn file(name: &str) -> Result<PathBuf, String> {
    Ok(dir()?.join(name))
}

/// Write to a temp file and rename it over the old one, so a crash never leaves half a file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    std::fs::create_dir_all(path.parent().ok_or_else(|| std::io::Error::other("no parent folder"))?)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

pub fn save_json<T: Serialize + ?Sized>(path: &Path, value: &T) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    write_atomic(path, &json).map_err(|e| format!("Couldn't save {}: {e}", path.file_name().unwrap_or_default().to_string_lossy()))
}

/// None when the file doesn't exist yet; Err when it exists but can't be read or parsed.
pub fn load_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    match std::fs::read(path) {
        Ok(b) => serde_json::from_slice(&b).map(Some).map_err(|e| format!("{name} is damaged: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Couldn't read {name}: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_round_trip_and_missing_file() {
        let dir = std::env::temp_dir().join(format!("lagsmith-appdata-{}", std::process::id()));
        let p = dir.join("x.json");
        assert_eq!(load_json::<Vec<u32>>(&p), Ok(None));
        save_json(&p, &[1u32, 2]).unwrap();
        assert_eq!(load_json::<Vec<u32>>(&p), Ok(Some(vec![1, 2])));
        std::fs::write(&p, b"{").unwrap();
        assert!(load_json::<Vec<u32>>(&p).unwrap_err().contains("damaged"));
        let _ = std::fs::remove_dir_all(dir);
    }
}
