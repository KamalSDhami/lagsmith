import type { ReactNode } from "react";
import { Bell, User } from "lucide-react";
import { ICON_STROKE } from "../pages/nav";

export function TopBar({ title, subtitle, userName }: { title: ReactNode; subtitle?: ReactNode; userName: string | null }) {
  const initial = userName?.trim().charAt(0).toUpperCase() ?? "";
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          aria-label="Notifications"
          className="relative grid size-11 place-items-center rounded-full border border-line bg-surface text-ink shadow-card hover:bg-subtle"
        >
          <Bell size={19} strokeWidth={ICON_STROKE} />
          <span aria-hidden className="absolute top-2.5 right-3 size-2 rounded-full bg-accent ring-2 ring-surface" />
        </button>
        <div
          role="img"
          aria-label={userName ? `Signed in as ${userName}` : "User"}
          className="grid size-11 place-items-center rounded-full bg-accent-soft text-[17px] font-semibold text-accent"
        >
          {initial || <User size={19} strokeWidth={ICON_STROKE} aria-hidden />}
        </div>
      </div>
    </header>
  );
}
