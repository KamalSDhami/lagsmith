import { invoke } from "@tauri-apps/api/core";
import type { Commands } from "../types";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Typed IPC call. In `npm run dev` outside Tauri, returns mock data instead. */
export async function call<K extends keyof Commands>(cmd: K): Promise<Commands[K]> {
  if (inTauri) return invoke<Commands[K]>(cmd);
  if (import.meta.env.DEV) {
    // Dynamic import behind a build-time constant: the mock is dropped from release builds.
    const { mockCall } = await import("./mock");
    return mockCall(cmd);
  }
  throw new Error("Not running inside the app.");
}
