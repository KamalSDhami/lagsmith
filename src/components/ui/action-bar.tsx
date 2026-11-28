import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Sticky bottom bar for staged changes (spec 2.4). Render it as the LAST child of the page content, and only
 * while changes are pending. It sits in flow, so the last row is never covered.
 * Left `summary` ("5 selected, 19.6 GB"). Right `children`: Discard (ghost) and the page's one primary.
 */
export function ActionBar({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      role="region"
      aria-label="Pending changes"
      className={cn(
        "animate-rise sticky bottom-4 z-20 flex min-h-16 items-center justify-between gap-4 rounded-[16px] border border-line bg-raised px-4 py-3 shadow-pop",
        className,
      )}
    >
      <p className="tnum min-w-0 text-body font-medium" aria-live="polite">
        {summary}
      </p>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
