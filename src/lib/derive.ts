import type { AntiCheat, Commands, Crash, Drive, Gpu, GpuAppPreference, Hardware, Power, Stability, StartupApp, SystemState } from "../types";
import { hasRiotGame, valorantRequirements, VALORANT_NOTE } from "./requirements";
import type { Page } from "../pages/nav";
import { formatGB, formatRam, isoDay, plural } from "./format";

export function blueScreensLast7Days(s: Stability, now = new Date()): number {
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  const from = isoDay(start);
  const to = isoDay(now);
  // Compare YYYY-MM-DD strings so no timezone conversion can shift a day.
  return s.days
    .filter((d) => d.date.slice(0, 10) >= from && d.date.slice(0, 10) <= to)
    .reduce((n, d) => n + d.blueScreens, 0);
}

/** Rust returns crashes newest first. */
export function latestCrash(s: Stability) {
  return s.crashes[0];
}

export function systemDrive(drives: Drive[]): Drive | undefined {
  return drives.find((d) => d.isSystem) ?? drives.find((d) => d.letter.toUpperCase().startsWith("C"));
}

export function freeRatio(d: Drive): number {
  return d.totalBytes > 0 ? d.freeBytes / d.totalBytes : 0;
}

export const LOW_DISK_RATIO = 0.15;

export function realGpus(h: Hardware): Gpu[] {
  return h.gpus.filter((g) => g.kind !== "software");
}

export function hasDualGpu(h: Hardware): boolean {
  return h.gpus.some((g) => g.kind === "dedicated") && h.gpus.some((g) => g.kind === "integrated");
}

/** Dedicated GPU if there is one, else integrated, else whatever exists. */
export function primaryGpu(h: Hardware): Gpu | undefined {
  return (
    h.gpus.find((g) => g.kind === "dedicated") ??
    h.gpus.find((g) => g.kind === "integrated") ??
    h.gpus[0]
  );
}

/** 0 sticks means the stick count could not be read. */
export function isSingleChannel(h: Hardware): boolean {
  return h.ramSticks === 1;
}

export function channelLabel(h: Hardware): string {
  if (h.ramSticks === 0) return "Channel unknown";
  return h.ramSticks === 1 ? "Single channel" : "Dual channel";
}

export function needsRamUpgradeTip(h: Hardware): boolean {
  return isSingleChannel(h) && primaryGpu(h)?.kind === "integrated";
}

export function enabledStartup(apps: StartupApp[]): number {
  return apps.filter((a) => a.enabled).length;
}

export function hasDisplayDriverUpdate(u: Commands["check_driver_updates"]): boolean {
  return u.updates.some((x) => /display/i.test(x.driverClass));
}

export type Severity = "critical" | "warning" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  body: string;
  evidence: string;
  source: string;
  /** Button label and destination; omitted when there is nothing more to show. */
  action?: { label: string; page: Page };
}

type Partial8 = {
  system?: SystemState;
  anticheat?: AntiCheat[];
  hardware?: Hardware;
  storage?: Commands["get_storage"];
  stability?: Stability;
  startup?: StartupApp[];
  security?: Commands["get_security"];
  gpuPreferences?: GpuAppPreference[];
};

