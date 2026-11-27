import { Bug, Cpu, MonitorX, TriangleAlert } from "lucide-react";
import type { AppCrash, DumpAnalysis, Stability } from "../types";
import { useSys } from "../lib/useSystemData";
import { Page, Empty } from "../components/Page";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Skeleton } from "../components/ui/skeleton";
import { Show } from "../components/Show";
import { AntiCheatCard } from "../components/AntiCheatCard";
import { crashSeverity, localDay, shortCode } from "../lib/derive";
import { formatSize, formatTime, isoDay } from "../lib/format";
import { ICON_STROKE } from "./nav";
import { cn } from "../lib/cn";

const DAYS = 30;

function Tile({ icon: Icon, n, label, tone }: { icon: typeof Bug; n: number | null; label: string; tone: "danger" | "warning" | "info" }) {
  const tones = {
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning-icon",
    info: "bg-info-soft text-info",
  };
  return (
    <Card className="flex items-center gap-3.5 px-4 py-3">
      <span className={cn("grid size-10 place-items-center rounded-xl", n ? tones[tone] : "bg-subtle text-muted")}>
        <Icon size={19} strokeWidth={ICON_STROKE} aria-hidden />
      </span>
      <div>
        <div className="text-[1.375rem] leading-none font-semibold tabular-nums">{n ?? "-"}</div>
        <div className="mt-1 text-[0.875rem] text-muted">{label}</div>
      </div>
    </Card>
  );
}

const SERIES = [
  { key: "blue", label: "Blue screen", color: "#5b58dc" },
  { key: "shutdown", label: "Unexpected shutdown", color: "#b07000" },
  { key: "app", label: "App crash", color: "#a3a1e8" },
] as const;

/** 30-day dot plot. Driver resets have no per-day dates in the contract, so they're not plotted. */
function Timeline({ s }: { s: Stability }) {
  const today = new Date();
  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (DAYS - 1 - i));
    return d;
  });
  const keys = days.map(isoDay);
  const byDay = new Map(s.days.map((d) => [d.date.slice(0, 10), d]));
  const appByDay = new Map<string, number>();
  for (const a of s.appCrashes) {
    const k = localDay(a.time);
    appByDay.set(k, (appByDay.get(k) ?? 0) + 1);
  }
  const W = 900;
  const H = 96;
  const x = (i: number) => 20 + (i * (W - 40)) / (DAYS - 1);
  const rows = { blue: 26, shutdown: 50, app: 74 };
  const dots: { cx: number; cy: number; color: string; title: string }[] = [];
  keys.forEach((k, i) => {
    const d = byDay.get(k);
    const label = days[i].toLocaleDateString(undefined, { day: "numeric", month: "short" });
    if (d?.blueScreens) dots.push({ cx: x(i), cy: rows.blue, color: SERIES[0].color, title: `${label}: ${d.blueScreens} blue screen(s)` });
    if (d?.unexpectedShutdowns)
      dots.push({ cx: x(i), cy: rows.shutdown, color: SERIES[1].color, title: `${label}: ${d.unexpectedShutdowns} unexpected shutdown(s)` });
    const a = appByDay.get(k);
    if (a) dots.push({ cx: x(i), cy: rows.app, color: SERIES[2].color, title: `${label}: ${a} app crash(es)` });
  });
  const ticks = [0, 5, 10, 15, 20, 25, 29];
  return (
    <figure aria-label="Crash timeline, last 30 days">
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-[7rem] w-full" role="img" aria-label={`${dots.length} days with events in the last 30 days`}>
        {Object.values(rows).map((y) => (
          <line key={y} x1={20} x2={W - 20} y1={y} y2={y} stroke="#ececf1" strokeWidth={1} />
        ))}
        {dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={6} fill={d.color}>
            <title>{d.title}</title>
          </circle>
        ))}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H + 14} textAnchor="middle" fontSize="12" fill="#5f5f67">
            {days[i].toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function AppCrashRow({ a }: { a: AppCrash }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="min-w-0">
        <div className="truncate text-[0.875rem] font-medium">
          {a.app} {a.hang && <span className="font-normal text-muted">(stopped responding)</span>}
        </div>
        <div className="truncate text-[0.8125rem] text-muted">{a.module ? `in ${a.module}` : "Faulting module not recorded"}</div>
      </div>
      <span className="shrink-0 text-[0.8125rem] text-muted">{formatTime(a.time)}</span>
    </li>
  );
}

