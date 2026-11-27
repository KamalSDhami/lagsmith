import { Lock } from "lucide-react";
import type { StartupApp } from "../types";
import { useSys } from "../lib/useSystemData";
import { Page, Empty } from "../components/Page";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Show } from "../components/Show";
import { useReview } from "../components/Review";
import { isProtected, PROTECTED_REASON } from "../lib/protected";
import { ICON_STROKE } from "./nav";

/** Why an entry can't be switched here, or null when it can. Anti-cheat always wins. */
export function lockReason(a: StartupApp): string | null {
  if (isProtected(a.name, a.command)) return PROTECTED_REASON;
  if (a.canToggle) return null;
  if (/^HKLM/i.test(a.source)) return "Machine-wide entry: change it in Task Manager > Startup apps";
  return "Can't be changed from Lagsmith";
}

function sourceLabel(src: string) {
  if (/^HKCU/i.test(src)) return "Current user";
  if (/^HKLM/i.test(src)) return "All users";
  if (/startup folder/i.test(src)) return "Startup folder";
  return src;
}

export function StartupPage() {
  const { data, load } = useSys();
  const review = useReview();
  const s = data.get_startup;
  const list = s.status === "ok" || s.status === "loading" ? s.data : undefined;
  const enabled = list?.filter((a) => a.enabled).length;

  const ask = (a: StartupApp, next: boolean) =>
    review({
      title: `${next ? "Turn on" : "Turn off"} ${a.name} at startup`,
      groups: [
        {
          label: "Startup apps",
          items: [{ label: `${next ? "Turn on" : "Turn off"} ${a.name}`, detail: `${sourceLabel(a.source)} · ${a.command}` }],
        },
      ],
      changes: [{ kind: "startupEnabled", id: a.id, enabled: next }],
    });

  return (
    <Page
      title="Startup Manager"
      subtitle="Switch off what you don't need before a game. Every change is in History & Undo."
      aside={
        <div className="text-right">
          <div className="text-[1.625rem] leading-tight font-semibold tabular-nums">{list ? enabled : "-"}</div>
          <div className="text-[0.8125rem] text-muted">{list ? `on, of ${list.length} startup apps` : "Startup apps"}</div>
        </div>
      }
    >
      <Card className="flex min-h-0 flex-1 flex-col" data-focus-id="startup-list">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6.5rem_minmax(11rem,14rem)] gap-4 border-b border-line px-5 py-2.5 text-[0.8125rem] font-medium text-muted">
          <span>App</span>
          <span>Source</span>
          <span>Status</span>
          <span className="text-right">Startup</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Show load={s} what="startup apps" onRetry={() => load("get_startup")}>
            {(apps) =>
              apps.length === 0 ? (
                <Empty>No startup apps found.</Empty>
              ) : (
                <ul className="divide-y divide-line" aria-label="Startup apps">
                  {/* Apps that are on come first: they are the ones that cost boot time. */}
                  {[...apps].sort((x, y) => Number(y.enabled) - Number(x.enabled)).map((a) => {
                    const reason = lockReason(a);
                    const anticheat = reason === PROTECTED_REASON;
                    return (
                      <li
                        key={a.id}
                        data-testid={`startup-${a.id}`}
                        data-locked={reason ? "true" : "false"}
                        className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6.5rem_minmax(11rem,14rem)] items-center gap-4 px-5 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-[0.875rem] font-semibold">
                            {a.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-[0.9375rem] font-medium">{a.name}</div>
                            <div className="truncate text-[0.75rem] text-muted" title={a.command}>
                              {a.command}
                            </div>
                          </div>
                        </div>
                        <span className="truncate text-[0.875rem] text-muted" title={a.source}>
                          {sourceLabel(a.source)}
                        </span>
                        <span>
                          <Badge tone={a.enabled ? "success" : "neutral"}>{a.enabled ? "On" : "Off"}</Badge>
                        </span>
                        <div className="flex items-center justify-end gap-2">
                          {reason ? (
                            <span className="flex items-center gap-1.5 text-right text-[0.75rem] leading-snug text-muted" title={reason}>
                              {anticheat && <Lock size={15} strokeWidth={ICON_STROKE} aria-hidden />}
                              {reason}
                            </span>
                          ) : (
                            <Switch checked={a.enabled} label={`Start ${a.name} with Windows`} onChange={(next) => ask(a, next)} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            }
          </Show>
        </div>
      </Card>
    </Page>
  );
}
