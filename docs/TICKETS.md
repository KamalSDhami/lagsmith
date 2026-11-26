# Tickets

Pending and in-progress work. Update the status when something moves.

- **Priority:** P0 blocks the first build, P1 is needed for v1, P2 is v2 or later.
- **Status:** todo, doing, done, blocked.

## Your PC (from the case study)

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| PC-1 | Reinstall Riot Vanguard through the Riot Client, then restart twice | P0 | todo? | Confirm it was done; crashes should stop |
| PC-2 | Set Power mode to "Best performance" while plugged in | P1 | todo | Settings → System → Power |
| PC-3 | Add a second 8 GB DDR4-2400 SO-DIMM | P2 | todo | Biggest remaining fix for lag; about ₹2,000 |
| PC-4 | Re-run DISM RestoreHealth (failed with 0x800f0915) | P2 | todo | Optional; SFC is clean |
| PC-5 | Delete the old claude.ai design canvas | P2 | todo | Needs your confirmation in the app |

## App: first build (v0.1, read-only)

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| APP-1 | Scaffold Tauri 2, React, TypeScript; strict CSP; no opener plugin | P0 | done | `D:\Git\projects\system-ready` |
| APP-2 | IPC contract (`model.rs` and `types.ts`) | P0 | done | 7 read-only commands, no arguments |
| APP-3 | Rust scan modules: hardware, storage, stability, startup, memory, security, drivers | P0 | doing | Backend subagent |
| APP-4 | Dashboard UI matching the approved light design | P0 | done | Built and tested in a browser with mock data only |
| APP-5 | Memory page (read-only, honest note about RAM cleaning) | P0 | done | |
| APP-6 | Make the dashboard fit 1366x768 without scrolling | P0 | todo | Currently about 987px tall |
| APP-7 | `/ponytail` code review pass | P0 | todo | After APP-3 |
| APP-8 | `/security-audit` of IPC commands and capabilities | P0 | todo | After APP-3 |
| APP-9 | Fix review and audit findings | P0 | todo | |
| APP-10 | Run in Tauri (`npm run tauri dev`) and check against real data | P0 | todo | |
| APP-11 | Release build and NSIS installer | P1 | todo | First run about 20-35 min |
| APP-12 | Rename the project to its final name | P1 | todo | Proposed name "Lagsmith"; needs your decision |

## App: v1 features

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| V1-1 | Crash Detective page: crash timeline, suspect driver per crash, plain-English codes | P1 | todo | |
| V1-2 | Hardware page, including RAM slot diagram and upgrade tip | P1 | todo | |
| V1-3 | Storage Cleaner page with checkboxes and running totals | P1 | todo | Allow-list only |
| V1-4 | Startup Manager with reversible toggles (StartupApproved) | P1 | todo | |
| V1-5 | Gaming Mode: Game Mode, Game Bar capture, power mode via API | P1 | todo | |
| V1-6 | GPU per game (Windows graphics preference), "game on wrong GPU" finding | P1 | todo | Designs exist on the Doop canvas |
| V1-7 | Review and Apply sheet, restore point, results screen | P1 | todo | |
| V1-8 | History and Undo log | P1 | todo | |
| V1-9 | Elevated helper process for admin-only actions (UAC per action) | P1 | todo | Needed by V1-5 and V2-1 |
| V1-10 | Lenovo update catalogue check, alongside Windows Update | P2 | todo | |

## App: v2 and later

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| V2-1 | System Repair runner (SFC and DISM) with live progress | P2 | todo | |
| V2-2 | Move large data to another drive (WSL, SDKs) with free-space checks | P2 | todo | |
| V2-3 | Debloat from a fixed Store-app list | P2 | todo | |
| V2-4 | Name the exact faulting driver from crash dumps (dbghelp) | P2 | todo | |
| V2-5 | Memory: "close before gaming" list, one-time trim, standby purge only when a real problem is detected | P2 | todo | No timed RAM cleaning |
| V2-6 | Dark mode palette (Apple-style neutral greys) | P2 | todo | Undecided |
| V2-7 | Desktop PC hero image, chosen by device type | P2 | todo | Asset exists; remove brand logos before shipping |

## Design

| ID | Task | Priority | Status | Notes |
|---|---|---|---|---|
| DES-1 | Light dashboard | P0 | done | Doop canvas KQV3ZmmkNI |
| DES-2 | Dual-GPU card, popover and per-game GPU frames | P1 | done | Sample data |
| DES-3 | Designs for the remaining screens (Crashes, Storage, Startup, and so on) | P1 | todo | |
| DES-4 | Choose one font for both themes (Doop used Inter for light, Manrope for dark) | P1 | todo | The app uses Inter |
