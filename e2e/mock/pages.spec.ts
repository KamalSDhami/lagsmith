import { test, expect } from "@playwright/test";
import { open, nav, expectFits } from "./helpers";

// One test per page: it renders, key real values from the mock appear, and it fits 1366x700.

test("dashboard", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Kamal");
  await expect(page.getByText("2 blue screens").first()).toBeVisible();
  await expect(page.getByText("12.2 GB free").first()).toBeVisible();
  await expect(page.getByText("of 158.6 GB (C:)")).toBeVisible();
  await expect(page.getByText("Intel UHD 620")).toBeVisible();
  await expect(page.getByText("1 stick · Single channel")).toBeVisible();
  await expect(page.getByText("4 apps")).toBeVisible();
  await expect(page.getByText("Up to date")).toBeVisible();
  await expect(page.getByText("Recent blue screens")).toBeVisible();
  // The sidebar footer no longer shows the OS name (it is on Hardware).
  await expect(page.getByText("Windows 11", { exact: true })).toHaveCount(0);
  await expect(page.getByText("System Ready")).toHaveCount(0);
  await expectFits(page);
});

test("scan PC runs every step and ends with a summary", async ({ page }) => {
  await open(page, "", 400);
  await page.getByRole("button", { name: "Scan Now" }).click();
  await expect(page.getByRole("heading", { name: "Scanning your PC…" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Scan progress" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel scan" })).toBeVisible();
  await expectFits(page);
  await expect(page.getByRole("heading", { name: "Scan complete" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("progressbar", { name: "Scan progress" })).toHaveAttribute("aria-valuenow", "100");
  const steps = page.getByRole("list", { name: "Scan steps" }).getByRole("listitem");
  await expect(steps).toHaveCount(5);
  for (const s of await steps.all()) await expect(s).toHaveAttribute("data-state", "done");
  await expect(page.getByTestId("elapsed")).toHaveText(/^\d\d:\d\d$/);
  await expect(page.getByTestId("scan-summary")).toContainText("2 blue screens in 7 days");
  await expect(page.getByText("412,000")).toHaveCount(0);
  await expectFits(page);
  await page.getByRole("button", { name: /View all \d+ findings/ }).click();
  await expect(page.getByText("Top findings")).toBeVisible();
});

test("scan PC can be cancelled", async ({ page }) => {
  await open(page, "", 3000);
  await page.getByRole("button", { name: "Scan Now" }).click();
  await page.getByRole("button", { name: "Cancel scan" }).click();
  await expect(page.getByText("Scan cancelled.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start scan" })).toBeVisible();
});

test("crash detective", async ({ page }) => {
  await open(page);
  await nav(page, "Crash Detective");
  await expect(page.getByText("0xCE")).toBeVisible();
  await expect(page.getByText("0x50")).toBeVisible();
  await expect(page.getByRole("list", { name: "Legend" })).toContainText(/Blue screen\s*2/);
  await expect(page.getByRole("list", { name: "Legend" })).toContainText(/Unexpected shutdown\s*3/);
  await expect(page.getByText("vgm.exe")).toBeVisible();
  await expect(page.getByText("in flutter_windows.dll")).toBeVisible();
  await expect(page.getByText("112526-10921-01.dmp")).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze dumps" })).toBeEnabled();
  await expect(page.getByText(/coming next build/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Riot Vanguard running" })).toBeVisible();
  await expect(page.getByRole("img", { name: /days with events/ })).toBeVisible();
  await expectFits(page);
});

test("hardware", async ({ page }) => {
  await open(page);
  await nav(page, "Hardware");
  await expect(page.getByText("Intel Core i7-8650U")).toBeVisible();
  await expect(page.getByText("4 cores · 8 threads")).toBeVisible();
  await expect(page.getByText(/BIOS N24ET81W/)).toBeVisible();
  await expect(page.getByText("1 stick of 2 slots · Single channel")).toBeVisible();
  await expect(page.getByText("Managed by Windows")).toBeVisible();
  await expect(page.getByText("No battery data")).toBeVisible();
  await expect(page.getByText(/single 8 GB stick/)).toBeVisible();
  await expectFits(page);
});

test("hardware shows battery figures only when they exist", async ({ page }) => {
  await open(page, "fixture=battery");
  await nav(page, "Hardware");
  await expect(page.getByText("65% (Plugged in)")).toBeVisible();
  await expect(page.getByText("48 of 57 Wh design")).toBeVisible();
  await expect(page.getByText("Health 84%")).toBeVisible();
});

test("memory", async ({ page }) => {
  await open(page);
  await nav(page, "Memory");
  await expect(page.getByText("7.8 GB")).toBeVisible();
  await expect(page.getByText("Google Chrome")).toBeVisible();
  await expect(page.getByText(/doesn't automatically 'clean' RAM/)).toBeVisible();
  await expectFits(page);
});

test("storage cleaner", async ({ page }) => {
  await open(page);
  await nav(page, "Storage Cleaner");
  await expect(page.getByTestId("potential")).toHaveText("19.6 GB");
  await expect(page.getByText("Gradle caches")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select npm cache" })).toBeChecked();
  // The default tab only lists rows that can be cleaned; nothing is "not available yet".
  await expect(page.getByText("Not available yet")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review 5 items" })).toBeEnabled();
  await expectFits(page);
  await page.getByRole("tab", { name: /Move/ }).click();
  await expect(page.getByText("Ubuntu").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Move Ubuntu" })).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText("18.3 GB").first()).toBeVisible();
  await page.getByRole("tab", { name: /Yours/ }).click();
  await expect(page.getByText("Downloads").first()).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expectFits(page);
});

test("storage: clicking a row toggles it (the whole row is the target)", async ({ page }) => {
  await open(page);
  await nav(page, "Storage Cleaner");
  const box = page.getByRole("checkbox", { name: "Select npm cache" });
  await page.getByText("Developer cache (safe, refills itself)").first().click();
  await expect(box).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Review 4 items" })).toBeVisible();
});

test("startup manager", async ({ page }) => {
  await open(page);
  await nav(page, "Startup Manager");
  await expect(page.getByRole("list", { name: "Startup apps" }).getByRole("listitem")).toHaveCount(9);
  await expect(page.getByText("Kapy Notes")).toBeVisible();
  await expect(page.getByTestId("startup-hklm-securityhealth")).toContainText("Machine-wide entry: change it in Task Manager > Startup apps");
  await expect(page.getByText("Impact")).toHaveCount(0);
  await expectFits(page);
});

test("gaming mode", async ({ page }) => {
  await open(page);
  await nav(page, "Gaming Mode");
  await expect(page.getByRole("switch", { name: "Game Mode" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Game Bar background recording" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("combobox", { name: "Power mode" })).toHaveValue("balanced");
  await expect(page.getByText("VALORANT readiness")).toBeVisible();
  await expect(page.getByText(/VAN9001/)).toHaveCount(0);
  // The explain-only notes sit in a disclosure that starts closed.
  await expect(page.getByText("Memory Integrity is on")).toBeHidden();
  await page.getByText("What Lagsmith explains but never changes").click();
  await expect(page.getByText("Memory Integrity is on")).toBeVisible();
  await expect(page.getByText(/Hyper-V is running, and WSL has Ubuntu installed/)).toBeVisible();
  await expect(page.getByText("Riot Vanguard (vgk)")).toBeVisible();
  await expectFits(page);
});

test("system repair", async ({ page }) => {
  await open(page);
  await nav(page, "System Repair");
  await expect(page.getByText("Repaired", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run SFC" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Run DISM" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Create Restore Point" })).toBeEnabled();
  await expect(page.getByText(/Available in the next build/)).toHaveCount(0);
  await expectFits(page);
});

test("history & undo starts empty", async ({ page }) => {
  await open(page);
  await nav(page, "History & Undo");
  await expect(page.getByText("No changes yet. Lagsmith hasn't changed anything on this PC.")).toBeVisible();
  await expectFits(page);
});

test("debloat", async ({ page }) => {
  await open(page);
  await nav(page, "Debloat");
  await expect(page.getByText("Get Help")).toBeVisible();
  await expect(page.getByText("Clipchamp")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Get Help" })).toBeEnabled();
  await expectFits(page);
});
