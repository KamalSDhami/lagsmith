import { test, expect, chromium, type Page } from "@playwright/test";

// Runs against the real app on this PC (see scripts/test-real.ps1). Asserts only facts that don't drift:
// the 25 Nov 2026 case-study crashes, the GPU and driver, the RAM layout. Free space and memory change, so they aren't asserted.
let page: Page;

test.beforeAll(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const pages = browser.contexts().flatMap((c) => c.pages());
  page = pages.find((p) => p.url().startsWith("http://localhost:1420") || p.url().startsWith("http://tauri.localhost"))!;
  expect(page, "Lagsmith window not found over CDP").toBeTruthy();
});

test("every scan command is allowed and returns data", async () => {
  await expect(page.getByText(/UHD 620/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2 blue screens/).first()).toBeVisible();
  // An IPC permission denial surfaces as a "Couldn't read ..." error state on a card.
  await expect(page.getByText(/Couldn.t read/)).toHaveCount(0);
});

test("dashboard shows the real crash and hardware facts", async () => {
  await expect(page.getByText(/31\.0\.101\.2145/).first()).toBeVisible();
  await expect(page.getByText(/1 stick/).first()).toBeVisible();
  await expect(page.getByText(/Single channel/).first()).toBeVisible();
});
