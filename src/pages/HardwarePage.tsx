import type { ReactNode } from "react";
import { Battery, Cpu, HardDrive, MemoryStick, Monitor, MonitorCog, type LucideIcon } from "lucide-react";
import type { Gpu } from "../types";
import { useSys, type Cmd } from "../lib/useSystemData";
import { Page } from "../components/Page";
import { Card } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Show } from "../components/Show";
import { Skeleton } from "../components/ui/skeleton";
import { WORN_BATTERY, batteryHealth, channelLabel, needsRamUpgradeTip, primaryGpu, realGpus } from "../lib/derive";
import { Badge } from "../components/ui/badge";
import { formatGB, formatRam, plural, shortGpuName } from "../lib/format";
import { ICON_STROKE } from "./nav";

function HwCard({
  icon: Icon,
  title,
  load,
  what,
  cmd,
  children,
}: {
  icon: LucideIcon;
  title: string;
  load: { status: string };
  what: string;
  cmd: Cmd;
  children: ReactNode;
}) {
  const { load: reload } = useSys();
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-tile text-tile-ink">
          <Icon size={17} strokeWidth={ICON_STROKE} aria-hidden />
        </span>
        <h2 className="text-[0.9375rem] font-medium">{title}</h2>
      </div>
      <div className="mt-2.5 min-h-[3.25rem]">
        {load.status === "error" ? (
          <div className="text-[0.875rem]" role="alert">
            <p className="text-muted">Couldn't read {what}</p>
            <button onClick={() => reload(cmd)} className="font-medium text-accent hover:underline">
              Try again
            </button>
          </div>
        ) : load.status === "ok" ? (
          children
        ) : (
          <div aria-hidden>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/2" />
          </div>
        )}
      </div>
    </Card>
  );
}

