import { test, expect } from "@playwright/test";
import { open, nav, expectFits, showAllFindings } from "./helpers";

test("two GPUs: dedicated is primary, both are listed, power-saving app triggers finding", async ({ page }) => {
  await open(page, "fixture=dualgpu");
  await expect(page.getByText("NVIDIA GeForce MX150")).toBeVisible();
  await expect(page.getByText("+1")).toBeVisible();
  // Dedicated primary GPU: no single-channel upgrade tip.
  await expect(page.getByText("Upgrade Tip")).toHaveCount(0);
  await showAllFindings(page);
  await expect(page.getByText("App set to power-saving graphics")).toBeVisible();
  await page.getByRole("button", { name: /Show all graphics adapters/ }).click();
  await expect(page.getByRole("dialog", { name: "Graphics adapters" })).toContainText("Used by games");
  await expect(page.getByRole("dialog", { name: "Graphics adapters" })).toContainText("Used for the display");
  await page.keyboard.press("Escape");
  await nav(page, "Hardware");
  await expect(page.getByRole("list", { name: "Graphics adapters" }).getByRole("listitem")).toHaveCount(2);
  await expectFits(page);
});

test("0 RAM sticks: channel unknown, no tip, no finding", async ({ page }) => {
  await open(page, "fixture=noram");
  await expect(page.getByText("Channel unknown")).toBeVisible();
  await expect(page.getByText("Upgrade Tip")).toHaveCount(0);
  await expect(page.getByText("Top findings")).toBeVisible();
  await showAllFindings(page);
  await expect(page.getByText("Single channel memory")).toHaveCount(0);
  await nav(page, "Hardware");
  await expect(page.getByText(/couldn't read how many memory sticks/)).toBeVisible();
});

test("bugcheck 41 blue screen without a dump", async ({ page }) => {
  await open(page, "fixture=bugcheck41");
  await nav(page, "Crash Detective");
  await expect(page.getByText("0x133")).toBeVisible();
  await expect(page.getByText(/No dump saved/)).toBeVisible();
  await expect(page.getByText("No crash dumps on this PC.")).toBeVisible();
  await expectFits(page);
});

test("every command failing shows errors, never empty or zero states", async ({ page }) => {
  await open(page, "fixture=allfail");
  await expect(page.getByText("Couldn't read stability info")).toBeVisible();
  await expect(page.getByText("Couldn't read storage info")).toBeVisible();
  await expect(page.getByText(/Some checks couldn't run/)).toBeVisible();
  await expect(page.getByText("No issues found in this scan.")).toHaveCount(0);
  await expectFits(page);

  await nav(page, "Startup Manager");
  await expect(page.getByText("Couldn't read startup apps")).toBeVisible();
  await expect(page.getByText("No startup apps found.")).toHaveCount(0);

  await nav(page, "Debloat");
  await expect(page.getByText("Couldn't read Store apps")).toBeVisible();
  await expect(page.getByText("No removable Store apps found.")).toHaveCount(0);

  await nav(page, "Gaming Mode");
  await expect(page.getByText("Couldn't read gaming settings")).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);

  await nav(page, "History & Undo");
  await expect(page.getByText("Couldn't read history")).toBeVisible();
  for (const p of ["Crash Detective", "Hardware", "Storage Cleaner", "System Repair", "Memory"]) {
    await nav(page, p);
    await expect(page.getByText(/Couldn.t read/).first()).toBeVisible();
    await expectFits(page);
  }
});

test("empty lists show empty states", async ({ page }) => {
  await open(page, "fixture=empty");
  await expect(page.getByText("0 blue screens")).toBeVisible();
  await expect(page.getByText("Stable")).toBeVisible();
  await nav(page, "Startup Manager");
  await expect(page.getByText("No startup apps found.")).toBeVisible();
  await nav(page, "Debloat");
  await expect(page.getByText("No removable Store apps found.")).toBeVisible();
  await nav(page, "Crash Detective");
  await expect(page.getByText("No blue screens recorded.")).toBeVisible();
  await expect(page.getByText("No app crashes recorded.")).toBeVisible();
  await expect(page.getByText("No anti-cheat software found.")).toBeVisible();
  await nav(page, "Hardware");
  await expect(page.getByText("No graphics adapter found").first()).toBeVisible();
  await nav(page, "Storage Cleaner");
  await expect(page.getByText("Nothing in this category.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Review & Clean/ })).toBeDisabled();
});

test("VALORANT requirements failing: Gaming note and dashboard finding", async ({ page }) => {
  await open(page, "fixture=tpmfail");
  await expect(page.getByText("VALORANT requirements not met")).toBeVisible();
  await nav(page, "Gaming Mode");
  await expect(page.getByText("Off", { exact: true })).toBeVisible();
  await expect(page.getByText("Not found", { exact: true })).toBeVisible();
  await expect(page.getByText(/VALORANT on Windows 11 needs TPM 2.0 and Secure Boot, or it shows VAN9001\/VAN9003/)).toBeVisible();
  await expect(page.getByText(/Lagsmith never changes them/)).toBeVisible();
  await expectFits(page);
});

test("VALORANT finding only appears when Vanguard or VALORANT is installed", async ({ page }) => {
  await open(page, "fixture=tpmfail&fixture=novanguard");
  await expect(page.getByText("Top findings")).toBeVisible();
  await showAllFindings(page);
  await expect(page.getByText("Recent blue screens")).toBeVisible();
  await expect(page.getByText("VALORANT requirements not met")).toHaveCount(0);
});

test("locked anti-cheat startup rows have no toggle", async ({ page }) => {
  await open(page);
  await nav(page, "Startup Manager");
  const row = page.getByTestId("startup-hklm-vanguard");
  await expect(row).toHaveAttribute("data-locked", "true");
  await expect(row.getByRole("switch")).toHaveCount(0);
  await expect(row).toContainText("Lagsmith never changes anti-cheat software");
  // Every row that mentions an anti-cheat is locked.
  for (const r of await page.getByRole("list", { name: "Startup apps" }).getByRole("listitem").all()) {
    const text = (await r.textContent()) ?? "";
    if (/vanguard|riot|vgtray/i.test(text)) await expect(r.getByRole("switch")).toHaveCount(0);
  }
});

test("anti-cheat entries with compound names are locked even when Rust says canToggle", async ({ page }) => {
  await open(page, "fixture=anticheatnames");
  await nav(page, "Startup Manager");
  for (const id of ["ac-eac", "ac-be", "ac-riotclient", "ac-faceit"]) {
    const row = page.getByTestId(`startup-${id}`);
    await expect(row).toHaveAttribute("data-locked", "true");
    await expect(row.getByRole("switch")).toHaveCount(0);
    await expect(row).toContainText("Lagsmith never changes anti-cheat software");
  }
  // A normal HKCU entry still has its switch.
  await expect(page.getByTestId("startup-hkcu-steam").getByRole("switch")).toHaveCount(1);
});

test("settings Windows didn't report show Unknown, not Off", async ({ page }) => {
  await open(page, "fixture=nullsettings");
  await nav(page, "Gaming Mode");
  const gm = page.getByRole("switch", { name: "Game Mode" });
  await expect(gm).toHaveAttribute("aria-checked", "mixed");
  await expect(gm).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Game Bar background recording" })).toHaveAttribute("aria-checked", "mixed");
  await expect(page.getByText("Unknown", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("combobox", { name: "Power mode" })).toHaveValue("unknown");
});

test("power mode Best power efficiency while plugged in: finding and Gaming note", async ({ page }) => {
  await open(page, "fixture=powersave");
  await showAllFindings(page);
  const row = page.getByRole("listitem").filter({ hasText: "Power mode is set to Best power efficiency" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Windows is limiting performance even though you're plugged in.");
  await expect(row).toContainText("(Windows power settings)");
  await row.getByRole("button", { name: "Fix in Gaming Mode" }).click();
  await expect(page.getByRole("heading", { name: "Gaming Mode", level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Power mode" })).toHaveValue("best_efficiency");
  await expect(page.getByRole("note").filter({ hasText: "Best power efficiency limits performance" })).toBeVisible();
  await expectFits(page);
});

test("power-efficiency finding is not shown on battery or in the default mock", async ({ page }) => {
  await open(page);
  await showAllFindings(page);
  await expect(page.getByText("Recent blue screens")).toBeVisible();
  await expect(page.getByText("Power mode is set to Best power efficiency")).toHaveCount(0);
});

test("worn battery: finding and amber health on Hardware", async ({ page }) => {
  await open(page, "fixture=badbattery");
  await showAllFindings(page);
  const row = page.getByRole("listitem").filter({ hasText: "Battery holds 25% of its original charge" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("12.09 Wh of 48.84 Wh design");
  await expect(row).toContainText("(Battery report)");
  await row.getByRole("button", { name: "View hardware" }).click();
  await expect(page.getByRole("heading", { name: "Hardware Overview" })).toBeVisible();
  const badge = page.getByText("Health 25%");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveClass(/text-warning/);
  await expect(page.getByText("12.09 of 48.84 Wh design")).toBeVisible();
  await expectFits(page);
});
