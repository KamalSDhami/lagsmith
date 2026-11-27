import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Gamepad2, Info, Layers, Monitor, Power, TriangleAlert, Video, type LucideIcon } from "lucide-react";
import type { ChangeRequest, GpuAppPreference, GpuPref, SystemState } from "../types";
import { useSys } from "../lib/useSystemData";
import { Page, Empty } from "../components/Page";
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

type Mode = "best_performance" | "balanced" | "best_efficiency";
const MODE_LABEL: Record<SystemState["power"]["mode"], string> = {
  best_performance: "Best performance",
  balanced: "Balanced",
  best_efficiency: "Best power efficiency",
  unknown: "Unknown",
};

const GPU_PREF_LABEL: Record<GpuPref, string> = {
  auto: "Let Windows decide",
  power_saving: "Power saving",
  high_performance: "High performance",
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

function SettingRow({
  icon: Icon,
  title,
  desc,
  focusId,
  children,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  focusId?: string;
  children: ReactNode;
}) {
  return (
    <li data-focus-id={focusId} className="flex items-center gap-3 px-4 py-2.5">
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

function GpuPrefCard({
  onSelect,
}: {
  onSelect: (title: string, items: ReviewItem[], changes: ChangeRequest[]) => void;
}) {
  const { data, load } = useSys();
  const [customExe, setCustomExe] = useState("");
  const [customPref, setCustomPref] = useState<GpuPref>("high_performance");

  const ask = (app: Pick<GpuAppPreference, "name" | "exe">, preference: GpuPref) =>
    onSelect(
      `Set GPU preference for ${app.name}`,
      [{ label: `${app.name}: ${GPU_PREF_LABEL[preference]}`, detail: app.exe }],
      [{ kind: "gpuPreference", exe: app.exe, preference }],
    );

  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customExe.trim().replace(/^"+|"+$/g, "").trim();
    if (!trimmed) return;
    const name = trimmed.split(/[\\/]/).pop()?.replace(/\.exe$/i, "") || trimmed;
    ask({ name, exe: trimmed }, customPref);
  };

  return (
    <Card className="flex min-h-0 flex-col" aria-labelledby="gpu-pref-title" data-focus-id="gpu-pref">
      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
        <Monitor size={16} strokeWidth={ICON_STROKE} className="text-muted" aria-hidden />
        <h2 id="gpu-pref-title" className="text-[0.9375rem] font-semibold">
          Per-app GPU preference
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Show load={data.get_gpu_preferences} what="graphics preferences" onRetry={() => load("get_gpu_preferences")}>
          {(apps) =>
            apps.length === 0 ? (
              <Empty>No apps listed yet. Add an app .exe below to set its GPU preference.</Empty>
            ) : (
              <ul className="divide-y divide-line" aria-label="Per-app GPU preferences">
                {apps.map((app) => (
                  <li key={app.exe} className="flex items-center gap-2.5 px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.875rem] font-medium">{app.name}</div>
                      <div className="truncate text-[0.75rem] text-muted" title={app.exe}>
                        {app.exe}
                      </div>
                    </div>
                    <select
                      aria-label={`GPU preference for ${app.name}`}
                      value={app.preference}
                      onChange={(e) => ask(app, e.currentTarget.value as GpuPref)}
                      className="h-9 min-w-[9.5rem] shrink-0 rounded-lg border border-line bg-surface px-2 text-[0.8125rem]"
                    >
                      <option value="auto">Let Windows decide</option>
                      <option value="power_saving">Power saving</option>
                      <option value="high_performance">High performance</option>
                    </select>
                  </li>
                ))}
              </ul>
            )
          }
        </Show>
      </div>
      <form onSubmit={addCustom} className="border-t border-line px-4 py-2.5">
        <label htmlFor="game-exe" className="block text-[0.8125rem] font-medium">
          Add a game .exe
        </label>
        <div className="mt-1.5 flex items-center gap-2">
        <input
          id="game-exe"
          type="text"
          value={customExe}
          onChange={(e) => setCustomExe(e.target.value)}
          placeholder="C:\Games\Game\game.exe"
          aria-label="App .exe path"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[0.8125rem] placeholder:text-muted"
        />
        <select
          aria-label="GPU preference for new app"
          value={customPref}
          onChange={(e) => setCustomPref(e.currentTarget.value as GpuPref)}
          className="h-9 min-w-[9.5rem] rounded-lg border border-line bg-surface px-2 text-[0.8125rem]"
        >
          <option value="high_performance">High performance</option>
          <option value="power_saving">Power saving</option>
          <option value="auto">Let Windows decide</option>
        </select>
        <Button type="submit" variant="outline" disabled={!customExe.trim()}>
          Set
        </Button>
        </div>
      </form>
    </Card>
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

  // Only settings that differ from the target (or that Windows didn't report) are proposed.
  const todo: { name: string; item: ReviewItem; change: ChangeRequest }[] = [];
  if (s) {
    if (s.gameMode !== true)
      todo.push({ name: "Game Mode", item: { label: "Turn on Game Mode", detail: `Now: ${onOff(s.gameMode)}` }, change: { kind: "gameMode", on: true } });
    if (s.gameBarCapture !== false)
      todo.push({
        name: "Game Bar recording",
        item: { label: "Turn off Game Bar background recording", detail: `Now: ${onOff(s.gameBarCapture)}` },
        change: { kind: "gameBarCapture", on: false },
      });
    if (s.power.mode !== "best_performance")
      todo.push({
        name: "Power mode",
        item: { label: "Set power mode to Best performance", detail: `Now: ${MODE_LABEL[s.power.mode]}` },
        change: { kind: "powerMode", mode: "best_performance" },
      });
  }

  const applyAll = () =>
    send(
      "Gaming optimization",
      todo.map((t) => t.item),
      todo.map((t) => t.change),
    );

  return (
    <Page title="Gaming Mode" subtitle="Normal Windows settings for smoother games. Every change is reviewed first and can be undone.">
      <Card className="flex shrink-0 items-center gap-4 px-5 py-3.5">
        <span className="grid size-11 place-items-center rounded-xl bg-tile text-tile-ink">
          <Gamepad2 size={22} strokeWidth={ICON_STROKE} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[1rem] font-semibold">Optimize for gaming</h2>
          <p className="text-[0.875rem] text-muted">
            {!s
              ? "Game Mode on, Game Bar background recording off, power mode Best performance."
              : todo.length === 0
                ? "Game Mode is on, Game Bar background recording is off and power mode is Best performance."
                : `To change: ${todo.map((t) => t.name).join(", ")}.`}
          </p>
        </div>
        <Button onClick={applyAll} disabled={!s || todo.length === 0}>
          {!s ? "Review and apply" : todo.length === 0 ? "Already optimized" : `Review and apply ${todo.length === 1 ? "1 change" : `${todo.length} changes`}`}
        </Button>
      </Card>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        <div className="flex min-h-0 flex-col gap-4">
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
                  <SettingRow icon={Power} title="Power mode" desc={`Plan: ${st.power.plan}`} focusId="power-mode">
                    <select
                      aria-label="Power mode"
                      value={st.power.mode}
                      onChange={(e) => {
                        const mode = e.currentTarget.value as Mode;
                        const label = `Set power mode to ${MODE_LABEL[mode]}`;
                        send(label, [{ label, detail: `Now: ${MODE_LABEL[st.power.mode]}` }], [{ kind: "powerMode", mode }]);
                      }}
                      className="h-9 min-w-[9.5rem] rounded-lg border border-line bg-surface px-2 text-[0.8125rem]"
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
          <GpuPrefCard onSelect={send} />
        </div>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <AntiCheatCard title="VALORANT readiness" focusId="valorant" className="shrink-0">
            <Show load={sy} what="Secure Boot and TPM state" onRetry={() => load("get_system")}>
              {(st) => <Requirements s={st} />}
            </Show>
          </AntiCheatCard>

          <Card className="shrink-0">
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-[18px] px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="text-[0.9375rem] font-semibold">What Lagsmith explains but never changes</span>
                <ChevronDown size={17} strokeWidth={ICON_STROKE} aria-hidden className="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-line px-4 py-3">
                <div>
                  <h3 className="text-[0.875rem] font-semibold">Game tips (VALORANT)</h3>
                  <ul className="mt-1.5 space-y-1">
                    {TIPS.map((t) => (
                      <li key={t} className="flex items-center gap-2 text-[0.875rem]">
                        <Check size={15} strokeWidth={ICON_STROKE} className="shrink-0 text-accent" aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {sec.status === "ok" && sec.data.memoryIntegrity ? (
                      <Info size={16} strokeWidth={ICON_STROKE} className="text-info" aria-hidden />
                    ) : (
                      <TriangleAlert size={16} strokeWidth={ICON_STROKE} className="text-muted" aria-hidden />
                    )}
                    <h3 className="text-[0.875rem] font-semibold">
                      Memory Integrity is{" "}
                      {sec.status === "ok" ? (sec.data.memoryIntegrity ? "on" : "off") : sec.status === "error" ? "unknown" : "…"}
                    </h3>
                  </div>
                  <p className="mt-1 text-[0.8125rem] leading-snug text-muted">
                    It can cost some performance in games, but it blocks malicious drivers and some anti-cheats rely on it. Lagsmith
                    explains it and never changes it. You can review it in Windows Security, Device security, Core isolation.
                  </p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Layers size={16} strokeWidth={ICON_STROKE} className="text-muted" aria-hidden />
                    <h3 className="text-[0.875rem] font-semibold">Hyper-V and WSL</h3>
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
                </div>
              </div>
            </details>
          </Card>
        </div>
      </div>
    </Page>
  );
}
