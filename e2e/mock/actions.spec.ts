import { test, expect, type Page } from "@playwright/test";
import { open, nav, expectFits } from "./helpers";

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

test("admin: SFC streams progress across navigation, locks other tasks, refreshes lastSfc", async ({ page }) => {
  await open(page, "", 350);
  await nav(page, "System Repair");
  await expect(page.getByRole("region", { name: "Last SFC result" })).toContainText("Repaired");

  await page.getByRole("button", { name: "Run SFC" }).click();
  const sfcCard = page.getByTestId("admin-card-sfc");
  await expect(sfcCard.getByRole("progressbar", { name: "Check System Files (SFC) progress" })).toBeVisible();
  await expect(sfcCard).toContainText("Verification 45% complete", { timeout: 5000 });
  await expect(page.getByRole("button", { name: /Waiting for SFC/ })).toHaveCount(2);
  await expect(page.getByTestId("admin-card-dism-restorehealth").getByRole("button")).toBeDisabled();
  await expect(page.getByTestId("admin-card-restore-point").getByRole("button")).toBeDisabled();

  // Single-task lock and progress survive navigating to another page and back.
  await nav(page, "Crash Detective");
  await expect(page.getByRole("button", { name: /Waiting for SFC/ })).toBeDisabled();
  await nav(page, "System Repair");

  await expect(sfcCard).toContainText("No problems", { timeout: 5000 });
  await expect(sfcCard).toContainText("Windows Resource Protection did not find any integrity violations.");
  await expect(page.getByRole("region", { name: "Last SFC result" })).toContainText("No problems");
  await expect(page.getByRole("button", { name: "Run DISM" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Create Restore Point" })).toBeEnabled();
  await expectFits(page);
});

test("admin: DISM succeeds and updates Last results", async ({ page }) => {
  await open(page);
  await nav(page, "System Repair");
  await page.getByRole("button", { name: "Run DISM" }).click();

  const dismCard = page.getByTestId("admin-card-dism-restorehealth");
  await expect(dismCard).toContainText("Repaired");
  await expect(dismCard).toContainText("DISM completed the Windows image repair.");

  const lastDism = page.getByRole("region", { name: "Last DISM result" });
  await expect(lastDism).toContainText("Repaired");
  await expect(lastDism).toContainText("DISM completed the Windows image repair.");
  await expect(lastDism).toContainText("Source: this session");
  await expectFits(page);
});

test("admin: DISM reports missing source files with alert and exit code", async ({ page }) => {
  await open(page, "fixture=dismMissing");
  await nav(page, "System Repair");
  await page.getByRole("button", { name: "Run DISM" }).click();

  const dismCard = page.getByTestId("admin-card-dism-restorehealth");
  await expect(dismCard).toContainText("Source missing");
  await expect(dismCard.getByRole("alert")).toContainText("0x800F081F");

  const lastDism = page.getByRole("region", { name: "Last DISM result" });
  await expect(lastDism).toContainText("Source missing");
  await expect(lastDism).toContainText("Exit 0x800F081F");
  await expectFits(page);
});

test("admin: Create Restore Point completes", async ({ page }) => {
  await open(page);
  await nav(page, "System Repair");
  await page.getByRole("button", { name: "Create Restore Point" }).click();

  const rpCard = page.getByTestId("admin-card-restore-point");
  await expect(rpCard).toContainText("Created");
  await expect(rpCard).toContainText("Created a Windows restore point.");
  await expectFits(page);
});

test("admin: failure shows inline alert on Repair card", async ({ page }) => {
  await open(page, "fail=run_admin_task");
  await nav(page, "System Repair");
  await page.getByRole("button", { name: "Run SFC" }).click();

  const alert = page.getByTestId("admin-card-sfc").getByRole("alert");
  await expect(alert).toContainText("Mock failure: run_admin_task");
  await expect(page.getByRole("button", { name: "Run SFC" })).toBeEnabled();
});

test("admin: Analyze dumps streams progress and displays suspect modules", async ({ page }) => {
  await open(page, "", 250);
  await nav(page, "Crash Detective");
  await page.getByRole("button", { name: "Analyze dumps" }).click();

  await expect(page.getByRole("progressbar", { name: "Dump analysis progress" })).toBeVisible();
  const list = page.getByRole("list", { name: "Analyzed crash dumps" });
  await expect(list).toBeVisible({ timeout: 5000 });
  await expect(list).toContainText("112526-10921-01.dmp");
  await expect(list).toContainText("0xCE");
  await expect(list).toContainText("vgk.sys · unloaded");
  await expect(list).toContainText("112426-11078-01.dmp");
  await expect(list).toContainText("0x50");
  await expect(list).toContainText("vgk.sys · loaded");
  await expect(list).toContainText("Cause: vgk.sys");
  await expectFits(page);
});

test("admin: Analyze dumps handles empty dump folder", async ({ page }) => {
  await open(page, "fixture=bugcheck41");
  await nav(page, "Crash Detective");
  await page.getByRole("button", { name: "Analyze dumps" }).click();
  await expect(page.getByText("No crash dumps found in C:\\Windows\\Minidump.")).toBeVisible();
  await expectFits(page);
});

test("admin: running protected game refuses admin tasks with alert", async ({ page }) => {
  await open(page, "fixture=gameRunning");
  await nav(page, "System Repair");
  await page.getByRole("button", { name: "Run SFC" }).click();

  const sfcAlert = page.getByTestId("admin-card-sfc").getByRole("alert");
  await expect(sfcAlert).toContainText("VALORANT is running");
  await expect(page.getByRole("region", { name: "Last SFC result" })).toContainText("Repaired");

  await nav(page, "Crash Detective");
  await page.getByRole("button", { name: "Analyze dumps" }).click();
  await expect(page.getByRole("alert")).toContainText("VALORANT is running");
});

test("gaming: per-app GPU preference goes through review and undo", async ({ page }) => {
  await open(page, "fixture=dualgpu");
  await nav(page, "Gaming Mode");
  const select = page.getByRole("combobox", { name: "GPU preference for VALORANT" });
  await expect(select).toHaveValue("power_saving");
  await select.selectOption("high_performance");

  const d = sheet(page);
  await expect(d.getByRole("heading", { name: "Review: Set GPU preference for VALORANT" })).toBeVisible();
  await d.getByRole("button", { name: "Apply changes" }).click();
  await expect(d.getByTestId("results")).toContainText("High performance");
  await d.getByRole("button", { name: "Undo" }).click();
  await expect(d.getByRole("heading", { name: "Changes undone" })).toBeVisible();
  await d.getByRole("button", { name: "Close" }).click();
  await expect(select).toHaveValue("power_saving");

  // Add a custom .exe path through the Review sheet.
  await page.getByRole("textbox", { name: "App .exe path" }).fill("D:\\Games\\Apex\\r5apex.exe");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await expect(d.getByRole("heading", { name: "Review: Set GPU preference for r5apex" })).toBeVisible();
  await d.getByRole("button", { name: "Apply changes" }).click();
  await d.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("combobox", { name: "GPU preference for r5apex" })).toHaveValue("high_performance");
  await expectFits(page);
});

test("debloat: removal review says it cannot be undone; result offers reinstall, History has no undo", async ({ page }) => {
  await open(page);
  await nav(page, "Debloat");
  await page.getByRole("button", { name: "Remove Get Help" }).click();

  const d = sheet(page);
  await expect(d.getByRole("heading", { name: "Review: Remove Get Help" })).toBeVisible();
  await expect(d.getByRole("note")).toContainText("This cannot be undone");
  await expect(d.getByRole("note")).toContainText("Microsoft Store");
  await d.getByRole("button", { name: "Apply changes" }).click();

  const r = d.getByTestId("results");
  await expect(r).toContainText("Removed Get Help");
  const link = r.getByRole("link", { name: "Reinstall from Microsoft Store" });
  await expect(link).toHaveAttribute("href", "ms-windows-store://pdp/?PFN=Microsoft.GetHelp_8wekyb3d8bbwe");
  await expect(d.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await d.getByRole("button", { name: "Close" }).click();

  await expect(page.getByTestId("app-Microsoft.GetHelp")).toHaveCount(0);
  await expect(page.getByTestId("app-Clipchamp.Clipchamp")).toBeVisible();
  await expectFits(page);

  await nav(page, "History & Undo");
  const set = page.getByRole("list", { name: "Change history" }).getByRole("listitem").first();
  await expect(set).toContainText("Remove Get Help");
  await expect(set.getByRole("button", { name: "Undo" })).toBeDisabled();
  await set.getByRole("button", { name: /Show details/ }).click();
  await expect(set.getByRole("link", { name: "Reinstall from Microsoft Store" })).toBeVisible();
});

test("debloat: refused while a protected game runs, app stays listed", async ({ page }) => {
  await open(page, "fixture=gameRunning");
  await nav(page, "Debloat");
  await page.getByRole("button", { name: "Remove Clipchamp" }).click();
  await sheet(page).getByRole("button", { name: "Apply changes" }).click();
  await expect(sheet(page).getByRole("alert")).toContainText("VALORANT is running");
  await sheet(page).getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("app-Clipchamp.Clipchamp")).toBeVisible();
  await expectHistoryEmpty(page);
});

test("storage: move a WSL distro to D:, review warns about shutdown, undo moves it back", async ({ page }) => {
  await open(page);
  await nav(page, "Storage Cleaner");
  await page.getByRole("tab", { name: /Move data/ }).click();
  await page.getByRole("button", { name: "Move Ubuntu" }).click();

  const form = page.getByRole("dialog", { name: "Move WSL distro" });
  await expect(form).toContainText("Move Ubuntu to another drive");
  await expect(form).toContainText("D: 26.9 GB free");
  await expect(form.getByLabel("Folder")).toHaveValue("D:\\WSL\\Ubuntu");
  await form.getByRole("button", { name: "Review move" }).click();

  const d = sheet(page);
  await expect(d.getByRole("note")).toContainText("shut down Ubuntu first");
  await expect(d).toContainText("To D:\\WSL\\Ubuntu");
  await d.getByRole("button", { name: "Apply changes" }).click();
  await expect(d.getByTestId("results")).toContainText("Moved WSL distro Ubuntu to D:\\WSL\\Ubuntu");
  await expect(page.getByTitle("D:\\WSL\\Ubuntu\\ext4.vhdx").first()).toBeVisible({ timeout: 10_000 });

  // Undo shuts the distro down, so it is only offered from History, behind a confirmation.
  await expect(d).toContainText("To undo, use History & Undo");
  await expect(d.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await d.getByRole("button", { name: "Close" }).click();
  await nav(page, "History & Undo");
  const set = page.getByRole("list", { name: "Change history" }).getByRole("listitem").first();
  await set.getByRole("button", { name: "Undo" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm undo" });
  await expect(confirm).toContainText("shuts that distro down first");
  await confirm.getByRole("button", { name: "Undo changes" }).click();
  await expect(confirm).toBeHidden();
  await expect(set).toContainText("Undone");
  await nav(page, "Storage Cleaner");
  await page.getByRole("tab", { name: /Move data/ }).click();
  await expect(page.getByTitle("C:\\Users\\Kamal\\AppData\\Local\\wsl\\Ubuntu\\ext4.vhdx").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTitle("D:\\WSL\\Ubuntu\\ext4.vhdx")).toHaveCount(0);
  await expectFits(page);
});

test("storage: WSL move refuses an unknown drive and a game folder", async ({ page }) => {
  await open(page);
  await nav(page, "Storage Cleaner");
  await page.getByRole("tab", { name: /Move data/ }).click();
  for (const [target, why] of [
    ["E:\\WSL\\Ubuntu", "isn't a local fixed drive"],
    ["D:\\Riot Games\\wsl", "never moves WSL into game"],
  ]) {
    await page.getByRole("button", { name: "Move Ubuntu" }).click();
    const form = page.getByRole("dialog", { name: "Move WSL distro" });
    await form.getByLabel("Folder").fill(target);
    await form.getByRole("button", { name: "Review move" }).click();
    const d = sheet(page);
    await d.getByRole("button", { name: "Apply changes" }).click();
    await expect(d.getByTestId("results")).toContainText(why);
    await expect(d.getByTestId("results")).toContainText("Failed");
    await expect(d.getByRole("button", { name: "Undo" })).toHaveCount(0);
    await d.getByRole("button", { name: "Close" }).click();
  }
});

test("storage: old WSL gets an honest update message", async ({ page }) => {
  await open(page, "fixture=oldwsl");
  await nav(page, "Storage Cleaner");
  await page.getByRole("tab", { name: /Move data/ }).click();
  await page.getByRole("button", { name: "Move Ubuntu" }).click();
  await page.getByRole("dialog", { name: "Move WSL distro" }).getByRole("button", { name: "Review move" }).click();
  const d = sheet(page);
  await d.getByRole("button", { name: "Apply changes" }).click();
  await expect(d.getByTestId("results")).toContainText("WSL 2.3 or newer");
  await expect(d.getByTestId("results")).toContainText("wsl --update");
});

test("storage: WSL move is refused while a protected game runs", async ({ page }) => {
  await open(page, "fixture=gameRunning");
  await nav(page, "Storage Cleaner");
  await page.getByRole("tab", { name: /Move data/ }).click();
  await page.getByRole("button", { name: "Move Ubuntu" }).click();
  await page.getByRole("dialog", { name: "Move WSL distro" }).getByRole("button", { name: "Review move" }).click();
  await sheet(page).getByRole("button", { name: "Apply changes" }).click();
  await expect(sheet(page).getByRole("alert")).toContainText("VALORANT is running");
});

test("storage: the move form blocks a drive without enough space", async ({ page }) => {
  await open(page);
  await nav(page, "Storage Cleaner");
  await page.getByRole("tab", { name: /Move data/ }).click();
  await page.getByRole("button", { name: "Move Ubuntu" }).click();
  const form = page.getByRole("dialog", { name: "Move WSL distro" });
  await form.getByLabel("Folder").fill("C:\\WSL\\Ubuntu");
  await expect(form.getByRole("alert")).toContainText("doesn't have enough free space");
  await expect(form.getByRole("button", { name: "Review move" })).toBeDisabled();
});

test("admin: busy state names the running task and its progress on the other buttons", async ({ page }) => {
  await open(page, "", 350);
  await nav(page, "System Repair");
  await page.getByRole("button", { name: "Run SFC" }).click();
  await expect(page.getByTestId("admin-card-sfc")).toContainText("Verification 45% complete", { timeout: 5000 });
  await expect(page.getByTestId("admin-card-dism-restorehealth").getByRole("button")).toHaveText(/Waiting for SFC \(\d+%\)/);
  await expect(page.getByTestId("admin-card-restore-point").getByRole("button")).toHaveText(/Waiting for SFC/);
  await expect(page.getByTestId("admin-card-sfc").getByRole("button")).toHaveText("Running SFC…");
});

test("admin: a repair left running in the background shows a banner and locks SFC and DISM", async ({ page }) => {
  await open(page, "fixture=backgroundSfc");
  await nav(page, "System Repair");
  const banner = page.getByTestId("background-repair");
  await expect(banner).toContainText("A repair is still running in the background (SFC). Results appear here when it finishes.");
  await expect(page.getByTestId("admin-card-sfc").getByRole("button")).toHaveText("Waiting for SFC");
  await expect(page.getByTestId("admin-card-sfc").getByRole("button")).toBeDisabled();
  await expect(page.getByTestId("admin-card-dism-restorehealth").getByRole("button")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Create Restore Point" })).toBeEnabled();
  await expectFits(page);
});

test("admin: Refresh clears the background banner once the repair has finished", async ({ page }) => {
  await open(page, "fixture=backgroundDone");
  await nav(page, "System Repair");
  const banner = page.getByTestId("background-repair");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Refresh" }).click();
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run SFC" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Run DISM" })).toBeEnabled();
});

test("admin: closing while a task runs asks first; Keep open stays, Close anyway closes", async ({ page }) => {
  await open(page, "", 350);
  await nav(page, "System Repair");
  await page.getByRole("button", { name: "Run SFC" }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("lagsmith:close-blocked", { detail: "SFC" })));
  const dlg = page.getByRole("dialog", { name: "Repair still running" });
  await expect(dlg).toContainText("SFC is still running");
  await expect(dlg).toContainText("keeps running in the background");
  await dlg.getByRole("button", { name: "Keep Lagsmith open" }).click();
  await expect(dlg).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __lagsmithClosed?: boolean }).__lagsmithClosed)).toBeFalsy();

  await page.evaluate(() => window.dispatchEvent(new CustomEvent("lagsmith:close-blocked", { detail: "SFC" })));
  await dlg.getByRole("button", { name: "Close anyway" }).click();
  expect(await page.evaluate(() => (window as unknown as { __lagsmithClosed?: boolean }).__lagsmithClosed)).toBe(true);
});
