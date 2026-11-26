import { Monitor } from "lucide-react";
import { NAV, ICON_STROKE, type Page } from "../pages/nav";
import { cn } from "../lib/cn";
import { LogoMark } from "./Logo";

export function Sidebar({ page, onNavigate, osName }: { page: Page; onNavigate: (p: Page) => void; osName: string | null }) {
  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-line bg-sidebar">
      <div className="flex items-center gap-3 px-7 pt-6 pb-5">
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
        <div className="flex h-11 items-center gap-2.5 rounded-xl bg-[#e9e9ee] px-4 text-[0.875rem] font-medium">
          <Monitor size={17} strokeWidth={ICON_STROKE} aria-hidden className="text-[#3a3a40]" />
          {osName ?? "Windows"}
        </div>
      </div>
    </aside>
  );
}
