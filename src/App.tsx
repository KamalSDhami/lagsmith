import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ScanHero } from "./components/ScanHero";
import { StatCards } from "./components/StatCards";
import { TopFindings } from "./components/TopFindings";
import { MemoryPage } from "./pages/MemoryPage";
import { Placeholder } from "./pages/Placeholder";
import { pageLabel, type Page } from "./pages/nav";
import { useSystemData } from "./lib/useSystemData";
import { greeting, shortOs } from "./lib/format";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const { data, load, loadAll, busy } = useSystemData();
  const main = useRef<HTMLElement>(null);

  const hw = data.get_hardware.status === "ok" ? data.get_hardware.data : undefined;
  const userName = hw?.userName || null;
  const osName = hw ? shortOs(hw.os) : null;

  useEffect(() => {
    main.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <div className="flex h-full min-w-[1100px]">
      <Sidebar page={page} onNavigate={setPage} osName={osName} />
      <main ref={main} className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-6 pt-5 pb-5">
          {page === "dashboard" && (
            <>
              <TopBar
                title={userName ? `${greeting()}, ${userName}` : greeting()}
                subtitle="Check your system health and see what is slowing it down for gaming."
                userName={userName}
              />
              <ScanHero onScan={loadAll} scanning={busy} />
              <StatCards data={data} retry={load} />
              <TopFindings data={data} retry={load} onOpen={setPage} />
            </>
          )}
          {page === "memory" && <MemoryPage mem={data.get_memory} onRefresh={() => load("get_memory")} />}
          {page !== "dashboard" && page !== "memory" && <Placeholder title={pageLabel(page)} />}
        </div>
      </main>
    </div>
  );
}
