import { test, expect, type Page } from "@playwright/test";
import { open } from "./helpers";

const sidebar = (page: Page) => page.getByRole("complementary", { name: "Sidebar" });
const width = (page: Page) => sidebar(page).evaluate((el) => el.getBoundingClientRect().width);

test("sample data banner shows outside Tauri, in the banner and the sidebar", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("status").filter({ hasText: "Sample data." })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("not this PC");
  await expect(sidebar(page)).toContainText("Sample data");
});

test("sidebar is 240 wide at 1366 and a 64 px rail below 1200, with hysteresis", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await expect.poll(() => width(page)).toBe(240);
  await page.setViewportSize({ width: 1150, height: 768 });
  await expect.poll(() => width(page)).toBe(64);
  // 1210 is inside the 24 px hysteresis band: stays a rail.
  await page.setViewportSize({ width: 1210, height: 768 });
  await page.waitForTimeout(400);
  expect(await width(page)).toBe(64);
  await page.setViewportSize({ width: 1230, height: 768 });
  await expect.poll(() => width(page)).toBe(240);
});

test("rail icons keep their names, show a tooltip on hover and focus, and never expand on hover", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await open(page);
  const crash = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Crash Detective" });
  await crash.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Crash Detective");
  expect(await width(page)).toBe(64);
  await page.mouse.move(700, 400);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings", exact: true }).focus();
  await expect(page.getByRole("tooltip")).toHaveText("Settings");
});

test("finding dots mark pages with an open finding, in the rail too", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await open(page);
  await expect(page.getByTestId("dot-crash")).toBeVisible();
  await expect(page.getByTestId("dot-storage")).toBeVisible();
  await expect(page.getByTestId("dot-hardware")).toHaveCount(0);
});

test("Ctrl+B toggles the sidebar and the choice survives a reload", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await expect.poll(() => width(page)).toBe(240);
  await page.keyboard.press("Control+b");
  await expect.poll(() => width(page)).toBe(64);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await expect.poll(() => width(page)).toBe(64);
  await page.keyboard.press("Control+b");
  await expect.poll(() => width(page)).toBe(240);
  // An explicit "expanded" overrides the narrow-window rule.
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.waitForTimeout(300);
  expect(await width(page)).toBe(240);
});

test("active nav item shows aria-current and the toggle button reports its state", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await expect(page.getByRole("button", { name: "Dashboard", exact: true })).toHaveAttribute("aria-current", "page");
  const toggle = page.getByRole("button", { name: "Collapse sidebar" });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toHaveAttribute("aria-expanded", "false");
});

test("theme switch applies instantly, persists, and System follows the OS", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page);
  const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  expect(await theme()).toBe("light");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.getByRole("radio", { name: "Dark" }).click();
  expect(await theme()).toBe("dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(22, 22, 22)");
  await page.reload();
  expect(await theme()).toBe("dark"); // applied by theme-init.js before the app loads
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "System" }).click();
  expect(await theme()).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(theme).toBe("dark");
});

test("no flash: the theme is set before the app script runs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lagsmith.theme", "dark"));
  await page.goto("/");
  await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(22, 22, 22)");
});

test("settings: sidebar choice, auto-clean switch and threshold stepper", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: "Collapsed" }).click();
  await expect.poll(() => width(page)).toBe(64);
  await page.getByRole("radio", { name: "Automatic" }).click();
  await expect.poll(() => width(page)).toBe(240);

  const sw = page.getByRole("switch", { name: "Auto-clean memory" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Raise threshold by 5 percent" })).toBeDisabled();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Raise threshold by 5 percent" }).click();
  await expect(page.getByLabel("Threshold")).toHaveText("90%");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Threshold")).toHaveText("90%");
  await expect(page.getByRole("switch", { name: "Auto-clean memory" })).toHaveAttribute("aria-checked", "true");
});

test("settings is a flow page: no horizontal scroll, no nested scroll areas", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await open(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeFocused();
  const m = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const nested = [...main.querySelectorAll<HTMLElement>("*")].filter((el) => {
      const o = getComputedStyle(el).overflowY;
      return (o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight;
    });
    return { overflowX: document.documentElement.scrollWidth > window.innerWidth, nested: nested.length };
  });
  expect(m.overflowX).toBe(false);
  expect(m.nested).toBe(0);
});

test("the focus ring is visible on rail and expanded nav buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await open(page);
  const btn = page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Scan PC" });
  await page.keyboard.press("Tab");
  await btn.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(btn).toBeFocused();
  expect(await btn.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
});
