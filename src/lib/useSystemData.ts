import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AdminEvent, AdminResult, AdminTask, Commands } from "../types";
import { call, errorMessage, runAdminTask } from "./api";

export type Cmd = keyof Commands;

export type Load<T> =
  | { status: "idle"; data?: undefined }
  | { status: "loading"; data?: T }
  | { status: "ok"; data: T }
  | { status: "error"; error: string; data?: T };

export type SystemData = { [K in Cmd]: Load<Commands[K]> };

const ALL: Cmd[] = [
  "get_hardware",
  "get_storage",
  "get_caches",
  "get_stability",
  "get_startup",
  "get_memory",
  "get_security",
  "check_driver_updates",
  "get_system",
  "get_anticheat",
  "list_crash_dumps",
  "get_disk_usage",
  "get_store_apps",
  "get_gpu_preferences",
  "get_history",
];

/** Loaded when the app opens: what the dashboard needs, plus the one-off driver check. */
const ON_START: Cmd[] = [
  "get_hardware",
  "get_storage",
  "get_stability",
  "get_startup",
  "get_security",
  "get_system",
  "get_anticheat",
  "get_gpu_preferences",
  "check_driver_updates",
];

export interface ScanStep {
  label: string;
  cmds: Cmd[];
}

/**
 * What "Scan PC" reads. Excludes the Windows Update driver check (runs once at start) and
 * get_disk_usage (slow; only the Storage page asks for it).
 */
export const SCAN_STEPS: ScanStep[] = [
  { label: "Reading crash history", cmds: ["get_stability", "list_crash_dumps"] },
  { label: "Checking hardware", cmds: ["get_hardware", "get_system", "get_security", "get_anticheat", "get_gpu_preferences"] },
  { label: "Measuring storage and caches", cmds: ["get_storage", "get_caches"] },
  { label: "Checking memory", cmds: ["get_memory"] },
  { label: "Checking startup and Store apps", cmds: ["get_startup", "get_store_apps"] },
];

export type ScanCmdState = "pending" | "ok" | "error";

export interface ScanRun {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  cancelled: boolean;
  cmds: Partial<Record<Cmd, ScanCmdState>>;
}

export interface AdminRunResult {
  result: AdminResult;
  finishedAt: string;
}

export interface AdminState {
  running: AdminTask | null;
  event: AdminEvent | null;
  results: Partial<Record<AdminTask, AdminRunResult>>;
  error: { task: AdminTask; message: string } | null;
}

function initial(): SystemData {
  return Object.fromEntries(ALL.map((c) => [c, { status: ON_START.includes(c) ? "loading" : "idle" }])) as SystemData;
}

const INITIAL_ADMIN: AdminState = {
  running: null,
  event: null,
  results: {},
  error: null,
};

/** Loads read commands in parallel; each one succeeds or fails on its own. */
export function useSystemData() {
  const [state, setState] = useState<SystemData>(initial);
  const [scan, setScan] = useState<ScanRun | null>(null);
  const [admin, setAdmin] = useState<AdminState>(INITIAL_ADMIN);
  const adminRunningRef = useRef(false);
  // Per-command request counter so a slow, older response never overwrites a newer one.
  const seq = useRef<Record<string, number>>({});
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(<K extends Cmd>(cmd: K): Promise<boolean> => {
    const id = (seq.current[cmd] ?? 0) + 1;
    seq.current[cmd] = id;
    setState((s) => ({ ...s, [cmd]: { status: "loading", data: s[cmd].data } }));
    return call(cmd).then(
      (data) => {
        if (seq.current[cmd] === id) setState((s) => ({ ...s, [cmd]: { status: "ok", data } }));
        return true;
      },
      (e: unknown) => {
        if (seq.current[cmd] === id)
          setState((s) => ({ ...s, [cmd]: { status: "error", error: errorMessage(e), data: s[cmd].data } }));
        return false;
      },
    );
  }, []);

  /** Load once, when a page first needs it. */
  const ensure = useCallback(
    (...cmds: Cmd[]) => {
      for (const c of cmds) if (stateRef.current[c].status === "idle") void load(c);
    },
    [load],
  );

  const scanSeq = useRef(0);
  const runScan = useCallback(() => {
    const id = ++scanSeq.current;
    const cmds = SCAN_STEPS.flatMap((s) => s.cmds);
    setScan({ id, startedAt: Date.now(), finishedAt: null, cancelled: false, cmds: Object.fromEntries(cmds.map((c) => [c, "pending"])) });
    let left = cmds.length;
    for (const c of cmds) {
      void load(c).then((ok) => {
        left--;
        setScan((r) => {
          if (!r || r.id !== id || r.cancelled) return r;
          return { ...r, cmds: { ...r.cmds, [c]: ok ? "ok" : "error" }, finishedAt: left === 0 ? Date.now() : r.finishedAt };
        });
      });
    }
  }, [load]);

  /** IPC calls can't be aborted; cancelling stops tracking and leaves the page. Results that arrive still update the data. */
  const cancelScan = useCallback(() => setScan((r) => (r && !r.finishedAt ? { ...r, cancelled: true } : r)), []);

  const startAdminTask = useCallback(
    (task: AdminTask) => {
      if (adminRunningRef.current) return;
      adminRunningRef.current = true;
      setAdmin((prev) => ({
        ...prev,
        running: task,
        event: { stage: "Waiting for admin permission…", percent: null },
        error: null,
      }));
      void runAdminTask(task, (e) => {
        setAdmin((prev) => (prev.running === task ? { ...prev, event: e } : prev));
      }).then(
        (result) => {
          adminRunningRef.current = false;
          setAdmin((prev) => ({
            ...prev,
            running: null,
            event: null,
            results: { ...prev.results, [task]: { result, finishedAt: new Date().toISOString() } },
            error: null,
          }));
          if (task === "sfc") void load("get_system");
        },
        (err: unknown) => {
          adminRunningRef.current = false;
          setAdmin((prev) => ({
            ...prev,
            running: null,
            event: null,
            error: { task, message: errorMessage(err) },
          }));
        },
      );
    },
    [load],
  );

  useEffect(() => {
    ON_START.forEach((c) => void load(c));
  }, [load]);

  return { data: state, load, ensure, scan, runScan, cancelScan, admin, startAdminTask };
}

export type Sys = ReturnType<typeof useSystemData>;

export const SysContext = createContext<Sys | null>(null);

export function useSys(): Sys {
  const s = useContext(SysContext);
  if (!s) throw new Error("SysContext missing");
  return s;
}

/** The value if loaded (also while reloading), else undefined. */
export function value<T>(l: Load<T>): T | undefined {
  return l.status === "ok" ? l.data : l.status === "loading" ? l.data : undefined;
}
