# Definition of done

**Owner's definition (26 Nov 2026):** Lagsmith can run, by itself, every diagnosis we did by hand on 25 Nov to make the game stable (see `CASE-STUDY.md`), and its results agree with what we found. Every feature the owner asked for exists and works.

A row is ticked only when an automated test proves it: `e2e/real` checks the real app on this PC (9 tests), `e2e/mock` checks edge cases with sample data (34 tests), and `cargo test` covers parsing and the actions (31 unit tests plus live tests).

## A. Diagnoses from 25 Nov

| # | Diagnosis | App feature | Proven by | Status |
|---|---|---|---|---|
| A1 | Device, CPU cores and threads, BIOS, Windows version | Hardware | real: N24ET81W, 4 cores, 8 threads | done |
| A2 | GPU, driver version, driver resets (4101) | Dashboard, Hardware | real: UHD 620, 31.0.101.2145 | done |
| A3 | RAM, sticks and slots, speed, channel | Hardware | real: 1 stick, single channel | done |
| A4 | Free space per drive | Dashboard, Storage | real | done |
| A5 | Blue screens with code and meaning | Crash Detective | real: 0xCE, 0x50; mock: blue screen without a dump | done |
| A6 | Unexpected shutdowns | Crash Detective | real, cargo test | done |
| A7 | App crashes and hangs (`vgm.exe`) | Crash Detective | real: vgm.exe | done |
| A8 | Drivers named in crash dumps (`vgk.sys`) | Crash Detective | owner's UAC run 27 Nov: `112526-14828-01.dmp` 0xCE suspect `vgk.sys` (unloaded), matches case study | done |
| A9 | Anti-cheat installed, service state | Crash Detective, Gaming | real: Riot Vanguard | done |
| A10 | Free RAM, top memory apps (anti-cheat never opened) | Memory | real: no vgc/VALORANT rows | done |
| A11 | Page file | Hardware | real | done |
| A12 | Power plan and mode, battery health, `hasBattery` | Hardware, Gaming, Dashboard | live 28 Nov: best_efficiency on AC, 12.09 of 48.84 Wh (25%), design read from the battery driver because WMI fails here; mock | done |
| A13 | Memory Integrity, Hyper-V, WSL | Gaming | real | done |
| A14 | Startup apps, anti-cheat entries locked | Startup Manager | real: RiotClient has no toggle | done |
| A15 | What fills C: (programs, WSL disk, app data, user folders, caches) | Storage Cleaner | real: VALORANT 35.2 GB, Ubuntu vhdx | done |
| A16 | Real driver updates only | Dashboard | live: 2 real upgrades, fake ones dropped | done |
| A17 | Leftover Store apps | Debloat | live: none installed on this PC; mock list | done |
| A18 | Last SFC result | System Repair | real page; reads `CBS.log`, `CbsPersist_*.log`, and up to 4 `CbsPersist_*.cab` | done |
| A19 | Game Mode, Game Bar capture | Gaming | real | done |
| A20 | Secure Boot, TPM 2.0 (VAN9001/9003) | Gaming, Dashboard | real: Secure Boot on, TPM 2.0; mock: failing fixture | done |

**20 of 20 done.**

## B. Screens (owner's 9-screen design)

Dashboard, Scan PC, Crash Detective, Hardware, Storage Cleaner, Startup Manager, Gaming Mode, System Repair, History & Undo, plus Memory and Debloat: **all built**. Each has a mock test that checks it fits 1366x700, and a real test against live data. Places where the design showed numbers we have no source for were changed; see the frontend report in `PROGRESS.md`.

## C. Actions (reversible, logged in History & Undo)

| # | Action | Proven by | Status |
|---|---|---|---|
| C1 | Startup toggle (HKCU) | live test on its own test entry; mock UI flow | done |
| C2 | Game Mode, Game Bar capture | live apply and undo, restored exactly; mock | done |
| C3 | Power mode | live apply and undo; mock | done |
| C4 | GPU preference per game | `get_gpu_preferences` + `GpuPreference` action/undo; unit + mock UI + dual-GPU finding | done |
| C5 | Clean user caches (handle-based, never follows links) | unit tests on temp folders; mock UI flow. Not yet run on real caches. | done (unit) |
| C6 | Run SFC and DISM with live progress | helper parsers unit-tested; needs owner's UAC run | built, awaiting UAC check |
| C7 | Restore point before changes | owner's UAC run 27 Nov: restore point created | done |
| C8 | Move WSL to another drive (`wsl --manage --move`, WSL 2.3+, undo moves back) | unit tests (distro, path, drive, space, version, game folders); mock UI flow, undo via History confirm, unknown-drive, low-space and game-folder refusals, old-WSL message (same-drive refusal is unit-tested only). Never run on this PC. | built, not run on a real distro |
| C9 | Remove a leftover Store app (`PackageManager`, current user, not reversible, "Reinstall from Microsoft Store") | unit tests (deny list, allow-list re-check, framework/system refusal, fake remover); mock UI flow, History has no undo. Never run on this PC. | built, not run on a real package |
| C10 | Clean memory (trim user apps' working sets; optional auto-clean above a set %, no timer; standby purge via the helper) | unit tests (process filter, watcher crossing and cooldown, threshold bounds); mock. Never run for real, and `purge-standby` never run on this PC. | built, not run for real |

All actions are refused during a protected game session (the game itself or `vgc`). The Vanguard tray icon doesn't block them.

## D. Quality gates

- `cargo test`, `npm run build`, mock and real Playwright: **passing** (26 Nov).
- The dashboard fits 1366x768: **passing**.
- Reviewer findings: fixed, or ticketed in `TICKETS.md`.
