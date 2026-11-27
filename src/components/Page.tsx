import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "../lib/cn";
import { useNav } from "../lib/navContext";
import { pageLabel, ICON_STROKE } from "../pages/nav";

/** Page frame: a header, then a body that fills the remaining height so long lists scroll inside their cards. */
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
  const { from, go } = useNav();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 tabIndex={-1} className="text-[1.625rem] leading-tight font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[0.9375rem] text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-start gap-4">
          {from && (
            <button
              onClick={() => go(from)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[0.875rem] font-medium text-accent hover:bg-subtle"
            >
              <ArrowLeft size={16} strokeWidth={ICON_STROKE} aria-hidden />
              Back to {pageLabel(from)}
            </button>
          )}
          {aside}
        </div>
      </header>
      <div className={cn("mt-4 flex min-h-0 flex-1 flex-col gap-4", className)}>{children}</div>
    </div>
  );
}

/** Visible (not tooltip) note for controls that exist but don't work yet. */
export function NextBuild({ children = "Available in the next build", className }: { children?: ReactNode; className?: string }) {
  return <span className={cn("text-[0.75rem] text-muted", className)}>{children}</span>;
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h2 className="text-[0.9375rem] font-semibold">{children}</h2>
      {aside}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-[0.875rem] text-muted">{children}</p>;
}
