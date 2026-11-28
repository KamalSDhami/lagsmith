import type { FluentIcon } from "@fluentui/react-icons";
import {
  AppsFilled,
  AppsRegular,
  BroomFilled,
  BroomRegular,
  DeveloperBoardFilled,
  DeveloperBoardRegular,
  HistoryFilled,
  HistoryRegular,
  HomeFilled,
  HomeRegular,
  PowerFilled,
  PowerRegular,
  RamFilled,
  RamRegular,
  SearchFilled,
  SearchRegular,
  SettingsFilled,
  SettingsRegular,
  WarningFilled,
  WarningRegular,
  WrenchFilled,
  WrenchRegular,
  XboxControllerFilled,
  XboxControllerRegular,
} from "@fluentui/react-icons";

export type Page =
  | "dashboard"
  | "scan"
  | "crash"
  | "hardware"
  | "memory"
  | "storage"
  | "startup"
  | "gaming"
  | "debloat"
  | "repair"
  | "history"
  | "settings";

/** Fluent System Icons: Regular normally, Filled for the active item (spec 5.3). Pages import icons the same way. */
export interface NavItem {
  id: Page;
  label: string;
  icon: FluentIcon;
  iconActive: FluentIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      { id: "dashboard", label: "Dashboard", icon: HomeRegular, iconActive: HomeFilled },
      { id: "scan", label: "Scan PC", icon: SearchRegular, iconActive: SearchFilled },
    ],
  },
  {
    label: "Diagnostics",
    items: [
      { id: "crash", label: "Crash Detective", icon: WarningRegular, iconActive: WarningFilled },
      { id: "hardware", label: "Hardware", icon: DeveloperBoardRegular, iconActive: DeveloperBoardFilled },
      { id: "memory", label: "Memory", icon: RamRegular, iconActive: RamFilled },
    ],
  },
  {
    label: "Optimization",
    items: [
      { id: "storage", label: "Storage Cleaner", icon: BroomRegular, iconActive: BroomFilled },
      { id: "startup", label: "Startup Manager", icon: PowerRegular, iconActive: PowerFilled },
      { id: "gaming", label: "Gaming Mode", icon: XboxControllerRegular, iconActive: XboxControllerFilled },
    ],
  },
  {
    label: "System",
    items: [
      { id: "repair", label: "System Repair", icon: WrenchRegular, iconActive: WrenchFilled },
      { id: "debloat", label: "Debloat", icon: AppsRegular, iconActive: AppsFilled },
      { id: "history", label: "History & Undo", icon: HistoryRegular, iconActive: HistoryFilled },
    ],
  },
];

/** Pinned to the bottom of the sidebar, outside the scrolling nav. */
export const SETTINGS_ITEM: NavItem = { id: "settings", label: "Settings", icon: SettingsRegular, iconActive: SettingsFilled };

export function pageLabel(p: Page): string {
  if (p === "settings") return SETTINGS_ITEM.label;
  for (const g of NAV) for (const i of g.items) if (i.id === p) return i.label;
  return "";
}

/**
 * Scroll model per page (spec 2.1). "fit" = legacy: the page fills the viewport and cards may scroll inside.
 * "flow" = content height, `main` is the only scroll container, no card uses flex-1 / h-full.
 * Page agents flip an entry to "flow" when they convert that page. Dashboard is always "fit".
 */
export const PAGE_LAYOUT: Record<Page, "fit" | "flow"> = {
  dashboard: "fit",
  scan: "fit",
  crash: "fit",
  hardware: "fit",
  memory: "fit",
  storage: "fit",
  startup: "fit",
  gaming: "fit",
  debloat: "fit",
  repair: "fit",
  history: "fit",
  settings: "flow",
};

/** Legacy stroke width for the old Lucide icons that pages still use. Fluent icons ignore it. */
export const ICON_STROKE = 1.75;
