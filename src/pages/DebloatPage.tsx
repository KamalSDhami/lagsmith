import type { StoreApp } from "../types";
import { useSys } from "../lib/useSystemData";
import { Page, Empty } from "../components/Page";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Show } from "../components/Show";
import { useReview } from "../components/Review";
import { useNav } from "../lib/navContext";

export function DebloatPage() {
  const { data, load } = useSys();
  const review = useReview();
  const { go } = useNav();

  const remove = (a: StoreApp) =>
    review({
      title: `Remove ${a.name}`,
      warning: `This cannot be undone. Lagsmith can't restore ${a.name}; to get it back, reinstall it from the Microsoft Store. It is removed for your Windows account only.`,
      groups: [{ label: "Store app to remove", items: [{ label: a.name, detail: a.publisher }] }],
      changes: [{ kind: "removeStoreApp", id: a.id }],
    });

  return (
    <Page title="Debloat" subtitle="Leftover Microsoft Store apps you can remove.">
      <p className="text-[0.875rem] text-muted">Removing an app can't be undone in Lagsmith. You can reinstall it from the Microsoft Store.</p>
      {/* The card hugs its rows: two apps should not sit in a viewport-tall box. */}
      <Card className="flex max-h-full min-h-0 flex-col self-stretch">
        <div className="min-h-0 overflow-y-auto">
          <Show load={data.get_store_apps} what="Store apps" onRetry={() => load("get_store_apps")}>
            {(apps) =>
              apps.length === 0 ? (
                <div>
                  <Empty>No removable Store apps found.</Empty>
                  <button onClick={() => go("storage")} className="mx-4 mb-4 font-medium text-accent hover:underline">
                    Free space in Storage Cleaner
                  </button>
                </div>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => remove(a)}
                        aria-label={`Remove ${a.name}`}
                        className="border-danger/40 text-danger hover:bg-danger-soft"
                      >
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
