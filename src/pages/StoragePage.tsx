import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Lock } from "lucide-react";
import type { CacheItem, DiskUsage, Drive, SizedItem } from "../types";
import { useSys } from "../lib/useSystemData";
import { Page, Empty } from "../components/Page";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { Progress } from "../components/ui/progress";
import { Tabs } from "../components/ui/tabs";
import { Skeleton } from "../components/ui/skeleton";
import { Dialog } from "../components/ui/dialog";
import { InlineError, LoadingRows } from "../components/Show";
import { useReview } from "../components/Review";
import { formatGB } from "../lib/format";
import { systemDrive } from "../lib/derive";
import { isProtected, PROTECTED_REASON } from "../lib/protected";
import { ICON_STROKE } from "./nav";
import { cn } from "../lib/cn";

/** Three groups: what Lagsmith cleans, what it can move, and what is yours (shown for information only). */
type Tab = "clean" | "move" | "files";

interface Row {
  key: string;
  tab: "dev" | "system" | "move" | "files";
  name: string;
  path: string;
  bytes: number;
  /** Only allow-listed caches can be cleaned. */
  cacheId?: string;
  /** WSL distro name: this row can be moved to another drive. */
  wslDistro?: string;
  locked?: string;
}

const TAB_NOTE: Record<Row["tab"], string> = {
  dev: "Developer cache (safe, refills itself)",
  system: "Temporary files",
  move: "Can be moved to another drive",
  files: "Your files: never cleaned automatically",
};

function cacheRows(caches: CacheItem[]): Row[] {
  return caches.map((c) => ({
    key: `cache-${c.id}`,
    tab: c.group === "devCache" ? "dev" : "system",
    name: c.name,
    path: c.displayPath,
    bytes: c.bytes,
    cacheId: c.id,
    locked: isProtected(c.name, c.displayPath) ? PROTECTED_REASON : undefined,
  }));
}

function usageRows(u: DiskUsage): Row[] {
  const mk = (tab: Row["tab"], items: SizedItem[], p: string): Row[] =>
    items.map((i) => ({
      key: `${p}-${i.name}`,
      tab,
      name: i.name,
      path: i.displayPath,
      bytes: i.bytes,
      wslDistro: p === "wsl" ? i.name : undefined,
      locked: isProtected(i.name, i.displayPath) ? PROTECTED_REASON : p === "wsl" ? undefined : "Not available yet",
    }));
  return [...mk("move", u.wslDisks, "wsl"), ...mk("move", u.appData, "app"), ...mk("files", u.userFolders, "user")];
}

const sum = (xs: { bytes: number }[]) => xs.reduce((n, x) => n + x.bytes, 0);
const inTab = (r: Row, t: Tab) => (t === "clean" ? r.tab === "dev" || r.tab === "system" : r.tab === t);

