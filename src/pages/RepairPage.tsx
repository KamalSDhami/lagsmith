import { Box, History, ShieldCheck, type LucideIcon } from "lucide-react";
import type { AdminEvent, AdminTask, SfcResult } from "../types";
import { useSys, type AdminRunResult } from "../lib/useSystemData";
import { Page } from "../components/Page";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge, type Tone } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Show } from "../components/Show";
import { formatDate, formatTime } from "../lib/format";
import { ICON_STROKE } from "./nav";

const SFC_OUTCOME: Record<SfcResult["outcome"], { label: string; tone: Tone; text: string }> = {
  no_problems: { label: "No problems", tone: "success", text: "Windows Resource Protection found no integrity violations." },
  repaired: { label: "Repaired", tone: "success", text: "SFC found corrupt files and repaired them." },
  could_not_repair: {
    label: "Could not repair",
    tone: "danger",
    text: "SFC found corrupt files it couldn't fix. Running DISM first usually gives SFC a clean source.",
  },
  unknown: { label: "Unknown", tone: "neutral", text: "The last SFC result couldn't be read from the CBS log." },
};

const ADMIN_OUTCOME: Record<string, { label: string; tone: Tone }> = {
  no_problems: { label: "No problems", tone: "success" },
  repaired: { label: "Repaired", tone: "success" },
  could_not_repair: { label: "Could not repair", tone: "danger" },
  source_missing: { label: "Source missing", tone: "danger" },
  created: { label: "Created", tone: "success" },
  already_exists: { label: "Already exists", tone: "info" },
  protection_off: { label: "Protection off", tone: "warning" },
  failed: { label: "Failed", tone: "danger" },
};

function outcomeMeta(outcome: string): { label: string; tone: Tone } {
  return ADMIN_OUTCOME[outcome] ?? { label: outcome, tone: "neutral" };
}

function formatExitHex(code: number | null): string | null {
  if (code === null || code === 0) return null;
  return `0x${code.toString(16).toUpperCase()}`;
}

interface ToolSpec {
  task: AdminTask;
  icon: LucideIcon;
  title: string;
  desc: string;
  runLabel: string;
  runningLabel: string;
}

const TOOLS: ToolSpec[] = [
  {
    task: "sfc",
    icon: ShieldCheck,
    title: "Check System Files (SFC)",
    desc: "Scans protected Windows files and repairs corrupt ones.",
    runLabel: "Run SFC",
    runningLabel: "Running SFC…",
  },
  {
    task: "dism-restorehealth",
    icon: Box,
    title: "Repair Windows Image (DISM)",
    desc: "Repairs the component store that SFC repairs from.",
    runLabel: "Run DISM",
    runningLabel: "Running DISM…",
  },
  {
    task: "restore-point",
    icon: History,
    title: "Create Restore Point",
    desc: "Saves a Windows restore point before making system repairs.",
    runLabel: "Create Restore Point",
    runningLabel: "Creating…",
  },
];

