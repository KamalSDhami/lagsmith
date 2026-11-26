import type { ReactNode } from "react";
import { Bell, User } from "lucide-react";
import { ICON_STROKE } from "../pages/nav";
import { Popover } from "./ui/popover";

export function TopBar({ title, subtitle, userName }: { title: ReactNode; subtitle?: ReactNode; userName: string | null }) {
  const initial = userName?.trim().charAt(0).toUpperCase() ?? "";
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-[1.625rem] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[0.9375rem] text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Popover
          label="Notifications"
          panelClassName="w-64"
          trigger={(p) => (
            <button
              {...p}
              aria-label="Notifications"
              className="grid size-10 place-items-center rounded-full border border-line bg-surface text-ink shadow-card hover:bg-subtle"
            >
              <Bell size={18} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          )}
        >
          <p className="px-3 py-2 text-[0.875rem] text-muted">No notifications yet</p>
        </Popover>
        {/* Shows the Windows user's initial; there are no accounts in this app. */}
        <div
          aria-hidden
          className="grid size-10 place-items-center rounded-full bg-accent-soft text-[1rem] font-semibold text-accent"
        >
          {initial || <User size={18} strokeWidth={ICON_STROKE} />}
        </div>
      </div>
    </header>
  );
}
