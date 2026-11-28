import { deriveFindings } from "./derive";
import type { Page } from "../pages/nav";
import type { Cmd, SystemData } from "./useSystemData";

/** Nav finding dots (spec 3.1): the most severe open finding per page. Info findings and pages without findings get no dot. */
export type DotSeverity = "critical" | "warning";

export function navDots(data: SystemData): Partial<Record<Page, DotSeverity>> {
  const ok = <K extends Cmd>(c: K) => {
    const s = data[c];
    return s.status === "ok" ? s.data : undefined;
  };
  const findings = deriveFindings({
    stability: ok("get_stability"),
    storage: ok("get_storage"),
    hardware: ok("get_hardware"),
    startup: ok("get_startup"),
    security: ok("get_security"),
    system: ok("get_system"),
    anticheat: ok("get_anticheat"),
    gpuPreferences: ok("get_gpu_preferences"),
  });
  const out: Partial<Record<Page, DotSeverity>> = {};
  for (const f of findings) {
    const page = f.action?.page;
    if (!page || f.severity === "info") continue;
    if (out[page] !== "critical") out[page] = f.severity === "critical" ? "critical" : (out[page] ?? "warning");
  }
  return out;
}
