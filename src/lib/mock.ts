import type { ActionCommands, ChangeItem, ChangeRequest, ChangeSet, Commands, DayEvents } from "../types";

// Sample data for `npm run dev` and the Playwright mock tests. Development only: api.ts imports
// this lazily behind import.meta.env.DEV, so it is not part of the release bundle.
//
// Values come from the user's ThinkPad T480 and docs/CASE-STUDY.md where they exist. Numbers
// the contract requires but we never measured are marked "invented" below.
//
// URL switches (all composable):
//   ?fixture=dualgpu|noram|bugcheck41|allfail|empty|tpmfail|novanguard|battery|gameRunning (repeatable)
//   ?fail=<command>   make one command fail (repeatable)
//   ?delay=<ms>       fixed delay for every command (default 300; driver check 1500, disk usage 2000)

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const gb = (n: number) => Math.round(n * GIB);

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Local date `offset` days before today, as YYYY-MM-DD. */
function dayAgo(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time `offset` days before today, as an RFC 3339 instant. */
function timeAgo(offset: number, hh: number, mm: number): string {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
}

// Case study, relative to "today" = 26 Nov: blue screens 0x50 on 24 Nov (2 days ago) and 0xCE on
// 25 Nov (1 day ago); unexpected shutdowns on 9, 16 and 24 Nov.
function days(): DayEvents[] {
  const out: DayEvents[] = [];
  for (let i = 29; i >= 0; i--) {
    out.push({
      date: dayAgo(i),
      blueScreens: i === 1 || i === 2 ? 1 : 0,
      unexpectedShutdowns: i === 2 || i === 10 || i === 17 ? 1 : 0,
    });
  }
  return out;
}

function base(): Commands {
  return {
    get_hardware: {
      userName: "Kamal",
      device: "LENOVO ThinkPad T480",
      os: "Windows 11 Pro 26H2",
      cpu: "Intel(R) Core(TM) i7-8650U CPU @ 1.90GHz",
      cpuCores: 4,
      cpuThreads: 8,
      biosVersion: "N24ET81W (1.56)",
      ramBytes: gb(8),
      ramSticks: 1,
      ramSlots: 2,
      ramSpeedMhz: 2400,
      gpus: [
        {
          name: "Intel(R) UHD Graphics 620",
          vendor: "Intel",
          kind: "integrated",
          dedicatedBytes: 0,
          driverVersion: "31.0.101.2145",
          driverDate: "2026-02-10T00:00:00Z",
        },
      ],
    },
    get_storage: {
      drives: [
        { letter: "C:", totalBytes: gb(158.6), freeBytes: gb(12.2), isSystem: true },
        { letter: "D:", totalBytes: gb(78.8), freeBytes: gb(26.9), isSystem: false },
      ],
    },
    get_caches: [
      { id: "npm", name: "npm cache", displayPath: "%LOCALAPPDATA%\\npm-cache", bytes: gb(4.5), group: "devCache" },
      { id: "gradle", name: "Gradle caches", displayPath: "%USERPROFILE%\\.gradle\\caches", bytes: gb(9.46), group: "devCache" },
      { id: "uv", name: "uv cache", displayPath: "%LOCALAPPDATA%\\uv\\cache", bytes: gb(2.1), group: "devCache" },
      { id: "dart", name: "Dart pub cache", displayPath: "%LOCALAPPDATA%\\Pub\\Cache", bytes: gb(2.22), group: "devCache" },
      // invented size
      { id: "temp", name: "Temporary files", displayPath: "%TEMP%", bytes: gb(1.3), group: "systemTemp" },
    ],
    get_stability: {
      days: days(),
      // Newest first, as Rust returns them.
      crashes: [
        {
          time: timeAgo(1, 21, 27),
          code: "0x000000CE",
          meaning: "A driver unloaded without cancelling its pending operations.",
          dumpFile: "C:\\Windows\\Minidump\\112526-10921-01.dmp",
        },
        {
          time: timeAgo(2, 1, 26),
          code: "0x00000050",
          meaning: "A driver or program referenced memory that was not available.",
          dumpFile: "C:\\Windows\\Minidump\\112426-11078-01.dmp",
        },
      ],
      driverResets: 0,
      appCrashes: [
        { time: timeAgo(2, 0, 40), app: "vgm.exe", module: "", hang: false },
        // date invented; the case study names the app and module only
        { time: timeAgo(6, 18, 5), app: "kapy_notes.exe", module: "flutter_windows.dll", hang: false },
      ],
    },
    // The five disabled entries are the ones the case study switched off. The enabled ones are sample entries.
    get_startup: [
      { id: "hkcu-onedrive", name: "Microsoft OneDrive", command: "OneDrive.exe /background", source: "HKCU Run", enabled: true, canToggle: true },
      { id: "hklm-securityhealth", name: "Windows Security notification icon", command: "SecurityHealthSystray.exe", source: "HKLM Run", enabled: true, canToggle: false },
      { id: "hklm-vanguard", name: "Riot Vanguard", command: "vgtray.exe", source: "HKLM Run", enabled: true, canToggle: false },
      { id: "hkcu-steam", name: "Steam", command: "steam.exe -silent", source: "HKCU Run", enabled: true, canToggle: true },
      { id: "hkcu-onedrivesetup", name: "OneDrive Setup", command: "OneDriveSetup.exe /thfirstsetup", source: "HKCU RunOnce", enabled: false, canToggle: true },
      { id: "hkcu-edge", name: "Microsoft Edge (auto-launch)", command: "msedge.exe --no-startup-window", source: "HKCU Run", enabled: false, canToggle: true },
      { id: "hkcu-discord", name: "Discord", command: "Update.exe --processStart Discord.exe", source: "HKCU Run", enabled: false, canToggle: true },
      { id: "hkcu-kapy", name: "Kapy Notes", command: "kapy_notes.exe --minimized", source: "HKCU Run", enabled: false, canToggle: true },
      { id: "folder-memreduct", name: "Mem Reduct", command: "memreduct.exe -minimized", source: "Startup folder", enabled: false, canToggle: true },
    ],
    // invented: per-app figures; total and available match "about 2 GB free" in the case study
    get_memory: {
      totalBytes: gb(7.8),
      availableBytes: gb(2.1),
      commitBytes: gb(9.6),
      commitLimitBytes: gb(13.8),
      topApps: [
        { name: "Google Chrome", processes: 24, bytes: gb(1.9) },
        { name: "Visual Studio Code", processes: 11, bytes: gb(1.1) },
        { name: "Vmmem (WSL)", processes: 1, bytes: gb(0.9) },
        { name: "Discord", processes: 6, bytes: gb(0.4) },
        { name: "Windows Explorer", processes: 1, bytes: gb(0.2) },
        { name: "Microsoft Defender", processes: 2, bytes: gb(0.2) },
      ],
    },
    get_security: { memoryIntegrity: true },
    check_driver_updates: { checkedAt: new Date().toISOString(), updates: [] },
    get_system: {
      // invented sizes; the case study only says the page file is auto-managed
      pageFile: { autoManaged: true, allocatedBytes: gb(2.4), usedBytes: gb(0.6), peakBytes: gb(1.1) },
      power: { plan: "Balanced", mode: "balanced", onBattery: false, batteryPercent: null, batteryDesignWh: null, batteryFullWh: null },
      hyperVRunning: true,
      wslDistros: ["Ubuntu"],
      gameMode: true,
      gameBarCapture: false,
      lastSfc: { time: timeAgo(1, 23, 10), outcome: "repaired" },
      secureBoot: true,
      tpmVersion: "2.0",
    },
    get_anticheat: [
      { name: "Riot Vanguard", installed: true, service: "vgk", state: "running", startType: "boot" },
      { name: "Riot Vanguard", installed: true, service: "vgc", state: "stopped", startType: "manual" },
    ],
    // invented sizes
    list_crash_dumps: [
      { file: "C:\\Windows\\Minidump\\112526-10921-01.dmp", time: timeAgo(1, 21, 28), bytes: Math.round(1.6 * MIB) },
      { file: "C:\\Windows\\Minidump\\112426-11078-01.dmp", time: timeAgo(2, 1, 27), bytes: Math.round(1.4 * MIB) },
    ],
    get_disk_usage: {
      // invented sizes, except the WSL disk (18.28 GB in the case study)
      programs: [
        { name: "Visual Studio Community 2022", displayPath: "C:\\Program Files\\Microsoft Visual Studio", bytes: gb(11.7) },
        { name: "Android Studio", displayPath: "C:\\Program Files\\Android\\Android Studio", bytes: gb(2.6) },
      ],
      wslDisks: [{ name: "WSL (Ubuntu)", displayPath: "%LOCALAPPDATA%\\Packages\\CanonicalGroup...\\ext4.vhdx", bytes: gb(18.28) }],
      appData: [{ name: "Android SDK", displayPath: "%LOCALAPPDATA%\\Android\\Sdk", bytes: gb(6.4) }],
      userFolders: [
        { name: "Downloads", displayPath: "%USERPROFILE%\\Downloads", bytes: gb(7.9) },
        { name: ".cache (Hugging Face models)", displayPath: "%USERPROFILE%\\.cache", bytes: gb(5.2) },
        { name: "Documents", displayPath: "%USERPROFILE%\\Documents", bytes: gb(1.8) },
      ],
    },
    get_store_apps: [
      { id: "Microsoft.GetHelp_8wekyb3d8bbwe", name: "Get Help", publisher: "Microsoft Corporation" },
      { id: "Clipchamp.Clipchamp_yxz26nhyzhsrt", name: "Clipchamp", publisher: "Microsoft Corporation" },
    ],
    get_history: [],
  };
}

type Fixture = (d: Commands) => void;

const FIXTURES: Record<string, Fixture> = {
  // Adds the MX150 variant of the T480. Sample data.
  dualgpu: (d) => {
    d.get_hardware.gpus.push({
      name: "NVIDIA GeForce MX150",
      vendor: "NVIDIA",
      kind: "dedicated",
      dedicatedBytes: gb(2),
      driverVersion: "32.0.15.6094",
      driverDate: "2026-01-20T00:00:00Z",
    });
  },
  noram: (d) => {
    d.get_hardware.ramSticks = 0;
  },
  // Kernel-Power 41 with a bugcheck code but no dump written.
  bugcheck41: (d) => {
    d.get_stability.crashes = [
      { time: timeAgo(1, 22, 3), code: "0x00000133", meaning: "A driver or device took too long to respond.", dumpFile: null },
    ];
    d.list_crash_dumps = [];
    d.get_stability.days.forEach((x) => (x.blueScreens = x.date === dayAgo(1) ? 1 : 0));
  },
  empty: (d) => {
    d.get_hardware.gpus = [];
    d.get_storage.drives = [];
    d.get_caches = [];
    d.get_stability.crashes = [];
    d.get_stability.appCrashes = [];
    d.get_stability.days.forEach((x) => {
      x.blueScreens = 0;
      x.unexpectedShutdowns = 0;
    });
    d.get_startup = [];
    d.get_memory.topApps = [];
    d.get_anticheat = [];
    d.list_crash_dumps = [];
    d.get_disk_usage = { programs: [], wslDisks: [], appData: [], userFolders: [] };
    d.get_store_apps = [];
    d.get_system.wslDistros = [];
  },
  tpmfail: (d) => {
    d.get_system.secureBoot = false;
    d.get_system.tpmVersion = null;
  },
  novanguard: (d) => {
    d.get_anticheat = [];
    d.get_startup = d.get_startup.filter((s) => !/vanguard/i.test(s.name));
  },
  // Sample battery figures (the default mock has none, because they were never measured).
  battery: (d) => {
    Object.assign(d.get_system.power, { onBattery: false, batteryPercent: 65, batteryDesignWh: 57, batteryFullWh: 48 });
  },
  gameRunning: () => {},
  // This PC's live data (26 Nov): Best power efficiency while plugged in.
  powersave: (d) => {
    Object.assign(d.get_system.power, { mode: "best_efficiency", onBattery: false });
  },
  // This PC's live battery report: 12.09 of 48.84 Wh (25%). Charge percent not reported here.
  badbattery: (d) => {
    Object.assign(d.get_system.power, { batteryDesignWh: 48.84, batteryFullWh: 12.09 });
  },
  // Settings Windows didn't report.
  nullsettings: (d) => {
    d.get_system.gameMode = null;
    d.get_system.gameBarCapture = null;
    d.get_system.power.mode = "unknown";
  },
  // Real anti-cheat process names that a whole-word match would miss. canToggle is true on purpose:
  // the UI must still lock them.
  anticheatnames: (d) => {
    const add = (id: string, name: string, command: string) =>
      d.get_startup.push({ id, name, command, source: "HKCU Run", enabled: true, canToggle: true });
    add("ac-eac", "EasyAntiCheat_EOS", "C:\\Program Files (x86)\\EasyAntiCheat_EOS\\EasyAntiCheat_EOS.exe");
    add("ac-be", "BattlEye Service", "BEService_x64.exe");
    add("ac-riotclient", "Riot Client", "RiotClientServices.exe --launch-background-mode");
    add("ac-faceit", "FACEIT", "FACEITService.exe");
  },
};

function params() {
  return new URLSearchParams(window.location.search);
}

let state: Commands | null = null;
let nextId = 1;

function db(): Commands {
  if (state) return state;
  const d = base();
  for (const f of params().getAll("fixture")) FIXTURES[f]?.(d);
  state = d;
  return d;
}

function delayFor(cmd: string): number {
  const fixed = params().get("delay");
  if (fixed !== null) return Number(fixed) || 0;
  if (cmd === "check_driver_updates") return 1500;
  if (cmd === "get_disk_usage") return 2000;
  return 300;
}

function shouldFail(cmd: string): boolean {
  const p = params();
  return p.getAll("fixture").includes("allfail") || p.getAll("fail").includes(cmd);
}

function later<T>(cmd: string, work: () => T): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      if (shouldFail(cmd)) return reject(new Error(`Mock failure: ${cmd}`));
      try {
        resolve(work());
      } catch (e) {
        reject(e);
      }
    }, delayFor(cmd)),
  );
}