/** Asks where to move a WSL distro, then hands off to the review sheet. Rust re-checks every rule. */
function MoveDialog({
  row,
  drives,
  onClose,
  onReview,
}: {
  row: Row | null;
  drives: Drive[];
  onClose: () => void;
  onReview: (distro: string, target: string, bytes: number) => void;
}) {
  // Where the disk is now: a drive letter in its path, else the system drive (paths under %LOCALAPPDATA% are shortened).
  const home = row && /^[A-Za-z]:/.test(row.path) ? row.path.slice(0, 2).toUpperCase() : drives.find((d) => d.isSystem)?.letter;
  const others = drives.filter((d) => d.letter !== home);
  const [target, setTarget] = useState("");
  useEffect(() => {
    if (row) setTarget(others[0] ? `${others[0].letter}\\WSL\\${row.wslDistro}` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);
  const letter = target.trim().slice(0, 2).toUpperCase();
  const drive = drives.find((d) => d.letter === letter);
  const valid = /^[A-Za-z]:\\[^\\/:*?"<>|]+/.test(target.trim());
  const needs = row ? row.bytes + 2 ** 30 : 0;
  const roomy = !drive || drive.freeBytes >= needs;
  return (
    <Dialog open={!!row} onClose={onClose} title="Move WSL distro" className="w-[30rem]">
      {row && (
        <form
          className="p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && roomy) onReview(row.wslDistro!, target.trim(), row.bytes);
          }}
        >
          <h2 className="text-[1.125rem] font-semibold">Move {row.wslDistro} to another drive</h2>
          <p className="mt-1 text-[0.875rem] text-muted">
            Its disk ({formatGB(row.bytes)}) moves to the folder you choose. The folder must be new or empty, on a different drive.
          </p>
          {others.length === 0 ? (
            <p role="status" className="mt-3 text-[0.875rem]">
              No second local drive was found, so there is nowhere to move it.
            </p>
          ) : (
            <>
              <label className="mt-4 block text-[0.8125rem] font-medium" htmlFor="wsl-target">
                Folder
              </label>
              <input
                id="wsl-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={"D:\\WSL\\Ubuntu"}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[0.875rem]"
              />
              <p className="mt-1 text-[0.8125rem] text-muted">
                {others.map((d) => `${d.letter} ${formatGB(d.freeBytes)} free`).join(" · ")}
              </p>
              {!roomy && (
                <p role="alert" className="mt-2 text-[0.8125rem] text-danger">
                  {drive?.letter} doesn't have enough free space (needs about {formatGB(needs)}).
                </p>
              )}
            </>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || !roomy || others.length === 0}>
              Review move
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

const SEGMENTS: { label: string; key: keyof DiskUsage; color: string }[] = [
  { label: "Installed programs", key: "programs", color: "#5b58dc" },
  { label: "WSL disks", key: "wslDisks", color: "#8f8dea" },
  { label: "App data", key: "appData", color: "#c2c0f2" },
  { label: "Your folders", key: "userFolders", color: "#8e8e98" },
];

/** One stacked bar of the measured folders against the drive's used space, then a legend with the biggest item of each. */
function FillingCard() {
  const { data, load } = useSys();
  const du = data.get_disk_usage;
  const drive = data.get_storage.status === "ok" ? systemDrive(data.get_storage.data.drives) : undefined;
  const used = drive ? drive.totalBytes - drive.freeBytes : 0;
  return (
    <Card className="flex min-h-0 flex-col">
      <h2 className="px-4 pt-3.5 pb-2 text-[0.9375rem] font-semibold">What's filling {drive?.letter ?? "C:"}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
        {du.status === "error" ? (
          <InlineError what="disk usage" onRetry={() => load("get_disk_usage")} />
        ) : du.data === undefined ? (
          <div role="status">
            <p className="text-[0.8125rem] text-muted">Measuring folders. This can take a minute.</p>
            <LoadingRows rows={4} />
          </div>
        ) : (
          (() => {
            const d = du.data!;
            const measured = SEGMENTS.reduce((n, g) => n + sum(d[g.key]), 0);
            const whole = Math.max(used, measured) || 1;
            return (
              <>
                <div role="img" aria-label="Measured folders against used space" className="flex h-3 overflow-hidden rounded-full bg-subtle">
                  {SEGMENTS.map((g) => (
                    <span key={g.key} style={{ width: `${(sum(d[g.key]) / whole) * 100}%`, background: g.color }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-2.5">
                  {SEGMENTS.map((g) => {
                    const top = [...d[g.key]].sort((a, b) => b.bytes - a.bytes)[0];
                    return (
                      <li key={g.key}>
                        <div className="flex items-center justify-between gap-2 text-[0.8125rem] font-medium">
                          <span className="flex items-center gap-2">
                            <span aria-hidden className="size-2.5 rounded-full" style={{ background: g.color }} />
                            {g.label}
                          </span>
                          <span className="tabular-nums">{formatGB(sum(d[g.key]))}</span>
                        </div>
                        <p className="truncate pl-[1.125rem] text-[0.75rem] text-muted" title={top?.displayPath}>
                          {top ? `Largest: ${top.name}, ${formatGB(top.bytes)}` : "None found"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[0.75rem] text-muted">Measured folders only. The rest of the used space is Windows and files not listed here.</p>
              </>
            );
          })()
        )}
      </div>
    </Card>
  );
}

export function StoragePage() {
  const { data, load } = useSys();
  const review = useReview();
  const [tab, setTab] = useState<Tab>("clean");
  const [moving, setMoving] = useState<Row | null>(null);
  const caches = data.get_caches;
  const usage = data.get_disk_usage;
  const st = data.get_storage;
  const drive = st.status === "ok" ? systemDrive(st.data.drives) : undefined;

  const rows = useMemo(
    () => [...(caches.data ? cacheRows(caches.data) : []), ...(usage.data ? usageRows(usage.data) : [])],
    [caches.data, usage.data],
  );

  // Developer and system caches start selected; Move and Your files never are.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set((caches.data ?? []).filter((c) => c.bytes > 0 && !isProtected(c.name, c.displayPath)).map((c) => c.id)));
  }, [caches.data]);

  const chosen = rows.filter((r) => r.cacheId && !r.locked && selected.has(r.cacheId));
  const potential = sum(chosen);
  const visible = rows.filter((r) => inTab(r, tab));
  const count = (t: Tab) => rows.filter((r) => inTab(r, t)).length;

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const openReview = () => {
    const dev = chosen.filter((r) => r.tab === "dev");
    const sys = chosen.filter((r) => r.tab === "system");
    review({
      title: "Storage cleanup",
      groups: [
        ...(dev.length ? [{ label: "Developer caches", items: dev.map((r) => ({ label: r.name, detail: r.path, bytes: r.bytes })) }] : []),
        ...(sys.length ? [{ label: "System caches", items: sys.map((r) => ({ label: r.name, detail: r.path, bytes: r.bytes })) }] : []),
      ],
      changes: [{ kind: "cleanCaches", ids: chosen.map((r) => r.cacheId!) }],
    });
  };

  const reviewMove = (distro: string, target: string, bytes: number) => {
    setMoving(null);
    review({
      title: `Move ${distro} to another drive`,
      warning: `Lagsmith will shut down ${distro} first (anything running in it stops; save your work). Moving a large disk can take several minutes. You can undo it from History to move it back.`,
      groups: [{ label: "WSL distro to move", items: [{ label: distro, detail: `To ${target}`, bytes }] }],
      changes: [{ kind: "wslMove", distro, target }],
    });
  };

  return (
    <Page
      title="Storage Cleaner"
      subtitle="Free up space by clearing caches that refill on their own."
      aside={
        <div className="text-right">
          <div className="text-[1.625rem] leading-tight font-semibold tabular-nums" data-testid="potential">
            {caches.data ? formatGB(potential) : "-"}
          </div>
          <div className="text-[0.8125rem] text-muted">Potential space to free</div>
        </div>
      }
    >
      <Card className="shrink-0 px-4 py-2.5" data-focus-id="c-drive">
        {st.status === "error" ? (
          <InlineError what="storage info" onRetry={() => load("get_storage")} />
        ) : drive ? (
          <div className="flex items-center gap-4">
            <span className="text-[0.875rem] font-medium whitespace-nowrap">{drive.letter}</span>
            <div className="flex-1">
              <Progress
                value={drive.totalBytes ? 1 - drive.freeBytes / drive.totalBytes : 0}
                tone={drive.freeBytes / drive.totalBytes < 0.15 ? "warning" : "accent"}
                label={`${drive.letter} used space`}
              />
            </div>
            <span className="text-[0.875rem] whitespace-nowrap text-muted">
              {formatGB(drive.freeBytes)} free of {formatGB(drive.totalBytes)}
            </span>
          </div>
        ) : st.status === "ok" ? (
          <p className="text-[0.875rem] text-muted">No system drive found.</p>
        ) : (
          <Skeleton className="h-5 w-full" />
        )}
      </Card>

      <div className="shrink-0">
        <Tabs
          label="Storage categories"
          value={tab}
          onChange={setTab}
          items={[
            { id: "clean", label: `Safe to clean (${count("clean")})` },
            { id: "move", label: `Move (${count("move")})` },
            { id: "files", label: `Yours (${count("files")})` },
          ]}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_18rem] gap-4">
        <Card className="flex min-h-0 flex-col">
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto" aria-label="Storage items">
            {caches.status === "error" && (
              <li>
                <InlineError what="caches" onRetry={() => load("get_caches")} />
              </li>
            )}
            {visible.map((r) => {
              const canPick = !!r.cacheId && !r.locked;
              const inner = (
                <>
                  {r.locked === PROTECTED_REASON ? (
                    <span title={r.locked} className="grid size-[1.125rem] place-items-center text-muted">
                      <Lock size={15} strokeWidth={ICON_STROKE} aria-label={r.locked} />
                    </span>
                  ) : canPick ? (
                    <Checkbox label={`Select ${r.name}`} checked={selected.has(r.cacheId!)} onChange={(on) => toggle(r.cacheId!, on)} />
                  ) : (
                    <span aria-hidden className="size-[1.125rem] shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[0.9375rem] font-medium">{r.name}</div>
                    <div className="truncate text-[0.8125rem] text-muted" title={r.path}>
                      {r.locked === PROTECTED_REASON ? r.locked : r.tab === "move" && !r.wslDistro ? "Shown for information. Lagsmith can't move this yet." : TAB_NOTE[r.tab]}
                    </div>
                  </div>
                  <span className="text-[0.9375rem] tabular-nums">{formatGB(r.bytes)}</span>
                  {r.wslDistro && !r.locked && (
                    <Button variant="outline" size="sm" onClick={() => setMoving(r)} aria-label={`Move ${r.wslDistro}`}>
                      Move…
                    </Button>
                  )}
                  {r.cacheId ? (
                    <Badge tone="success" className="w-16 justify-center">
                      Safe
                    </Badge>
                  ) : !r.wslDistro ? (
                    <Badge tone="neutral" className="w-16 justify-center">
                      Yours
                    </Badge>
                  ) : null}
                </>
              );
              const cls = "flex min-h-[3.25rem] items-center gap-3 px-4 py-2";
              return (
                <li key={r.key} data-testid={`row-${r.key}`}>
                  {/* The label makes the whole row the click target for the 18 px checkbox. */}
                  {canPick ? <label className={cn(cls, "cursor-pointer hover:bg-subtle")}>{inner}</label> : <div className={cls}>{inner}</div>}
                </li>
              );
            })}
            {caches.data === undefined && caches.status !== "error" && (
              <li>
                <LoadingRows rows={4} />
              </li>
            )}
            {tab !== "clean" && usage.data === undefined && usage.status !== "error" && (
              <li className="px-4 py-2.5 text-[0.8125rem] text-muted" role="status">
                Measuring folders…
              </li>
            )}
            {caches.data !== undefined && visible.length === 0 && (tab === "clean" ? true : usage.data !== undefined) && (
              <li>
                <Empty>Nothing in this category.</Empty>
              </li>
            )}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
            <span className="text-[0.875rem] text-muted">{chosen.length} selected</span>
            <Button onClick={openReview} disabled={chosen.length === 0}>
              {chosen.length === 1 ? "Review 1 item" : chosen.length === 0 ? "Review items" : `Review ${chosen.length} items`}
              <ArrowRight size={16} strokeWidth={ICON_STROKE} aria-hidden />
            </Button>
          </div>
        </Card>
        <FillingCard />
      </div>
      <MoveDialog row={moving} drives={st.status === "ok" ? st.data.drives : []} onClose={() => setMoving(null)} onReview={reviewMove} />
    </Page>
  );
}
