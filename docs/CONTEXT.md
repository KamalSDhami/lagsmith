# CONTEXT (handoff file, max 700 words; any AI or human can resume from here. Replace stale lines, don't append)

**Updated:** 28 Nov 2026. Backend added RAM cleaner, settings, findings store, saved dump analysis, `open_external`, battery fix; UI agent wires them. C8 and C9 are built and mock-tested but never run on this PC. Next: owner UAC runs, then `npm run tauri build`.

## What this is
Lagsmith: an open-source (MIT) Windows app (Tauri 2 + React) that diagnoses why a PC lags or crashes, shows the evidence, and applies only the fixes the user ticks, with undo. Born from fixing the owner's ThinkPad T480 for VALORANT on 25 Nov 2026 (`docs/CASE-STUDY.md`). **Done means `docs/DEFINITION-OF-DONE.md`**: the app runs every 25 Nov diagnosis by itself.

## Where things are
- **Code:** `D:\Git\projects\system-ready`. Repo: github.com/KamalSDhami/lagsmith (public). Commit with the noreply email.
- **Rust not on PATH / drive space:** run cargo from `src-tauri` (so `src-tauri/.cargo/config.toml` keeps build output in `%LOCALAPPDATA%\lagsmith-target` off D:). Prefix `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"`. Use `cargo ... -j 3`, one cargo at a time.
- **Helper staging:** `scripts/stage-helper.ps1 -Profile debug|release` builds `lagsmith-helper` (`src-tauri/helper`) and copies it to gitignored `src-tauri/binaries/lagsmith-helper-x86_64-pc-windows-msvc.exe` for `bundle.externalBin`. `beforeBuildCommand` runs it automatically for `npm run tauri build`.
- **Run:** `npm run tauri dev` (stage helper first if helper source changed).
- **Tests:**
  - `npx playwright test --project=mock` (mock data only).
  - `scripts/test-real.ps1`: real app over CDP port 9222.
  - `cargo test --workspace -j 3` from `src-tauri`; live tests run with `-- --ignored`.
  - `scripts/test-admin.ps1`: manual UAC check for the owner. **Never trigger UAC unattended.**
- **Design:** `docs/references/EXACT-all-screens.webp` (owner's 9 screens). Match it exactly.
- **Owner contact:** a Discord webhook given in chat. Never write it to a file.

## Architecture
- **Contract:** `src-tauri/src/model.rs` is mirrored by `src/types.ts`. Read commands take no arguments. System changes go through `apply_changes`, `undo_change`, `get_history`. App data (28 Nov): `get_settings`/`set_settings` (`prefs.rs`), `record_scan`/`get_findings_history` (`findings.rs`, Resolved only from re-scan evidence), `get_dump_analysis`, `clean_memory` (`actions/memclean.rs`, includes the 30 s auto-clean watcher), `open_external` (`external.rs`, host allow-list). Files live in `appdata.rs`.
- **Code:** `scan/*` (diagnostics), `actions/*` (startup, Game Mode, Game Bar, power overlay, handle-based cache clean), `admin/*` (private DACL named pipe + `runas` launcher + `run_admin_task` Channel command).
- **Elevated helper (`src-tauri/helper/`):** System32-only DLL loading, `protected::gate()`, strict arg allow-list (exit codes 2 to 5), pipe server verified as `lagsmith.exe`. Tasks: `restore-point`, `sfc`, `dism-restorehealth`, `analyze-dumps` (`dbgeng.dll`, resolves `vgk.sys`), `purge-standby` (`NtSetSystemInformation`, never run on this PC).
- **Frontend:** `RepairPage.tsx` (SFC, DISM, Restore Point with live progress) and `CrashPage.tsx` ("Analyze dumps" + suspect driver display), coordinated by single-task lock in `useSystemData.ts`.
- **Bundling & Security:** `tauri.conf.json` sets strict CSP, `bundle.externalBin = ["binaries/lagsmith-helper"]`, `bundle.windows.nsis.installMode = "perMachine"`. Capabilities hold only `allow-<command>` (list in `build.rs`). No shell spawning from the UI.

## Remaining
- Owner UAC run: `scripts/test-admin.ps1`, plus one `purge-standby` run.
- `C8`/`C9` on a real PC: owner tests with a spare distro or app (`actions/wsl.rs`, `actions/store.rs`). Unverified: `PackageManager` without admin, `wsl --manage --move` output, the `ms-windows-store://` link in WebView2.
- `npm run tauri build`: build & verify NSIS `perMachine` installer.

## Hard rules
- **Anti-cheat (`docs/ANTI-CHEAT.md`):** Never open game or anti-cheat processes (`protected.rs`), no drivers, never toggle HVCI/Secure Boot/TPM, refuse active changes during `is_game_session` (game or in-game anti-cheat service; tray icon doesn't block).
- **RAM cleaning: manual button, plus optional auto-clean above a user-set % (off by default). Never a timer, never protected/system processes, never during a game session; auto-clean never purges standby.**
- **Every number needs a source.** Review before change; undo after.
- **UI:** clean SaaS look with Apple-style colour restraint, light mode first, no gradients/emoji/em dashes, fits 1366x768.

## Waiting on owner
1. Manual UAC test (`scripts/test-admin.ps1`).
2. Laptop image source/licence and a real app icon.
3. Rewrite git history (Gmail in first 2 commits)?
4. Trademark check for "Lagsmith".
5. Keep `CONDOM-REPORT.md` uncommitted.

## Mistakes not to repeat
- Always run `cargo` from `src-tauri` (or via `scripts/stage-helper.ps1`) so `src-tauri/.cargo/config.toml` keeps build artifacts on C:, not D:.
- Never clear a whole folder (`%TEMP%` wipe lost dumps); never toggle real startup entries in tests.
- PowerShell `@(@(a,b))` flattens; write files whole.
