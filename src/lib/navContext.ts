import { createContext, useContext } from "react";
import type { Page } from "../pages/nav";

/** Go to a page. `focus` is a `data-focus-id` to scroll to and briefly highlight; `from` adds a back link. */
export type Go = (page: Page, focus?: string, from?: Page) => void;

interface NavState {
  from: Page | null;
  go: Go;
}

export const NavContext = createContext<NavState>({ from: null, go: () => {} });
export const useNav = () => useContext(NavContext);
