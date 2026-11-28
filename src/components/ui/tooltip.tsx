import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

/** Label beside the element on hover and keyboard focus. Fixed-position portal, so a scrolling or clipped nav never cuts it off. */
export function Tooltip({
  label,
  children,
  side = "right",
}: {
  label: string;
  children: ReactElement<Record<string, unknown>>;
  side?: "right" | "top";
}) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      setPos(side === "right" ? { x: r.right + 8, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.top - 8 });
    }, delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pos) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [pos]);

  return (
    <span ref={ref} className="flex min-w-0" onMouseEnter={() => show(150)} onMouseLeave={hide} onFocus={() => show(0)} onBlur={hide}>
      {cloneElement(children, { "aria-describedby": pos ? id : undefined })}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            id={id}
            style={{ left: pos.x, top: pos.y, transform: side === "right" ? "translateY(-50%)" : "translate(-50%,-100%)" }}
            className="pointer-events-none fixed z-50 rounded-[8px] bg-primary px-2 py-1 text-caption font-medium whitespace-nowrap text-primary-ink shadow-pop"
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}
