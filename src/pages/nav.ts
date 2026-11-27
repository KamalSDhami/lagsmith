import {
  Gamepad2,
  History,
  House,
  Layers,
  LayoutGrid,
  MemoryStick,
  Cpu,
  Power,
  Search,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";

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
  | "history";

export interface NavItem {
  id: Page;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [
      { id: "dashboard", label: "Dashboard", icon: House },
      { id: "scan", label: "Scan PC", icon: Search },
    ],
  },
  {
    label: "Diagnostics",
    items: [
      { id: "crash", label: "Crash Detective", icon: TriangleAlert },
      { id: "hardware", label: "Hardware", icon: Cpu },
      { id: "memory", label: "Memory", icon: MemoryStick },
    ],
  },
  {
    label: "Optimization",
    items: [
      { id: "storage", label: "Storage Cleaner", icon: Layers },
      { id: "startup", label: "Startup Manager", icon: Power },
      { id: "gaming", label: "Gaming Mode", icon: Gamepad2 },
    ],
  },
  {
    label: "System",
    items: [
      { id: "repair", label: "System Repair", icon: Wrench },
      { id: "debloat", label: "Debloat", icon: LayoutGrid },
      { id: "history", label: "History & Undo", icon: History },
    ],
  },
];

export function pageLabel(p: Page): string {
  for (const g of NAV) for (const i of g.items) if (i.id === p) return i.label;
  return "";
}

export const ICON_STROKE = 1.75;
