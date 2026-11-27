// Screenshots every page of the mock UI at the two supported window sizes into test-results/ui/ (gitignored).
// Needs the Vite mock server on :1420 (npm run dev). Usage: node scripts/screenshots.mjs [query]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const query = process.argv[2] ?? "";
const sizes = [
  [1366, 768],
  [1100, 700],
];
const pages = ["Dashboard", "Scan PC", "Crash Detective", "Hardware", "Memory", "Storage Cleaner", "Startup Manager", "Gaming Mode", "System Repair", "Debloat", "History & Undo"];
mkdirSync("test-results/ui", { recursive: true });

const browser = await chromium.launch();
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(`http://localhost:1420/?delay=50${query ? `&${query}` : ""}`);
  await page.getByRole("navigation", { name: "Main" }).waitFor();
  await page.waitForTimeout(800);
  for (const name of pages) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true }).click();
    await page.waitForTimeout(name === "Storage Cleaner" ? 2600 : 500);
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
    await page.screenshot({ path: `test-results/ui/${slug}-${w}.png` });
    const over = await page.evaluate(() => {
      const m = document.querySelector("main");
      return m.scrollHeight - m.clientHeight;
    });
    if (over > 1) console.log(`${name} ${w}x${h}: page scrolls by ${over}px`);
  }
  await page.close();
}
await browser.close();
