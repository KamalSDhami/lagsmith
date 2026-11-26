import type { Commands, Drive, Gpu, Hardware, Stability, StartupApp } from "../types";
import type { Page } from "../pages/nav";
import { driveName, formatGB, formatRam, isoDay, plural } from "./format";

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

export function latestCrash(s: Stability) {
  return [...s.crashes].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
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

/** Dedicated GPU if there is one, else integrated, else whatever exists. */
export function primaryGpu(h: Hardware): Gpu | undefined {
  return (
    h.gpus.find((g) => g.kind === "dedicated") ??
    h.gpus.find((g) => g.kind === "integrated") ??
    h.gpus[0]
  );
}

export function isSingleChannel(h: Hardware): boolean {
  return h.ramSticks < 2;
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
  action: string;
  page: Page;
}

type Partial7 = {
  hardware?: Hardware;
  storage?: Commands["get_storage"];
  stability?: Stability;
  startup?: StartupApp[];
  security?: Commands["get_security"];
};

/** Findings derived from whatever data is available, most severe first. */
export function deriveFindings(d: Partial7, now = new Date()): Finding[] {
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
        action: "Investigate",
        page: "crash",
      });
    }
  }

  if (d.storage) {
    const c = systemDrive(d.storage.drives);
    if (c && freeRatio(c) < LOW_DISK_RATIO) {
      const letter = driveName(c.letter);
      out.push({
        id: "disk",
        severity: "warning",
        title: `Low disk space on ${letter}`,
        body: "Your system drive is almost full, which can cause slowdowns and crashes.",
        evidence: `${formatGB(c.freeBytes)} free of ${formatGB(c.totalBytes)}`,
        source: "Disk scan",
        action: "Review Cleanup",
        page: "storage",
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
      action: "View Upgrade Tip",
      page: "hardware",
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
        action: "Manage startup",
        page: "startup",
      });
    }
  }

  if (d.security?.memoryIntegrity) {
    out.push({
      id: "hvci",
      severity: "info",
      title: "Memory Integrity is on",
      body: "It costs some gaming performance but protects against malicious drivers. Lagsmith explains it but never changes it for you.",
      evidence: "",
      source: "Device Guard",
      action: "Learn more",
      page: "hardware",
    });
  }

  // Pushed in the agreed order (crashes, disk, RAM, startup, Memory Integrity).
  return out;
}
