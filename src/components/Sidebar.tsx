import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { NAV, ICON_STROKE, type Page } from "../pages/nav";
import { cn } from "../lib/cn";
import { LogoMark } from "./Logo";
import { formatAgo } from "../lib/format";

interface Props {
  page: Page;
  onNavigate: (p: Page) => void;
  osName: string | null;
  scanning: boolean;
  finishedAt: number | null;
  onScan: () => void;
}

export function Sidebar({ page, onNavigate, osName, scanning, finishedAt, onScan }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <aside className="flex h-full w-[220px] shrink-0 min-[1200px]:w-[260px] flex-col border-r border-line bg-sidebar">
      <div className="flex items-center gap-3 px-5 pt-6 pb-5 min-[1200px]:px-7">
        <LogoMark className="size-9" />
        <div className="leading-tight">
          <div className="text-[1.0625rem] font-semibold tracking-tight">Lagsmith</div>
          <div className="text-[0.8125rem] text-muted">PC Optimizer</div>
        </div>
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-4 pb-4">
        {NAV.map((group, gi) => (
          <div key={gi} className={cn(gi > 0 && "mt-3 [@media(min-height:860px)]:mt-5")}>
            {group.label && <div className="px-3 pb-1 text-[0.8125rem] font-medium text-muted">{group.label}</div>}
            <ul className="space-y-0.5">
              {group.items.map(({ id, label, icon: Icon }) => {
                const active = id === page;
                return (
                  <li key={id}>
                    <button
                      onClick={() => onNavigate(id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 w-full items-center gap-3 rounded-xl px-3 [@media(max-height:740px)]:h-8 [@media(min-height:860px)]:h-10 text-left text-[0.9375rem] transition-colors",
                        active ? "bg-accent-soft font-medium text-ink" : "text-ink hover:bg-[#e7e7ec]",
                      )}
                    >
                      <Icon size={19} strokeWidth={ICON_STROKE} aria-hidden className={active ? "text-accent" : "text-[#3a3a40]"} />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-4 pb-5">
        {/* Scan state is from this session only; there is no stored scan history. */}
        <button
          onClick={onScan}
          disabled={scanning}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-4 text-left text-[0.875rem] font-medium hover:bg-subtle disabled:opacity-60"
        >
          {scanning ? (
            <LoaderCircle size={16} strokeWidth={ICON_STROKE} aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <RefreshCw size={16} strokeWidth={ICON_STROKE} aria-hidden />
          )}
          {scanning ? "Scanning…" : "Scan again"}
        </button>
        <p className="mt-2 px-1 text-[0.8125rem] text-muted">
          {finishedAt ? `Last scan ${formatAgo(finishedAt, now)}` : "Not scanned this session"}
        </p>
        <p className="px-1 text-[0.8125rem] text-muted">{osName ?? "Windows"}</p>
      </div>
    </aside>
  );
}
