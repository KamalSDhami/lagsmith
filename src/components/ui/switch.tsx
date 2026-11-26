import { cn } from "../../lib/cn";

/** Accessible on/off switch. `checked: null` renders an "Unknown" state that can't be toggled. */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean | null;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  const unknown = checked === null;
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={unknown ? "mixed" : checked}
      aria-label={label}
      disabled={disabled || unknown}
      onClick={() => !unknown && onChange?.(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent-bar" : "bg-[#8e8e98]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
        )}
      />
    </button>
  );
  if (!unknown) return control;
  return (
    <span className="flex items-center gap-2">
      <span className="text-[0.8125rem] text-muted">Unknown</span>
      {control}
    </span>
  );
}
