import type { ReactNode } from "react";
import { Activity, ArrowRight, HardDrive, MemoryStick, Monitor, Power, type LucideIcon } from "lucide-react";
import type { SystemData, Cmd } from "../lib/useSystemData";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { Skeleton } from "./ui/skeleton";
import { cn } from "../lib/cn";
import { formatGB, formatRam, plural, shortGpuName } from "../lib/format";
import {
  LOW_DISK_RATIO,
  blueScreensLast7Days,
  enabledStartup,
  freeRatio,
  channelLabel,
  hasDisplayDriverUpdate,
  needsRamUpgradeTip,
  primaryGpu,
  realGpus,
  systemDrive,
} from "../lib/derive";
import { ICON_STROKE, type Page } from "../pages/nav";

type Retry = (cmd: Cmd) => void;
type OpenPage = (page: Page, focus?: string) => void;

function CardHead({
  icon: Icon,
  title,
  tile = "accent",
  extra,
}: {
  icon: LucideIcon;
  title: string;
  tile?: "accent" | "danger";
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          tile === "danger" ? "bg-danger-soft text-danger" : "bg-tile text-tile-ink",
        )}
      >
        <Icon size={17} strokeWidth={ICON_STROKE} aria-hidden />
      </span>
      <h3 className="truncate text-[0.9375rem] font-medium">{title}</h3>
      {extra && <span className="ml-auto">{extra}</span>}
      <ArrowRight
        size={16}
        strokeWidth={ICON_STROKE}
        aria-hidden
        className="absolute top-[1.375rem] right-3.5 text-muted opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
    </div>
  );
}

function Value({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div title={title} className="mt-2.5 truncate text-[1.125rem] leading-tight font-semibold tracking-tight min-[1240px]:text-[1.375rem]">
      {children}
    </div>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <div className="mt-1 text-[0.875rem] leading-snug text-muted">{children}</div>;
}

function Loading() {
  return (
    <div aria-hidden>
      <Skeleton className="mt-3 h-6 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <Skeleton className="mt-3 h-7 w-24 rounded-lg" />
    </div>
  );
}

export function InlineError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="mt-3 text-[0.875rem]" role="alert">
      <p className="text-muted">Couldn't read {what}</p>
      <button onClick={onRetry} className="relative z-[2] mt-1 font-medium text-accent underline-offset-2 hover:underline">
        Try again
      </button>
    </div>
  );
}

const shell = "group relative h-full p-3.5 text-left transition-colors hover:border-[#d4d4dc]";

/** The overlay button makes the whole card the link, without nesting the "Try again" buttons inside a button. */
function Overlay({ label, onOpen }: { label: string; onOpen: () => void }) {
  return <button onClick={onOpen} aria-label={label} className="absolute inset-0 z-[1] rounded-[18px]" />;
}

function StabilityCard({ d, retry, onOpen }: { d: SystemData; retry: Retry; onOpen: OpenPage }) {
  const s = d.get_stability;
  const n = s.status === "ok" ? blueScreensLast7Days(s.data) : 0;
  return (
    <Card className={shell}>
      <Overlay label="Stability: open Crash Detective" onOpen={() => onOpen("crash")} />
      <CardHead icon={Activity} title="Stability" tile={s.status === "ok" && n > 0 ? "danger" : "accent"} />
      {s.status === "loading" && <Loading />}
      {s.status === "error" && <InlineError what="stability info" onRetry={() => retry("get_stability")} />}
      {s.status === "ok" && (
        <>
          <Value>{plural(n, "blue screen", "blue screens")}</Value>
          <Sub>in the last 7 days</Sub>
          <div className="mt-2.5">
            {n > 0 ? <Badge tone="danger">Needs Attention</Badge> : <Badge tone="success">Stable</Badge>}
          </div>
        </>
      )}
    </Card>
  );
}

function StorageCard({ d, retry, onOpen }: { d: SystemData; retry: Retry; onOpen: OpenPage }) {
  const s = d.get_storage;
  const c = s.status === "ok" ? systemDrive(s.data.drives) : undefined;
  const low = c ? freeRatio(c) < LOW_DISK_RATIO : false;
  return (
    <Card className={shell}>
      <Overlay label="Storage: open Storage Cleaner" onOpen={() => onOpen("storage")} />
      <CardHead icon={HardDrive} title="Storage" />
      {s.status === "loading" && <Loading />}
      {s.status === "error" && <InlineError what="storage info" onRetry={() => retry("get_storage")} />}
      {s.status === "ok" && !c && <Sub>No system drive found</Sub>}
      {s.status === "ok" && c && (
        <>
          <Value>{formatGB(c.freeBytes)} free</Value>
          <Sub>
            of {formatGB(c.totalBytes)} ({c.letter})
          </Sub>
          <div className="mt-[1.125rem]">
            <Progress value={1 - freeRatio(c)} tone={low ? "warning" : "accent"} label={`${c.letter} used space`} />
          </div>
        </>
      )}
    </Card>
  );
}

