import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import type { SystemData, Cmd } from "../lib/useSystemData";
import { deriveFindings, type Finding, type Severity } from "../lib/derive";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { cn } from "../lib/cn";
import { ICON_STROKE, type Page } from "../pages/nav";

const SOURCES: Cmd[] = ["get_stability", "get_storage", "get_hardware", "get_startup", "get_security"];

const tile: Record<Severity, string> = {
  critical: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning-icon",
  info: "bg-info-soft text-info",
};

function Row({ f, onOpen }: { f: Finding; onOpen: (p: Page) => void }) {
  const Icon = f.severity === "info" ? Info : TriangleAlert;
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)_minmax(150px,210px)_auto] items-center gap-x-5 px-5 py-3.5">
      <span className={cn("grid size-11 place-items-center rounded-xl", tile[f.severity])}>
        <Icon size={20} strokeWidth={ICON_STROKE} aria-label={f.severity === "info" ? "Info" : f.severity === "critical" ? "Critical" : "Warning"} />
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium">{f.title}</h3>
        <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{f.body}</p>
      </div>
      <div className="text-[14px] leading-snug">
        {f.evidence && <div className="font-medium">{f.evidence}</div>}
        <div className="text-muted">({f.source})</div>
      </div>
      <Button variant="outline" onClick={() => onOpen(f.page)} className="min-w-[180px] justify-between">
        {f.action}
        <ArrowRight size={17} strokeWidth={ICON_STROKE} aria-hidden />
      </Button>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li aria-hidden className="grid grid-cols-[44px_1fr_180px] items-center gap-x-5 px-5 py-4">
      <Skeleton className="size-11 rounded-xl" />
      <div>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-2 h-3.5 w-2/3" />
      </div>
      <Skeleton className="h-9 w-full rounded-xl" />
    </li>
  );
}

export function TopFindings({ data, retry, onOpen }: { data: SystemData; retry: (c: Cmd) => void; onOpen: (p: Page) => void }) {
  const loading = SOURCES.some((c) => data[c].status === "loading");
  const failed = SOURCES.filter((c) => data[c].status === "error");
  const ok = <K extends Cmd>(c: K) => {
    const s = data[c];
    return s.status === "ok" ? s.data : undefined;
  };
  const findings = loading
    ? []
    : deriveFindings({
        stability: ok("get_stability"),
        storage: ok("get_storage"),
        hardware: ok("get_hardware"),
        startup: ok("get_startup"),
        security: ok("get_security"),
      });

  return (
    <section aria-labelledby="findings-title" className="mt-7">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="findings-title" className="text-[20px] font-semibold tracking-tight">
          Top findings
        </h2>
        {!loading && <span className="text-[14px] text-muted">{findings.length === 1 ? "1 item" : `${findings.length} items`}</span>}
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line" aria-busy={loading}>
          {loading && [0, 1, 2].map((i) => <SkeletonRow key={i} />)}
          {!loading && findings.map((f) => <Row key={f.id} f={f} onOpen={onOpen} />)}
          {!loading && findings.length === 0 && failed.length === 0 && (
            <li className="px-5 py-6 text-[14px] text-muted">No issues found in this scan.</li>
          )}
        </ul>
        {!loading && failed.length > 0 && (
          <div className="flex items-center gap-3 border-t border-line px-5 py-3 text-[14px]" role="alert">
            <span className="text-muted">Some checks couldn't run, so this list may be incomplete.</span>
            <button
              onClick={() => failed.forEach(retry)}
              className="font-medium text-accent underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </div>
        )}
      </Card>
    </section>
  );
}
