import { expect, type Page } from "@playwright/test";

/** Open the app with mock data. `query` adds fixtures, e.g. "fixture=dualgpu&fixture=noram". */
export async function open(page: Page, query = "", delay = 50) {
  const q = [`delay=${delay}`, query].filter(Boolean).join("&");
  await page.goto(`/?${q}`);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

export async function nav(page: Page, label: string) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: label, exact: true }).click();
  await expect(page.locator("main h1").first()).toBeVisible();
}

/** No horizontal scroll, and the page fits the 1366x700 window without vertical scrolling. */
export async function expectFits(page: Page) {
  const m = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    return {
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      sh: main.scrollHeight,
      ch: main.clientHeight,
    };
  });
  expect(m.overflowX, "horizontal scroll").toBe(false);
  expect(m.sh, "page content taller than the window").toBeLessThanOrEqual(m.ch + 1);
}

/** Waits for the findings to load, then expands the list if it's collapsed. */
export async function showAllFindings(page: Page) {
  const section = page.getByRole("region", { name: "Top findings" });
  await expect(section.locator("[aria-busy=false]")).toBeVisible();
  const viewAll = section.getByRole("button", { name: /View all/ });
  if (await viewAll.count()) await viewAll.click();
}
