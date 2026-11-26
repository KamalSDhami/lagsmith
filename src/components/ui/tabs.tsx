import { cn } from "../../lib/cn";

export function Tabs<T extends string>({
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
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cn(
            "h-8 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors",
            t.id === value ? "border-transparent bg-accent-soft text-accent" : "border-line bg-surface text-ink hover:bg-subtle",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
