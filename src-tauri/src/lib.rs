mod actions;
mod admin;
mod appdata;
mod external;
mod findings;
mod model;
mod prefs;
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
async fn get_gpu_preferences() -> Result<Vec<GpuAppPreference>, String> { blocking(scan::gpuprefs::read).await }

#[tauri::command]
async fn get_history() -> Result<Vec<ChangeSet>, String> { blocking(actions::get_history).await }
#[tauri::command]
async fn apply_changes(title: String, changes: Vec<ChangeRequest>) -> Result<ChangeSet, String> {
    tauri::async_runtime::spawn_blocking(move || actions::apply_changes(title, changes)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn run_admin_task(task: String, on_event: tauri::ipc::Channel<model::AdminEvent>) -> Result<model::AdminResult, String> {
    tauri::async_runtime::spawn_blocking(move || admin::run_admin_task(&task, |e| { let _ = on_event.send(e); }))
        .await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn get_background_repair() -> Result<Vec<String>, String> { blocking(admin::background::background_repair).await }
// The UI calls this after the user confirms "Close anyway". The helper and sfc.exe are separate
// processes and keep running; killing a repair half way is worse than letting it finish.
#[tauri::command]
fn close_app(app: tauri::AppHandle) { app.exit(0); }
#[tauri::command]
async fn undo_change(id: String) -> Result<ChangeSet, String> {
    tauri::async_runtime::spawn_blocking(move || actions::undo_change(id)).await.map_err(|e| e.to_string())?
}

// App data: settings, findings for Resolved markers, the last dump analysis.
#[tauri::command]
async fn get_settings() -> Result<prefs::Settings, String> { blocking(|| Ok(prefs::load())).await }
#[tauri::command]
async fn set_settings(settings: prefs::Settings) -> Result<prefs::Settings, String> {
    tauri::async_runtime::spawn_blocking(move || prefs::save(settings)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn get_findings_history() -> Result<Vec<findings::Finding>, String> { blocking(findings::get).await }
#[tauri::command]
async fn record_scan(report: findings::ScanReport) -> Result<Vec<findings::Finding>, String> {
    tauri::async_runtime::spawn_blocking(move || findings::record_scan(report)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn get_dump_analysis() -> Result<Option<SavedDumpAnalysis>, String> { blocking(admin::load_dumps).await }
// Trims normal user apps' working sets. Refused while a game session runs; protected names are skipped before any handle opens.
#[tauri::command]
async fn clean_memory() -> Result<MemoryClean, String> {
    tauri::async_runtime::spawn_blocking(|| actions::memclean::clean(false)).await.map_err(|e| e.to_string())?
}
// Only links on a fixed allow-list (external.rs) are opened.
#[tauri::command]
async fn open_external(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || external::open(&url)).await.map_err(|e| e.to_string())?
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
            get_system, get_anticheat, list_crash_dumps, get_disk_usage, get_store_apps, get_gpu_preferences,
            get_history, apply_changes, undo_change, run_admin_task, get_background_repair, close_app,
            get_settings, set_settings, get_findings_history, record_scan, get_dump_analysis, clean_memory, open_external
        ])
        .setup(|_| {
            actions::memclean::start_auto_clean();
            Ok(())
        })
        .on_window_event(|window, event| {
            // While an admin task runs, closing asks first: the UI shows the prompt.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(task) = admin::running_task() {
                    api.prevent_close();
                    let _ = tauri::Emitter::emit(window, "close-blocked", task);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Lagsmith");
}