export function mockCall<K extends keyof Commands>(cmd: K): Promise<Commands[K]> {
  return later(cmd, () => structuredClone(db()[cmd]));
}

// ---- Actions (phase 2): applied in memory, recorded in history ----

type Undo = ChangeRequest;

const POWER_LABEL = { best_performance: "Best performance", balanced: "Balanced", best_efficiency: "Best power efficiency" };

function applyOne(d: Commands, c: ChangeRequest): ChangeItem[] {
  const item = (description: string, status: ChangeItem["status"], detail: string, undo: Undo | null = null, freedBytes = 0): ChangeItem => ({
    description,
    status,
    detail,
    undo,
    freedBytes,
  });
  const sys = d.get_system;
  switch (c.kind) {
    case "startupEnabled": {
      const app = d.get_startup.find((a) => a.id === c.id);
      const verb = c.enabled ? "Turn on" : "Turn off";
      if (!app) return [item(`${verb} startup entry`, "failed", "Entry not found")];
      if (!app.canToggle) return [item(`${verb} ${app.name} at startup`, "failed", "This entry can't be changed")];
      if (app.enabled === c.enabled) return [item(`${verb} ${app.name} at startup`, "skipped", c.enabled ? "Already on" : "Already off")];
      app.enabled = c.enabled;
      return [item(`${verb} ${app.name} at startup`, "done", "", { kind: "startupEnabled", id: app.id, enabled: !c.enabled })];
    }
    case "gameMode": {
      const desc = c.on ? "Turn on Game Mode" : "Turn off Game Mode";
      if (sys.gameMode === c.on) return [item(desc, "skipped", c.on ? "Already on" : "Already off")];
      const prev = sys.gameMode;
      sys.gameMode = c.on;
      return [item(desc, "done", "", prev === null ? null : { kind: "gameMode", on: prev })];
    }
    case "gameBarCapture": {
      const desc = c.on ? "Turn on Game Bar background recording" : "Turn off Game Bar background recording";
      if (sys.gameBarCapture === c.on) return [item(desc, "skipped", c.on ? "Already on" : "Already off")];
      const prev = sys.gameBarCapture;
      sys.gameBarCapture = c.on;
      return [item(desc, "done", "", prev === null ? null : { kind: "gameBarCapture", on: prev })];
    }
    case "powerMode": {
      const desc = `Set power mode to ${POWER_LABEL[c.mode]}`;
      if (sys.power.mode === c.mode) return [item(desc, "skipped", "Already set")];
      const prev = sys.power.mode;
      sys.power.mode = c.mode;
      return [item(desc, "done", "", prev === "unknown" ? null : { kind: "powerMode", mode: prev })];
    }
    case "cleanCaches": {
      return c.ids.map((id) => {
        const cache = d.get_caches.find((x) => x.id === id);
        if (!cache) return item(`Clear ${id}`, "failed", "Not on the allow-list");
        if (cache.bytes === 0) return item(`Clear ${cache.name}`, "skipped", "Already empty");
        const freed = cache.bytes;
        cache.bytes = 0;
        const sysDrive = d.get_storage.drives.find((x) => x.isSystem);
        if (sysDrive) sysDrive.freeBytes += freed;
        return item(`Clear ${cache.name}`, "done", "Refills on its own when the tool runs", null, freed);
      });
    }
  }
}

export function mockAct<K extends keyof ActionCommands>(cmd: K, args: ActionCommands[K]["args"]): Promise<ActionCommands[K]["result"]> {
  return later(cmd, () => {
    const d = db();
    if (params().getAll("fixture").includes("gameRunning")) {
      throw new Error("VALORANT is running. Lagsmith doesn't change anything while a protected game is open. Close the game and try again.");
    }
    if (cmd === "apply_changes") {
      const a = args as ActionCommands["apply_changes"]["args"];
      const set: ChangeSet = {
        id: `set-${nextId++}`,
        time: new Date().toISOString(),
        title: a.title,
        items: a.changes.flatMap((c) => applyOne(d, c)),
        undone: false,
      };
      d.get_history.unshift(set);
      return structuredClone(set) as ActionCommands[K]["result"];
    }
    const { id } = args as ActionCommands["undo_change"]["args"];
    const set = d.get_history.find((s) => s.id === id);
    if (!set) throw new Error("Change set not found");
    if (set.undone) throw new Error("This change set was already undone");
    for (const it of set.items) {
      if (it.status === "done" && it.undo) applyOne(d, it.undo as ChangeRequest);
    }
    set.undone = true;
    return structuredClone(set) as ActionCommands[K]["result"];
  });
}
