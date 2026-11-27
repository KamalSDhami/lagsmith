# Manual interactive UAC verification for Lagsmith's elevated helper (never run unattended).
# Builds lagsmith-helper, launches Lagsmith with CDP port 9222 for this run only, and invokes
# run_admin_task for each selected admin action so the owner can approve UAC and inspect live results.
param(
    [string[]]$Tasks = @("restore-point", "analyze-dumps", "sfc", "dism-restorehealth")
)

$ErrorActionPreference = "Stop"
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Staging lagsmith-helper..."
& (Join-Path $PSScriptRoot "stage-helper.ps1") -Profile debug
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$app = Start-Process powershell -ArgumentList "-NoProfile", "-Command", "npm run tauri dev -- -- -j 3" -PassThru -WindowStyle Hidden
$code = 1
try {
    $deadline = (Get-Date).AddMinutes(10)
    while (-not (Test-NetConnection 127.0.0.1 -Port 9222 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
        if ((Get-Date) -gt $deadline) { throw "App did not open the debugging port within 10 minutes" }
        Start-Sleep -Seconds 3
    }

    $tasksJson = ($Tasks | ConvertTo-Json -Compress)
    if ($Tasks.Count -eq 1) { $tasksJson = "[$tasksJson]" }

    $nodeScript = @'
import { chromium } from "@playwright/test";

const tasks = JSON.parse(process.env.ADMIN_TASKS_JSON);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => /localhost:1420|tauri\.localhost/.test(p.url()));
if (!page) throw new Error("Lagsmith window not found over CDP");

page.on("console", (msg) => {
  const txt = msg.text();
  if (txt.startsWith("[admin]")) console.log(txt);
});

let failed = false;
for (const task of tasks) {
  console.log(`\n=== Running admin task: ${task} (approve the UAC prompt) ===`);
  try {
    const res = await page.evaluate(async (t) => {
      const id = window.__TAURI_INTERNALS__.transformCallback((raw) => {
        if (raw && "message" in raw) {
          const ev = raw.message;
          const pct = ev.percent != null ? ` (${ev.percent.toFixed(1)}%)` : "";
          console.log(`[admin] ${t}: ${ev.stage}${pct}`);
        }
      });
      return await window.__TAURI_INTERNALS__.invoke("run_admin_task", {
        task: t,
        onEvent: `__CHANNEL__:${id}`,
      });
    }, task);
    console.log(`[result] ${task}:`, JSON.stringify(res, null, 2));
    if (task === "analyze-dumps" && res.outcome === "analyzed") {
      const target = res.dumps.find((d) => d.file === "112526-14828-01.dmp");
      if (target) {
        console.log(`[check] 112526-14828-01.dmp suspect: ${target.suspectModule} (${target.suspectFrom})`);
      }
    }
  } catch (err) {
    console.error(`[error] ${task}:`, err);
    failed = true;
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
'@

    $env:ADMIN_TASKS_JSON = $tasksJson
    $nodeScript | node --input-type=module
    $code = $LASTEXITCODE
} finally {
    Get-Process lagsmith -ErrorAction SilentlyContinue | Stop-Process -Force
    if ($app -and -not $app.HasExited) {
        & taskkill /PID $app.Id /T /F 2>$null | Out-Null
    }
    Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
exit $code
