param(
    [ValidateSet("debug", "release")]
    [string]$Profile = "debug"
)

$ErrorActionPreference = "Stop"
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
$repoRoot = Split-Path $PSScriptRoot -Parent
$srcTauri = Join-Path $repoRoot "src-tauri"

Push-Location $srcTauri
try {
    $cargoArgs = @("build", "-p", "lagsmith-helper", "-j", "3")
    if ($Profile -eq "release") {
        $cargoArgs += "--release"
    }

    & cargo @cargoArgs
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $meta = cargo metadata --no-deps --format-version 1 | ConvertFrom-Json
    $targetDir = $meta.target_directory
    $built = Join-Path $targetDir "$Profile\lagsmith-helper.exe"
    if (-not (Test-Path $built)) {
        throw "Built helper not found at $built"
    }

    $binDir = Join-Path $srcTauri "binaries"
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    $dest = Join-Path $binDir "lagsmith-helper-x86_64-pc-windows-msvc.exe"
    Copy-Item -Path $built -Destination $dest -Force
    Write-Host "Staged $dest"
} finally {
    Pop-Location
}
