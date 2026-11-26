import { Box, ShieldCheck, type LucideIcon } from "lucide-react";
import type { SfcResult } from "../types";
import { useSys } from "../lib/useSystemData";
import { Page, NextBuild } from "../components/Page";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge, type Tone } from "../components/ui/badge";
import { Show } from "../components/Show";
import { formatDate, formatTime } from "../lib/format";
import { ICON_STROKE } from "./nav";

const OUTCOME: Record<SfcResult["outcome"], { label: string; tone: Tone; text: string }> = {
  no_problems: { label: "No problems", tone: "success", text: "Windows Resource Protection found no integrity violations." },
  repaired: { label: "Repaired", tone: "success", text: "SFC found corrupt files and repaired them." },
  could_not_repair: {
    label: "Could not repair",
    tone: "danger",
    text: "SFC found corrupt files it couldn't fix. Running DISM first usually gives SFC a clean source.",
  },
  unknown: { label: "Unknown", tone: "neutral", text: "The last SFC result couldn't be read from the CBS log." },
};

function Tool({ icon: Icon, title, desc, run }: { icon: LucideIcon; title: string; desc: string; run: string }) {
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-tile text-tile-ink">
          <Icon size={22} strokeWidth={ICON_STROKE} aria-hidden />
        </span>
        <div>
          <h2 className="text-[1rem] font-semibold">{title}</h2>
          <p className="text-[0.875rem] text-muted">{desc}</p>
        </div>
      </div>
      <Button variant="outline" disabled className="mt-4 w-full">
        {run}
      </Button>
      <NextBuild className="mt-1.5 text-center">Needs the admin helper. Available in the next build</NextBuild>
    </Card>
  );
}

export function RepairPage() {
  const { data, load } = useSys();
  return (
    <Page title="System Repair" subtitle="Check and repair Windows system files. Both tools take 10 to 60 minutes and need admin rights.">
      <div className="grid shrink-0 grid-cols-2 gap-3">
        <Tool icon={ShieldCheck} title="Check System Files (SFC)" desc="Scans protected Windows files and repairs corrupt ones." run="Run SFC" />
        <Tool icon={Box} title="Repair Windows Image (DISM)" desc="Repairs the component store that SFC repairs from." run="Run DISM" />
      </div>
      <Card className="mt-3 p-5">
        <h2 className="text-[1rem] font-semibold">Last results</h2>
        <div className="mt-3 grid grid-cols-2 gap-6">
          <section aria-label="Last SFC result">
            <h3 className="text-[0.875rem] font-medium">System File Checker</h3>
            <Show load={data.get_system} what="the last SFC result" onRetry={() => load("get_system")}>
              {(s) =>
                s.lastSfc ? (
                  <div className="mt-1.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={OUTCOME[s.lastSfc.outcome].tone}>{OUTCOME[s.lastSfc.outcome].label}</Badge>
                      <span className="text-[0.8125rem] text-muted" title={formatTime(s.lastSfc.time)}>
                        {formatDate(s.lastSfc.time)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[0.875rem] text-muted">{OUTCOME[s.lastSfc.outcome].text}</p>
                    <p className="mt-1 text-[0.75rem] text-muted">Source: CBS log</p>
                  </div>
                ) : (
                  <p className="mt-1.5 text-[0.875rem] text-muted">No SFC run found in the CBS log.</p>
                )
              }
            </Show>
          </section>
          <section aria-label="Last DISM result">
            <h3 className="text-[0.875rem] font-medium">DISM</h3>
            <p className="mt-1.5 text-[0.875rem] text-muted">Lagsmith can't read past DISM results yet. They'll appear here after you run DISM from Lagsmith.</p>
          </section>
        </div>
      </Card>
    </Page>
  );
}
