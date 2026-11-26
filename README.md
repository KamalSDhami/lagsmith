# Lagsmith

Find out why your Windows PC is laggy or crashing, see the evidence, and fix only what you choose. Every change can be undone.

Lagsmith is for gamers and developers on everyday Windows laptops and desktops. It reads what Windows already records (crash reports, event logs, hardware details and disk usage) and explains it in plain English. It is not a "PC booster": no fake health scores, no RAM cleaners, no registry "optimizers".

> **Status:** early development (v0.1). The current build only reads; it does not change anything on your PC. See [docs/PROGRESS.md](docs/PROGRESS.md).

## What it does today (read-only)

| Area | What it shows | Where the data comes from |
|---|---|---|
| Stability | Blue screens and unexpected shutdowns over 30 days, with plain-English crash codes | Windows Event Log |
| Hardware | CPU, RAM sticks and slots (single or dual channel), every GPU, built-in or separate | WMI and DXGI |
| Drivers | Real driver upgrades only, never older versions offered as "updates" | Windows Update Agent |
| Storage | Free space per drive, plus the size of known developer and system caches | Disk measurement |
| Startup | Apps that start with Windows, and whether each is enabled | Registry and Startup folders |
| Memory | What is using RAM, by app, and the commit charge | Windows memory APIs |
| Security | Whether Memory Integrity is on | Device Guard settings |

## Planned

Reviewed, reversible fixes, each with a restore point and an undo history. Examples: clearing caches, moving large data to another drive, startup toggles, Gaming Mode, choosing the GPU per game, and a System Repair runner (SFC and DISM) with live progress. See [docs/TICKETS.md](docs/TICKETS.md).

## Principles

1. Every number shows its source.
2. Nothing changes without a review step, and every change can be undone.
3. User files are never touched without an explicit tick.
4. No snake oil.

## Build from source

Requirements: Windows 10 or 11, [Rust](https://rustup.rs) (stable), Node.js 20+, WebView2 (included with Windows 11), and the Visual Studio C++ build tools.

```powershell
npm install
npm run tauri dev     # run in development
npm run tauri build   # build the installer
```

`npm run dev` runs the UI alone in a browser with sample data.

## Tech

Tauri 2 (Rust) with React, TypeScript and Tailwind CSS. The frontend has no access to the shell or filesystem: it can only call a fixed set of read-only commands, and none of them take arguments.

## Background

Lagsmith grew out of a real fix on a ThinkPad T480 that was crashing during Valorant. See [docs/CASE-STUDY.md](docs/CASE-STUDY.md).

## License

[MIT](LICENSE)
