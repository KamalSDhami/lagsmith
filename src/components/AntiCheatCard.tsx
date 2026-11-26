import { Lock } from "lucide-react";
import { useSys } from "../lib/useSystemData";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Show } from "./Show";
import { Empty } from "./Page";
import { ICON_STROKE } from "../pages/nav";
import { PROTECTED_REASON } from "../lib/protected";
import { cn } from "../lib/cn";

/** Read-only anti-cheat status from get_anticheat. */
export function AntiCheatCard({ className }: { className?: string }) {
  const { data, load } = useSys();
  return (
    <Card className={cn("flex min-h-0 flex-col", className)} aria-labelledby="ac-title">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-1.5">
        <Lock size={16} strokeWidth={ICON_STROKE} className="text-muted" aria-hidden />
        <h2 id="ac-title" className="text-[0.9375rem] font-semibold">
          Anti-cheat status
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Show load={data.get_anticheat} what="anti-cheat status" onRetry={() => load("get_anticheat")}>
          {(list) =>
            list.length === 0 ? (
              <Empty>No anti-cheat software found.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {list.map((a) => (
                  <li key={`${a.name}-${a.service}`} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[0.875rem] font-medium">
                        {a.name} <span className="font-normal text-muted">({a.service})</span>
                      </div>
                      <div className="text-[0.8125rem] text-muted">
                        {a.installed ? "Installed" : "Not installed"} · Start type: {a.startType || "unknown"}
                      </div>
                    </div>
                    <Badge tone={a.state === "running" ? "success" : "neutral"}>
                      {a.state === "running" ? "Running" : a.state === "stopped" ? "Stopped" : "Missing"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )
          }
        </Show>
      </div>
      <p className="border-t border-line px-4 py-2 text-[0.75rem] text-muted">{PROTECTED_REASON}.</p>
    </Card>
  );
}
