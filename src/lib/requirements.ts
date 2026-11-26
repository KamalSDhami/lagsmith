import type { AntiCheat, SystemState } from "../types";

export type Check = "pass" | "fail" | "unknown";

export interface ValorantRequirements {
  secureBoot: { state: Check; label: string };
  tpm: { state: Check; label: string };
  failing: boolean;
}

export const VALORANT_NOTE =
  "VALORANT on Windows 11 needs TPM 2.0 and Secure Boot, or it shows VAN9001/VAN9003. Both are turned on in your PC's UEFI/BIOS settings.";

/**
 * Secure Boot fails only when it is known to be off (null is "Unknown").
 * TPM fails unless the version is 2.x; null means no TPM was found.
 */
export function valorantRequirements(s: SystemState): ValorantRequirements {
  const sb: Check = s.secureBoot === null ? "unknown" : s.secureBoot ? "pass" : "fail";
  const tpmOk = s.tpmVersion !== null && /^2(\.|$)/.test(s.tpmVersion.trim());
  const tpm: Check = tpmOk ? "pass" : "fail";
  return {
    secureBoot: { state: sb, label: sb === "unknown" ? "Unknown" : sb === "pass" ? "On" : "Off" },
    tpm: { state: tpm, label: s.tpmVersion ? s.tpmVersion : "Not found" },
    failing: sb === "fail" || tpm === "fail",
  };
}

export function hasRiotGame(ac: AntiCheat[]): boolean {
  return ac.some((a) => a.installed && /vanguard|valorant/i.test(a.name));
}
