import type { ActionCommands, AdminEvent, AdminResult, AdminTask, ChangeItem, ChangeRequest, ChangeSet, Commands, DayEvents, DumpAnalysis } from "../types";

// Sample data for `npm run dev` and the Playwright mock tests. Development only: api.ts imports
// this lazily behind import.meta.env.DEV, so it is not part of the release bundle.
//
// Values come from the user's ThinkPad T480 and docs/CASE-STUDY.md where they exist. Numbers
// the contract requires but we never measured are marked "invented" below.
//
// URL switches (all composable):
//   ?fixture=dualgpu|noram|bugcheck41|allfail|empty|tpmfail|novanguard|battery|gameRunning|dismMissing|oldwsl|oldcrash (repeatable)
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
      wslDisks: [{ name: "Ubuntu", displayPath: "%LOCALAPPDATA%\\Packages\\CanonicalGroup...\\ext4.vhdx", bytes: gb(18.28) }],
      appData: [{ name: "Android SDK", displayPath: "%LOCALAPPDATA%\\Android\\Sdk", bytes: gb(6.4) }],
      userFolders: [
        { name: "Downloads", displayPath: "%USERPROFILE%\\Downloads", bytes: gb(7.9) },
        { name: ".cache (Hugging Face models)", displayPath: "%USERPROFILE%\\.cache", bytes: gb(5.2) },
        { name: "Documents", displayPath: "%USERPROFILE%\\Documents", bytes: gb(1.8) },
      ],
    },
    get_store_apps: [
      { id: "Microsoft.GetHelp", name: "Get Help", publisher: "Microsoft Corporation" },
      { id: "Clipchamp.Clipchamp", name: "Clipchamp", publisher: "Microsoft Corporation" },
    ],
    get_gpu_preferences: [
      {
        name: "VALORANT",
        exe: "C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe",
        preference: "auto",
        source: "Installed app",
      },
    ],
    get_history: [],
    get_background_repair: [],
  };
}

type Fixture = (d: Commands) => void;

