# CONTEXT (handoff file, max 700 words; keep it under the limit, replace stale lines rather than appending)

**Updated:** 26 Nov 2026 (evening)

## What this is
Lagsmith: an open-source (MIT) Windows app that diagnoses why a PC is laggy or crashing, shows the evidence, and applies only the fixes the user ticks, with undo. It grew from fixing the owner's ThinkPad T480 for VALORANT on 25 Nov 2026 (`docs/CASE-STUDY.md`). **The owner's definition of done is `docs/DEFINITION-OF-DONE.md`**: the app runs every 25 Nov diagnosis by itself.

## Where things are
- **Code:** `D:\Git\projects\system-ready`. **Repo:** github.com/KamalSDhami/lagsmith (public). Commits use the noreply email.
- **Rust build output:** `%LOCALAPPDATA%\lagsmith-target`, set in the gitignored `src-tauri/.cargo/config.toml`. D: is nearly full; keep builds off it.
- **Rust is not on PATH.** Prefix commands with `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"`. Use `-j 3` and one cargo process at a time.
- **Run the app:** `npm run tauri dev`.
- **Tests:**
  - `npx playwright test --project=mock`: 34 tests, with fixtures via `?fixture=`.
  - `scripts/test-real.ps1`: 9 tests on the real app, using a test-only debugging port.
  - `cargo test -j 3`, plus the live tests run with `-- --ignored`.
- **Design:** the owner's 9-screen design is `docs/references/EXACT-all-screens.webp`. The name is Lagsmith, not "System Ready".
- **Owner contact:** a Discord webhook (one-way) that the owner gave in chat. It's never stored in files. Post updates; replies can't be read.

## Architecture
- Tauri 2, React 19, TypeScript, Tailwind 4, Inter and lucide icons, with hand-written shadcn-style components.
- **Contract:** `src-tauri/src/model.rs` mirrored by `src/types.ts`.
  - Read commands take no arguments.
  - Actions use `apply_changes(title, changes)`, `undo_change(id)` and `get_history`; each is validated in Rust.
- **Code layout:** `src-tauri/src/scan/*` (diagnostics) and `src-tauri/src/actions/*` (startup, Game Mode, Game Bar, power overlay, cache cleaning). History is JSON in local app data.
- **Security:** strict CSP; capabilities grant only the app's own commands; no shell spawning.
- **Admin helper (next):** a separate small binary, one allow-listed action ID per UAC launch, no paths from the caller; installed per machine.

## Hard rules
- **Anti-cheat (`docs/ANTI-CHEAT.md`):**
  - Never open game or anti-cheat processes (`protected.rs`).
  - No drivers.
  - Never disable anti-cheat.
  - Changes are refused during a game session (`is_game_session`: the game or `vgc`, not the tray icon).
- **No timed RAM cleaning.**
- **Every number has a source.** Review before any change, then undo; user files are never auto-selected.
- **UI:**
  - A clean SaaS look with Apple-style colour restraint.
  - No brutalism, gradients, emoji or em dashes.
  - Fits 1366x768.
  - When the owner supplies a design, match it exactly.

## Status
- Definition of done: **18 of 20 diagnoses done**, all screens built, actions C1, C2, C3 and C5 done.
- **Remaining:**
  - A8: naming drivers in crash dumps (admin helper plus dbgeng).
  - C6, C7: SFC, DISM and a restore point (admin helper).
  - C4: GPU per game.
  - A18: the last SFC result from compressed CBS logs.
- The app found two new problems on the owner's PC: power mode set to Best power efficiency while plugged in, and the battery at 25% health.

## Waiting on the owner
1. The laptop image's source and licence.
2. A real app icon.
3. Whether to rewrite git history to remove the Gmail address and machine details.
4. A trademark check for "Lagsmith".

## Mistakes not to repeat
- PowerShell `@(@(a,b))` flattens: write files whole, or check replacements before saving.
- Never clear a whole folder.
- Check `DisplayVersion` before calling a build "Insider".
- Windows Update offers fake "upgrades": compare versions.
- Never toggle the owner's real startup entries in tests.
