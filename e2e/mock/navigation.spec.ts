import { test, expect } from "@playwright/test";
import { open, nav, expectFits } from "./helpers";

const cards: [string, RegExp, string][] = [
  ["Stability", /Stability: open Crash Detective/, "Crash Detective"],
  ["Storage", /Storage: open Storage Cleaner/, "Storage Cleaner"],
  ["Memory", /Memory: open Memory/, "Memory"],
  ["Graphics", /Graphics: .*Open Hardware/, "Hardware"],
  ["Startup", /Startup: open Startup Manager/, "Startup Manager"],
];

for (const [name, button, heading] of cards) {
  test(`dashboard ${name} card opens its page, shows a back link, and moves focus to the heading`, async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: button }).click();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeFocused();
    await page.getByRole("button", { name: "Back to Dashboard" }).click();
    await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  });
}

test("stat cards are keyboard reachable and show a focus ring", async ({ page }) => {
  await open(page);
  const card = page.getByRole("button", { name: /Stability: open Crash Detective/ });
  await card.focus();
  await page.keyboard.press("Tab"); // move on, then back, so :focus-visible applies
  await page.keyboard.press("Shift+Tab");
  await expect(card).toBeFocused();
  const outline = await card.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Crash Detective", level: 1 })).toBeVisible();
});

test("a finding opens the page at the item and flashes it", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("region", { name: "Top findings" }).locator("[aria-busy=false]")).toBeVisible();
  await page.getByRole("button", { name: "Find the cause" }).click();
  await expect(page.getByRole("heading", { name: "Crash Detective", level: 1 })).toBeFocused();
  const row = page.locator('[data-focus-id="crash-latest"]');
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-flash", "");
  await expect(row).not.toHaveAttribute("data-flash", "", { timeout: 4000 });
  await page.getByRole("button", { name: "Back to Dashboard" }).click();
});

test("storage and hardware findings land on their items", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("region", { name: "Top findings" }).locator("[aria-busy=false]")).toBeVisible();
  await page.getByRole("button", { name: "Free up space" }).click();
  await expect(page.locator('[data-focus-id="c-drive"]')).toHaveAttribute("data-flash", "");
  await nav(page, "Dashboard");
  await page.getByRole("button", { name: "See upgrade tip" }).click();
  await expect(page.locator('[data-focus-id="ram-tip"]')).toHaveAttribute("data-flash", "");
});

test("sidebar navigation clears the back link and moves focus to the heading", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Stability: open Crash Detective/ }).click();
  await expect(page.getByRole("button", { name: "Back to Dashboard" })).toBeVisible();
  await nav(page, "Memory");
  await expect(page.getByRole("heading", { name: "Memory", level: 1 })).toBeFocused();
  await expect(page.getByRole("button", { name: "Back to Dashboard" })).toHaveCount(0);
});

test("crash range filters counts, timeline and lists by their own timestamps", async ({ page }) => {
  await open(page, "fixture=oldcrash");
  await nav(page, "Crash Detective");
  const legend = page.getByRole("list", { name: "Legend" });
  // 30 days: the blue screen from 12 days ago and the app crash from 20 days ago are included.
  await expect(legend).toContainText(/Blue screen\s*3/);
  await expect(legend).toContainText(/App crash\s*3/);
  await expect(page.getByText("0x116")).toBeVisible();
  await expect(page.getByText("old_game.exe")).toBeVisible();

  await page.getByRole("tab", { name: "Last 7 days" }).click();
  await expect(legend).toContainText(/Blue screen\s*2/);
  await expect(legend).toContainText(/App crash\s*2/);
  await expect(page.getByText("0x116")).toHaveCount(0);
  await expect(page.getByText("old_game.exe")).toHaveCount(0);
  await expect(page.getByText("0xCE")).toBeVisible();
  await expect(page.getByRole("img", { name: /days with events in the last 7 days/ })).toBeVisible();
  // Driver resets have no per-day dates, so they stay a 30-day count.
  await expect(legend).toContainText("30 days, no dates");
  await expectFits(page);

  await page.getByRole("tab", { name: "Last 30 days" }).click();
  await expect(legend).toContainText(/Blue screen\s*3/);
});

test("7 days is the dashboard window: the dashboard and the 7-day range agree", async ({ page }) => {
  await open(page, "fixture=oldcrash");
  await expect(page.getByText("2 blue screens").first()).toBeVisible();
  await page.getByRole("button", { name: /Stability: open Crash Detective/ }).click();
  await page.getByRole("tab", { name: "Last 7 days" }).click();
  await expect(page.getByRole("list", { name: "Legend" })).toContainText(/Blue screen\s*2/);
});

test("startup anti-cheat rows stay locked and the machine-wide wording is honest", async ({ page }) => {
  await open(page);
  await nav(page, "Startup Manager");
  const vg = page.getByTestId("startup-hklm-vanguard");
  await expect(vg).toContainText("Lagsmith never changes anti-cheat software");
  await expect(vg.getByRole("switch")).toHaveCount(0);
  await expect(page.getByTestId("startup-hklm-securityhealth").getByRole("switch")).toHaveCount(0);
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);
});
