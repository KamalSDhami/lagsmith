# CONTEXT (handoff file, max 700 words; any AI or human can resume from here. Replace stale lines, don't append)

**Updated:** 26 Nov 2026 (night). Last commit `17c0432`.

## What this is
Lagsmith: an open-source (MIT) Windows app (Tauri 2 + React) that diagnoses why a PC lags or crashes, shows the evidence, and applies only the fixes the user ticks, with undo. Born from fixing the owner's ThinkPad T480 for VALORANT on 25 Nov 2026 (`docs/CASE-STUDY.md`). **Done means `docs/DEFINITION-OF-DONE.md`**: the app runs every 25 Nov diagnosis by itself.

## Where things are
- **Code:** `D:\Git\projects\system-ready`. Repo: github.com/KamalSDhami/lagsmith (public). Commit with the noreply email.
- **Rust not on PATH:** prefix `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"`. Use `cargo ... -j 3`, one cargo at a time. Build output goes to `%LOCALAPPDATA%\lagsmith-target` (gitignored `src-tauri/.cargo/config.toml`); D: is nearly full.
- **Run:** `npm run tauri dev`.
- **Tests:**
  - `npx playwright test --project=mock`: 34 pass.
  - `scripts/test-real.ps1`: 12 tests on the real app over CDP port 9222. Written and pushed, **never run yet**.
  - `cargo test -j 3`: 31 pass, plus live tests with `-- --ignored`.
- **Design:** `docs/references/EXACT-all-screens.webp` (owner's 9 screens). Match it exactly.
- **Owner contact:** a Discord webhook given in chat. Never write it to a file.

## Architecture
- **Contract:** `src-tauri/src/model.rs` is mirrored by `src/types.ts`. Read commands take no arguments. Actions go through `apply_changes(title, changes)`, `undo_change(id)` and `get_history`.
- **Code:** `scan/*` (diagnostics), `actions/*` (startup, Game Mode, Game Bar, power overlay, cache clean). History is JSON.
- **Security:** strict CSP. Capabilities hold only `allow-<command>` (list in `build.rs`). No shell spawning from the UI.

## Admin helper: IN PROGRESS (about 30%)
**Written, not compiled:**
- `src-tauri/src/admin/protocol.rs`: 4 action ids (`analyze-dumps`, `sfc`, `dism-restorehealth`, `restore-point`), pipe-name check, exit codes 2/3/4/5.
- `src-tauri/src/admin/mod.rs`: `run_admin_task`. Random pipe with user-only access, `runas` launch, error 1223 means "declined", checks the client PID, reads JSON lines.

**Already compiled:**
- `model.rs` has `AdminEvent`, `AdminResult`, `DumpAnalysis` (unused).
- `scan/protected.rs` has the shared `gate()`.

**Next steps, in order:**
1. **Wire into `lib.rs`:**
   - add `mod admin;`;
   - add the `run_admin_task` command (`spawn_blocking`, `tauri::ipc::Channel<AdminEvent>`);
   - add it to `build.rs`, and `allow-run-admin-task` to `capabilities/default.json`.
2. **Cargo `windows` features:** `Win32_System_Pipes`, `Win32_Security_Cryptography`, `Win32_Security_Authorization`, `Win32_System_LibraryLoader`, `Win32_System_Restore`, `Win32_System_Diagnostics_Debug_Extensions`. Fix compile errors.
3. **Helper binary** `src/bin/lagsmith-helper/main.rs`: a second `[[bin]]`, plus `default-run = "lagsmith"`. Share code via `#[path]`. It must:
   - call `SetDefaultDllDirectories`;
   - run the gate;
   - connect to the pipe;
   - verify the server is `lagsmith.exe` next to it.

   Actions:
   - `restore-point`: `SRSetRestorePointW`.
   - `sfc`: output is UTF-16 with NULs; parse "Verification N% complete".
   - `dism`: `\r` progress `[== 45.0% ]`; 0x800f081f means no source.
4. **analyze-dumps (A8):** dbgeng loaded from System32, empty symbol path. Name the suspect driver and check unloaded modules. Expected on the owner's PC: `vgk.sys` in `112526-14828-01.dmp`.
5. `tauri.conf.json`: `bundle.windows.nsis.installMode = "perMachine"`.
6. **Frontend:**
   - mirror the 3 types in `src/types.ts` (shapes in `model.rs`);
   - System Repair: SFC/DISM/restore buttons with live progress;
   - Crash Detective: "Analyze dumps" button.
7. **Tests:**
   - `tests/helper.rs`: bad args exit 2;
   - run `scripts/test-real.ps1`;
   - write `scripts/test-admin.ps1` for the owner's one manual UAC check. **Never trigger UAC unattended.**

## Other remaining
- C4: GPU preference per game (`HKCU\Software\Microsoft\DirectX\UserGpuPreferences`), with undo.
- A18: last SFC result from compressed CBS logs.

## Hard rules
- **Anti-cheat (`docs/ANTI-CHEAT.md`):**
  - Never open game or anti-cheat processes (`protected.rs`).
  - No drivers.
  - Never disable anti-cheat or HVCI/Secure Boot/TPM.
  - Changes are refused during a game session (`is_game_session`: the game or `vgc.exe`; the tray icon doesn't count).
- **No timed RAM cleaning.**
- **Every number needs a source.** Review before change; undo after.
- **UI:** clean SaaS look with Apple-style colour restraint. Light mode first. No brutalism, gradients, emoji or em dashes. Fits 1366x768.

## Waiting on owner
1. Laptop image source and licence.
2. A real app icon.
3. Rewrite git history (Gmail in the first 2 commits)?
4. Trademark check for "Lagsmith".
5. Keep `CONDOM-REPORT.md` uncommitted.

## Mistakes not to repeat
- PowerShell `@(@(a,b))` flattens; write files whole.
- Never clear a whole folder (%TEMP% wipe lost the dumps).
- Windows Update offers fake "upgrades"; compare versions.
- Never toggle the owner's real startup entries in tests.
- A background agent can run out of budget: commit WIP often.
