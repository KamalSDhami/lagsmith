import type { ReactNode } from "react";
import { AddRegular, SubtractRegular } from "@fluentui/react-icons";
import { Page, SectionTitle } from "../components/Page";
import { Card } from "../components/ui/card";
import { Segmented } from "../components/ui/segmented";
import { Switch } from "../components/ui/switch";
import { inTauri } from "../lib/api";
import { useSettings, type SidebarPref, type ThemePref } from "../lib/settings";
import pkg from "../../package.json";

/** One settings row: label + one-line description left, control right, min height 56 (spec 9.10). */
function Row({ label, description, children, id }: { label: string; description?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div id={id} className="flex min-h-14 items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <p className="text-body font-medium">{label}</p>
        {description && <p className="text-secondary text-muted">{description}</p>}
      </div>
      {children !== undefined && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      <Card className="divide-y divide-line">{children}</Card>
    </section>
  );
}

const THEMES: { id: ThemePref; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];
const SIDEBARS: { id: SidebarPref; label: string }[] = [
  { id: "auto", label: "Automatic" },
  { id: "expanded", label: "Expanded" },
  { id: "collapsed", label: "Collapsed" },
];

function Stepper({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const set = (v: number) => onChange(Math.min(95, Math.max(60, v)));
  const btn =
    "grid size-8 place-items-center rounded-[8px] border border-line bg-surface hover:bg-subtle disabled:opacity-50 disabled:hover:bg-surface";
  return (
    <div role="group" aria-label="Clean when memory use passes" className="flex items-center gap-2">
      <button className={btn} disabled={disabled || value <= 60} onClick={() => set(value - 5)} aria-label="Lower threshold by 5 percent">
        <SubtractRegular fontSize={16} aria-hidden />
      </button>
      <output aria-label="Threshold" className="tnum w-12 text-center text-body font-medium">
        {value}%
      </output>
      <button className={btn} disabled={disabled || value >= 95} onClick={() => set(value + 5)} aria-label="Raise threshold by 5 percent">
        <AddRegular fontSize={16} aria-hidden />
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { settings, sidebar, update, setSidebar } = useSettings();
  const { autoClean } = settings;

  return (
    <Page title="Settings" subtitle="Changes apply as soon as you make them.">
      <div className="flex max-w-[720px] flex-col gap-6">
        <Section title="General">
          <Row label="Start Lagsmith with Windows" description="Adds a per-user startup entry. Switch it off here to remove it.">
            <Switch
              label="Start Lagsmith with Windows"
              checked={settings.startWithWindows}
              onChange={(v) => update({ startWithWindows: v })}
            />
          </Row>
        </Section>

        <Section title="Appearance">
          <Row label="Theme" description="System follows your Windows light or dark setting.">
            <Segmented label="Theme" items={THEMES} value={settings.theme} onChange={(theme) => update({ theme })} />
          </Row>
          <Row label="Sidebar" description="Automatic collapses to icons when the window is narrower than 1200 px. Ctrl+B toggles it.">
            <Segmented label="Sidebar" items={SIDEBARS} value={sidebar} onChange={setSidebar} />
          </Row>
        </Section>

        <Section title="Memory">
          <Row
            label="Auto-clean memory"
            description="Paused during games. Never touches game or anti-cheat processes. No timer. Can cause brief slowdowns when apps reload."
          >
            <Switch
              label="Auto-clean memory"
              checked={autoClean.enabled}
              onChange={(enabled) => update({ autoClean: { ...autoClean, enabled } })}
            />
          </Row>
          <Row
            label="Clean when memory use passes"
            description={autoClean.enabled ? "Cleans once when use crosses this level, then waits until it drops 10 points." : "Turn on Auto-clean to set a level."}
          >
            <Stepper
              value={autoClean.thresholdPercent}
              disabled={!autoClean.enabled}
              onChange={(thresholdPercent) => update({ autoClean: { ...autoClean, thresholdPercent } })}
            />
          </Row>
        </Section>

        <Section title="Permissions">
          <Row label="Admin helper" description="Lagsmith asks for admin permission once per action. It never keeps admin rights." />
        </Section>

        <Section title="About">
          <Row label="Version">
            <span className="tnum text-body text-muted">{pkg.version}</span>
          </Row>
          <Row label="Licences" description="Lagsmith is MIT licensed. Third-party notices are in THIRD-PARTY-NOTICES.md in the project repository." />
          <Row
            label="Privacy"
            description="Lagsmith reads Windows event logs, hardware data and folder sizes on this PC. Nothing is sent anywhere."
          />
          <Row label="Project">
            <code className="text-muted">github.com/KamalSDhami/lagsmith</code>
          </Row>
          {!inTauri && <Row label="Data" description="Sample data. This is a preview with made-up values, not this PC." />}
        </Section>
      </div>
    </Page>
  );
}
