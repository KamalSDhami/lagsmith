fn main() {
    // Declaring the app's commands generates an `allow-<command>` permission for each, so the
    // capability can grant exactly these and nothing else.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
        "get_hardware",
        "get_storage",
        "get_caches",
        "get_stability",
        "get_startup",
        "get_memory",
        "get_security",
        "check_driver_updates",
        "get_system",
        "get_anticheat",
        "list_crash_dumps",
        "get_disk_usage",
        "get_store_apps",
        "get_history",
        "apply_changes",
        "undo_change",
    ])))
    .expect("failed to run tauri-build");
}