/** Findings derived from whatever data is available, most severe first. */
export function deriveFindings(d: Partial8, now = new Date()): Finding[] {
  const out: Finding[] = [];

  if (d.stability) {
    const n = blueScreensLast7Days(d.stability, now);
    if (n > 0) {
      const latest = latestCrash(d.stability);
      const body = `Windows has crashed ${plural(n, "time", "times")} in the last 7 days.`;
      out.push({
        id: "crashes",
        severity: "critical",
        title: "Recent blue screens",
        body: latest?.meaning ? `${body} Latest: ${latest.meaning}` : body,
        evidence: plural(n, "blue screen", "blue screens"),
        source: "Windows Event Log",
        action: { label: "View crashes", page: "crash" },
      });
    }
  }

  if (d.system && d.anticheat && hasRiotGame(d.anticheat)) {
    const r = valorantRequirements(d.system);
    if (r.failing) {
      out.push({
        id: "valorant-req",
        severity: "warning",
        title: "VALORANT requirements not met",
        body: VALORANT_NOTE,
        evidence: `Secure Boot ${r.secureBoot.label} · TPM ${r.tpm.label}`,
        source: "System check",
        action: { label: "View gaming", page: "gaming" },
      });
    }
  }

  if (d.storage) {
    const c = systemDrive(d.storage.drives);
    if (c && freeRatio(c) < LOW_DISK_RATIO) {
      out.push({
        id: "disk",
        severity: "warning",
        title: `Low disk space on ${c.letter}`,
        body: "Your system drive is almost full, which can cause slowdowns and crashes.",
        evidence: `${formatGB(c.freeBytes)} free of ${formatGB(c.totalBytes)}`,
        source: "Disk scan",
        action: { label: "View storage", page: "storage" },
      });
    }
  }

  if (d.system && powerHoldsBack(d.system.power)) {
    out.push({
      id: "power-efficiency",
      severity: "warning",
      title: "Power mode is set to Best power efficiency",
      body: "Windows is limiting performance even though you're plugged in. Switch to Best performance before gaming.",
      evidence: "",
      source: "Windows power settings",
      action: { label: "Fix in Gaming Mode", page: "gaming" },
    });
  }

  if (d.hardware && hasDualGpu(d.hardware) && d.gpuPreferences) {
    const wrong = d.gpuPreferences.filter((p) => p.preference === "power_saving");
    if (wrong.length > 0) {
      out.push({
        id: "gpu-pref",
        severity: "warning",
        title: "App set to power-saving graphics",
        body: `${wrong[0].name} is pinned to integrated graphics on a dual-GPU PC. Switch it to High performance.`,
        evidence: plural(wrong.length, "app", "apps"),
        source: "Windows graphics settings",
        action: { label: "Fix in Gaming Mode", page: "gaming" },
      });
    }
  }

  if (d.hardware && needsRamUpgradeTip(d.hardware)) {
    const ram = formatRam(d.hardware.ramBytes);
    out.push({
      id: "ram",
      severity: "info",
      title: "Single channel memory",
      body: `Your ${ram} RAM is running in single channel, which reduces memory bandwidth for your graphics.`,
      evidence: `${ram} · ${plural(d.hardware.ramSticks, "stick", "sticks")}`,
      source: "Hardware check",
      action: { label: "View hardware", page: "hardware" },
    });
  }

  if (d.startup) {
    const n = enabledStartup(d.startup);
    if (n > 6) {
      out.push({
        id: "startup",
        severity: "warning",
        title: "Many apps start with Windows",
        body: "Each one adds to boot time and keeps running in the background while you play.",
        evidence: plural(n, "app", "apps"),
        source: "Startup entries",
        action: { label: "View startup apps", page: "startup" },
      });
    }
  }

  const health = d.system ? batteryHealth(d.system.power) : null;
  if (health !== null && health < WORN_BATTERY && d.system) {
    const p = d.system.power;
    out.push({
      id: "battery-worn",
      severity: "info",
      title: `Battery holds ${Math.round(health * 100)}% of its original charge`,
      body: "A worn battery can make Windows lower performance and shorten unplugged play. Consider replacing it.",
      evidence: `${p.batteryFullWh} Wh of ${p.batteryDesignWh} Wh design`,
      source: "Battery report",
      action: { label: "View hardware", page: "hardware" },
    });
  }

  if (d.security?.memoryIntegrity) {
    out.push({
      id: "hvci",
      severity: "info",
      title: "Memory Integrity is on",
      body: "It costs some gaming performance but protects against malicious drivers. Lagsmith explains it but never changes it for you.",
      evidence: "",
      source: "Device Guard",
    });
  }

  // Pushed in the agreed order (crashes, disk, RAM, startup, Memory Integrity).
  return out;
}

/** Local calendar day (YYYY-MM-DD) of an RFC 3339 instant. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Our own label: video timeouts (0x116, 0x117) are Medium, every other blue screen is High. */
export function crashSeverity(c: Crash): "High" | "Medium" {
  const n = parseInt(c.code, 16);
  return n === 0x116 || n === 0x117 ? "Medium" : "High";
}

/** "0x000000CE" -> "0xCE". */
export function shortCode(code: string): string {
  const n = parseInt(code, 16);
  return Number.isNaN(n) ? code : `0x${n.toString(16).toUpperCase()}`;
}

/** Best power efficiency while plugged in throttles the CPU and GPU for no reason. */
export function powerHoldsBack(p: Power): boolean {
  return p.mode === "best_efficiency" && !p.onBattery;
}

export const WORN_BATTERY = 0.5;

/** Full-charge capacity as a share of design capacity, or null when either is unknown. */
export function batteryHealth(p: Power): number | null {
  if (p.batteryFullWh === null || p.batteryDesignWh === null || p.batteryDesignWh <= 0) return null;
  return p.batteryFullWh / p.batteryDesignWh;
}
