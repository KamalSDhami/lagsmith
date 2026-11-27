import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CircleCheck, CircleMinus, CircleX, ShieldAlert, Undo2 } from "lucide-react";
import type { ChangeRequest, ChangeSet } from "../types";
import { act, errorMessage } from "../lib/api";
import { useSys } from "../lib/useSystemData";
import { formatGB } from "../lib/format";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { ICON_STROKE } from "../pages/nav";

export interface ReviewItem {
  label: string;
  detail?: string;
  bytes?: number;
}

export interface ReviewRequest {
  title: string;
  groups: { label: string; items: ReviewItem[] }[];
  changes: ChangeRequest[];
}

type Phase =
  | { kind: "review" }
  | { kind: "working"; what: "apply" | "undo" }
  | { kind: "result"; set: ChangeSet }
  | { kind: "error"; message: string; undo: boolean };

const ReviewContext = createContext<(r: ReviewRequest) => void>(() => {});

/** Opens the review sheet. Every change in the app goes through it. */
export function useReview() {
  return useContext(ReviewContext);
}

/** True when a set has at least one applied item that can be reversed. */
export function canUndo(set: ChangeSet): boolean {
  return !set.undone && set.items.some((i) => i.status === "done" && i.undo !== null && i.undo !== undefined);
}

export function freedTotal(set: ChangeSet): number {
  return set.items.reduce((n, i) => n + (i.status === "done" ? i.freedBytes : 0), 0);
}

/** Re-reads everything an action can change. */
export function useRefreshAfterChange() {
  const { load, data } = useSys();
  const cachesLoaded = data.get_caches.status !== "idle";
  return useCallback(() => {
    void load("get_startup");
    void load("get_system");
    void load("get_storage");
    void load("get_gpu_preferences");
    void load("get_history");
    if (cachesLoaded) void load("get_caches");
  }, [load, cachesLoaded]);
}

const statusIcon = {
  done: <CircleCheck size={17} strokeWidth={1.75} className="text-success" aria-hidden />,
  skipped: <CircleMinus size={17} strokeWidth={1.75} className="text-muted" aria-hidden />,
  failed: <CircleX size={17} strokeWidth={1.75} className="text-danger" aria-hidden />,
};

const statusText = { done: "Done", skipped: "Skipped", failed: "Failed" };

export function SetItems({ set }: { set: ChangeSet }) {
  return (
    <ul className="divide-y divide-line">
      {set.items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 py-2">
          <span className="mt-0.5">{statusIcon[it.status]}</span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.875rem]">{it.description}</div>
            {it.detail && <div className="text-[0.8125rem] text-muted">{it.detail}</div>}
          </div>
          <span className="shrink-0 text-[0.8125rem] text-muted">{statusText[it.status]}</span>
        </li>
      ))}
    </ul>
  );
}

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<ReviewRequest | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "review" });
  const refresh = useRefreshAfterChange();

  const open = useCallback((r: ReviewRequest) => {
    setReq(r);
    setPhase({ kind: "review" });
  }, []);
  const close = () => {
    if (phase.kind !== "working") setReq(null);
  };

  const apply = async () => {
    if (!req) return;
    setPhase({ kind: "working", what: "apply" });
    try {
      const set = await act("apply_changes", { title: req.title, changes: req.changes });
      setPhase({ kind: "result", set });
    } catch (e) {
      setPhase({ kind: "error", message: errorMessage(e), undo: false });
    } finally {
      refresh();
    }
  };

  const undo = async (set: ChangeSet) => {
    setPhase({ kind: "working", what: "undo" });
    try {
      const after = await act("undo_change", { id: set.id });
      setPhase({ kind: "result", set: after });
    } catch (e) {
      setPhase({ kind: "error", message: errorMessage(e), undo: true });
    } finally {
      refresh();
    }
  };

  const count = req?.groups.reduce((n, g) => n + g.items.length, 0) ?? 0;
  const bytes = req?.groups.reduce((n, g) => n + g.items.reduce((m, i) => m + (i.bytes ?? 0), 0), 0) ?? 0;
  const heading =
    phase.kind === "result" ? (phase.set.undone ? "Changes undone" : "Results") : req ? `Review: ${req.title}` : "Review";

  return (
    <ReviewContext.Provider value={open}>
      {children}
      <Dialog open={!!req} onClose={close} title={heading}>
        {req && (
          <div className="flex max-h-[calc(100vh-4rem)] flex-col">
            <div className="border-b border-line px-6 pt-5 pb-4">
              <h2 className="text-[1.125rem] font-semibold">{heading}</h2>
              {phase.kind === "review" && (
                <p className="mt-0.5 text-[0.875rem] text-muted">
                  {count === 1 ? "1 change" : `${count} changes`}
                  {bytes > 0 && `, ${formatGB(bytes)} to free`}. Nothing changes until you apply.
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">
              {(phase.kind === "review" || phase.kind === "working") && (
                <div className="space-y-3" aria-busy={phase.kind === "working"}>
                  {req.groups.map((g) => (
                    <section key={g.label}>
                      <h3 className="text-[0.8125rem] font-medium text-muted">{g.label}</h3>
                      <ul className="mt-1 divide-y divide-line">
                        {g.items.map((i, k) => (
                          <li key={k} className="flex items-baseline justify-between gap-4 py-2 text-[0.875rem]">
                            <div className="min-w-0">
                              <div>{i.label}</div>
                              {i.detail && <div className="truncate text-[0.8125rem] text-muted">{i.detail}</div>}
                            </div>
                            {i.bytes !== undefined && <span className="shrink-0 tabular-nums">{formatGB(i.bytes)}</span>}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}

              {phase.kind === "result" && (
                <div data-testid="results">
                  <SetItems set={phase.set} />
                  {freedTotal(phase.set) > 0 && (
                    <p className="mt-2 text-[0.875rem]">
                      Space freed: <span className="font-semibold">{formatGB(freedTotal(phase.set))}</span>
                    </p>
                  )}
                </div>
              )}

              {phase.kind === "error" && (
                <div role="alert" className="flex gap-3 rounded-xl bg-danger-soft p-4">
                  <ShieldAlert size={20} strokeWidth={ICON_STROKE} className="shrink-0 text-danger" aria-hidden />
                  <div>
                    <p className="text-[0.9375rem] font-semibold text-danger">
                      {phase.undo ? "Undo didn't run" : "Lagsmith didn't apply these changes"}
                    </p>
                    <p className="mt-1 text-[0.875rem] text-ink">{phase.message}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-3">
              {phase.kind === "review" && (
                <>
                  <Button variant="outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button onClick={apply}>Apply changes</Button>
                </>
              )}
              {phase.kind === "working" && (
                <span className="text-[0.875rem] text-muted" role="status">
                  {phase.what === "apply" ? "Applying…" : "Undoing…"}
                </span>
              )}
              {phase.kind === "result" && (
                <>
                  {canUndo(phase.set) && (
                    <Button variant="outline" onClick={() => undo(phase.set)}>
                      <Undo2 size={16} strokeWidth={ICON_STROKE} aria-hidden />
                      Undo
                    </Button>
                  )}
                  <Button onClick={close}>Close</Button>
                </>
              )}
              {phase.kind === "error" && <Button onClick={close}>Close</Button>}
            </div>
          </div>
        )}
      </Dialog>
    </ReviewContext.Provider>
  );
}
