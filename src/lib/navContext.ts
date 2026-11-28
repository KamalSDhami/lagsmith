import { createContext, useContext } from "react";
import type { Page } from "../pages/nav";

/** Go to a page. `focus` is a `data-focus-id` to scroll to and briefly highlight; `from` adds a back link. */
export type Go = (page: Page, focus?: string, from?: Page) => void;

interface NavState {
  from: Page | null;
  go: Go;
  /** Scroll model of the current page (see PAGE_LAYOUT in pages/nav.ts). */
  layout: "fit" | "flow";
}

export const NavContext = createContext<NavState>({ from: null, go: () => {}, layout: "fit" });
export const useNav = () => useContext(NavContext);
