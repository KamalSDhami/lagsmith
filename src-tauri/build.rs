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
    ])))
    .expect("failed to run tauri-build");
}
