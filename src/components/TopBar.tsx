import type { ReactNode } from "react";

/** Dashboard heading. No bell or avatar: there are no notifications or accounts in this app. */
export function TopBar({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="min-w-0">
      <h1 tabIndex={-1} className="text-[1.625rem] leading-tight font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[0.9375rem] text-muted">{subtitle}</p>}
    </header>
  );
}
