// IPC contract. Mirrors src-tauri/src/model.rs; change both together.
// Sizes are bytes, times are RFC 3339 strings.

export type GpuKind = "integrated" | "dedicated" | "software";

export interface Gpu {
  name: string;
  vendor: string;
  kind: GpuKind;
  dedicatedBytes: number;
  driverVersion: string;
  driverDate: string | null;
}

export interface Hardware {
  userName: string;
  device: string;
  os: string;
  cpu: string;
  cpuCores: number;
  cpuThreads: number;
  biosVersion: string;
  ramBytes: number;
  ramSticks: number;
  ramSlots: number;
  ramSpeedMhz: number;
  gpus: Gpu[];
}

export interface Drive { letter: string; totalBytes: number; freeBytes: number; isSystem: boolean }
export interface CacheItem { id: string; name: string; displayPath: string; bytes: number; group: "devCache" | "systemTemp" }
export interface Storage { drives: Drive[] }

export interface DayEvents { date: string; blueScreens: number; unexpectedShutdowns: number }
export interface Crash { time: string; code: string; meaning: string; dumpFile: string | null }
export interface AppCrash { time: string; app: string; module: string; hang: boolean }
export interface Stability { days: DayEvents[]; crashes: Crash[]; driverResets: number; appCrashes: AppCrash[] }

export interface PageFile { autoManaged: boolean; allocatedBytes: number; usedBytes: number; peakBytes: number }
export interface Power {
  plan: string;
  mode: "best_performance" | "balanced" | "best_efficiency" | "unknown";
  onBattery: boolean;
  batteryPercent: number | null;
  batteryDesignWh: number | null;
  batteryFullWh: number | null;
}
export interface SfcResult { time: string; outcome: "no_problems" | "repaired" | "could_not_repair" | "unknown" }
export interface SystemState {
  pageFile: PageFile | null;
  power: Power;
  hyperVRunning: boolean;
  wslDistros: string[];
  gameMode: boolean | null;
  gameBarCapture: boolean | null;
  lastSfc: SfcResult | null;
  secureBoot: boolean | null;
  tpmVersion: string | null;
}
export interface AntiCheat { name: string; installed: boolean; service: string; state: "running" | "stopped" | "missing"; startType: string }
export interface CrashDump { file: string; time: string; bytes: number }
export interface SizedItem { name: string; displayPath: string; bytes: number }
export interface DiskUsage { programs: SizedItem[]; wslDisks: SizedItem[]; appData: SizedItem[]; userFolders: SizedItem[] }
export interface StoreApp { id: string; name: string; publisher: string }

export interface StartupApp { name: string; command: string; source: string; enabled: boolean; id: string; canToggle: boolean }

export type GpuPref = "auto" | "power_saving" | "high_performance";
export interface GpuAppPreference { name: string; exe: string; preference: GpuPref; source: string }

// Phase 2: actions. All go through apply_changes (validated in Rust, refused while a protected game runs).
export type ChangeRequest =
  | { kind: "startupEnabled"; id: string; enabled: boolean }
  | { kind: "gameMode"; on: boolean }
  | { kind: "gameBarCapture"; on: boolean }
  | { kind: "powerMode"; mode: "best_performance" | "balanced" | "best_efficiency" }
  | { kind: "cleanCaches"; ids: string[] }
  | { kind: "gpuPreference"; exe: string; preference: GpuPref }
  | { kind: "removeStoreApp"; id: string } // C9: cannot be undone
  | { kind: "wslMove"; distro: string; target: string }; // C8: undo moves it back

export interface ChangeItem { description: string; status: "done" | "skipped" | "failed"; detail: string; undo: unknown | null; freedBytes: number; reinstallPfn?: string | null }
export interface ChangeSet { id: string; time: string; title: string; items: ChangeItem[]; undone: boolean }

export interface AppMemory { name: string; processes: number; bytes: number }
export interface Memory {
  totalBytes: number;
  availableBytes: number;
  commitBytes: number;
  commitLimitBytes: number;
  topApps: AppMemory[];
}

export interface DriverUpdate { title: string; driverClass: string; date: string | null }
export interface DriverUpdates { checkedAt: string; updates: DriverUpdate[] }

export interface Security { memoryIntegrity: boolean }

export type Commands = {
  get_hardware: Hardware;
  get_storage: Storage;
  get_caches: CacheItem[];
  get_stability: Stability;
  get_startup: StartupApp[];
  get_memory: Memory;
  get_security: Security;
  check_driver_updates: DriverUpdates;
  get_system: SystemState;
  get_anticheat: AntiCheat[];
  list_crash_dumps: CrashDump[];
  get_disk_usage: DiskUsage;
  get_store_apps: StoreApp[];
  get_gpu_preferences: GpuAppPreference[];
  get_history: ChangeSet[];
  /** Repair tools already running on this PC ("SFC", "DISM"), by process name. */
  get_background_repair: string[];
};

// Commands that take arguments (all validated in Rust).
export type ActionCommands = {
  apply_changes: { args: { title: string; changes: ChangeRequest[] }; result: ChangeSet };
  undo_change: { args: { id: string }; result: ChangeSet };
};

// Phase 3: elevated admin tasks (run_admin_task). Progress streams via Channel<AdminEvent>.
export type AdminTask = "analyze-dumps" | "sfc" | "dism-restorehealth" | "restore-point";

export interface AdminEvent {
  stage: string;
  percent: number | null;
}

export interface DumpAnalysis {
  file: string;
  bugcheckCode: string;
  parameters: string[];
  suspectModule: string | null;
  suspectFrom: "loaded" | "unloaded" | null;
  drivers: string[];
  driversLabel: "cause" | "drivers present";
  loadedModules: number;
  unloadedModules: number;
  error: string | null;
}

export interface AdminResult {
  task: AdminTask;
  ok: boolean;
  outcome: string;
  message: string;
  exitCode: number | null;
  dumps: DumpAnalysis[];
}
