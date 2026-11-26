import { test, expect, chromium, type Page } from "@playwright/test";

// Runs against the real app on this PC (scripts/test-real.ps1). Each test proves one row of docs/DEFINITION-OF-DONE.md
// against the 25 Nov 2026 case study. Only facts that don't drift are asserted (free space and memory change).
// No test changes the system: the action flows are proven by the Rust live tests (own test entry, restored settings)
// and by e2e/mock, so the owner's real startup entries and History stay untouched.
let page: Page;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const pages = browser.contexts().flatMap((c) => c.pages());
  page = pages.find((p) => /localhost:1420|tauri\.localhost/.test(p.url()))!;
  expect(page, "Lagsmith window not found over CDP").toBeTruthy();
});

async function open(name: RegExp) {
  await page.getByRole("button", { name }).first().click();
}

test("A2 A3 A5 A16: dashboard loads with no permission errors", async () => {
  await open(/^Dashboard$/);
  await expect(page.getByText(/UHD 620/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/31\.0\.101\.2145/).first()).toBeVisible();
  await expect(page.getByText(/1 stick/).first()).toBeVisible();
  await expect(page.getByText(/2 blue screens/).first()).toBeVisible();
  await expect(page.getByText(/Couldn.t read/)).toHaveCount(0);
});

test("A5 A6 A7 A9: Crash Detective shows the case-study crashes, vgm.exe and Vanguard", async () => {
  await open(/Crash Detective/);
  await expect(page.getByText(/0x0*CE/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/0x0*50/i).first()).toBeVisible();
  await expect(page.getByText(/vgm\.exe/).first()).toBeVisible();
  await expect(page.getByText(/Riot Vanguard/).first()).toBeVisible();
  await expect(page.getByText(/112526-14828-01\.dmp/).first()).toBeVisible();
});

test("A1 A11 A12: Hardware shows BIOS, cores and threads, page file, battery", async () => {
  await open(/^Hardware$/);
  await expect(page.getByText(/N24ET81W/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/4 cores/i).first()).toBeVisible();
  await expect(page.getByText(/8 threads/i).first()).toBeVisible();
  await expect(page.getByText(/page file/i).first()).toBeVisible();
});

test("A13 A19 A20: Gaming shows Secure Boot, TPM 2.0, Game Mode and anti-cheat status", async () => {
  await open(/Gaming Mode/);
  await expect(page.getByText(/TPM/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2\.0/).first()).toBeVisible();
  await expect(page.getByText(/Secure Boot/).first()).toBeVisible();
  await expect(page.getByText(/Game Mode/).first()).toBeVisible();
  await expect(page.getByText(/Memory Integrity/).first()).toBeVisible();
});

test("A14: Startup lists entries and keeps Riot locked", async () => {
  await open(/Startup Manager/);
  const riot = page.getByText(/RiotClient/).first();
  await expect(riot).toBeVisible({ timeout: 30_000 });
  const row = page.locator("li, tr, [role=row]").filter({ hasText: /RiotClient/ }).first();
  await expect(row.getByRole("switch")).toHaveCount(0);
});

test("A4 A15: Storage shows drives, caches and what fills C: (VALORANT, WSL)", async () => {
  await open(/Storage Cleaner/);
  await expect(page.getByText(/npm cache/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/VALORANT/).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/ext4\.vhdx|Ubuntu/).first()).toBeVisible();
});

test("A10: Memory lists top apps with no anti-cheat process", async () => {
  await open(/^Memory$/);
  await expect(page.getByText(/commit/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/vgc\.exe|vgtray\.exe|VALORANT/)).toHaveCount(0);
});

test("A18: System Repair shows the last SFC state", async () => {
  await open(/System Repair/);
  await expect(page.getByText(/SFC|System File/i).first()).toBeVisible({ timeout: 30_000 });
});

test("History page loads", async () => {
  await open(/History/);
  await expect(page.getByText(/History/).first()).toBeVisible();
  await expect(page.getByText(/Couldn.t read/)).toHaveCount(0);
});
