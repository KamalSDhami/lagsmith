# CONTEXT (handoff file, max 700 words; keep it under the limit, replace stale lines rather than appending)

**Updated:** 26 Nov 2026

## What this is
Lagsmith: an open-source (MIT) Windows app that diagnoses why a PC is laggy or crashing, shows the evidence, and later applies only the fixes the user ticks, with undo. It grew from fixing the owner's ThinkPad T480 for VALORANT on 25 Nov 2026 (`docs/CASE-STUDY.md`).

## Where things are
- **Code:** `D:\Git\projects\system-ready` (folder not yet renamed). **Repo:** github.com/KamalSDhami/lagsmith (public). Commits use the noreply email.
- **Rust build output:** `%LOCALAPPDATA%\lagsmith-target`, set in the gitignored `src-tauri/.cargo/config.toml`. D: is nearly full and holds VALORANT; keep builds off D:.
- **Rust is not on PATH.** Prefix commands with `$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"`. Use `-j 3` (8 GB RAM) and only one cargo process at a time.
- **Run the app:** `npm run tauri dev`. **UI only, with sample data:** `npm run dev`.
- **Design:** Doop canvas KQV3ZmmkNI (light dashboard approved; dark palette undecided). References are in `docs/references/`.
- **Docs to keep current:** `PROGRESS.md` (percentages and estimates), `TICKETS.md` (pending work), `PRODUCT.md` (product truth), `ANTI-CHEAT.md` (hard rules), this file.

## Stack and architecture
- Tauri 2, React 19, TypeScript, Tailwind 4, Inter, lucide icons. Hand-written shadcn-style components (the owner asked for the 21st.dev style).
- **IPC contract:** `src-tauri/src/model.rs` mirrored by `src/types.ts`. Commands take no arguments and are read-only: `get_hardware`, `get_storage`, `get_caches`, `get_stability`, `get_startup`, `get_memory`, `get_security`, `check_driver_updates`.
- **Rust:** `src-tauri/src/scan/*`. Uses windows 0.62.2, wmi 0.18.4 and winreg. No shell spawning.
- **Security:**
  - Strict CSP; capabilities grant only the app's own commands.
  - **Future admin actions:** go through a separate elevated helper that accepts allow-listed action IDs only. 10 design rules came from the security audit.
  - **The folder walker must not be reused for deletion:** it needs handle-based walking first.

## Hard rules (owner's requirements)
- **Anti-cheat safety:**
  - Never open a handle to a game or anti-cheat process (`scan/protected.rs`).
  - No drivers, no memory access, never disable anti-cheat services, no changes while a game runs.
- **No timed RAM cleaning** (Mem Reduct-style). Write any memory code from Windows APIs only; don't copy Mem Reduct (GPLv3).
- **Every number shows its source.** Nothing changes without review and undo. User data (models, Downloads) is never ticked by default.
- **UI:**
  - Clean, professional SaaS look.
  - Apple-style colour restraint: neutral greys; the accent only on the primary button, active nav and selection; status colours only for real status.
  - No brutalism, neumorphism, gradients, emoji or em dashes.
  - Must fit 1366x768.
- **When the owner supplies a design, match it exactly.**

## Status
- **v0.1 (read-only dashboard):** about 85%.
- **Three reviews done** (`/ponytail-review`, `/security-audit`, `/condom`); fixes are being applied. The condom report is `CONDOM-REPORT.md` (uncommitted).
- **Next:**
  1. Launch and verify on real data.
  2. Commit each fix and push.
  3. v0.2: Crash Detective with dump suspects, a "what fills C:" view, page file, power plan, anti-cheat service status (read-only), WSL and Hyper-V. About 2-3 sessions.
- **After that:** v1 actions with undo (about 3-4 sessions), then v2 (moving data, SFC/DISM, Store-app removal).

## Waiting on the owner
1. Source and licence of the laptop image (`src/assets/laptop.webp`).
2. A real app icon (it's still Tauri's default).
3. Whether to rewrite git history to remove the Gmail address and machine details from the first 2 commits.
4. A trademark check for "Lagsmith" (IP India, USPTO).
5. On the PC: confirm VALORANT works again after the Vanguard reinstall, and whether Memory Integrity was turned off on purpose.

## Mistakes not to repeat
- PowerShell `@(@(a,b))` flattens: use objects for find-and-replace, and check the result before writing.
- Never clear a whole folder (`%TEMP%`).
- Check `DisplayVersion` before calling a build "Insider".
- Windows Update offers fake "upgrades": compare versions before treating one as real.
