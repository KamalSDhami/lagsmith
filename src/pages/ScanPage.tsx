import { useEffect, useState } from "react";
import { ArrowRight, Check, CircleCheck, CircleX, LoaderCircle, Play } from "lucide-react";
import { SCAN_STEPS, useSys, value, type ScanCmdState } from "../lib/useSystemData";
import { Page } from "../components/Page";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { cn } from "../lib/cn";
import { formatElapsed, formatGB, plural } from "../lib/format";
import { blueScreensLast7Days, deriveFindings, systemDrive } from "../lib/derive";
import { ICON_STROKE, type Page as PageId } from "./nav";

type StepState = "pending" | "running" | "done" | "error";

function stepState(states: ScanCmdState[]): StepState {
  if (states.every((s) => s === "ok")) return "done";
  if (states.every((s) => s !== "pending")) return "error";
  return states.some((s) => s !== "pending") ? "running" : "pending";
}

function Ring({ pct }: { pct: number }) {
  const r = 70;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-[12.5rem] place-items-center" role="progressbar" aria-label="Scan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <svg viewBox="0 0 160 160" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="80" cy="80" r={r} fill="none" stroke="#ececf1" strokeWidth="12" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#5b58dc"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span className="text-[2.5rem] font-semibold tracking-tight tabular-nums">{pct}%</span>
    </div>
  );
}

export function ScanPage({ onStart, onOpen }: { onStart: () => void; onOpen: (p: PageId, focus?: string) => void }) {
  const { scan, cancelScan, data } = useSys();
  const [now, setNow] = useState(() => Date.now());
  const running = !!scan && !scan.finishedAt && !scan.cancelled;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const live = scan && !scan.cancelled ? scan : null;
  const idle = !live;
  const cmds = live?.cmds ?? {};
  const steps = SCAN_STEPS.map((s) => ({ ...s, state: stepState(s.cmds.map((c) => cmds[c] ?? "pending")) }));
  const doneCmds = Object.values(cmds).filter((s) => s !== "pending").length;
  const total = SCAN_STEPS.reduce((n, s) => n + s.cmds.length, 0);
  const pct = idle ? 0 : Math.round((doneCmds / total) * 100);
  const elapsed = live ? (live.finishedAt ?? now) - live.startedAt : 0;
  const stepsDone = steps.filter((s) => s.state === "done" || s.state === "error").length;
  const failed = steps.filter((s) => s.state === "error").length;

  const stab = value(data.get_stability);
  const storage = value(data.get_storage);
  const drive = storage ? systemDrive(storage.drives) : undefined;
  const findings = deriveFindings({
    stability: value(data.get_stability),
    storage,
    hardware: value(data.get_hardware),
    startup: value(data.get_startup),
    security: value(data.get_security),
    system: value(data.get_system),
    anticheat: value(data.get_anticheat),
    gpuPreferences: value(data.get_gpu_preferences),
  });

  const top = findings[0];

  return (
    <Page
      title={idle ? "Scan PC" : running ? "Scanning your PC…" : "Scan complete"}
      subtitle={idle ? "Read crash history, hardware, storage, memory and startup in one pass." : "Reading crash history, hardware, storage, memory and startup data."}
      className="justify-center"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-10 px-6">
        <Ring pct={pct} />
        <Card>
          <ul className="divide-y divide-line" aria-label="Scan steps">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 px-5 py-3" data-state={s.state}>
                {s.state === "done" && <CircleCheck size={20} strokeWidth={ICON_STROKE} className="text-success" aria-hidden />}
                {s.state === "error" && <CircleX size={20} strokeWidth={ICON_STROKE} className="text-danger" aria-hidden />}
                {s.state === "running" && (
                  <LoaderCircle size={20} strokeWidth={ICON_STROKE} className="text-muted motion-safe:animate-spin" aria-hidden />
                )}
                {s.state === "pending" && <span aria-hidden className="size-5 rounded-full border-2 border-line" />}
                <span className="flex-1 text-[0.9375rem]">{s.label}</span>
                <span
                  className={cn(
                    "flex items-center gap-1 text-[0.875rem]",
                    s.state === "done" ? "text-success" : s.state === "error" ? "text-danger" : "text-muted",
                  )}
                >
                  {s.state === "done" && <Check size={15} strokeWidth={ICON_STROKE} aria-hidden />}
                  {{ done: "Done", error: "Couldn't read", running: "Reading…", pending: idle ? "Not run" : "Pending" }[s.state]}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mx-auto grid w-full max-w-[40rem] grid-cols-2 divide-x divide-line text-center">
        <div>
          <div className="text-[1.375rem] font-semibold tabular-nums">
            {stepsDone} of {steps.length}
          </div>
          <div className="text-[0.875rem] text-muted">Steps completed</div>
        </div>
        <div>
          <div className="text-[1.375rem] font-semibold tabular-nums" data-testid="elapsed">
            {formatElapsed(elapsed)}
          </div>
          <div className="text-[0.875rem] text-muted">Elapsed time</div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        {scan?.cancelled && <p className="text-[0.875rem] text-muted">Scan cancelled. Results that already arrived are kept.</p>}
        {idle ? (
          <>
            <Button size="lg" onClick={onStart}>
              <Play size={18} strokeWidth={ICON_STROKE} aria-hidden />
              Start scan
            </Button>
            <p className="text-[0.875rem] text-muted">Lagsmith only reads. Nothing on your PC changes during a scan.</p>
          </>
        ) : running ? (
          <Button variant="outline" onClick={cancelScan}>
            Cancel scan
          </Button>
        ) : (
          <Card className="flex w-full max-w-[40rem] items-center justify-between gap-6 px-5 py-4" data-testid="scan-summary">
            <div className="text-[0.875rem]">
              <div className="font-semibold">{findings.length === 1 ? "1 finding" : `${findings.length} findings`}{top ? `. Top: ${top.title}` : ""}</div>
              <div className="text-muted">
                {stab ? plural(blueScreensLast7Days(stab), "blue screen", "blue screens") + " in 7 days" : "Crash history unavailable"}
                {drive ? ` · ${formatGB(drive.freeBytes)} free on ${drive.letter}` : ""}
                {failed > 0 ? ` · ${plural(failed, "step", "steps")} couldn't read` : ""}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {top?.action && (
                <Button onClick={() => onOpen(top.action!.page, top.action!.focus)}>
                  {top.action.label}
                  <ArrowRight size={16} strokeWidth={ICON_STROKE} aria-hidden />
                </Button>
              )}
              <Button variant={top?.action ? "outline" : "primary"} onClick={() => onOpen("dashboard")}>
                {findings.length > 1 ? `View all ${findings.length} findings` : "View results"}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </Page>
  );
}
