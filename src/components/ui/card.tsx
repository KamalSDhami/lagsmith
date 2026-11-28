import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/** Radius 16. Cards hug their content: never flex-1 / h-full / max-h (spec 2.1). */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[16px] border border-line bg-surface shadow-card", className)} {...props} />;
}
