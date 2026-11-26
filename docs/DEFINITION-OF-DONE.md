# Definition of done

**Owner's definition (26 Nov 2026):** Lagsmith can run, by itself, every diagnosis we did by hand on 25 Nov to make the game stable (see `CASE-STUDY.md`), and its results agree with what we found. Every feature the owner asked for exists and works.

A row is ticked only when an automated test proves it: `e2e/real` checks the real app on this PC, `e2e/mock` checks edge cases with sample data, and `cargo test` covers parsing.

## A. Diagnoses from 25 Nov

| # | Diagnosis | How we did it by hand | App feature | Status |
|---|---|---|---|---|
| A1 | Device, CPU, BIOS, Windows version and channel | WMI, registry | Hardware page | partial (BIOS missing) |
| A2 | GPU, driver version, driver resets (event 4101) | WMI, Event Log | Dashboard, Hardware | done |
| A3 | RAM total, sticks and slots, speed, single or dual channel | WMI | Hardware | done |
| A4 | Free space per drive | Disk query | Dashboard, Storage | done |
| A5 | Blue screens with code and meaning (1001, and 41 with a bugcheck) | System log | Crash Detective | done |
| A6 | Unexpected shutdowns (41, 6008) | System log | Crash Detective | done |
| A7 | App crashes and hangs (Application log 1000, 1002), e.g. `vgm.exe` before the 0x50 | Application log | Crash Detective | todo |
| A8 | Drivers named in crash dumps (`vgk.sys`) | Read minidumps as admin | Crash Detective, with the admin helper | todo |
| A9 | Anti-cheat installed and service state (`vgc`, `vgk`) | `Get-Service`, Uninstall keys | Crash Detective, Gaming | todo |
| A10 | Free RAM and top memory users | Process list | Memory | done |
| A11 | Page file setting and usage | WMI | Hardware, Memory | todo |
| A12 | Power plan and mode, battery | `powercfg` | Hardware, Gaming | todo |
| A13 | Memory Integrity, Hyper-V and WSL running | Device Guard, services | Gaming (explained, never changed) | partial |
| A14 | Startup apps and enabled state | Registry | Startup Manager | done (data), todo (page) |
| A15 | What fills C:: caches, installed programs, WSL disk, Store app data, user folders | Folder sizes | Storage Cleaner | partial (caches) |
| A16 | Real driver updates from Windows Update | WUA COM | Dashboard | done |
| A17 | Leftover Store apps that can be removed | `Get-AppxPackage` | Debloat | todo |
| A18 | System file health: last SFC or DISM result | SFC, DISM, CBS log | System Repair | todo |
| A19 | Game Mode, Game Bar capture state | Registry | Gaming Mode | todo |
| A20 | Secure Boot and TPM 2.0 (VALORANT on Windows 11 refuses to launch without them: VAN9001/VAN9003) | Added from research, 26 Nov | Gaming Mode, Dashboard finding | todo |

## B. Screens (owner's 9-screen design, `references/EXACT-all-screens.webp`)

Dashboard · Scan PC (progress) · Crash Detective · Hardware · Storage Cleaner · Startup Manager · Gaming Mode · System Repair · History & Undo. Also Memory and Debloat, which are in the nav. Every number comes from real data. The name stays Lagsmith.

## C. Actions (after A is done; each one reversible and logged in History & Undo)

| # | Action | Needs admin | Status |
|---|---|---|---|
| C1 | Startup toggle (StartupApproved, HKCU entries) | no | todo |
| C2 | Game Mode on, Game Bar capture off | no | todo |
| C3 | Power mode (best performance) | no | todo |
| C4 | GPU preference per game | no | todo |
| C5 | Clear user caches (needs the handle-based walker first) | no | todo |
| C6 | Run SFC and DISM with live progress | yes (helper) | todo |
| C7 | Create a restore point | yes (helper) | todo |
| C8 | Move WSL to another drive | no (`wsl --manage`) | later |
| C9 | Remove a leftover Store app | no (per user) | later |

**Never** (`ANTI-CHEAT.md`): touch game or anti-cheat processes, services, startup entries or folders; toggle Memory Integrity.

## D. Quality gates

- `cargo test`, `npm run build`, and all Playwright specs pass (mock and real).
- The dashboard fits 1366x768.
- No reviewer finding left open without a ticket.
