import { Info } from "lucide-react";
import { Button } from "./ui/button";

/** A repair that outlived its window (or was started elsewhere) is still running. */
export function BackgroundRepairBanner({ tools, onRefresh }: { tools: string[]; onRefresh: () => void }) {
  return (
    <div role="status" data-testid="background-repair" className="mb-3 flex shrink-0 items-center gap-3 rounded-xl bg-info-soft px-4 py-3 text-info">
      <Info size={18} aria-hidden className="shrink-0" />
      <p className="min-w-0 flex-1 text-[0.875rem] leading-snug">
        A repair is still running in the background ({tools.join(", ")}). Results appear here when it finishes.
      </p>
      <Button size="sm" variant="outline" onClick={onRefresh} className="shrink-0">
        Refresh
      </Button>
    </div>
  );
}
