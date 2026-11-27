import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ScanHero } from "./components/ScanHero";
import { StatCards } from "./components/StatCards";
import { TopFindings } from "./components/TopFindings";
import { ReviewProvider } from "./components/Review";
import { MemoryPage } from "./pages/MemoryPage";
import { ScanPage } from "./pages/ScanPage";
import { CrashPage } from "./pages/CrashPage";
import { HardwarePage } from "./pages/HardwarePage";
import { StoragePage } from "./pages/StoragePage";
import { StartupPage } from "./pages/StartupPage";
import { GamingPage } from "./pages/GamingPage";
import { CloseGuard } from "./components/CloseGuard";
import { RepairPage } from "./pages/RepairPage";
import { HistoryPage } from "./pages/HistoryPage";
import { DebloatPage } from "./pages/DebloatPage";
import { type Page } from "./pages/nav";
import { NavContext, type Go } from "./lib/navContext";
import { SysContext, useSystemData, value, type Cmd } from "./lib/useSystemData";
import { greeting, shortOs } from "./lib/format";

/** Commands a page loads on first visit (the rest load at start). */
const PAGE_NEEDS: Partial<Record<Page, Cmd[]>> = {
  crash: ["list_crash_dumps"],
  memory: ["get_memory"],
  storage: ["get_caches", "get_disk_usage"],
  history: ["get_history"],
  debloat: ["get_store_apps"],
};

export default function App() {
  const [target, setTarget] = useState<{ page: Page; focus?: string; from: Page | null }>({ page: "dashboard", from: null });
  const { page } = target;
  const go: Go = (p, focus, from) => setTarget({ page: p, focus, from: from ?? null });
  const firstRender = useRef(true);
  const sys = useSystemData();
  const { data, load, ensure, scan, runScan } = sys;
  const main = useRef<HTMLElement>(null);

  const hw = value(data.get_hardware);
  const userName = hw?.userName || null;
  const osName = hw ? shortOs(hw.os) : null;

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
    ensure(...(PAGE_NEEDS[page] ?? []));
    // Keyboard and screen-reader users land on the new page heading, not on the sidebar button they pressed.
    if (!firstRender.current) main.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    firstRender.current = false;
    if (!target.focus) return;
    // Rows can arrive after the page opens (lazy loads), so wait for the target, then scroll to it and flash it.
    let tries = 0;
    let clear: number | undefined;
    const t = window.setInterval(() => {
      const el = document.querySelector(`[data-focus-id="${target.focus}"]`);
      if (el) {
        window.clearInterval(t);
        el.scrollIntoView({ block: "center" });
        el.setAttribute("data-flash", "");
        clear = window.setTimeout(() => el.removeAttribute("data-flash"), 1500);
      } else if (++tries > 40) window.clearInterval(t);
    }, 100);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(clear);
    };
  }, [target, page, ensure]);

  const startScan = () => {
    runScan();
    go("scan");
  };
  const open = (p: Page, focus?: string) => go(p, focus, "dashboard");
  const scanning = !!scan && !scan.finishedAt && !scan.cancelled;

  return (
    <SysContext.Provider value={sys}>
      <NavContext.Provider value={{ from: target.from, go }}>
      <ReviewProvider>
        <CloseGuard />
        <button
          onClick={() => main.current?.querySelector<HTMLElement>("h1")?.focus()}
          className="sr-only z-50 rounded-lg bg-surface px-3 py-2 text-[0.875rem] font-medium shadow-pop focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
        >
          Skip to content
        </button>
        <div className="flex h-full min-w-[1100px]">
          <Sidebar page={page} onNavigate={(p) => go(p)} osName={osName} scanning={scanning} finishedAt={scan?.finishedAt ?? null} onScan={startScan} />
          <main ref={main} id="main" className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex h-full max-w-[1440px] flex-col px-6 pt-5 pb-5">
              {page === "dashboard" && (
                <div className="flex flex-col gap-4">
                  <TopBar
                    title={userName ? `${greeting()}, ${userName}` : greeting()}
                    subtitle="Check your system health and see what is slowing it down for gaming."
                  />
                  <ScanHero onScan={startScan} scanning={scanning} finishedAt={scan?.finishedAt ?? null} />
                  <StatCards data={data} retry={load} onOpen={open} />
                  <TopFindings data={data} retry={load} onOpen={open} />
                </div>
              )}
              {page === "scan" && <ScanPage onStart={runScan} onOpen={(p, f) => go(p, f, "scan")} />}
              {page === "crash" && <CrashPage />}
              {page === "hardware" && <HardwarePage />}
              {page === "memory" && <MemoryPage mem={data.get_memory} onRefresh={() => load("get_memory")} />}
              {page === "storage" && <StoragePage />}
              {page === "startup" && <StartupPage />}
              {page === "gaming" && <GamingPage />}
              {page === "repair" && <RepairPage />}
              {page === "history" && <HistoryPage />}
              {page === "debloat" && <DebloatPage />}
            </div>
          </main>
        </div>
      </ReviewProvider>
      </NavContext.Provider>
    </SysContext.Provider>
  );
}
