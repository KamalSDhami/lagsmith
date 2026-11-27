import { useState } from "react";
import { ChevronDown, CircleCheck, Undo2 } from "lucide-react";
import type { ChangeSet } from "../types";
import { useSys } from "../lib/useSystemData";
import { act, errorMessage } from "../lib/api";
import { Page } from "../components/Page";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Dialog } from "../components/ui/dialog";
import { Show } from "../components/Show";
import { SetItems, canUndo, freedTotal, movesWsl, useRefreshAfterChange } from "../components/Review";
import { formatGB, formatTime, plural } from "../lib/format";
import { useNav } from "../lib/navContext";
import { ICON_STROKE } from "./nav";
import { cn } from "../lib/cn";

function SetRow({ set, onUndo }: { set: ChangeSet; onUndo: (s: ChangeSet) => void }) {
  const [open, setOpen] = useState(false);
  const freed = freedTotal(set);
  const done = set.items.filter((i) => i.status === "done").length;
  return (
    <li data-testid={`set-${set.id}`}>
      <div className="flex items-center gap-3 px-5 py-2">
        {/* The whole left side is the expand button, not just the chevron. */}
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} details for ${set.title}`}
          className="-ml-2 flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left hover:bg-subtle"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
            <CircleCheck size={18} strokeWidth={ICON_STROKE} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[0.9375rem] font-medium">{set.title}</span>
              {set.undone && <Badge tone="neutral">Undone</Badge>}
            </span>
            <span className="block text-[0.8125rem] text-muted">
              {formatTime(set.time)} · {plural(done, "change", "changes")}
              {freed > 0 ? ` · ${formatGB(freed)} freed` : ""}
            </span>
          </span>
          <ChevronDown size={17} strokeWidth={ICON_STROKE} aria-hidden className={cn("shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        <Button
          variant="outline"
          size="sm"
          disabled={!canUndo(set)}
          onClick={() => onUndo(set)}
          title={set.undone ? "Already undone" : canUndo(set) ? undefined : "Nothing here can be undone"}
        >
          <Undo2 size={15} strokeWidth={ICON_STROKE} aria-hidden />
          Undo
        </Button>
      </div>
      {open && (
        <div className="border-t border-line bg-[#fafafb] px-5 py-1">
          <SetItems set={set} />
        </div>
      )}
    </li>
  );
}

export function HistoryPage() {
  const { data, load } = useSys();
  const { go } = useNav();
  const refresh = useRefreshAfterChange();
  const [confirm, setConfirm] = useState<ChangeSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doUndo = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await act("undo_change", { id: confirm.id });
      if (movesWsl(confirm)) void load("get_disk_usage");
      setConfirm(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const totalFreed = (data.get_history.data ?? []).filter((x) => !x.undone).reduce((n, x) => n + freedTotal(x), 0);
  const wslNote = !!confirm?.items.some((i) => (i.undo as { kind?: string } | null)?.kind === "wslMove");
  const undoable = confirm ? confirm.items.filter((i) => i.status === "done" && i.undo != null).length : 0;

  return (
    <Page
      title="History & Undo"
      subtitle="Every change Lagsmith makes is listed here and can be undone where Windows allows it."
      aside={
        totalFreed > 0 && (
          <div className="text-right">
            <div className="text-[1.625rem] leading-tight font-semibold tabular-nums">{formatGB(totalFreed)}</div>
            <div className="text-[0.8125rem] text-muted">Freed in total</div>
          </div>
        )
      }
    >
      <Card className="flex max-h-full min-h-0 flex-col">
        <div className="min-h-0 overflow-y-auto">
          <Show load={data.get_history} what="history" onRetry={() => load("get_history")}>
            {(sets) =>
              sets.length === 0 ? (
                <div className="p-8 text-center">
                  <CircleCheck size={28} strokeWidth={ICON_STROKE} className="mx-auto text-muted" aria-hidden />
                  <p className="mt-2 text-[0.9375rem]">No changes yet. Lagsmith hasn't changed anything on this PC.</p>
                  <Button variant="outline" className="mt-3" onClick={() => go("storage")}>
                    Free space in Storage Cleaner
                  </Button>
                </div>
              ) : (
                <ul className="divide-y divide-line" aria-label="Change history">
                  {sets.map((s) => (
                    <SetRow key={s.id} set={s} onUndo={(x) => (setError(null), setConfirm(x))} />
                  ))}
                </ul>
              )
            }
          </Show>
        </div>
      </Card>

      <Dialog open={!!confirm} onClose={() => !busy && setConfirm(null)} title="Confirm undo" className="w-[26rem]">
        {confirm && (
          <div className="p-6">
            <h2 className="text-[1.125rem] font-semibold">Undo "{confirm.title}"?</h2>
            <p className="mt-1 text-[0.875rem] text-muted">
              This reverses {plural(undoable, "change", "changes")}. Cleared caches can't be restored; they refill on their own.
              {wslNote && " Undoing a WSL move shuts that distro down first, then moves its disk back."}
            </p>
            {error && (
              <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[0.875rem] text-danger">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={doUndo} disabled={busy}>
                {busy ? "Undoing…" : `Undo ${plural(undoable, "change", "changes")}`}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Page>
  );
}
