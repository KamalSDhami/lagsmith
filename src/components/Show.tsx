import type { ReactNode } from "react";
import type { Load } from "../lib/useSystemData";
import { Skeleton } from "./ui/skeleton";

export function InlineError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="px-4 py-3 text-[0.875rem]" role="alert">
      <p className="text-muted">Couldn't read {what}</p>
      <button onClick={onRetry} className="mt-1 font-medium text-accent underline-offset-2 hover:underline">
        Try again
      </button>
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-3 px-4 py-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

/** Renders loading, error or the data. Stale data stays visible while reloading. */
export function Show<T>({
  load,
  what,
  onRetry,
  children,
  loading,
}: {
  load: Load<T>;
  what: string;
  onRetry: () => void;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if (load.status === "error") return <InlineError what={what} onRetry={onRetry} />;
  if (load.data === undefined) return <>{loading ?? <LoadingRows />}</>;
  return <>{children(load.data)}</>;
}
