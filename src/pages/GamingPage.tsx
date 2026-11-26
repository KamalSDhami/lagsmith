import { Check, Gamepad2, Info, Layers, Power, ShieldCheck, TriangleAlert, Video, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ChangeRequest, SystemState } from "../types";
import { useSys } from "../lib/useSystemData";
import { Page } from "../components/Page";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Switch } from "../components/ui/switch";
import { Show } from "../components/Show";
import { AntiCheatCard } from "../components/AntiCheatCard";
import { useReview, type ReviewItem } from "../components/Review";
import { valorantRequirements, VALORANT_NOTE } from "../lib/requirements";
import { powerHoldsBack } from "../lib/derive";
import { ICON_STROKE } from "./nav";
import { cn } from "../lib/cn";

type Mode = "best_performance" | "balanced" | "best_efficiency";
const MODE_LABEL: Record<SystemState["power"]["mode"], string> = {
  best_performance: "Best performance",
  balanced: "Balanced",
  best_efficiency: "Best power efficiency",
  unknown: "Unknown",
};

const TIPS = [
  "Use low in-game graphics settings",
  "Turn off V-Sync",
  "Cap FPS at your screen's refresh rate",
  "Keep the graphics driver up to date",
  "Use fullscreen mode, not windowed",
];

function onOff(v: boolean | null) {
  return v === null ? "Unknown" : v ? "On" : "Off";
}

function SettingRow({ icon: Icon, title, desc, children }: { icon: LucideIcon; title: string; desc: string; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-tile text-tile-ink">
        <Icon size={16} strokeWidth={ICON_STROKE} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[0.875rem] font-medium">{title}</div>
        <div className="truncate text-[0.8125rem] text-muted">{desc}</div>
      </div>
      {children}
    </li>
  );
}

function Requirements({ s }: { s: SystemState }) {
  const r = valorantRequirements(s);
  const tone = (c: "pass" | "fail" | "unknown") => (c === "pass" ? "success" : c === "fail" ? "warning" : "neutral");
  return (
    <>
      <dl className="space-y-1.5 px-4 pb-2 text-[0.875rem]">
        <div className="flex items-center justify-between">
          <dt>Secure Boot</dt>
          <dd>
            <Badge tone={tone(r.secureBoot.state)}>{r.secureBoot.label}</Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>TPM</dt>
          <dd>
            <Badge tone={tone(r.tpm.state)}>{r.tpm.label}</Badge>
          </dd>
        </div>
      </dl>
      {r.failing && (
        <p role="note" className="mx-3 mb-3 rounded-lg bg-warning-soft px-3 py-2 text-[0.8125rem] leading-snug text-warning">
          {VALORANT_NOTE} Lagsmith never changes them.
        </p>
      )}
    </>
  );
}

