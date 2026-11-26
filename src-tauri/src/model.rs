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
    pub caches: Vec<CacheItem>,
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
}

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
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub commit_bytes: u64,
    pub commit_limit_bytes: u64,
    pub top_apps: Vec<AppMemory>, // top 8 by working set, grouped by exe name
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
