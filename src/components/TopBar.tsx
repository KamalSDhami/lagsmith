import type { ReactNode } from "react";
import { PageHeading } from "./Page";

/** Dashboard heading. No bell or avatar: there are no notifications or accounts in this app. */
export function TopBar({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="min-w-0">
      <PageHeading title={title} subtitle={subtitle} />
    </header>
  );
}
