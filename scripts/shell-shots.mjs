// Shell screenshots (sidebar, banner, Settings, dark mode) into test-results/shell/ (gitignored).
// Needs the Vite mock server on :1420 (npm run dev). Usage: node scripts/shell-shots.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const sizes = [
  [1366, 768],
  [1100, 700],
  [1280, 720],
];
const pages = ["Dashboard", "Storage Cleaner", "Settings"];
mkdirSync("test-results/shell", { recursive: true });

const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto("http://localhost:1420/?delay=50");
    await page.getByRole("navigation", { name: "Main" }).waitFor();
    await page.waitForTimeout(800);
    for (const name of pages) {
      const nav = name === "Settings" ? page.getByRole("button", { name, exact: true }) : page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true });
      await nav.click();
      await page.waitForTimeout(name === "Storage Cleaner" ? 2600 : 500);
      const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
      await page.screenshot({ path: `test-results/shell/sample-${slug}-${w}-${scheme}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
