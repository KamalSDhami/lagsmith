import { useState } from "react";
import { ArrowRight, Info, TriangleAlert } from "lucide-react";
import type { SystemData, Cmd } from "../lib/useSystemData";
import { deriveFindings, type Finding, type Severity } from "../lib/derive";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { cn } from "../lib/cn";
import { ICON_STROKE, type Page } from "../pages/nav";

const SOURCES: Cmd[] = [
  "get_stability",
  "get_storage",
  "get_hardware",
  "get_startup",
  "get_security",
  "get_system",
  "get_anticheat",
  "get_gpu_preferences",
];
const COLLAPSED = 5;

const tile: Record<Severity, string> = {
  critical: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning-icon",
  info: "bg-info-soft text-info",
};

const severityLabel: Record<Severity, string> = { critical: "Critical", warning: "Warning", info: "Info" };

function Row({ f, onOpen }: { f: Finding; onOpen: (p: Page, focus?: string) => void }) {
  const Icon = f.severity === "info" ? Info : TriangleAlert;
  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-2">
      <span className={cn("grid size-9 place-items-center rounded-lg", tile[f.severity])}>
        <Icon size={18} strokeWidth={ICON_STROKE} aria-label={severityLabel[f.severity]} />
      </span>
      <div className="min-w-0">
        <h3 className="flex min-w-0 items-baseline gap-2 text-[0.9375rem] font-medium">
          <span className="shrink-0">{f.title}</span>
          <span className="truncate text-[0.8125rem] font-normal text-muted">
            {f.evidence ? `${f.evidence} · ` : ""}
            {f.source}
          </span>
        </h3>
        <p title={f.body} className="line-clamp-2 text-[0.8438rem] text-muted">
          {f.body}
        </p>
      </div>
      <div className="flex justify-end">
        {f.action && (
          <Button variant="outline" size="sm" onClick={() => onOpen(f.action!.page, f.action!.focus)}>
            {f.action.label}
            <ArrowRight size={15} strokeWidth={ICON_STROKE} aria-hidden />
          </Button>
        )}
      </div>
    </li>
  );
}

function SkeletonRow() {
  return (
    <li aria-hidden className="grid grid-cols-[2.25rem_1fr_9.5rem] items-center gap-x-4 px-4 py-2">
      <Skeleton className="size-9 rounded-lg" />
      <div>
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-1.5 h-3.5 w-2/3" />
      </div>
      <Skeleton className="h-8 w-full rounded-lg" />
    </li>
  );
}

export function TopFindings({ data, retry, onOpen }: { data: SystemData; retry: (c: Cmd) => void; onOpen: (p: Page, focus?: string) => void }) {
  const [expanded, setExpanded] = useState(false);
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
        system: ok("get_system"),
        anticheat: ok("get_anticheat"),
        gpuPreferences: ok("get_gpu_preferences"),
      });
  const shown = expanded ? findings : findings.slice(0, COLLAPSED);
  const hidden = findings.length > COLLAPSED;

  return (
    <section aria-labelledby="findings-title">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="findings-title" className="text-[1.125rem] font-semibold tracking-tight">
          Top findings
        </h2>
        {!loading && hidden && (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls="findings-list"
            className="inline-flex h-8 items-center text-[0.875rem] font-medium text-accent underline-offset-2 hover:underline"
          >
            {expanded ? "Show fewer" : `View all ${findings.length}`}
          </button>
        )}
        {!loading && !hidden && (
          <span className="text-[0.875rem] text-muted">{findings.length === 1 ? "1 item" : `${findings.length} items`}</span>
        )}
      </div>
      <Card className="overflow-hidden">
        <ul id="findings-list" className="divide-y divide-line" aria-busy={loading}>
          {loading && [0, 1, 2].map((i) => <SkeletonRow key={i} />)}
          {!loading && shown.map((f) => <Row key={f.id} f={f} onOpen={onOpen} />)}
          {!loading && findings.length === 0 && failed.length === 0 && (
            <li className="px-4 py-4 text-[0.875rem] text-muted">No issues found in this scan.</li>
          )}
        </ul>
        {!loading && failed.length > 0 && (
          <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 text-[0.875rem]" role="alert">
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
