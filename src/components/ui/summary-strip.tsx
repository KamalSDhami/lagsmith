import type { ReactNode } from "react";
import { Card } from "./card";

/** The 2 to 4 numbers that used to sit in a page header aside (spec 2.4). */
export function SummaryStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <Card className="flex min-h-14 flex-wrap items-center gap-x-8 gap-y-2 px-4 py-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline gap-2">
          <span className="tnum text-metric font-semibold">{it.value}</span>
          <span className="text-secondary text-muted">{it.label}</span>
        </div>
      ))}
    </Card>
  );
}
