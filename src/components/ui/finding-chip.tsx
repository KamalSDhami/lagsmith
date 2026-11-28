import { Badge, type Tone } from "./badge";

export type FindingState = "open-critical" | "open-warning" | "info" | "resolved" | "watching";

const map: Record<FindingState, { tone: Tone; label: string }> = {
  "open-critical": { tone: "danger", label: "Open" },
  "open-warning": { tone: "warning", label: "Open" },
  info: { tone: "info", label: "Info" },
  resolved: { tone: "success", label: "Resolved" },
  watching: { tone: "neutral", label: "Watching" },
};

/** One chip, one wording, wherever a finding state shows (spec 10). Resolved is the only success-green on a neutral page. */
export function FindingChip({ state, label }: { state: FindingState; label?: string }) {
  const m = map[state];
  return <Badge tone={m.tone}>{label ?? m.label}</Badge>;
}
