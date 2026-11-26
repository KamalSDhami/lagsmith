import { useCallback, useEffect, useRef, useState } from "react";
import type { Commands } from "../types";
import { call } from "./api";

export type Cmd = keyof Commands;

export type Load<T> =
  | { status: "loading"; data?: T }
  | { status: "ok"; data: T }
  | { status: "error"; error: string; data?: T };

export type SystemData = { [K in Cmd]: Load<Commands[K]> };

const ALL: Cmd[] = [
  "get_hardware",
  "get_storage",
  "get_stability",
  "get_startup",
  "get_memory",
  "get_security",
  "check_driver_updates",
];

function initial(): SystemData {
  return Object.fromEntries(ALL.map((c) => [c, { status: "loading" }])) as SystemData;
}

function message(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : "Unknown error";
}

/** Loads every read command in parallel; each one succeeds or fails on its own. */
export function useSystemData() {
  const [state, setState] = useState<SystemData>(initial);
  // Per-command request counter so a slow, older response never overwrites a newer one.
  const seq = useRef<Record<string, number>>({});

  const load = useCallback(<K extends Cmd>(cmd: K) => {
    const id = (seq.current[cmd] ?? 0) + 1;
    seq.current[cmd] = id;
    setState((s) => ({ ...s, [cmd]: { status: "loading", data: s[cmd].data } }));
    call(cmd).then(
      (data) => {
        if (seq.current[cmd] !== id) return;
        setState((s) => ({ ...s, [cmd]: { status: "ok", data } }));
      },
      (e: unknown) => {
        if (seq.current[cmd] !== id) return;
        setState((s) => ({ ...s, [cmd]: { status: "error", error: message(e), data: s[cmd].data } }));
      },
    );
  }, []);

  const loadAll = useCallback(() => ALL.forEach((c) => load(c)), [load]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const busy = ALL.some((c) => state[c].status === "loading");
  return { data: state, load, loadAll, busy };
}
