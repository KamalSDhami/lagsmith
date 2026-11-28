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
        "get_gpu_preferences",
        "get_history",
        "apply_changes",
        "undo_change",
        "run_admin_task",
        "get_background_repair",
        "close_app",
        "get_settings",
        "set_settings",
        "get_findings_history",
        "record_scan",
        "get_dump_analysis",
        "clean_memory",
        "open_external",
    ])))
    .expect("failed to run tauri-build");
}
