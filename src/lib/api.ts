import { invoke } from "@tauri-apps/api/core";
import type { ActionCommands, Commands } from "../types";

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Typed read command. In `npm run dev` outside Tauri, returns mock data instead. */
export async function call<K extends keyof Commands>(cmd: K): Promise<Commands[K]> {
  if (inTauri) return invoke<Commands[K]>(cmd);
  if (import.meta.env.DEV) {
    // Dynamic import behind a build-time constant: the mock is dropped from release builds.
    const { mockCall } = await import("./mock");
    return mockCall(cmd);
  }
  throw new Error("Not running inside the app.");
}

/** Typed action command with arguments. Rust validates every argument. */
export async function act<K extends keyof ActionCommands>(
  cmd: K,
  args: ActionCommands[K]["args"],
): Promise<ActionCommands[K]["result"]> {
  if (inTauri) return invoke<ActionCommands[K]["result"]>(cmd, args);
  if (import.meta.env.DEV) {
    const { mockAct } = await import("./mock");
    return mockAct(cmd, args);
  }
  throw new Error("Not running inside the app.");
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}
