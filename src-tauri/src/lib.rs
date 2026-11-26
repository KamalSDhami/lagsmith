mod actions;
mod model;
mod scan;

use model::*;

// Scan commands are read-only and take no arguments. apply_changes and undo_change are the only
// ones that change anything; actions/ re-validates their arguments and refuses while a game runs.
// Everything runs off the UI thread, and errors are plain strings for the UI to show.
#[tauri::command]
async fn get_hardware() -> Result<Hardware, String> { blocking(scan::hardware::read).await }
#[tauri::command]
async fn get_storage() -> Result<Storage, String> { blocking(scan::storage::read).await }
// Separate from get_storage: walking cache folders is slow and only the Storage Cleaner page needs it.
#[tauri::command]
async fn get_caches() -> Result<Vec<CacheItem>, String> { blocking(scan::storage::caches).await }
#[tauri::command]
async fn get_stability() -> Result<Stability, String> { blocking(scan::stability::read).await }
#[tauri::command]
async fn get_startup() -> Result<Vec<StartupApp>, String> { blocking(scan::startup::read).await }
#[tauri::command]
async fn get_memory() -> Result<Memory, String> { blocking(scan::memory::read).await }
#[tauri::command]
async fn get_security() -> Result<Security, String> { blocking(scan::security::read).await }
#[tauri::command]
async fn check_driver_updates() -> Result<DriverUpdates, String> { blocking(scan::drivers::check).await }

#[tauri::command]
async fn get_system() -> Result<SystemState, String> { blocking(scan::system::read).await }
#[tauri::command]
async fn get_anticheat() -> Result<Vec<AntiCheat>, String> { blocking(scan::anticheat::read).await }
#[tauri::command]
async fn list_crash_dumps() -> Result<Vec<CrashDump>, String> { blocking(scan::dumps::list).await }
// Slow: walks user folders and app data. Only the Storage page calls it.
#[tauri::command]
async fn get_disk_usage() -> Result<DiskUsage, String> { blocking(scan::diskusage::read).await }
#[tauri::command]
async fn get_store_apps() -> Result<Vec<StoreApp>, String> { blocking(scan::storeapps::read).await }

#[tauri::command]
async fn get_history() -> Result<Vec<ChangeSet>, String> { blocking(actions::get_history).await }
#[tauri::command]
async fn apply_changes(title: String, changes: Vec<ChangeRequest>) -> Result<ChangeSet, String> {
    tauri::async_runtime::spawn_blocking(move || actions::apply_changes(title, changes)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn undo_change(id: String) -> Result<ChangeSet, String> {
    tauri::async_runtime::spawn_blocking(move || actions::undo_change(id)).await.map_err(|e| e.to_string())?
}

async fn blocking<T: Send + 'static>(f: fn() -> Result<T, String>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Keep the process-wide MTA alive for the whole run, so WMI (used from pooled threads) never
    // loses its apartment when a scanner's own CoInitializeEx/CoUninitialize pair ends.
    // The cookie is never released; the process exiting ends it.
    let _mta = unsafe { windows::Win32::System::Com::CoIncrementMTAUsage() };
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_hardware, get_storage, get_caches, get_stability, get_startup,
            get_memory, get_security, check_driver_updates,
            get_system, get_anticheat, list_crash_dumps, get_disk_usage, get_store_apps,
            get_history, apply_changes, undo_change
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lagsmith");
}
