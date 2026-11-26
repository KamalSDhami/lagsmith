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
  ramBytes: number;
  ramSticks: number;
  ramSlots: number;
  ramSpeedMhz: number;
  gpus: Gpu[];
}

export interface Drive { letter: string; totalBytes: number; freeBytes: number; isSystem: boolean }
export interface CacheItem { id: string; name: string; displayPath: string; bytes: number; group: "devCache" | "systemTemp" }
export interface Storage { drives: Drive[]; caches: CacheItem[] }

export interface DayEvents { date: string; blueScreens: number; unexpectedShutdowns: number }
export interface Crash { time: string; code: string; meaning: string; dumpFile: string | null }
export interface Stability { days: DayEvents[]; crashes: Crash[]; driverResets: number }

export interface StartupApp { name: string; command: string; source: string; enabled: boolean }

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
  get_stability: Stability;
  get_startup: StartupApp[];
  get_memory: Memory;
  get_security: Security;
  check_driver_updates: DriverUpdates;
};
