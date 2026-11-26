import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Native modal <dialog>: focus trap, Escape to close and a backdrop come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        "m-auto max-h-[calc(100vh-4rem)] w-[34rem] max-w-[calc(100vw-4rem)] rounded-[20px] border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[rgb(20_20_30/0.28)]",
        className,
      )}
    >
      {open && children}
    </dialog>
  );
}
