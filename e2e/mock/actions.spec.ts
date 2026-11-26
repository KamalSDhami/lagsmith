import { test, expect, type Page } from "@playwright/test";
import { open, nav } from "./helpers";

const sheet = (page: Page) => page.getByRole("dialog");

async function expectHistoryEmpty(page: Page) {
  await nav(page, "History & Undo");
  await expect(page.getByText("No changes yet. Lagsmith hasn't changed anything on this PC.")).toBeVisible();
}

test("storage: review, apply, results; caches can't be undone", async ({ page }) => {
  await open(page);
  await nav(page, "Storage Cleaner");
  await expect(page.getByTestId("potential")).toHaveText("19.6 GB");
  await page.getByRole("button", { name: /Review & Clean/ }).click();

  const d = sheet(page);
  await expect(d.getByRole("heading", { name: "Review: Storage cleanup" })).toBeVisible();
  await expect(d).toContainText("5 changes, 19.6 GB to free");
  await expect(d).toContainText("Developer caches");
  await expect(d).toContainText("System caches");
  await expect(d).toContainText("Gradle caches");
  await d.getByRole("button", { name: "Apply changes" }).click();

  await expect(d.getByRole("heading", { name: "Results" })).toBeVisible();
  await expect(d.getByTestId("results")).toContainText("Clear npm cache");
  await expect(d.getByTestId("results")).toContainText("Done");
  await expect(d).toContainText("Space freed: 19.6 GB");
  await expect(d.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await d.getByRole("button", { name: "Close" }).click();

  // Data re-read after the change.
  await expect(page.getByText("31.8 GB free of 158.6 GB")).toBeVisible();
  await nav(page, "History & Undo");
  const set = page.getByRole("list", { name: "Change history" }).getByRole("listitem").first();
  await expect(set).toContainText("Storage cleanup");
  await expect(set).toContainText("19.6 GB freed");
  await expect(set.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("startup: single-item review, apply, undo from results", async ({ page }) => {
  await open(page);
  await nav(page, "Startup Manager");
  const row = page.getByTestId("startup-hkcu-discord");
  await expect(row).toContainText("Off");
  await row.getByRole("switch", { name: "Start Discord with Windows" }).click();

  const d = sheet(page);
  await expect(d).toContainText("1 change");
  await expect(d).toContainText("Turn on Discord");
  await d.getByRole("button", { name: "Apply changes" }).click();
  await expect(d.getByTestId("results")).toContainText("Turn on Discord at startup");
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");

  await d.getByRole("button", { name: "Undo" }).click();
  await expect(d.getByRole("heading", { name: "Changes undone" })).toBeVisible();
  await d.getByRole("button", { name: "Close" }).click();
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "false");

  await nav(page, "History & Undo");
  const set = page.getByRole("list", { name: "Change history" }).getByRole("listitem").first();
  await expect(set).toContainText("Undone");
  await expect(set.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("gaming: Apply Optimization as one set, undo from History with confirmation", async ({ page }) => {
  await open(page);
  await nav(page, "Gaming Mode");
  await page.getByRole("button", { name: "Apply Optimization" }).click();

  const d = sheet(page);
  await expect(d.getByRole("heading", { name: "Review: Gaming optimization" })).toBeVisible();
  await expect(d).toContainText("3 changes");
  await expect(d).toContainText("Set power mode to Best performance");
  await d.getByRole("button", { name: "Apply changes" }).click();
  const r = d.getByTestId("results");
  await expect(r).toContainText("Set power mode to Best performance");
  await expect(r).toContainText("Already on");
  await expect(r).toContainText("Skipped");
  await d.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("combobox", { name: "Power mode" })).toHaveValue("best_performance");

  await nav(page, "History & Undo");
  const set = page.getByRole("list", { name: "Change history" }).getByRole("listitem").first();
  await expect(set).toContainText("Gaming optimization");
  await set.getByRole("button", { name: /Show details/ }).click();
  await expect(set).toContainText("Turn off Game Bar background recording");
  await set.getByRole("button", { name: "Undo" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm undo" });
  await expect(confirm).toContainText('Undo "Gaming optimization"?');
  await confirm.getByRole("button", { name: "Undo changes" }).click();
  await expect(confirm).toBeHidden();
  await expect(set).toContainText("Undone");

  await nav(page, "Gaming Mode");
  await expect(page.getByRole("combobox", { name: "Power mode" })).toHaveValue("balanced");
});

test("gaming: a single toggle goes through review", async ({ page }) => {
  await open(page);
  await nav(page, "Gaming Mode");
  await page.getByRole("switch", { name: "Game Bar background recording" }).click();
  const d = sheet(page);
  await expect(d).toContainText("1 change");
  await d.getByRole("button", { name: "Apply changes" }).click();
  await expect(d.getByTestId("results")).toContainText("Turn on Game Bar background recording");
  await expect(page.getByRole("switch", { name: "Game Bar background recording" })).toHaveAttribute("aria-checked", "true");
  await d.getByRole("button", { name: "Undo" }).click();
  await expect(d.getByRole("heading", { name: "Changes undone" })).toBeVisible();
  await d.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("switch", { name: "Game Bar background recording" })).toHaveAttribute("aria-checked", "false");
});

test("gaming: Game Mode off, then undo restores it", async ({ page }) => {
  await open(page);
  await nav(page, "Gaming Mode");
  const gm = page.getByRole("switch", { name: "Game Mode" });
  await expect(gm).toHaveAttribute("aria-checked", "true");
  await gm.click();
  const d = sheet(page);
  await expect(d).toContainText("Turn off Game Mode");
  await d.getByRole("button", { name: "Apply changes" }).click();
  await expect(d.getByTestId("results")).toContainText("Done");
  await expect(gm).toHaveAttribute("aria-checked", "false");
  await d.getByRole("button", { name: "Undo" }).click();
  await expect(d.getByRole("heading", { name: "Changes undone" })).toBeVisible();
  await d.getByRole("button", { name: "Close" }).click();
  await expect(gm).toHaveAttribute("aria-checked", "true");
});

test("Cancel changes nothing", async ({ page }) => {
  await open(page);
  await nav(page, "Startup Manager");
  const sw = page.getByTestId("startup-hkcu-steam").getByRole("switch");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await sheet(page).getByRole("button", { name: "Cancel" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(sw).toHaveAttribute("aria-checked", "true");

  await nav(page, "Gaming Mode");
  await page.getByRole("button", { name: "Apply Optimization" }).click();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Power mode" })).toHaveValue("balanced");

  await expectHistoryEmpty(page);
});

test("a running protected game: refusal message, nothing changes", async ({ page }) => {
  await open(page, "fixture=gameRunning");
  await nav(page, "Storage Cleaner");
  await page.getByRole("button", { name: /Review & Clean/ }).click();
  await sheet(page).getByRole("button", { name: "Apply changes" }).click();
  const alert = sheet(page).getByRole("alert");
  await expect(alert).toContainText("Lagsmith didn't apply these changes");
  await expect(alert).toContainText("VALORANT is running");
  await sheet(page).getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("potential")).toHaveText("19.6 GB");
  await expectHistoryEmpty(page);
});

test("locked startup rows explain why and have no toggle", async ({ page }) => {
  await open(page);
  await nav(page, "Startup Manager");
  await expect(page.getByTestId("startup-hklm-vanguard").getByRole("switch")).toHaveCount(0);
  await expect(page.getByTestId("startup-hklm-vanguard")).toContainText("Lagsmith never changes anti-cheat software");
  await expect(page.getByTestId("startup-hklm-securityhealth").getByRole("switch")).toHaveCount(0);
  await expect(page.getByTestId("startup-hklm-securityhealth")).toContainText("Needs admin (coming soon)");
});
