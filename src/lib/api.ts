import { invoke } from "@tauri-apps/api/core";
import type { Commands } from "../types";
import { mockCall } from "./mock";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Typed IPC call. Outside Tauri (plain `npm run dev`), returns mock data. */
export function call<K extends keyof Commands>(cmd: K): Promise<Commands[K]> {
  if (!inTauri) return mockCall(cmd);
  return invoke<Commands[K]>(cmd);
}
