# Progress

**Last updated:** 27 Nov 2026 (handoff to Claude)
**Current goal:** Admin helper, `dbgeng.dll` dump analysis, C4 GPU preference per game, and A18 compressed CBS `.cab` SFC fallback built and verified (all changes currently uncommitted in working tree: 34 modified, 5 untracked). Next: commit WIP, owner interactive UAC test (`scripts/test-admin.ps1`), C8/C9, and release NSIS build.

## Overall

| Milestone | Progress | Notes |
|---|---|---|
| PC fix (case study) | 95% | Vanguard reinstall (PC-1) and power mode (PC-2) left to owner |
| Product definition (`PRODUCT.md`) | 100% | |
| Design: light dashboard & 9+ screens | 100% | All screens built and checked at 1366x700 |
| **v0.1 + v1 core (read-only + reversible actions + C4 + A18)** | **100%** | 42 lib tests, 43 mock E2E, 12 real CDP tests pass |
| **Admin helper & repair/dump analysis** | **95%** | Built, unit/integration/mock tested, security & Ponytail reviewed; awaiting owner's interactive UAC test (`scripts/test-admin.ps1`) |
| Remaining v2 (C8 WSL move, C9 Debloat) | 0% | Scoped in `TICKETS.md` |
| Release NSIS installer (`perMachine`) | 10% | `tauri.conf.json` configured (`perMachine` + `externalBin`); `npm run tauri build` pending |

## Verification snapshot (26 Nov 2026)

| Suite | Result | Notes |
|---|---|---|
| `cargo test --workspace -j 3` (from `src-tauri`) | **56 passed**, 0 failed (3 ignored live tests) | `42` `lagsmith_lib` + `11` `lagsmith-helper` + `3` `tests/helper.rs` |
| `npm run build` (`tsc && vite build`) | **Passed** | Clean bundle in `dist/` |
| `npx playwright test --project=mock` | **43 passed**, 0 failed | Includes `expectFits` at 1366x700, 8 admin-task tests, and C4 GPU pref + dual-GPU finding |
| `scripts/test-real.ps1` (real Tauri app via CDP 9222) | **12 passed**, 0 failed (46.6s) | Verified against live hardware, Event Log, Windows Update, Storage, Memory, Startup, CBS logs |
| `scripts/test-admin.ps1` (interactive UAC) | Ready, not run | Never run unattended (triggers UAC) |

## Locations

- **Project:** `D:\Git\projects\system-ready` (GitHub: `https://github.com/KamalSDhami/lagsmith`, MIT)
- **Rust build output:** `%LOCALAPPDATA%\lagsmith-target` (configured in `src-tauri/.cargo/config.toml`; run `cargo` from `src-tauri`)
- **Helper workspace crate:** `src-tauri/helper` (staged to `src-tauri/binaries/lagsmith-helper-x86_64-pc-windows-msvc.exe` via `scripts/stage-helper.ps1`)
- **Docs:** `docs/PRODUCT.md`, `docs/CASE-STUDY.md`, `docs/CONTEXT.md`, `docs/DEFINITION-OF-DONE.md`, `docs/ANTI-CHEAT.md`, `docs/TICKETS.md`

## Decisions log

| Date | Decision |
|---|---|
| 26 Nov | Tauri 2, React, Tailwind v4, hand-written components in clean SaaS / Apple-restrained light theme |
| 26 Nov | No automatic RAM cleaning; honest memory panel instead |
| 26 Nov | Reversible actions go through Review sheet (`apply_changes` / `undo_change`) and refuse while a protected game runs |
| 26 Nov | "Up to date" for drivers must cite Windows Update as its source |
| 26 Nov | Elevated admin tasks run in separate `lagsmith-helper.exe` over private DACL named pipe with `runas` per action and `perMachine` NSIS install |
| 26 Nov | `lagsmith-helper` placed in workspace crate `src-tauri/helper/` and bundled via `bundle.externalBin` + `scripts/stage-helper.ps1` |

## Log

- **25 Nov:** diagnosed and fixed the PC (`CASE-STUDY.md`).
- **26 Nov:**
  - Scaffolded Tauri 2 + React, built all read-only scan modules, reversible HKCU/power/cache actions, and all screens.
  - Wired `admin` pipe launcher and `run_admin_task` IPC command.
  - Built `lagsmith-helper` (`restore-point`, `sfc`, `dism-restorehealth`, `analyze-dumps` via System32 `dbgeng.dll` with empty symbol path and unloaded module resolution).
  - Wired `RepairPage` (SFC, DISM, Restore Point with live progress) and `CrashPage` ("Analyze dumps" + suspect driver display).
  - Ran Security Audit (Condom + Cloudflare Security Audit + `ANTI-CHEAT.md`) and Ponytail code review; fixed NSIS `externalBin` bundling, `parse_dism_progress` UTF-8 boundary panic, DISM `3010`/`0x800f0915` outcomes, `GetSystemWindowsDirectoryW`, pipe PID fail-closed guards, `is_game_session` coverage, and added UAC-free pipe mismatch integration test.
  - Implemented **A18** (`.cab` fallback in `scan/system.rs` via `System32\expand.exe` + `FOLDERID_Windows` + `AtomicU64` exclusive temp dir) and **C4** (`get_gpu_preferences` + `GpuPreference` action/undo + `Per-app GPU preference` card on `GamingPage` + dual-GPU wrong-GPU finding), verified with delta security/Ponytail reviews and full test suites (`56` Cargo, `43` mock Playwright, `12` real CDP).
