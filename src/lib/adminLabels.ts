import type { AdminTask } from "../types";
import type { AdminState } from "./useSystemData";

const NAME: Record<AdminTask, string> = {
  sfc: "SFC",
  "dism-restorehealth": "DISM",
  "restore-point": "restore point",
  "analyze-dumps": "dump analysis",
};

/** What a disabled admin button says while something else runs: what it is and how far along. */
export function waitingLabel(admin: AdminState, background: string[]): string | null {
  if (admin.running) {
    const pct = admin.event?.percent;
    return `Waiting for ${NAME[admin.running]}${pct != null ? ` (${Math.round(pct)}%)` : ""}`;
  }
  return background.length ? `Waiting for ${background.join(" and ")}` : null;
}
