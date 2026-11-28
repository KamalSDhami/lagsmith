import { useCallback, useEffect, useState } from "react";
import {
  ArrowSyncRegular,
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
  SpinnerIosRegular,
} from "@fluentui/react-icons";
import { NAV, SETTINGS_ITEM, type NavItem, type Page } from "../pages/nav";
import { cn } from "../lib/cn";
import { LogoMark } from "./Logo";
import { formatAgo } from "../lib/format";
import { Tooltip } from "./ui/tooltip";
import { inTauri } from "../lib/api";
import { useSettings } from "../lib/settings";
import type { DotSeverity } from "../lib/navDots";

const RAIL_BELOW = 1200;
const EXPAND_AT = 1224; // 24 px hysteresis so dragging the window edge does not flap

/** Effective collapsed state: manual choice wins, otherwise the window width decides (spec 3.1). Also binds Ctrl+B. */
export function useSidebar() {
  const { sidebar, setSidebar } = useSettings();
  const [narrow, setNarrow] = useState(() => window.innerWidth < RAIL_BELOW);
  useEffect(() => {
    const on = () => setNarrow((n) => (window.innerWidth < RAIL_BELOW ? true : window.innerWidth >= EXPAND_AT ? false : n));
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const collapsed = sidebar === "collapsed" || (sidebar === "auto" && narrow);
  const toggle = useCallback(() => setSidebar(collapsed ? "expanded" : "collapsed"), [collapsed, setSidebar]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "b") return;
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle]);
  return { collapsed, toggle };
}

interface Props {
  page: Page;
  onNavigate: (p: Page) => void;
  scanning: boolean;
  finishedAt: number | null;
  onScan: () => void;
  collapsed: boolean;
  onToggle: () => void;
  dots: Partial<Record<Page, DotSeverity>>;
}

function NavButton({
  item,
  active,
  rail,
  dot,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  rail: boolean;
  dot?: DotSeverity;
  onClick: () => void;
}) {
  const Icon = active ? item.iconActive : item.icon;
  const btn = (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      aria-description={dot ? "Has an open finding" : undefined}
      className={cn(
        "relative flex h-9 items-center rounded-[10px] text-left text-body transition-colors [@media(max-height:740px)]:h-8 [@media(min-height:860px)]:h-10",
        rail ? "w-10 justify-center" : "w-full gap-3 px-3",
        active ? "bg-accent-soft font-medium text-ink dark:bg-subtle" : "text-ink hover:bg-hover",
      )}
    >
      {active && <span aria-hidden className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent" />}
      <span className="relative grid shrink-0 place-items-center">
        <Icon fontSize={20} aria-hidden className={active ? "text-accent" : "text-muted"} />
        {dot && (
          <span
            aria-hidden
            data-testid={`dot-${item.id}`}
            className={cn("absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-sidebar", dot === "critical" ? "bg-danger" : "bg-warning-icon")}
          />
        )}
      </span>
      {!rail && <span className="truncate whitespace-nowrap">{item.label}</span>}
    </button>
  );
  return rail ? <Tooltip label={item.label}>{btn}</Tooltip> : btn;
}

export function Sidebar({ page, onNavigate, scanning, finishedAt, onScan, collapsed, onToggle, dots }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const rail = collapsed;
  const lastScan = finishedAt ? `Last scan ${formatAgo(finishedAt, now)}` : "Not scanned this session";
  const ToggleIcon = rail ? PanelLeftExpandRegular : PanelLeftContractRegular;
  const toggleLabel = rail ? "Expand sidebar" : "Collapse sidebar";

  const toggle = (
    <Tooltip label={`${toggleLabel} (Ctrl+B)`}>
      <button
        onClick={onToggle}
        aria-label={toggleLabel}
        aria-expanded={!rail}
        aria-keyshortcuts="Control+B"
        className="grid size-10 shrink-0 place-items-center rounded-[10px] text-muted transition-colors hover:bg-hover hover:text-ink [@media(max-height:740px)]:size-8"
      >
        <ToggleIcon fontSize={20} aria-hidden />
      </button>
    </Tooltip>
  );

  const scanLabel = scanning ? "Scanning…" : "Scan again";
  const scanIcon = scanning ? (
    <SpinnerIosRegular fontSize={rail ? 20 : 16} aria-hidden className="motion-safe:animate-spin" />
  ) : (
    <ArrowSyncRegular fontSize={rail ? 20 : 16} aria-hidden />
  );

  return (
    <aside
      aria-label="Sidebar"
      data-collapsed={rail}
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-line bg-sidebar transition-[width] duration-200 ease-out",
        rail ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex shrink-0 pt-4 pb-3 [@media(max-height:740px)]:pt-3 [@media(max-height:740px)]:pb-2", rail ? "flex-col items-center gap-2 px-3 [@media(max-height:740px)]:gap-1" : "items-center justify-between gap-2 pr-3 pl-4")}>
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark className="size-8 shrink-0" />
          {!rail && (
            <div className="min-w-0 leading-tight whitespace-nowrap">
              <div className="text-card font-semibold tracking-tight">Lagsmith</div>
              <div className="text-secondary text-muted">PC Optimizer</div>
            </div>
          )}
        </div>
        {toggle}
      </div>

      <nav aria-label="Main" className={cn("min-h-0 flex-1 overflow-y-auto pb-3", rail ? "px-3" : "px-3")}>
        {NAV.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && (rail ? "mt-2 border-t border-line pt-2 [@media(max-height:740px)]:mt-1 [@media(max-height:740px)]:pt-1" : "mt-3 [@media(min-height:860px)]:mt-4"))}>
            {group.label && !rail && <div className="px-3 pb-1 text-secondary font-medium text-muted">{group.label}</div>}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.id} className={rail ? "flex justify-center" : undefined}>
                  <NavButton item={item} active={item.id === page} rail={rail} dot={dots[item.id]} onClick={() => onNavigate(item.id)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("shrink-0 border-t border-line pt-3 pb-3", rail ? "flex flex-col items-center gap-1.5 px-3" : "px-3")}>
        {/* Scan state is from this session only; there is no stored scan history. */}
        {rail ? (
          <Tooltip label={scanning ? "Scanning…" : `Scan again. ${lastScan}`}>
            <button
              onClick={onScan}
              disabled={scanning}
              aria-label={scanLabel}
              className="grid size-10 place-items-center rounded-[10px] border border-line bg-surface hover:bg-subtle disabled:opacity-60 [@media(max-height:740px)]:size-8"
            >
              {scanIcon}
            </button>
          </Tooltip>
        ) : (
          <>
            <button
              onClick={onScan}
              disabled={scanning}
              className="flex h-10 w-full items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-left text-body font-medium hover:bg-subtle disabled:opacity-60"
            >
              {scanIcon}
              {scanLabel}
            </button>
            <p className="mt-2 px-1 pb-2 text-secondary text-muted">{lastScan}</p>
          </>
        )}
        <NavButton item={SETTINGS_ITEM} active={page === "settings"} rail={rail} onClick={() => onNavigate("settings")} />
        {!inTauri &&
          (rail ? (
            <Tooltip label="Sample data: this is a preview, not this PC">
              <span
                aria-label="Sample data"
                role="img"
                className="grid size-7 place-items-center rounded-full bg-warning-soft text-caption font-semibold text-warning"
              >
                S
              </span>
            </Tooltip>
          ) : (
            <span className="mt-1 inline-flex h-6 items-center self-start rounded-full bg-warning-soft px-2.5 text-caption font-medium text-warning">
              Sample data
            </span>
          ))}
      </div>
    </aside>
  );
}
