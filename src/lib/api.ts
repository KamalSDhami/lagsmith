import { Channel, invoke } from "@tauri-apps/api/core";
import type { ActionCommands, AdminEvent, AdminResult, AdminTask, Commands, ExtraCommands } from "../types";

type Reads = Commands & ExtraCommands;

export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Typed read command. In `npm run dev` outside Tauri, returns mock data instead. */
export async function call<K extends keyof Reads>(cmd: K): Promise<Reads[K]> {
  if (inTauri) return invoke<Reads[K]>(cmd);
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

/** Elevated admin task with live progress streamed over a Tauri Channel. */
export async function runAdminTask(task: AdminTask, onEvent: (e: AdminEvent) => void): Promise<AdminResult> {
  if (inTauri) {
    const channel = new Channel<AdminEvent>();
    channel.onmessage = onEvent;
    return invoke<AdminResult>("run_admin_task", { task, onEvent: channel });
  }
  if (import.meta.env.DEV) {
    const { mockAdminTask } = await import("./mock");
    return mockAdminTask(task, onEvent);
  }
  throw new Error("Not running inside the app.");
}

/** Fires when the window's close button was pressed while an admin task runs (Rust blocked the close). */
export async function onCloseBlocked(cb: (task: string) => void): Promise<() => void> {
  if (inTauri) {
    const { listen } = await import("@tauri-apps/api/event");
    return listen<string>("close-blocked", (e) => cb(e.payload));
  }
  const h = (e: Event) => cb(String((e as CustomEvent).detail));
  window.addEventListener("lagsmith:close-blocked", h);
  return () => window.removeEventListener("lagsmith:close-blocked", h);
}

/** Close the app for real. Any running repair keeps going in its own process. */
export async function closeApp(): Promise<void> {
  if (inTauri) return invoke("close_app");
  (window as unknown as { __lagsmithClosed?: boolean }).__lagsmithClosed = true;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}
