# Tickets

Pending, active, and completed work. Update status when something moves.

- **Priority:** P0 blocks the first build, P1 is needed for v1, P2 is v2 or later.
- **Status:** `todo`, `doing`, `done`, `blocked`.

## Your PC (from the case study)

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| PC-1 | Reinstall Riot Vanguard through the Riot Client, then restart twice | P0 | todo? | Owner to confirm |
| PC-2 | Set Power mode to "Best performance" while plugged in | P1 | todo | Owner can now apply from Gaming Mode in Lagsmith |
| PC-3 | Add a second 8 GB DDR4-2400 SO-DIMM | P2 | todo | Hardware upgrade (~₹2,000) |
| PC-4 | Re-run DISM RestoreHealth (failed with 0x800f0915) | P2 | todo | Optional; can run from System Repair (`scripts/test-admin.ps1`) |
| PC-5 | Delete the old claude.ai design canvas | P2 | todo | Needs owner confirmation |

## App: v0.1 & Quality Gates

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| APP-1 | Scaffold Tauri 2, React, TypeScript; strict CSP; no core plugins | P0 | done | `D:\Git\projects\system-ready` |
| APP-2 | IPC contract (`model.rs` and `types.ts`) | P0 | done | 17 commands including `run_admin_task` |
| APP-3 | Rust scan modules: hardware, storage, stability, startup, memory, security, drivers | P0 | done | Verified by unit + live + real CDP tests |
| APP-4 | Dashboard UI matching the approved light design | P0 | done | Built and verified |
| APP-5 | Memory page (read-only, honest note about RAM cleaning) | P0 | done | Verified in `e2e/real` (no anti-cheat rows) |
| APP-6 | Make all screens fit 1366x700 without scrolling | P0 | done | Verified by `expectFits` across 42 mock tests |
| APP-7 | Ponytail code review pass | P0 | done | Completed 26 Nov; all high-priority findings fixed |
| APP-8 | Security & Condom audit of IPC, pipe helper, capabilities, anti-cheat | P0 | done | Completed 26 Nov; all findings fixed |
| APP-9 | Fix review and audit findings | P0 | done | 56 Cargo + 43 mock + 12 real tests green |
| APP-10 | Run in Tauri and verify against real PC data (`scripts/test-real.ps1`) | P0 | done | 12/12 passed over CDP port 9222 (46.6s) |
| APP-11 | Release build and NSIS `perMachine` installer (`npm run tauri build`) | P1 | todo | `externalBin` + `perMachine` configured; release build ~20-35 min |
| APP-12 | Rename the project to Lagsmith | P1 | done | GitHub repo `KamalSDhami/lagsmith` (MIT) |
| APP-13 | Show storage in GiB the way Windows does (`C:` 158.6 GB) | P0 | done | Verified in mock & real tests |
| APP-14 | Memory Integrity reads as off/on from registry | P1 | done | Verified in real test |

## App: v1 & Elevated Helper

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| V1-1 | Crash Detective page: crash timeline, suspect driver, plain-English codes | P1 | done | Built; dump analysis button wired |
| V1-2 | Hardware page, including RAM slots and upgrade tip | P1 | done | Verified in real & mock tests |
| V1-3 | Storage Cleaner page with checkboxes, allow-list, handle-based clean | P1 | done | Unit + mock tests pass |
| V1-4 | Startup Manager with reversible toggles (`StartupApproved`) | P1 | done | Live + mock tests pass; anti-cheat locked |
| V1-5 | Gaming Mode: Game Mode, Game Bar capture, power mode via API | P1 | done | Live + mock tests pass |
| V1-6 | GPU per game (`UserGpuPreferences`) + "game on wrong GPU" finding (`C4`) | P1 | done | Unit + mock E2E (set, undo, custom `.exe`, dual-GPU finding) pass |
| V1-7 | Review and Apply sheet, results screen | P1 | done | All actions pass through `ReviewProvider` |
| V1-8 | History and Undo log (`history.json` atomic save) | P1 | done | Verified in unit, mock, real tests |
| V1-9 | Elevated helper process (`lagsmith-helper`, UAC per action) | P1 | doing | Built, 14 helper tests + pipe mismatch test pass; awaiting owner's `scripts/test-admin.ps1` UAC run |
| V1-10 | Lenovo update catalogue check alongside Windows Update | P2 | todo | |

## App: v2 and later

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| V2-1 | System Repair runner (`sfc`, `dism-restorehealth`, `restore-point`) with live progress | P2 | doing | Built & mock-tested; awaiting owner's `scripts/test-admin.ps1` UAC run |
| V2-2 | Move WSL distro to another drive (`C8`): `wsl --manage --move`, WSL 2.3+ check, free-space and game-folder checks, undo moves back | P2 | doing | Built; 11 unit + mock UI tests pass. Never run on a real distro. Not built: SDK moves, folder picker |
| V2-3 | Remove a leftover Store app (`C9`): `PackageManager`, current user, not reversible, "Reinstall from Microsoft Store" link | P2 | doing | Built; unit + mock UI tests pass. Never run on a real package. Game Bar removed from the allow-list (Xbox rule) |
| V2-4 | Name exact faulting driver from crash dumps (`dbgeng.dll`, `A8`) | P2 | done | Owner UAC run 27 Nov: `vgk.sys` (unloaded) in `112526-14828-01.dmp` |
| V2-5 | Last SFC result from compressed CBS `.cab` archives (`A18`) | P2 | done | `System32\expand.exe` fallback + unit + real tests pass |
| V2-6 | Memory: "close before gaming" list, one-time trim (no timed RAM cleaning) | P2 | todo | |
| V2-7 | Dark mode palette (Apple-style neutral greys) | P2 | todo | |
| V2-8 | Desktop PC hero image, chosen by device type | P2 | todo | Remove brand logos before shipping |
| V2-9 | Closing the app during SFC/DISM leaves the elevated helper and `sfc.exe` running with no UI. Warn before close while an admin task runs; on reopen, show "a repair is still running" and pick up the result from the CBS log | P1 | todo | Found 27 Nov: owner closed app at SFC 84%; SFC kept going (good, killing it mid-repair is worse) |
