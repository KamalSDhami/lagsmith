import { InfoRegular } from "@fluentui/react-icons";
import { inTauri } from "../lib/api";

/** Preview-only strip (never rendered inside the Tauri window), so screenshots are never mistaken for this PC. */
export function SampleBanner() {
  if (inTauri) return null;
  return (
    <div role="status" className="flex h-7 shrink-0 items-center justify-center gap-2 bg-warning-soft px-4 text-secondary text-warning">
      <InfoRegular fontSize={16} aria-hidden />
      <span>Sample data. You are viewing a preview with made-up values, not this PC.</span>
    </div>
  );
}
