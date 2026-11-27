import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Load } from "../lib/useSystemData";
import type { Memory } from "../types";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Skeleton } from "../components/ui/skeleton";
import { Page } from "../components/Page";
import { InlineError } from "../components/StatCards";
import { formatGB } from "../lib/format";
import { ICON_STROKE } from "./nav";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[0.875rem] font-medium text-muted">{label}</div>
      <div className="mt-2 text-[1.5rem] leading-tight font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-[0.8125rem] text-muted">{sub}</div>}
    </Card>
  );
}

const TOP_N = 8;

function Body({ m }: { m: Memory }) {
  const [all, setAll] = useState(false);
  const apps = all ? m.topApps : m.topApps.slice(0, TOP_N);
  const used = Math.max(0, m.totalBytes - m.availableBytes);
  const usedPct = m.totalBytes > 0 ? Math.round((used / m.totalBytes) * 100) : 0;
  const commitRatio = m.commitLimitBytes > 0 ? m.commitBytes / m.commitLimitBytes : 0;
  return (
    <>
      <div className="grid shrink-0 grid-cols-3 gap-4">
        <Stat label="Total" value={formatGB(m.totalBytes)} sub="Usable by Windows" />
        <Stat label="Available" value={formatGB(m.availableBytes)} sub="Free and standby" />
        <Stat label="In use" value={formatGB(used)} sub={`${usedPct}% of total`} />
      </div>

      <Card className="shrink-0 p-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-[0.9375rem] font-medium">Commit charge</h2>
          <div className="text-[0.875rem]">
            <span className="font-medium">{formatGB(m.commitBytes)}</span>
            <span className="text-muted"> of {formatGB(m.commitLimitBytes)} limit</span>
          </div>
        </div>
        <p className="mt-1 text-[0.8125rem] text-muted">
          Memory that programs have reserved, backed by RAM plus the page file. Near the limit, apps can fail to start.
        </p>
        <div className="mt-3">
          <Progress value={commitRatio} tone={commitRatio > 0.9 ? "warning" : "accent"} label="Commit charge" />
        </div>
      </Card>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <h2 className="px-5 pt-4 pb-2 text-[0.9375rem] font-medium">Top apps by memory</h2>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[0.875rem]">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-left text-[0.8125rem] text-muted">
              <th scope="col" className="px-5 py-2 font-medium">App</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Processes</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Memory</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {apps.map((a, i) => (
              <tr key={`${a.name}-${i}`}>
                <td className="px-5 py-2.5 font-medium">{a.name}</td>
                <td className="px-5 py-2.5 text-right text-muted tabular-nums">{a.processes}</td>
                <td className="px-5 py-2.5 text-right tabular-nums">{formatGB(a.bytes)}</td>
              </tr>
            ))}
            {m.topApps.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-4 text-muted">
                  No app data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {m.topApps.length > TOP_N && (
          <button
            onClick={() => setAll((v) => !v)}
            className="m-2 inline-flex h-9 items-center rounded-lg px-3 text-[0.875rem] font-medium text-accent hover:bg-subtle"
          >
            {all ? "Show fewer" : `Show all ${m.topApps.length}`}
          </button>
        )}
        </div>
      </Card>
    </>
  );
}

export function MemoryPage({ mem, onRefresh }: { mem: Load<Memory>; onRefresh: () => void }) {
  const loading = mem.status === "loading";
  return (
    <Page
      title="Memory"
      subtitle="How your RAM is being used right now."
      aside={
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={17} strokeWidth={ICON_STROKE} aria-hidden className={loading ? "motion-safe:animate-spin" : ""} />
          Refresh
        </Button>
      }
    >
      <p className="shrink-0 text-[0.8125rem] leading-relaxed text-muted">
        Lagsmith doesn't automatically 'clean' RAM. Emptying memory on a timer forces Windows to reload files from disk and causes
        stutter in games.
      </p>
      {(mem.status === "loading" || mem.status === "idle") && !mem.data && (
        <div className="grid grid-cols-3 gap-4" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-7 w-1/2" />
            </Card>
          ))}
        </div>
      )}
      {mem.status === "error" && (
        <Card className="p-4">
          <InlineError what="memory info" onRetry={onRefresh} />
        </Card>
      )}
      {mem.data && mem.status !== "error" && <Body m={mem.data} />}
    </Page>
  );
}
