import { cn } from "../../lib/cn";

/** Few visible options, one choice (Hick). Radio semantics; arrow keys move within the group. */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] bg-subtle p-0.5">
      {items.map((it, idx) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(it.id)}
            onKeyDown={(e) => {
              const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              const n = (idx + step + items.length) % items.length;
              onChange(items[n].id);
              e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role=radio]")[n]?.focus();
            }}
            className={cn(
              "h-8 rounded-[8px] px-3 text-secondary font-medium transition-colors",
              on ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
