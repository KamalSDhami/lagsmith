import type { Commands, DayEvents } from "../types";

// Real values from the user's ThinkPad T480, used only when not running inside Tauri.
const GIB = 1024 ** 3;
const gb = (n: number) => Math.round(n * GIB);

function days(): DayEvents[] {
  const out: DayEvents[] = [];
  const end = new Date(2026, 10, 26);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({
      date,
      blueScreens: date === "2026-11-24" || date === "2026-11-25" ? 1 : 0,
      unexpectedShutdowns: date === "2026-11-09" || date === "2026-11-16" ? 1 : 0,
    });
  }
  return out;
}

const data: Commands = {
  get_hardware: {
    userName: "Kamal",
    device: "LENOVO ThinkPad T480",
    os: "Windows 11 Pro 26H2",
    cpu: "Intel(R) Core(TM) i7-8650U CPU @ 1.90GHz",
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
        driverDate: "2026-04-15T00:00:00Z",
      },
    ],
  },
  get_storage: {
    drives: [{ letter: "C:", totalBytes: gb(158.6), freeBytes: gb(12.2), isSystem: true }],
    caches: [
      { id: "npm", name: "npm cache", displayPath: "%LOCALAPPDATA%\\npm-cache", bytes: gb(4.5), group: "devCache" },
      { id: "gradle", name: "Gradle caches", displayPath: "%USERPROFILE%\\.gradle\\caches", bytes: gb(9.46), group: "devCache" },
      { id: "uv", name: "uv cache", displayPath: "%LOCALAPPDATA%\\uv\\cache", bytes: gb(2.1), group: "devCache" },
      { id: "dart", name: "Dart pub cache", displayPath: "%LOCALAPPDATA%\\Pub\\Cache", bytes: gb(2.22), group: "devCache" },
    ],
  },
  get_stability: {
    days: days(),
    crashes: [
      {
        time: "2026-11-25T21:14:03+05:30",
        code: "0x000000CE",
        meaning: "A driver unloaded without cancelling its pending operations.",
        dumpFile: "C:\\Windows\\Minidump\\112526-10921-01.dmp",
      },
      {
        time: "2026-11-24T19:02:41+05:30",
        code: "0x00000050",
        meaning: "A driver or program referenced memory that was not available.",
        dumpFile: "C:\\Windows\\Minidump\\112426-11078-01.dmp",
      },
    ],
    driverResets: 0,
  },
  get_startup: [
    { name: "Microsoft OneDrive", command: "OneDrive.exe /background", source: "HKCU Run", enabled: true },
    { name: "Windows Security notification icon", command: "SecurityHealthSystray.exe", source: "HKLM Run", enabled: true },
    { name: "Realtek HD Audio Manager", command: "RtkAudUService64.exe", source: "HKLM Run", enabled: true },
    { name: "Riot Vanguard", command: "vgtray.exe", source: "HKLM Run", enabled: true },
    { name: "Discord", command: "Update.exe --processStart Discord.exe", source: "HKCU Run", enabled: false },
    { name: "Steam", command: "steam.exe -silent", source: "HKCU Run", enabled: false },
    { name: "Microsoft Teams", command: "ms-teams.exe", source: "Startup folder", enabled: false },
    { name: "Docker Desktop", command: "Docker Desktop.exe", source: "HKCU Run", enabled: false },
    { name: "Spotify", command: "Spotify.exe --autostart", source: "HKCU Run", enabled: false },
  ],
  get_memory: {
    totalBytes: gb(7.8),
    availableBytes: gb(2.3),
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
  check_driver_updates: { checkedAt: "2026-11-26T15:30:00+05:30", updates: [] },
};

const delays: Partial<Record<keyof Commands, number>> = { check_driver_updates: 1500 };

/** Browser-only mocks. Add `?fail=get_hardware` (repeatable) to the URL to preview error states. */
export function mockCall<K extends keyof Commands>(cmd: K): Promise<Commands[K]> {
  const ms = delays[cmd] ?? 300 + Math.random() * 300;
  const fail = new URLSearchParams(window.location.search).getAll("fail").includes(cmd);
  return new Promise((resolve, reject) =>
    setTimeout(() => (fail ? reject(new Error(`Mock failure: ${cmd}`)) : resolve(structuredClone(data[cmd]))), ms),
  );
}
