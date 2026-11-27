//! IPC contract. Mirrored by `src/types.ts`; change both together.
//! Everything here is read-only data. Sizes are in bytes, times are RFC 3339 strings.
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Hardware {
    pub user_name: String,      // Windows display name, first name only if available, for the greeting
    pub device: String,        // "LENOVO ThinkPad T480 (20L6S42005)"
    pub os: String,             // "Windows 11 Pro 26H2 (build 26300.9974)"
    pub cpu: String,
    pub cpu_cores: u32,
    pub cpu_threads: u32,
    pub bios_version: String,    // "N24ET81W (1.56)"
    pub ram_bytes: u64,
    pub ram_sticks: u32,
    pub ram_slots: u32,
    pub ram_speed_mhz: u32,
    pub gpus: Vec<Gpu>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    pub vendor: String,          // "Intel" | "NVIDIA" | "AMD" | other
    pub kind: GpuKind,
    pub dedicated_bytes: u64,
    pub driver_version: String,
    pub driver_date: Option<String>,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum GpuKind { Integrated, Dedicated, Software }

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Storage {
    pub drives: Vec<Drive>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Drive {
    pub letter: String,          // "C:"
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub is_system: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CacheItem {
    pub id: String,              // fixed allow-list id, e.g. "npm", "gradle"
    pub name: String,            // "npm cache"
    pub display_path: String,    // "AppData\\Local\\npm-cache" (user part shortened)
    pub bytes: u64,
    pub group: CacheGroup,
}

#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub enum CacheGroup { DevCache, SystemTemp }

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Stability {
    pub days: Vec<DayEvents>,    // last 30 days, oldest first
    pub crashes: Vec<Crash>,     // blue screens, newest first
    pub driver_resets: u32,      // Event 4101 in 30 days
    pub app_crashes: Vec<AppCrash>, // Application log 1000 (crash) and 1002 (hang), 30 days, newest first, max 50
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppCrash {
    pub time: String,
    pub app: String,             // "vgm.exe"
    pub module: String,          // faulting module, "" for hangs
    pub hang: bool,              // true for event 1002
}

/// A1, A11, A12, A13, A18, A19: one cheap read of system state.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SystemState {
    pub page_file: Option<PageFile>,
    pub power: Power,
    pub hyper_v_running: bool,   // hypervisor present (WSL2, VBS)
    pub wsl_distros: Vec<String>,// registered distro names
    pub game_mode: Option<bool>, // HKCU GameBar AutoGameModeEnabled (None = Windows default, on)
    pub game_bar_capture: Option<bool>, // HKCU GameDVR AppCaptureEnabled
    pub last_sfc: Option<SfcResult>, // from CBS.log if readable
    pub secure_boot: Option<bool>,   // HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot\State UEFISecureBootEnabled
    pub tpm_version: Option<String>, // "2.0" | "1.2" | None if no TPM, via Tbsi_GetDeviceInfo (no admin)
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageFile { pub auto_managed: bool, pub allocated_bytes: u64, pub used_bytes: u64, pub peak_bytes: u64 }

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Power {
    pub plan: String,            // "Balanced"
    pub mode: String,            // "best_performance" | "balanced" | "best_efficiency" | "unknown" (overlay)
    pub on_battery: bool,
    pub battery_percent: Option<u8>,
    pub battery_design_wh: Option<f32>,
    pub battery_full_wh: Option<f32>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SfcResult { pub time: String, pub outcome: String } // "no_problems" | "repaired" | "could_not_repair" | "unknown"

/// A9: anti-cheat presence, read from the Service Control Manager and Uninstall keys only. Never opens their processes.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AntiCheat {
    pub name: String,            // "Riot Vanguard"
    pub installed: bool,
    pub service: String,         // "vgk"
    pub state: String,           // "running" | "stopped" | "missing"
    pub start_type: String,      // "boot" | "system" | "auto" | "manual" | "disabled" | "unknown"
}

/// A8 (listing only; reading dumps needs the admin helper).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CrashDump { pub file: String, pub time: String, pub bytes: u64 }

/// A15: what fills the drive. Slow; called only from the Storage page.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsage {
    pub programs: Vec<SizedItem>,     // installed programs by EstimatedSize, top 15
    pub wsl_disks: Vec<SizedItem>,    // ext4.vhdx per distro
    pub app_data: Vec<SizedItem>,     // %LOCALAPPDATA%\Packages and \Programs top folders, top 10
    pub user_folders: Vec<SizedItem>, // Downloads, Documents, Desktop, Videos, Pictures, ~\.cache
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SizedItem { pub name: String, pub display_path: String, pub bytes: u64 }

/// A17: known removable Store apps that are installed (fixed list, never system apps).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StoreApp { pub id: String, pub name: String, pub publisher: String }

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DayEvents {
    pub date: String,            // "2026-11-25"
    pub blue_screens: u32,
    pub unexpected_shutdowns: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Crash {
    pub time: String,
    pub code: String,            // "0x000000CE"
    pub meaning: String,         // plain English for known codes, else ""
    pub dump_file: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartupApp {
    pub name: String,
    pub command: String,
    pub source: String,          // "HKCU Run" | "HKLM Run" | "Startup folder"
    pub enabled: bool,           // from StartupApproved
    pub id: String,              // stable id: "<source>|<value or file name>"; actions refer to entries by this
    pub can_toggle: bool,        // false for HKLM (needs admin) and for anti-cheat/game entries (never)
}

/// C4: per-app Windows graphics preference (`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GpuAppPreference {
    pub name: String,            // display name or exe stem
    pub exe: String,             // full executable path
    pub preference: String,      // "auto" | "power_saving" | "high_performance"
    pub source: String,          // "Windows graphics settings" | "Installed app"
}

// ---------- Phase 2: actions. Every change goes through `apply_changes`, is validated in Rust,
// ---------- refused while a protected game is running, and recorded in History for undo.

#[derive(serde::Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ChangeRequest {
    StartupEnabled { id: String, enabled: bool },
    GameMode { on: bool },
    GameBarCapture { on: bool },
    PowerMode { mode: String },          // "best_performance" | "balanced" | "best_efficiency"
    CleanCaches { ids: Vec<String> },    // allow-listed cache ids from get_caches only
    GpuPreference { exe: String, preference: String }, // "auto" | "power_saving" | "high_performance"
    RemoveStoreApp { id: String },       // package name from get_store_apps only; cannot be undone (C9)
    WslMove { distro: String, target: String }, // distro from the WSL scan, absolute folder on another fixed drive (C8)
}

#[derive(Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChangeSet {
    pub id: String,              // unique, time-based
    pub time: String,
    pub title: String,           // "Gaming optimization", "Cleanup", "Startup"
    pub items: Vec<ChangeItem>,
    pub undone: bool,
}

#[derive(Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChangeItem {
    pub description: String,     // "Turned off Discord at startup", "Cleared npm cache (4.5 GB)"
    pub status: String,          // "done" | "skipped" | "failed"
    pub detail: String,          // reason when skipped/failed, "" otherwise
    pub undo: Option<UndoData>,  // None = can't be undone (caches refill on their own)
    pub freed_bytes: u64,
    // C9: package family name of a removed Store app, so the UI can offer "Reinstall from Microsoft Store".
    #[serde(default, rename = "reinstallPfn")]
    pub reinstall_pfn: Option<String>,
}

#[derive(Serialize, serde::Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UndoData {
    StartupEnabled { id: String, enabled: bool },
    GameMode { previous: Option<bool> },
    // `previous` is GameDVR AppCaptureEnabled; `previousStore` is GameConfigStore GameDVR_Enabled.
    // Both are needed to restore exactly (None = the value was absent, so undo deletes it).
    GameBarCapture {
        previous: Option<bool>,
        #[serde(default, rename = "previousStore")]
        previous_store: Option<bool>,
    },
    PowerMode { previous: String },
    GpuPreference { exe: String, previous: Option<String> },
    // C8: undo moves the distro back to the folder it came from.
    WslMove { distro: String, original: String },
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub commit_bytes: u64,
    pub commit_limit_bytes: u64,
    pub top_apps: Vec<AppMemory>, // top 8 by private working set (as Task Manager), grouped by exe name; anti-cheat processes skipped
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppMemory {
    pub name: String,            // "chrome.exe"
    pub processes: u32,
    pub bytes: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DriverUpdates {
    pub checked_at: String,
    pub updates: Vec<DriverUpdate>, // only real upgrades: newer than installed
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DriverUpdate {
    pub title: String,
    pub driver_class: String,
    pub date: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Security {
    pub memory_integrity: bool,
}

// ---------- Phase 3: the elevated helper (run_admin_task). Also compiled into lagsmith-helper,
// ---------- which sends these as JSON lines over a private named pipe.

/// Live progress from the helper, streamed through the command's channel.
#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdminEvent {
    pub stage: String,           // "Verification 45% complete", "Analysing 112526-14828-01.dmp"
    pub percent: Option<f32>,    // 0..=100 when the tool reports it
}

#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdminResult {
    pub task: String,            // "analyze-dumps" | "sfc" | "dism-restorehealth" | "restore-point"
    pub ok: bool,
    // analyze-dumps: "analyzed" | "no_dumps" | "failed"
    // sfc: "no_problems" | "repaired" | "could_not_repair" | "failed"
    // dism-restorehealth: "no_problems" | "repaired" | "source_missing" | "failed"
    // restore-point: "created" | "already_exists" | "protection_off" | "failed"
    pub outcome: String,
    pub message: String,         // plain English for the UI
    pub exit_code: Option<u32>,  // sfc/dism process exit code
    pub dumps: Vec<DumpAnalysis>, // analyze-dumps only, newest first
}

#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DumpAnalysis {
    pub file: String,                  // "112526-14828-01.dmp"
    pub bugcheck_code: String,         // "0x000000CE"
    pub parameters: Vec<String>,       // the 4 bugcheck arguments, "0xfffff8078e6cd9bd"
    pub suspect_module: Option<String>, // "vgk.sys", or None if the faulting address couldn't be resolved
    pub suspect_from: Option<String>,  // "loaded" | "unloaded"
    pub drivers: Vec<String>,          // non-Microsoft drivers (image path outside the Windows folder)
    pub drivers_label: String,         // "cause" when the faulting address resolved to suspect_module, else "drivers present"
    pub loaded_modules: u32,
    pub unloaded_modules: u32,
    pub error: Option<String>,         // which step failed, if any
}