function MemoryCard({ d, retry, onOpen }: { d: SystemData; retry: Retry; onOpen: OpenPage }) {
  const h = d.get_hardware;
  return (
    <Card className={shell}>
      <Overlay label="Memory: open Memory" onOpen={() => onOpen("memory")} />
      <CardHead icon={MemoryStick} title="Memory" />
      {h.status === "loading" && <Loading />}
      {h.status === "error" && <InlineError what="hardware info" onRetry={() => retry("get_hardware")} />}
      {h.status === "ok" && (
        <>
          <Value>{formatRam(h.data.ramBytes)}</Value>
          <Sub>
            {h.data.ramSticks > 0 ? `${plural(h.data.ramSticks, "stick", "sticks")} · ` : ""}
            {channelLabel(h.data)}
          </Sub>
          {needsRamUpgradeTip(h.data) && h.data.ramSlots > h.data.ramSticks && (
            <div className="mt-2.5">
              <Badge tone="warning">{plural(h.data.ramSlots - h.data.ramSticks, "slot free", "slots free")}</Badge>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function DriverPill({ d }: { d: SystemData }) {
  const u = d.check_driver_updates;
  if (u.status !== "ok" && u.status !== "error") return <Badge tone="neutral">Checking…</Badge>;
  if (u.status === "error") return <Badge tone="neutral">Not checked</Badge>;
  return hasDisplayDriverUpdate(u.data) ? (
    <Badge tone="warning">Update available</Badge>
  ) : (
    <Badge tone="success">Up to date</Badge>
  );
}

function GraphicsCard({ d, retry, onOpen }: { d: SystemData; retry: Retry; onOpen: OpenPage }) {
  const h = d.get_hardware;
  const to = () => onOpen("hardware");
  if (h.status !== "ok") {
    return (
      <Card className={shell}>
        <Overlay label="Graphics: open Hardware" onOpen={to} />
        <CardHead icon={Monitor} title="Graphics" />
        {h.status === "loading" ? <Loading /> : <InlineError what="hardware info" onRetry={() => retry("get_hardware")} />}
      </Card>
    );
  }
  const gpu = primaryGpu(h.data);
  const extra = realGpus(h.data).length - 1;
  const driverFailed = d.check_driver_updates.status === "error";
  return (
    <Card className={shell}>
      <Overlay label={`Graphics: ${gpu?.name ?? "none"}. Open Hardware`} onOpen={to} />
      <CardHead
        icon={Monitor}
        title="Graphics"
        extra={extra > 0 && <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[0.75rem] font-medium text-muted">+{extra}</span>}
      />
      {gpu ? (
        <>
          <Value title={gpu.name}>{shortGpuName(gpu.name)}</Value>
          <Sub>Driver {gpu.driverVersion}</Sub>
          <div className="mt-2.5">
            <DriverPill d={d} />
          </div>
          <div className="mt-1 flex h-[1.125rem] items-baseline gap-2 overflow-hidden whitespace-nowrap text-[0.75rem] leading-snug text-muted">
            {driverFailed ? (
              <>
                <span>Check failed</span>
                <button
                  onClick={() => retry("check_driver_updates")}
                  aria-label="Retry the driver update check"
                  className="relative z-[2] font-medium text-accent underline-offset-2 hover:underline"
                >
                  Retry
                </button>
              </>
            ) : (
              d.check_driver_updates.status === "ok" && "via Windows Update"
            )}
          </div>
        </>
      ) : (
        <Sub>No graphics adapter found</Sub>
      )}
    </Card>
  );
}

function StartupCard({ d, retry, onOpen }: { d: SystemData; retry: Retry; onOpen: OpenPage }) {
  const s = d.get_startup;
  return (
    <Card className={shell}>
      <Overlay label="Startup: open Startup Manager" onOpen={() => onOpen("startup")} />
      <CardHead icon={Power} title="Startup" />
      {s.status === "loading" && <Loading />}
      {s.status === "error" && <InlineError what="startup apps" onRetry={() => retry("get_startup")} />}
      {s.status === "ok" && (
        <>
          <Value>{plural(enabledStartup(s.data), "app", "apps")}</Value>
          <Sub>on at startup · {s.data.length} listed</Sub>
        </>
      )}
    </Card>
  );
}

export function StatCards({ data, retry, onOpen }: { data: SystemData; retry: Retry; onOpen: OpenPage }) {
  return (
    <section aria-label="System summary" className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
      <StabilityCard d={data} retry={retry} onOpen={onOpen} />
      <StorageCard d={data} retry={retry} onOpen={onOpen} />
      <MemoryCard d={data} retry={retry} onOpen={onOpen} />
      <GraphicsCard d={data} retry={retry} onOpen={onOpen} />
      <StartupCard d={data} retry={retry} onOpen={onOpen} />
    </section>
  );
}
