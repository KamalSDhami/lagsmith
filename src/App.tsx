import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ScanHero } from "./components/ScanHero";
import { StatCards } from "./components/StatCards";
import { TopFindings } from "./components/TopFindings";
import { ReviewProvider } from "./components/Review";
import { MemoryPage } from "./pages/MemoryPage";
import { Placeholder } from "./pages/Placeholder";
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
import { pageLabel, type Page } from "./pages/nav";
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
  const [page, setPage] = useState<Page>("dashboard");
  const sys = useSystemData();
  const { data, load, ensure, scan, runScan } = sys;
  const main = useRef<HTMLElement>(null);

  const hw = value(data.get_hardware);
  const userName = hw?.userName || null;
  const osName = hw ? shortOs(hw.os) : null;

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
    ensure(...(PAGE_NEEDS[page] ?? []));
  }, [page, ensure]);

  const startScan = () => {
    runScan();
    setPage("scan");
  };
  const scanning = !!scan && !scan.finishedAt && !scan.cancelled;

  return (
    <SysContext.Provider value={sys}>
      <ReviewProvider>
        <CloseGuard />
        <div className="flex h-full min-w-[1100px]">
          <Sidebar page={page} onNavigate={setPage} osName={osName} />
          <main ref={main} className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex h-full max-w-[1440px] flex-col px-6 pt-5 pb-5">
              {page === "dashboard" && (
                <div>
                  <TopBar
                    title={userName ? `${greeting()}, ${userName}` : greeting()}
                    subtitle="Check your system health and see what is slowing it down for gaming."
                    userName={userName}
                  />
                  <ScanHero onScan={startScan} scanning={scanning} />
                  <StatCards data={data} retry={load} />
                  <TopFindings data={data} retry={load} onOpen={setPage} />
                </div>
              )}
              {page === "scan" && <ScanPage onStart={runScan} onOpen={setPage} />}
              {page === "crash" && <CrashPage />}
              {page === "hardware" && <HardwarePage />}
              {page === "memory" && <MemoryPage mem={data.get_memory} onRefresh={() => load("get_memory")} />}
              {page === "storage" && <StoragePage />}
              {page === "startup" && <StartupPage />}
              {page === "gaming" && <GamingPage />}
              {page === "repair" && <RepairPage />}
              {page === "history" && <HistoryPage />}
              {page === "debloat" && <DebloatPage />}
              {page === "settings" && <Placeholder title={pageLabel(page)} />}
            </div>
          </main>
        </div>
      </ReviewProvider>
    </SysContext.Provider>
  );
}
