import type { ReactNode } from "react";
import { ArrowLeftRegular } from "@fluentui/react-icons";
import { cn } from "../lib/cn";
import { useNav } from "../lib/navContext";
import { pageLabel } from "../pages/nav";

/** H1 + one-line subtitle (spec 3.2). Shared by Dashboard (TopBar) and Page. */
export function PageHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="min-w-0">
      <h1 tabIndex={-1} className="text-h1 font-semibold tracking-tight">
        {title}
      </h1>
      {subtitle && <p className="mt-0.5 text-body text-muted">{subtitle}</p>}
    </div>
  );
}

/**
 * Page frame: a header, then the body.
 * - layout "flow" (PAGE_LAYOUT in pages/nav.ts): content height, `main` is the only scroller, children never use flex-1 / h-full.
 * - layout "fit" (Dashboard, and pages not yet converted): the body fills the remaining height.
 * `aside` takes at most one filled primary plus optional secondary actions.
 */
export function Page({
  title,
  subtitle,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { from, go, layout } = useNav();
  const fit = layout === "fit";
  return (
    <div className={cn("flex flex-col", fit && "h-full min-h-0")}>
      <header className="flex shrink-0 items-start justify-between gap-6">
        <PageHeading title={title} subtitle={subtitle} />
        <div className="flex shrink-0 items-center gap-3">
          {from && (
            <button
              onClick={() => go(from)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-body font-medium text-accent hover:bg-subtle"
            >
              <ArrowLeftRegular fontSize={16} aria-hidden />
              Back to {pageLabel(from)}
            </button>
          )}
          {aside}
        </div>
      </header>
      <div className={cn("mt-4 flex flex-col gap-4", fit && "min-h-0 flex-1", className)}>{children}</div>
    </div>
  );
}

/** Visible (not tooltip) note for controls that exist but don't work yet. */
export function NextBuild({ children = "Available in the next build", className }: { children?: ReactNode; className?: string }) {
  return <span className={cn("text-caption text-muted", className)}>{children}</span>;
}

/** Section heading (18/24) that sits outside its card, 8 px above it. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-h2 font-semibold tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-body text-muted">{children}</p>;
}
