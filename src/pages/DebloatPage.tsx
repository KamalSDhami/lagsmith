import { useSys } from "../lib/useSystemData";
import { Page, Empty, NextBuild } from "../components/Page";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Show } from "../components/Show";

export function DebloatPage() {
  const { data, load } = useSys();
  return (
    <Page title="Debloat" subtitle="Leftover Microsoft Store apps. Removed apps can be reinstalled from the Microsoft Store.">
      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Show load={data.get_store_apps} what="Store apps" onRetry={() => load("get_store_apps")}>
            {(apps) =>
              apps.length === 0 ? (
                <Empty>No removable Store apps found.</Empty>
              ) : (
                <ul className="divide-y divide-line" aria-label="Store apps">
                  {apps.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                      <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-subtle text-[0.875rem] font-semibold">
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.9375rem] font-medium">{a.name}</div>
                        <div className="truncate text-[0.8125rem] text-muted" title={a.id}>
                          {a.publisher}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <Button variant="outline" size="sm" disabled>
                          Remove
                        </Button>
                        <NextBuild />
                      </div>
                    </li>
                  ))}
                </ul>
              )
            }
          </Show>
        </div>
      </Card>
    </Page>
  );
}
