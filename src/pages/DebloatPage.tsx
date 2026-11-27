import type { StoreApp } from "../types";
import { useSys } from "../lib/useSystemData";
import { Page, Empty } from "../components/Page";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Show } from "../components/Show";
import { useReview } from "../components/Review";

export function DebloatPage() {
  const { data, load } = useSys();
  const review = useReview();

  const remove = (a: StoreApp) =>
    review({
      title: `Remove ${a.name}`,
      warning: `This cannot be undone. Lagsmith can't restore ${a.name}; to get it back, reinstall it from the Microsoft Store. It is removed for your Windows account only.`,
      groups: [{ label: "Store app to remove", items: [{ label: a.name, detail: a.publisher }] }],
      changes: [{ kind: "removeStoreApp", id: a.id }],
    });

  return (
    <Page title="Debloat" subtitle="Leftover Microsoft Store apps. Removing one can't be undone, but you can reinstall it from the Microsoft Store.">
      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Show load={data.get_store_apps} what="Store apps" onRetry={() => load("get_store_apps")}>
            {(apps) =>
              apps.length === 0 ? (
                <Empty>No removable Store apps found.</Empty>
              ) : (
                <ul className="divide-y divide-line" aria-label="Store apps">
                  {apps.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3" data-testid={`app-${a.id}`}>
                      <span aria-hidden className="grid size-9 place-items-center rounded-lg bg-subtle text-[0.875rem] font-semibold">
                        {a.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.9375rem] font-medium">{a.name}</div>
                        <div className="truncate text-[0.8125rem] text-muted" title={a.id}>
                          {a.publisher}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => remove(a)} aria-label={`Remove ${a.name}`}>
                        Remove
                      </Button>
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
