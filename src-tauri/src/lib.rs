mod model;
mod scan;

use model::*;

// All commands are read-only, take no arguments, and run off the UI thread.
// Errors are returned as plain strings for the UI to show.
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
            get_memory, get_security, check_driver_updates
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lagsmith");
}
