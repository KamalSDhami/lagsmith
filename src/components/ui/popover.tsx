import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Minimal popover: the trigger is rendered by the caller via `trigger(props)`,
 * the panel is a sibling positioned under it. Closes on Escape and outside click.
 */
export function Popover({
  trigger,
  before,
  children,
  className,
  panelClassName,
  label,
}: {
  trigger: (p: { onClick: () => void; "aria-expanded": boolean; "aria-controls": string; "aria-haspopup": "dialog" }) => ReactNode;
  /** Content rendered before the trigger, inside the positioned root. */
  before?: ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", className)}>
      {before}
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open, "aria-controls": id, "aria-haspopup": "dialog" })}
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute top-[calc(100%+8px)] right-0 z-20 rounded-2xl border border-line bg-surface p-2 shadow-pop",
            panelClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