const FIXTURES: Record<string, Fixture> = {
  // An SFC left running by an earlier session. "backgroundDone" finishes it after the first look.
  backgroundSfc: (d) => {
    d.get_background_repair = ["SFC"];
  },
  backgroundDone: (d) => {
    d.get_background_repair = ["SFC"];
  },
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
    d.get_gpu_preferences = [
      {
        name: "VALORANT",
        exe: "C:\\Riot Games\\VALORANT\\live\\ShooterGame\\Binaries\\Win64\\VALORANT-Win64-Shipping.exe",
        preference: "power_saving",
        source: "Windows graphics settings",
      },
      {
        name: "Visual Studio Code",
        exe: "C:\\Users\\Kamal\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
        preference: "auto",
        source: "Installed app",
      },
    ];
  },
  // Older events (invented dates) so the Crash Detective range control has something to filter.
  oldcrash: (d) => {
    d.get_stability.crashes.push({ time: timeAgo(12, 9, 14), code: "0x00000116", meaning: "The graphics driver stopped responding.", dumpFile: null });
    d.get_stability.days.forEach((x) => {
      if (x.date === dayAgo(12)) x.blueScreens = 1;
    });
    d.get_stability.appCrashes.push({ time: timeAgo(20, 15, 2), app: "old_game.exe", module: "d3d11.dll", hang: false });
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
    d.get_gpu_preferences = [];
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
  // WSL older than 2.3: moving a distro is refused with an "update WSL" message.
  oldwsl: () => {},
  dismMissing: () => {},
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

let bgLooks = 0;

export function mockCall<K extends keyof Commands>(cmd: K): Promise<Commands[K]> {
  return later(cmd, () => {
    const out = structuredClone(db()[cmd]);
    // React StrictMode loads everything twice at start, so "the first look" is two calls; the Refresh button is the third and sees the repair finished.
    if (cmd === "get_background_repair" && params().getAll("fixture").includes("backgroundDone") && ++bgLooks >= 2) db().get_background_repair = [];
    return out;
  });
}

// ---- Actions (phase 2): applied in memory, recorded in history ----

type Undo = ChangeRequest;

// C9: package family names for the sample Store apps (real apps have "<name>_<13 characters>").
const MOCK_PFN: Record<string, string> = {
  "Microsoft.GetHelp": "Microsoft.GetHelp_8wekyb3d8bbwe",
  "Clipchamp.Clipchamp": "Clipchamp.Clipchamp_yxz26nhyzhsrt",
};
// C8: where the sample WSL disk lives until it is moved (Rust reads this from the registry).
const MOCK_WSL_HOME = "C:\\Users\\Kamal\\AppData\\Local\\wsl\\Ubuntu";
const wslHome = new Map<string, string>();

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
    case "removeStoreApp": {
      const app = d.get_store_apps.find((a) => a.id === c.id);
      if (!app) return [item("Remove a Store app", "failed", "That app isn't in the removable list, or is already gone")];
      d.get_store_apps = d.get_store_apps.filter((a) => a.id !== c.id);
      return [{ ...item(`Removed ${app.name}`, "done", "Can't be undone. You can reinstall it from the Microsoft Store."), reinstallPfn: MOCK_PFN[c.id] ?? null }];
    }
    case "wslMove": {
      const disk = d.get_disk_usage.wslDisks.find((w) => w.name === c.distro);
      if (!disk) return [item(`Move WSL distro ${c.distro}`, "failed", "That isn't a WSL distro Lagsmith found")];
      if (params().getAll("fixture").includes("oldwsl")) {
        return [item(`Move WSL distro ${c.distro}`, "failed", 'Moving a WSL distro needs WSL 2.3 or newer. Update it with "wsl --update" in a terminal, then try again. Nothing was changed.')];
      }
      const target = c.target.trim().replace(/\\+$/, "");
      const m = /^([A-Za-z]:)\\[^\\/:*?"<>|]+(\\[^\\/:*?"<>|]+)*$/.exec(target);
      const home = wslHome.get(c.distro) ?? MOCK_WSL_HOME;
      const fail = (why: string) => [item(`Move WSL distro ${c.distro}`, "failed", why)];
      if (!m) return fail("The folder must be an absolute path on a drive. Use a full path like D:\\WSL\\Ubuntu");
      if (/riot|vanguard|valorant|anticheat|battleye|faceit|program files|windows/i.test(target)) return fail("Lagsmith never moves WSL into game, anti-cheat, Windows or Program Files folders");
      const letter = m[1].toUpperCase();
      if (letter === home.slice(0, 2).toUpperCase()) return fail(`Choose a folder on a different drive than ${letter}`);
      const drive = d.get_storage.drives.find((x) => x.letter === letter);
      if (!drive) return fail("That drive isn't a local fixed drive");
      if (drive.freeBytes < disk.bytes + GIB) return fail("That drive doesn't have enough free space for the move");
      const from = home;
      const fromDrive = d.get_storage.drives.find((x) => x.letter === from.slice(0, 2).toUpperCase());
      drive.freeBytes -= disk.bytes;
      if (fromDrive) fromDrive.freeBytes += disk.bytes;
      wslHome.set(c.distro, target);
      disk.displayPath = `${target}\\ext4.vhdx`;
      return [item(`Moved WSL distro ${c.distro} to ${target}`, "done", "", { kind: "wslMove", distro: c.distro, target: from })];
    }
    case "gpuPreference": {
      const exe = c.exe.trim().replace(/^"+|"+$/g, "").trim().replace(/\//g, "\\");
      const name = exe.split(/[\\/]/).pop() || exe;
      const label = { auto: "Let Windows decide", power_saving: "Power saving", high_performance: "High performance" }[c.preference];
      const existing = d.get_gpu_preferences.find((x) => x.exe.toLowerCase() === exe.toLowerCase());
      if (existing) {
        if (existing.preference === c.preference) return [item(`Set GPU preference for ${name} to ${label}`, "skipped", "Already set")];
        const prev = existing.preference;
        existing.preference = c.preference;
        return [item(`Set GPU preference for ${name} to ${label}`, "done", "", { kind: "gpuPreference", exe, preference: prev })];
      }
      d.get_gpu_preferences.push({
        name: name.replace(/\.exe$/i, ""),
        exe,
        preference: c.preference,
        source: "Windows graphics settings",
      });
      return [item(`Set GPU preference for ${name} to ${label}`, "done", "", { kind: "gpuPreference", exe, preference: "auto" })];
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

// ---- Phase 3: elevated admin tasks (run_admin_task) ----

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MOCK_DUMPS: Record<string, DumpAnalysis> = {
  "112526-10921-01.dmp": {
    file: "112526-10921-01.dmp",
    bugcheckCode: "0x000000CE",
    parameters: ["0xfffff8078e6cd9bd", "0x0000000000000010", "0xfffff8078e6cd9bd", "0x0000000000000002"],
    suspectModule: "vgk.sys",
    suspectFrom: "unloaded",
    drivers: ["vgk.sys"],
    driversLabel: "cause",
    loadedModules: 148,
    unloadedModules: 34,
    error: null,
  },
  "112426-11078-01.dmp": {
    file: "112426-11078-01.dmp",
    bugcheckCode: "0x00000050",
    parameters: ["0xffffb38f12c04000", "0x0000000000000000", "0xfffff8078e5a1240", "0x0000000000000002"],
    suspectModule: "vgk.sys",
    suspectFrom: "loaded",
    drivers: ["vgk.sys"],
    driversLabel: "cause",
    loadedModules: 151,
    unloadedModules: 19,
    error: null,
  },
};

export async function mockAdminTask(task: AdminTask, onEvent: (e: AdminEvent) => void): Promise<AdminResult> {
  const step = delayFor("run_admin_task");
  const fixtures = params().getAll("fixture");

  await sleep(step);
  if (shouldFail("run_admin_task")) {
    throw new Error("Mock failure: run_admin_task");
  }
  if (fixtures.includes("gameRunning")) {
    throw new Error("VALORANT is running. Lagsmith doesn't change anything while a protected game is open. Close the game and try again.");
  }

  const d = db();
  switch (task) {
    case "analyze-dumps": {
      if (d.list_crash_dumps.length === 0) {
        onEvent({ stage: "Checking C:\\Windows\\Minidump", percent: null });
        await sleep(step);
        return {
          task,
          ok: true,
          outcome: "no_dumps",
          message: "No crash dumps found in C:\\Windows\\Minidump.",
          exitCode: null,
          dumps: [],
        };
      }
      const dumps: DumpAnalysis[] = [];
      for (let i = 0; i < d.list_crash_dumps.length; i++) {
        const name = d.list_crash_dumps[i].file.split("\\").pop() ?? d.list_crash_dumps[i].file;
        onEvent({ stage: `Analysing ${name}`, percent: Math.round(((i + 1) / d.list_crash_dumps.length) * 100) });
        await sleep(step);
        dumps.push(
          structuredClone(
            MOCK_DUMPS[name] ?? {
              file: name,
              bugcheckCode: "0x00000000",
              parameters: ["0x0", "0x0", "0x0", "0x0"],
              suspectModule: null,
              suspectFrom: null,
              drivers: [],
              driversLabel: "drivers present",
              loadedModules: 0,
              unloadedModules: 0,
              error: null,
            },
          ),
        );
      }
      return {
        task,
        ok: true,
        outcome: "analyzed",
        message: `Analyzed ${dumps.length} crash ${dumps.length === 1 ? "dump" : "dumps"}.`,
        exitCode: null,
        dumps,
      };
    }
    case "sfc": {
      onEvent({ stage: "Starting Windows Resource Protection scan", percent: 5 });
      await sleep(step);
      onEvent({ stage: "Verification 45% complete", percent: 45 });
      await sleep(step);
      onEvent({ stage: "Verification 100% complete", percent: 100 });
      await sleep(step);
      d.get_system.lastSfc = { time: new Date().toISOString(), outcome: "no_problems" };
      return {
        task,
        ok: true,
        outcome: "no_problems",
        message: "Windows Resource Protection did not find any integrity violations.",
        exitCode: 0,
        dumps: [],
      };
    }
    case "dism-restorehealth": {
      onEvent({ stage: "Checking component store", percent: 25 });
      await sleep(step);
      onEvent({ stage: "Verifying image health", percent: 75 });
      await sleep(step);
      if (fixtures.includes("dismMissing")) {
        return {
          task,
          ok: false,
          outcome: "source_missing",
          message: "DISM couldn't find repair source files (0x800F081F). Connect to Windows Update or provide a Windows image source.",
          exitCode: 0x800f081f,
          dumps: [],
        };
      }
      onEvent({ stage: "The restore operation completed successfully.", percent: 100 });
      await sleep(step);
      return {
        task,
        ok: true,
        outcome: "repaired",
        message: "DISM completed the Windows image repair.",
        exitCode: 0,
        dumps: [],
      };
    }
    case "restore-point": {
      onEvent({ stage: "Creating restore point", percent: 40 });
      await sleep(step);
      onEvent({ stage: "Saving system snapshot", percent: 90 });
      await sleep(step);
      return {
        task,
        ok: true,
        outcome: "created",
        message: "Created a Windows restore point.",
        exitCode: null,
        dumps: [],
      };
    }
  }
}
