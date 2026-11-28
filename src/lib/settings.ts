import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./api";

/** Mirrors the backend `get_settings` / `set_settings` shape. */
export type ThemePref = "light" | "dark" | "system";
export interface AppSettings {
  theme: ThemePref;
  sidebarCollapsed: boolean;
  startWithWindows: boolean;
  autoClean: { enabled: boolean; thresholdPercent: number };
}
/** UI-only tri-state (spec 3.1). The backend stores only a bool, so "collapsed" maps to true and the rest to false. */
export type SidebarPref = "auto" | "expanded" | "collapsed";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  sidebarCollapsed: false,
  startWithWindows: false,
  autoClean: { enabled: false, thresholdPercent: 85 },
};

const LS = "lagsmith.settings";
const LS_THEME = "lagsmith.theme"; // read synchronously by public/theme-init.js
const LS_SIDEBAR = "lagsmith.sidebar";

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function readLocal(): AppSettings {
  const raw = safe(() => localStorage.getItem(LS), null);
  const theme = (safe(() => localStorage.getItem(LS_THEME), null) as ThemePref | null) || "system";
  if (!raw) return { ...DEFAULT_SETTINGS, theme };
  try {
    const p = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...p, theme, autoClean: { ...DEFAULT_SETTINGS.autoClean, ...p.autoClean } };
  } catch {
    return { ...DEFAULT_SETTINGS, theme };
  }
}

function readSidebar(s: AppSettings): SidebarPref {
  const v = safe(() => localStorage.getItem(LS_SIDEBAR), null);
  if (v === "auto" || v === "expanded" || v === "collapsed") return v;
  return s.sidebarCollapsed ? "collapsed" : "auto";
}

interface State {
  settings: AppSettings;
  sidebar: SidebarPref;
  loaded: boolean;
}

const initial = readLocal();
let state: State = { settings: initial, sidebar: readSidebar(initial), loaded: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function applyTheme(t: ThemePref) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

function persist(next: AppSettings, sidebar: SidebarPref) {
  safe(() => {
    localStorage.setItem(LS, JSON.stringify(next));
    localStorage.setItem(LS_THEME, next.theme);
    localStorage.setItem(LS_SIDEBAR, sidebar);
  }, undefined);
  if (inTauri) invoke("set_settings", { settings: next }).catch(() => {});
}

/**
 * Local typed wrapper: get_settings / set_settings are not in api.ts / types.ts yet. Outside Tauri the
 * localStorage copy is the store. Call once at startup.
 */
export async function loadSettings() {
  if (inTauri) {
    try {
      const s = await invoke<AppSettings>("get_settings");
      const sidebarLocal = readSidebar(readLocal());
      const merged: AppSettings = { ...DEFAULT_SETTINGS, ...s, autoClean: { ...DEFAULT_SETTINGS.autoClean, ...s.autoClean } };
      // Backend owns the values; keep an explicit "expanded" choice that the bool cannot express.
      const sidebar: SidebarPref = merged.sidebarCollapsed ? "collapsed" : sidebarLocal === "collapsed" ? "auto" : sidebarLocal;
      state = { settings: merged, sidebar, loaded: true };
      safe(() => {
        localStorage.setItem(LS_THEME, merged.theme);
        localStorage.setItem(LS_SIDEBAR, sidebar);
      }, undefined);
      applyTheme(merged.theme);
      emit();
      return;
    } catch {
      /* fall back to the local copy */
    }
  }
  state = { ...state, loaded: true };
  emit();
}

export function updateSettings(patch: Partial<AppSettings>) {
  const settings = { ...state.settings, ...patch };
  if (patch.theme) applyTheme(patch.theme);
  state = { ...state, settings };
  persist(settings, state.sidebar);
  emit();
}

export function setSidebarPref(sidebar: SidebarPref) {
  const settings = { ...state.settings, sidebarCollapsed: sidebar === "collapsed" };
  state = { ...state, settings, sidebar };
  persist(settings, sidebar);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => state;

export function useSettings() {
  const s = useSyncExternalStore(subscribe, snapshot);
  return { ...s, update: updateSettings, setSidebar: setSidebarPref };
}

/** Keep "system" live: re-apply when the OS scheme changes. Call once from App. */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const on = () => {
    if (state.settings.theme === "system") applyTheme("system");
  };
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}