export function GamingPage() {
  const { data, load } = useSys();
  const review = useReview();
  const sy = data.get_system;
  const s = sy.status === "ok" ? sy.data : undefined;
  const sec = data.get_security;

  const send = (title: string, items: ReviewItem[], changes: ChangeRequest[]) =>
    review({ title, groups: [{ label: "Windows gaming settings", items }], changes });

  const applyAll = () => {
    if (!s) return;
    send(
      "Gaming optimization",
      [
        { label: "Turn on Game Mode", detail: `Now: ${onOff(s.gameMode)}` },
        { label: "Turn off Game Bar background recording", detail: `Now: ${onOff(s.gameBarCapture)}` },
        { label: "Set power mode to Best performance", detail: `Now: ${MODE_LABEL[s.power.mode]}` },
      ],
      [
        { kind: "gameMode", on: true },
        { kind: "gameBarCapture", on: false },
        { kind: "powerMode", mode: "best_performance" },
      ],
    );
  };

  return (
    <Page title="Gaming Mode" subtitle="Normal Windows settings for smoother games. Every change is reviewed first and can be undone.">
      <Card className="flex shrink-0 items-center gap-4 px-5 py-3.5">
        <span className="grid size-11 place-items-center rounded-xl bg-tile text-tile-ink">
          <Gamepad2 size={22} strokeWidth={ICON_STROKE} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[1rem] font-semibold">Optimize for gaming</h2>
          <p className="text-[0.875rem] text-muted">Game Mode on, Game Bar background recording off, power mode Best performance.</p>
        </div>
        <Button onClick={applyAll} disabled={!s}>
          Apply Optimization
        </Button>
      </Card>

      <div className="mt-3 grid min-h-0 flex-1 grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <div className="flex min-h-0 flex-col gap-3">
          <Card className="shrink-0">
            <h2 className="px-4 pt-3 pb-1 text-[0.9375rem] font-semibold">Optimization settings</h2>
            <Show load={sy} what="gaming settings" onRetry={() => load("get_system")}>
              {(st) => (
                <ul className="divide-y divide-line">
                  <SettingRow icon={Gamepad2} title="Game Mode" desc="Prioritize system resources for games">
                    <Switch
                      checked={st.gameMode}
                      label="Game Mode"
                      onChange={(on) =>
                        send(on ? "Turn on Game Mode" : "Turn off Game Mode", [{ label: on ? "Turn on Game Mode" : "Turn off Game Mode" }], [
                          { kind: "gameMode", on },
                        ])
                      }
                    />
                  </SettingRow>
                  <SettingRow icon={Video} title="Game Bar recording" desc="Background recording costs CPU and disk">
                    <Switch
                      checked={st.gameBarCapture}
                      label="Game Bar background recording"
                      onChange={(on) => {
                        const label = on ? "Turn on Game Bar background recording" : "Turn off Game Bar background recording";
                        send(label, [{ label }], [{ kind: "gameBarCapture", on }]);
                      }}
                    />
                  </SettingRow>
                  <SettingRow icon={Power} title="Power mode" desc={`Plan: ${st.power.plan}`}>
                    <select
                      aria-label="Power mode"
                      value={st.power.mode}
                      onChange={(e) => {
                        const mode = e.currentTarget.value as Mode;
                        const label = `Set power mode to ${MODE_LABEL[mode]}`;
                        send(label, [{ label, detail: `Now: ${MODE_LABEL[st.power.mode]}` }], [{ kind: "powerMode", mode }]);
                      }}
                      className="h-8 rounded-lg border border-line bg-surface px-2 text-[0.8125rem]"
                    >
                      {st.power.mode === "unknown" && (
                        <option value="unknown" disabled>
                          Unknown
                        </option>
                      )}
                      <option value="best_performance">Best performance</option>
                      <option value="balanced">Balanced</option>
                      <option value="best_efficiency">Best power efficiency</option>
                    </select>
                  </SettingRow>
                  {powerHoldsBack(st.power) && (
                    <li role="note" className="mx-3 my-2 rounded-lg bg-warning-soft px-3 py-2 text-[0.8125rem] leading-snug text-warning">
                      Best power efficiency limits performance even though you're plugged in. Switch to Best performance before
                      gaming.
                    </li>
                  )}
                </ul>
              )}
            </Show>
          </Card>
          <Card className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="flex items-center gap-2">
              <Layers size={16} strokeWidth={ICON_STROKE} className="text-muted" aria-hidden />
              <h2 className="text-[0.9375rem] font-semibold">Hyper-V and WSL</h2>
            </div>
            {s ? (
              <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                Hyper-V is {s.hyperVRunning ? "running" : "not running"}
                {s.wslDistros.length > 0 ? `, and WSL has ${s.wslDistros.join(", ")} installed` : ""}.{" "}
                {s.hyperVRunning
                  ? "Virtualization can cost a little game performance. Lagsmith explains it and leaves it as is."
                  : "Nothing to note."}
              </p>
            ) : (
              <p className="mt-1 text-[0.8125rem] text-muted">{sy.status === "error" ? "Couldn't read Hyper-V state" : "Reading…"}</p>
            )}
          </Card>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <AntiCheatCard className="min-h-0 flex-1" />
          <Card className="shrink-0" aria-labelledby="req-title">
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <ShieldCheck size={16} strokeWidth={ICON_STROKE} className="text-muted" aria-hidden />
              <h2 id="req-title" className="text-[0.9375rem] font-semibold">
                VALORANT requirements
              </h2>
            </div>
            <Show load={sy} what="Secure Boot and TPM state" onRetry={() => load("get_system")}>
              {(st) => <Requirements s={st} />}
            </Show>
          </Card>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <Card className="shrink-0 px-4 py-3">
            <h2 className="text-[0.9375rem] font-semibold">Game tips</h2>
            <p className="mt-0.5 text-[0.8125rem] font-medium text-muted">VALORANT</p>
            <ul className="mt-1.5 space-y-1">
              {TIPS.map((t) => (
                <li key={t} className="flex items-center gap-2 text-[0.875rem]">
                  <Check size={15} strokeWidth={ICON_STROKE} className="shrink-0 text-accent" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
          <Card className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-3")}>
            <div className="flex items-center gap-2">
              {sec.status === "ok" && sec.data.memoryIntegrity ? (
                <Info size={16} strokeWidth={ICON_STROKE} className="text-info" aria-hidden />
              ) : (
                <TriangleAlert size={16} strokeWidth={ICON_STROKE} className="text-muted" aria-hidden />
              )}
              <h2 className="text-[0.9375rem] font-semibold">
                Memory Integrity is{" "}
                {sec.status === "ok" ? (sec.data.memoryIntegrity ? "on" : "off") : sec.status === "error" ? "unknown" : "…"}
              </h2>
            </div>
            <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
              It can cost some performance in games, but it blocks malicious drivers and some anti-cheats rely on it. Lagsmith
              explains it and never changes it. You can review it in Windows Security, Device security, Core isolation.
            </p>
          </Card>
        </div>
      </div>
    </Page>
  );
}
