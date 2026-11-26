import { cn } from "../../lib/cn";

/** value is 0..1 */
export function Progress({ value, tone = "accent", label }: { value: number; tone?: "accent" | "warning"; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-2 w-full overflow-hidden rounded-full bg-subtle"
    >
      <div
        className={cn("h-full rounded-full", tone === "accent" ? "bg-accent-bar" : "bg-warning-icon")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
