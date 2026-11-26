import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-md bg-subtle motion-safe:animate-pulse", className)} />;
}
