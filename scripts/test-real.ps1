# Launches the dev app with WebView2's debugging port open for this run only, runs the "real" Playwright tests, then closes it.
# The port lets any local process control the app, so it is never set in tauri.conf.json or a release build.
$ErrorActionPreference = "Stop"
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
Set-Location (Split-Path $PSScriptRoot -Parent)

$app = Start-Process powershell -ArgumentList "-NoProfile", "-Command", "npm run tauri dev -- -- -j 3" -PassThru -WindowStyle Hidden
try {
    $deadline = (Get-Date).AddMinutes(10)
    while (-not (Test-NetConnection 127.0.0.1 -Port 9222 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
        if ((Get-Date) -gt $deadline) { throw "App did not open the debugging port within 10 minutes" }
        Start-Sleep -Seconds 3
    }
    $env:PW_REAL = "1"
    npx playwright test --project=real
    $code = $LASTEXITCODE
} finally {
    Get-Process lagsmith -ErrorAction SilentlyContinue | Stop-Process -Force
    Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue
    Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
exit $code