function Big({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div title={title} className="truncate text-[1.125rem] font-semibold tracking-tight">
      {children}
    </div>
  );
}
function Sub({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 truncate text-[0.875rem] text-muted">{children}</div>;
}

function gpuRole(g: Gpu) {
  return g.kind === "dedicated" ? "Used by games" : g.kind === "integrated" ? "Used for the display" : "Software renderer";
}

/** "Intel(R) Core(TM) i7-8650U CPU @ 1.90GHz" -> "Intel Core i7-8650U". */
function shortCpu(name: string) {
  return name
    .replace(/\((R|TM)\)/gi, "")
    .replace(/\s+CPU\b.*$/i, "")
    .replace(/\s+@.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function HardwarePage() {
  const { data, load } = useSys();
  const hw = data.get_hardware;
  const st = data.get_storage;
  const sy = data.get_system;
  const h = hw.status === "ok" ? hw.data : undefined;
  const drives = st.status === "ok" ? st.data.drives : [];
  const sys = sy.status === "ok" ? sy.data : undefined;
  const gpu = h ? primaryGpu(h) : undefined;
  const p = sys?.power;

  return (
    <Page title="Hardware Overview" subtitle="Your system details, read from Windows.">
      <div className="grid shrink-0 grid-cols-3 gap-3">
        <HwCard icon={Cpu} title="CPU" load={hw} what="hardware info" cmd="get_hardware">
          {h && (
            <>
              <Big title={h.cpu}>{shortCpu(h.cpu)}</Big>
              <Sub>
                {plural(h.cpuCores, "core", "cores")} · {plural(h.cpuThreads, "thread", "threads")}
              </Sub>
            </>
          )}
        </HwCard>
        <HwCard icon={Monitor} title="Graphics" load={hw} what="hardware info" cmd="get_hardware">
          {h &&
            (gpu ? (
              <>
                <Big title={gpu.name}>{shortGpuName(gpu.name)}</Big>
                <Sub>Driver {gpu.driverVersion}</Sub>
              </>
            ) : (
              <Sub>No graphics adapter found</Sub>
            ))}
        </HwCard>
        <HwCard icon={MemoryStick} title="Memory" load={hw} what="hardware info" cmd="get_hardware">
          {h && (
            <>
              <Big>
                {formatRam(h.ramBytes)}
                {h.ramSpeedMhz > 0 && <span className="text-[0.875rem] font-normal text-muted"> · {h.ramSpeedMhz} MHz</span>}
              </Big>
              <Sub>
                {h.ramSticks > 0 ? `${plural(h.ramSticks, "stick", "sticks")} of ${h.ramSlots} slots · ` : ""}
                {channelLabel(h)}
              </Sub>
            </>
          )}
        </HwCard>
        <HwCard icon={HardDrive} title="Storage" load={st} what="storage info" cmd="get_storage">
          {drives.length === 0 ? (
            <Sub>No drives found</Sub>
          ) : (
            <ul className="space-y-1.5">
              {drives.map((d) => {
                const used = d.totalBytes > 0 ? 1 - d.freeBytes / d.totalBytes : 0;
                return (
                  <li key={d.letter}>
                    <div className="flex justify-between text-[0.875rem]">
                      <span className="font-medium">
                        {d.letter} {formatGB(d.totalBytes)}
                      </span>
                      <span className="text-muted">
                        {formatGB(d.freeBytes)} free · {Math.round(used * 100)}% used
                      </span>
                    </div>
                    <div className="mt-1">
                      <Progress value={used} tone={used > 0.85 ? "warning" : "accent"} label={`${d.letter} used space`} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </HwCard>
        <HwCard icon={Battery} title="Battery" load={sy} what="power info" cmd="get_system">
          {p &&
            (() => {
              const state = p.onBattery ? "On battery" : "Plugged in";
              const health = batteryHealth(p);
              return (
                <>
                  <Big>
                    {p.batteryPercent !== null ? `${p.batteryPercent}% (${state})` : health !== null ? state : "No battery data"}
                  </Big>
                  {health !== null ? (
                    <div className="mt-0.5 flex items-center gap-2 text-[0.875rem] text-muted">
                      <span className="truncate">
                        {p.batteryFullWh} of {p.batteryDesignWh} Wh design
                      </span>
                      <Badge tone={health < WORN_BATTERY ? "warning" : "neutral"} className="h-6 px-2">
                        Health {Math.round(health * 100)}%
                      </Badge>
                    </div>
                  ) : (
                    <Sub>
                      {p.batteryPercent === null ? `${state} · ` : ""}
                      {p.plan} plan
                    </Sub>
                  )}
                </>
              );
            })()}
        </HwCard>
        <HwCard icon={MonitorCog} title="System" load={hw} what="hardware info" cmd="get_hardware">
          {h && (
            <>
              <Big title={h.os}>{h.os.replace(/^Microsoft\s+/i, "")}</Big>
              <Sub>
                {h.device} · BIOS {h.biosVersion || "unknown"}
              </Sub>
            </>
          )}
        </HwCard>
      </div>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-3 gap-3">
        <Card className="p-4">
          <h2 className="text-[0.9375rem] font-semibold">Memory upgrade tip</h2>
          {h ? (
            needsRamUpgradeTip(h) ? (
              <div className="mt-2 flex gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-tile text-tile-ink">
                  <MemoryStick size={24} strokeWidth={ICON_STROKE} aria-hidden />
                </span>
                <p className="text-[0.875rem] leading-relaxed text-muted">
                  You're using a single {formatRam(h.ramBytes)} stick
                  {h.ramSlots > h.ramSticks ? ` with ${plural(h.ramSlots - h.ramSticks, "slot", "slots")} free` : ""}. Adding a matching stick
                  enables dual channel, which gives your integrated graphics more memory bandwidth.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[0.875rem] text-muted">
                {h.ramSticks === 0
                  ? "Lagsmith couldn't read how many memory sticks are installed."
                  : "No memory upgrade tip for this PC."}
              </p>
            )
          ) : (
            <Skeleton className="mt-2 h-12 w-full" />
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-[0.9375rem] font-semibold">Page file</h2>
          <Show load={sy} what="page file info" onRetry={() => load("get_system")}>
            {(s) =>
              s.pageFile ? (
                <dl className="mt-2 grid grid-cols-2 gap-y-1.5 text-[0.875rem]">
                  <dt className="text-muted">Size</dt>
                  <dd>{s.pageFile.autoManaged ? "Managed by Windows" : "Set manually"}</dd>
                  <dt className="text-muted">Allocated</dt>
                  <dd className="tabular-nums">{formatGB(s.pageFile.allocatedBytes)}</dd>
                  <dt className="text-muted">In use</dt>
                  <dd className="tabular-nums">{formatGB(s.pageFile.usedBytes)}</dd>
                  <dt className="text-muted">Peak</dt>
                  <dd className="tabular-nums">{formatGB(s.pageFile.peakBytes)}</dd>
                </dl>
              ) : (
                <p className="mt-2 text-[0.875rem] text-muted">No page file is configured.</p>
              )
            }
          </Show>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <h2 className="px-4 pt-4 pb-1 text-[0.9375rem] font-semibold">Graphics adapters</h2>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Show load={hw} what="graphics adapters" onRetry={() => load("get_hardware")}>
              {(d) => {
                const list = realGpus(d).length ? realGpus(d) : d.gpus;
                return list.length === 0 ? (
                  <p className="px-4 py-2 text-[0.875rem] text-muted">No graphics adapter found.</p>
                ) : (
                  <ul className="divide-y divide-line" aria-label="Graphics adapters">
                    {list.map((g, i) => (
                      <li key={i} className="px-4 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[0.875rem] font-medium">{g.name}</span>
                          <span className="shrink-0 rounded-md bg-subtle px-2 py-0.5 text-[0.75rem] font-medium">{gpuRole(g)}</span>
                        </div>
                        <div className="text-[0.8125rem] text-muted">
                          {g.kind === "dedicated" && g.dedicatedBytes > 0 ? `${formatRam(g.dedicatedBytes)} dedicated` : "Shared memory"} ·
                          Driver {g.driverVersion}
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              }}
            </Show>
          </div>
        </Card>
      </div>
    </Page>
  );
}
