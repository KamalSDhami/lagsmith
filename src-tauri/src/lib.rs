mod model;
mod scan;

use model::*;

// All commands are read-only, take no arguments, and run off the UI thread.
// Errors are returned as plain strings for the UI to show.
#[tauri::command]
async fn get_hardware() -> Result<Hardware, String> { blocking(scan::hardware::read).await }
#[tauri::command]
async fn get_storage() -> Result<Storage, String> { blocking(scan::storage::read).await }
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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_hardware, get_storage, get_stability, get_startup,
            get_memory, get_security, check_driver_updates
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lagsmith");
}