function DumpAnalysisRow({ a }: { a: DumpAnalysis }) {
  const driversPrefix = a.driversLabel === "cause" ? "Cause" : "Drivers present";
  return (
    <li className="px-4 py-2 text-[0.8125rem]">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-medium" title={a.file}>
            {a.file}
          </span>
          <span className="shrink-0 text-muted tabular-nums" title={a.bugcheckCode}>
            {shortCode(a.bugcheckCode)}
          </span>
        </div>
        {a.suspectModule && (
          <Badge tone="danger" className="h-6 shrink-0 px-2 text-[0.75rem]">
            {a.suspectModule}
            {a.suspectFrom ? ` · ${a.suspectFrom}` : ""}
          </Badge>
        )}
      </div>
      {a.drivers.length > 0 && (
        <div className="mt-0.5 truncate text-[0.75rem] text-muted">
          {driversPrefix}: {a.drivers.join(", ")}
        </div>
      )}
      {a.error && (
        <div role="alert" className="mt-0.5 text-[0.75rem] text-danger">
          {a.error}
        </div>
      )}
    </li>
  );
}

export function CrashPage() {
  const { data, load, admin, startAdminTask } = useSys();
  const st = data.get_stability;
  const s = st.status === "ok" || st.status === "loading" ? st.data : undefined;
  const blue30 = s ? s.days.reduce((n, d) => n + d.blueScreens, 0) : null;
  const analyzing = admin.running === "analyze-dumps";
  const dumpRun = admin.results["analyze-dumps"];
  const dumpError = admin.error?.task === "analyze-dumps" ? admin.error.message : null;

  return (
    <Page
      title="Crash Detective"
      subtitle="Blue screens, unexpected shutdowns, driver resets and app crashes from the Windows Event Log."
      aside={<span className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3 text-[0.875rem]">Last 30 days</span>}
    >
      <div className="grid shrink-0 grid-cols-3 gap-3">
        <Tile icon={MonitorX} n={blue30} label="Blue screens" tone="danger" />
        <Tile icon={Cpu} n={s ? s.driverResets : null} label={s?.driverResets === 1 ? "Driver reset" : "Driver resets"} tone="warning" />
        <Tile icon={Bug} n={s ? s.appCrashes.length : null} label="App crashes" tone="info" />
      </div>

      <Card className="mt-3 shrink-0 px-4 pt-3 pb-1">
        <div className="flex items-center justify-between">
          <h2 className="text-[0.9375rem] font-semibold">Crash timeline</h2>
          <ul className="flex gap-4 text-[0.8125rem] text-muted" aria-label="Legend">
            {SERIES.map((x) => (
              <li key={x.key} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: x.color }} />
                {x.label}
              </li>
            ))}
          </ul>
        </div>
        {st.status === "error" ? (
          <Show load={st} what="crash history" onRetry={() => load("get_stability")}>
            {() => null}
          </Show>
        ) : s ? (
          <Timeline s={s} />
        ) : (
          <Skeleton className="my-3 h-[6rem] w-full" />
        )}
      </Card>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-3 gap-3">
        <Card className="flex min-h-0 flex-col">
          <h2 className="px-4 pt-3 pb-1 text-[0.9375rem] font-semibold">Crash reports</h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Show load={st} what="crash reports" onRetry={() => load("get_stability")}>
              {(d) =>
                d.crashes.length === 0 ? (
                  <Empty>No blue screens recorded.</Empty>
                ) : (
                  <ul className="divide-y divide-line">
                    {d.crashes.map((c, i) => (
                      <li key={i} className="flex items-start gap-3 px-4 py-2">
                        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger">
                          <TriangleAlert size={16} strokeWidth={ICON_STROKE} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[0.875rem] font-medium">{shortCode(c.code)}</div>
                          <div className="text-[0.8125rem] leading-snug text-muted" title={c.meaning}>
                            {c.meaning || "No description"}
                          </div>
                          <div className="text-[0.75rem] text-muted">
                            {formatTime(c.time)}
                            {c.dumpFile ? "" : " · No dump saved"}
                          </div>
                        </div>
                        <Badge tone={crashSeverity(c) === "High" ? "danger" : "warning"}>{crashSeverity(c)}</Badge>
                      </li>
                    ))}
                  </ul>
                )
              }
            </Show>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <h2 className="px-4 pt-3 pb-1 text-[0.9375rem] font-semibold">App crashes</h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Show load={st} what="app crashes" onRetry={() => load("get_stability")}>
              {(d) =>
                d.appCrashes.length === 0 ? (
                  <Empty>No app crashes recorded.</Empty>
                ) : (
                  <ul className="divide-y divide-line">
                    {d.appCrashes.map((a, i) => (
                      <AppCrashRow key={i} a={a} />
                    ))}
                  </ul>
                )
              }
            </Show>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2">
            <h2 className="text-[0.9375rem] font-semibold">Crash dumps</h2>
            <Button
              size="sm"
              variant="outline"
              disabled={admin.running !== null}
              onClick={() => startAdminTask("analyze-dumps")}
              className="h-7 px-2.5 text-[0.75rem] disabled:opacity-50"
            >
              {analyzing ? "Analyzing…" : "Analyze dumps"}
            </Button>
          </div>
          {analyzing && (
            <div className="border-t border-line px-4 py-2">
              <Progress value={(admin.event?.percent ?? 0) / 100} label="Dump analysis progress" />
              <div className="mt-1 flex items-center justify-between gap-2 text-[0.75rem] text-muted">
                <span className="truncate">{admin.event?.stage ?? "Starting…"}</span>
                {admin.event?.percent !== null && admin.event?.percent !== undefined && (
                  <span className="shrink-0 tabular-nums">{Math.round(admin.event.percent)}%</span>
                )}
              </div>
            </div>
          )}
          {!analyzing && dumpError && (
            <p role="alert" className="border-t border-line bg-danger-soft/60 px-4 py-1.5 text-[0.75rem] text-danger">
              {dumpError}
            </p>
          )}
          <div className="max-h-[10.5rem] min-h-0 overflow-y-auto border-t border-line">
            {dumpRun ? (
              dumpRun.result.dumps.length === 0 ? (
                dumpRun.result.ok ? (
                  <Empty>{dumpRun.result.message}</Empty>
                ) : (
                  <p role="alert" className="px-4 py-3 text-[0.8125rem] text-danger">
                    {dumpRun.result.message}
                  </p>
                )
              ) : (
                <ul className="divide-y divide-line" aria-label="Analyzed crash dumps">
                  {dumpRun.result.dumps.map((a) => (
                    <DumpAnalysisRow key={a.file} a={a} />
                  ))}
                </ul>
              )
            ) : (
              <Show load={data.list_crash_dumps} what="crash dumps" onRetry={() => load("list_crash_dumps")}>
                {(dumps) =>
                  dumps.length === 0 ? (
                    <Empty>No crash dumps on this PC.</Empty>
                  ) : (
                    <ul className="divide-y divide-line">
                      {dumps.map((d) => (
                        <li key={d.file} className="flex items-center justify-between gap-3 px-4 py-1.5 text-[0.8125rem]">
                          <span className="truncate" title={d.file}>
                            {d.file.split("\\").pop()}
                          </span>
                          <span className="shrink-0 text-muted">
                            {formatTime(d.time)} · {formatSize(d.bytes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                }
              </Show>
            )}
          </div>
        </Card>

        <AntiCheatCard />
      </div>
    </Page>
  );
}