function ToolCard({
  spec,
  isRunning,
  anyRunning,
  event,
  latest,
  error,
  onRun,
}: {
  spec: ToolSpec;
  isRunning: boolean;
  anyRunning: boolean;
  event: AdminEvent | null;
  latest: AdminRunResult | undefined;
  error: string | null;
  onRun: (task: AdminTask) => void;
}) {
  const { task, icon: Icon, title, desc, runLabel, runningLabel } = spec;
  const meta = latest ? outcomeMeta(latest.result.outcome) : null;
  const exitHex = latest ? formatExitHex(latest.result.exitCode) : null;

  return (
    <Card className="flex flex-col p-5" data-testid={`admin-card-${task}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-tile text-tile-ink">
          <Icon size={22} strokeWidth={ICON_STROKE} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[1rem] font-semibold">{title}</h2>
          <p className="mt-0.5 text-[0.875rem] leading-snug text-muted">{desc}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-1 flex-col justify-end">
        {isRunning && (
          <div className="mb-3">
            <Progress value={(event?.percent ?? 0) / 100} label={`${title} progress`} />
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[0.8125rem] text-muted">
              <span className="truncate">{event?.stage ?? "Starting…"}</span>
              {event?.percent !== null && event?.percent !== undefined && (
                <span className="shrink-0 tabular-nums">{Math.round(event.percent)}%</span>
              )}
            </div>
          </div>
        )}

        {!isRunning && error && (
          <div role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[0.8125rem] leading-snug text-danger">
            {error}
          </div>
        )}

        {!isRunning && !error && latest && meta && (
          <div role={latest.result.ok ? undefined : "alert"} className="mb-3">
            <div className="flex items-center gap-2">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {exitHex && <span className="text-[0.75rem] text-muted tabular-nums">Exit {exitHex}</span>}
            </div>
            <p className={latest.result.ok ? "mt-1.5 text-[0.8125rem] leading-snug text-muted" : "mt-1.5 text-[0.8125rem] leading-snug text-danger"}>
              {latest.result.message}
            </p>
          </div>
        )}

        <Button
          variant="primary"
          disabled={anyRunning}
          onClick={() => onRun(task)}
          className="w-full active:scale-[0.99]"
        >
          {isRunning ? runningLabel : runLabel}
        </Button>
      </div>
    </Card>
  );
}

export function RepairPage() {
  const { data, load, admin, startAdminTask } = useSys();
  const anyRunning = admin.running !== null;
  const dismRun = admin.results["dism-restorehealth"];
  const dismMeta = dismRun ? outcomeMeta(dismRun.result.outcome) : null;
  const dismExitHex = dismRun ? formatExitHex(dismRun.result.exitCode) : null;

  return (
    <Page title="System Repair" subtitle="Check and repair Windows system files, or save a restore point. Requires admin rights.">
      <div className="grid shrink-0 grid-cols-3 gap-3">
        {TOOLS.map((spec) => (
          <ToolCard
            key={spec.task}
            spec={spec}
            isRunning={admin.running === spec.task}
            anyRunning={anyRunning}
            event={admin.running === spec.task ? admin.event : null}
            latest={admin.results[spec.task]}
            error={admin.error?.task === spec.task ? admin.error.message : null}
            onRun={startAdminTask}
          />
        ))}
      </div>
      <Card className="mt-3 p-5">
        <h2 className="text-[1rem] font-semibold">Last results</h2>
        <div className="mt-3 grid grid-cols-2 gap-6">
          <section aria-label="Last SFC result">
            <h3 className="text-[0.875rem] font-medium">System File Checker</h3>
            <Show load={data.get_system} what="the last SFC result" onRetry={() => load("get_system")}>
              {(s) =>
                s.lastSfc ? (
                  <div className="mt-1.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={SFC_OUTCOME[s.lastSfc.outcome].tone}>{SFC_OUTCOME[s.lastSfc.outcome].label}</Badge>
                      <span className="text-[0.8125rem] text-muted" title={formatTime(s.lastSfc.time)}>
                        {formatDate(s.lastSfc.time)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[0.875rem] text-muted">{SFC_OUTCOME[s.lastSfc.outcome].text}</p>
                    <p className="mt-1 text-[0.75rem] text-muted">Source: CBS log</p>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[0.875rem] text-muted">No SFC run found in the CBS log.</p>
                )
              }
            </Show>
          </section>
          <section aria-label="Last DISM result">
            <h3 className="text-[0.875rem] font-medium">DISM</h3>
            {dismRun && dismMeta ? (
              <div className="mt-1.5">
                <div className="flex items-center gap-2">
                  <Badge tone={dismMeta.tone}>{dismMeta.label}</Badge>
                  <span className="text-[0.8125rem] text-muted" title={formatTime(dismRun.finishedAt)}>
                    {formatDate(dismRun.finishedAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-[0.875rem] text-muted">{dismRun.result.message}</p>
                <p className="mt-1 text-[0.75rem] text-muted">
                  Source: this session{dismExitHex ? ` · Exit ${dismExitHex}` : ""}
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-[0.875rem] text-muted">
                Lagsmith can't read past DISM results yet. They'll appear here after you run DISM from Lagsmith.
              </p>
            )}
          </section>
        </div>
      </Card>
    </Page>
  );
}
