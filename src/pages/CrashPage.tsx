import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { AppCrash, DumpAnalysis, Stability } from "../types";
import { useSys, value } from "../lib/useSystemData";
import { Page, Empty } from "../components/Page";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Skeleton } from "../components/ui/skeleton";
import { Show } from "../components/Show";
import { Tabs } from "../components/ui/tabs";
import { useNav } from "../lib/navContext";
import { crashSeverity, localDay, shortCode, sinceDay } from "../lib/derive";
import { isProtected } from "../lib/protected";
import { formatSize, formatTime, isoDay } from "../lib/format";
import { ICON_STROKE } from "./nav";
import { waitingLabel } from "../lib/adminLabels";

/** Rust reads 30 days of events, so 30 is the longest range there is data for. */
type Range = 7 | 30;

const SERIES = [
  { key: "blue", label: "Blue screen", color: "#5b58dc" },
  { key: "shutdown", label: "Unexpected shutdown", color: "#b07000" },
  { key: "app", label: "App crash", color: "#a3a1e8" },
] as const;

/** Dot plot of the chosen range. Driver resets have no per-day dates in the contract, so they're not plotted. */
function Timeline({ s, range }: { s: Stability; range: Range }) {
  const DAYS = range;
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
  const ticks = range === 7 ? [0, 1, 2, 3, 4, 5, 6] : [0, 5, 10, 15, 20, 25, 29];
  return (
    <figure aria-label={`Crash timeline, last ${range} days`}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-[7rem] w-full" role="img" aria-label={`${dots.length} days with events in the last ${range} days`}>
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

const RANGES: { id: string; label: string; days: Range }[] = [
  { id: "7", label: "7 days", days: 7 },
  { id: "30", label: "30 days", days: 30 },
];

export function CrashPage() {
  const { data, load, admin, startAdminTask } = useSys();
  const { go } = useNav();
  const [range, setRange] = useState<Range>(30);
  const st = data.get_stability;
  const s = st.status === "ok" || st.status === "loading" ? st.data : undefined;
  const analyzing = admin.running === "analyze-dumps";
  const dumpRun = admin.results["analyze-dumps"];
  const dumpError = admin.error?.task === "analyze-dumps" ? admin.error.message : null;

  const from = sinceDay(range);
  const inRange = (t: string) => localDay(t) >= from;
  const crashes = s?.crashes.filter((c) => inRange(c.time)) ?? [];
  const appCrashes = s?.appCrashes.filter((a) => inRange(a.time)) ?? [];
  const daysIn = s?.days.filter((d) => d.date.slice(0, 10) >= from) ?? [];
  const counts = {
    blue: s ? daysIn.reduce((n, d) => n + d.blueScreens, 0) : null,
    shutdown: s ? daysIn.reduce((n, d) => n + d.unexpectedShutdowns, 0) : null,
    app: s ? appCrashes.length : null,
  };

  const analysis = new Map((dumpRun?.result.dumps ?? []).map((a) => [a.file, a]));
  const suspect = [...analysis.values()].find((a) => a.suspectModule);
  const vanguard = value(data.get_anticheat)?.find((a) => a.state === "running");

  return (
    <Page
      title="Crash Detective"
      subtitle="Blue screens, unexpected shutdowns, driver resets and app crashes from the Windows Event Log."
      aside={
        <Tabs
          label="Time range"
          value={String(range)}
          onChange={(v) => setRange(Number(v) as Range)}
          items={RANGES.map((r) => ({ id: r.id, label: `Last ${r.label}` }))}
        />
      }
    >
      <Card className="shrink-0 px-4 pt-3 pb-1">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[0.9375rem] font-semibold">Crash timeline</h2>
          <ul className="flex flex-wrap justify-end gap-x-4 text-[0.8125rem] text-muted" aria-label="Legend">
            {SERIES.map((x) => (
              <li key={x.key} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: x.color }} />
                {x.label}
                <span className="font-medium text-ink tabular-nums">{counts[x.key] ?? "-"}</span>
              </li>
            ))}
            <li>
              Driver resets <span className="font-medium text-ink tabular-nums">{s ? s.driverResets : "-"}</span> (30 days, no dates)
            </li>
          </ul>
        </div>
        {st.status === "error" ? (
          <Show load={st} what="crash history" onRetry={() => load("get_stability")}>
            {() => null}
          </Show>
        ) : s ? (
          <Timeline s={s} range={range} />
        ) : (
          <Skeleton className="my-3 h-[6rem] w-full" />
        )}
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <Card className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
            <div className="flex min-w-0 items-center gap-3">
              <h2 className="text-[0.9375rem] font-semibold">Crash reports</h2>
              {vanguard && (
                <button
                  onClick={() => go("gaming", "valorant", "crash")}
                  className="inline-flex h-7 items-center rounded-lg bg-subtle px-2.5 text-[0.8125rem] font-medium hover:bg-line"
                >
                  {vanguard.name.replace(/\s*\(.*\)/, "")} running
                </button>
              )}
            </div>
            <Button size="sm" disabled={admin.running !== null} onClick={() => startAdminTask("analyze-dumps")} className="disabled:opacity-50">
              {analyzing ? "Analyzing…" : (waitingLabel(admin, []) ?? "Analyze dumps")}
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
          {!analyzing && suspect?.suspectModule && (
            <p role="note" className="border-t border-line px-4 py-2 text-[0.8125rem] text-muted">
              {isProtected(suspect.suspectModule) ? (
                <>
                  {suspect.suspectModule} belongs to anti-cheat software, which Lagsmith never changes.{" "}
                  <button onClick={() => go("gaming", "valorant", "crash")} className="font-medium text-accent hover:underline">
                    See Gaming Mode requirements
                  </button>
                </>
              ) : (
                `${suspect.suspectModule} was the suspect in a dump.`
              )}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
            <Show load={st} what="crash reports" onRetry={() => load("get_stability")}>
              {(d) =>
                d.crashes.length === 0 ? (
                  <Empty>No blue screens recorded.</Empty>
                ) : crashes.length === 0 ? (
                  <Empty>No blue screens in the last {range} days.</Empty>
                ) : (
                  <ul className="divide-y divide-line">
                    {crashes.map((c, i) => {
                      const a = c.dumpFile ? analysis.get(c.dumpFile.split("\\").pop() ?? "") : undefined;
                      return (
                        <li key={i} data-focus-id={i === 0 ? "crash-latest" : undefined} className="flex items-start gap-3 px-4 py-2">
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
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge tone={crashSeverity(c) === "High" ? "danger" : "warning"}>{crashSeverity(c)}</Badge>
                            {a?.suspectModule && <span className="text-[0.75rem] font-medium text-danger">Suspect {a.suspectModule}</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )
              }
            </Show>
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-4">
          <Card className="flex min-h-0 flex-1 flex-col">
            <h2 className="px-4 pt-3 pb-2 text-[0.9375rem] font-semibold">Crash dumps</h2>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
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
                          <li key={d.file} className="flex items-center justify-between gap-3 px-4 py-2 text-[0.8125rem]">
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

          <Card className="flex min-h-0 flex-1 flex-col">
            <h2 className="px-4 pt-3 pb-2 text-[0.9375rem] font-semibold">App crashes</h2>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
              <Show load={st} what="app crashes" onRetry={() => load("get_stability")}>
                {(d) =>
                  d.appCrashes.length === 0 ? (
                    <Empty>No app crashes recorded.</Empty>
                  ) : appCrashes.length === 0 ? (
                    <Empty>No app crashes in the last {range} days.</Empty>
                  ) : (
                    <ul className="divide-y divide-line">
                      {appCrashes.map((a, i) => (
                        <AppCrashRow key={i} a={a} />
                      ))}
                    </ul>
                  )
                }
              </Show>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
