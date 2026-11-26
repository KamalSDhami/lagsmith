# Progress

**Last updated:** 26 Nov 2026
**Current goal:** first build (v0.1), a read-only dashboard running on real data from this PC.

## Overall

| Milestone | Progress | Estimated time left |
|---|---|---|
| PC fix (case study) | 95% | Vanguard reinstall (PC-1) and power mode (PC-2) are left to you |
| Product definition (`PRODUCT.md`) | 100% | |
| Design: light dashboard | 100% | |
| Design: remaining screens | 10% | 1-2 sessions |
| **First build (v0.1, read-only)** | **70%** | **about 1 hour** |
| v1 (actions with undo) | 0% | about 3-5 sessions after v0.1 |
| v2 | 0% | |

## First build breakdown

| Step | Weight | Progress | Notes |
|---|---|---|---|
| Scaffold, CSP, IPC contract | 10% | 100% | |
| Frontend: dashboard, Memory page, placeholder pages | 25% | 90% | Must fit 1366x768 (APP-6) |
| Backend: 7 read-only scan modules | 30% | 100% | 12 tests pass; live data confirmed |
| Code review (`/ponytail`) and security audit | 15% | 0% | |
| Fixes from review | 10% | 0% | |
| Run in Tauri against real data | 5% | 0% | |
| Release installer | 5% | 0% | First release compile is about 20-35 min |
| **Total** | 100% | **about 70%** | |

## Build times on this laptop (i7-8650U, 8 GB, 3 parallel jobs)

| Build | First time | After that |
|---|---|---|
| Dev (`npm run tauri dev`) | 8-15 min | 20-60 s |
| Release (`npm run tauri build`) | 20-35 min | 5-10 min |

## Locations

- **Project:** `D:\Git\projects\system-ready` (app renamed to Lagsmith)
- **Repository:** https://github.com/KamalSDhami/lagsmith (public, MIT)
- **Rust build output:** `C:\Users\KamalSDhami\AppData\Local\lagsmith-target` (kept off D:)
- **Design:** https://doop.design/c/KQV3ZmmkNI
- **Docs:** `docs/PRODUCT.md`, `docs/CASE-STUDY.md`, `docs/TICKETS.md`, `docs/references/`

## Decisions log

| Date | Decision |
|---|---|
| 26 Nov | Tauri 2, React, Tailwind, and hand-written components in the 21st.dev and shadcn style |
| 26 Nov | Light mode first; the dark palette is decided later, using Apple-style neutrals |
| 26 Nov | No automatic RAM cleaning; an honest memory panel instead |
| 26 Nov | The first build is read-only; any action needs review and undo |
| 26 Nov | "Up to date" for drivers must cite Windows Update as its source |
| 26 Nov | Name: Lagsmith (System Ready clashed with ReadyPC). Licence: MIT. Third-party inspiration images are kept out of the repo. |

## Log

- **25 Nov:** diagnosed and fixed the PC (see `CASE-STUDY.md`).
- **26 Nov:**
  - Product brief.
  - Three design rounds: the claude.ai canvas was rejected, then Doop variants, then your own design adopted.
  - Dual-GPU frames.
  - Project scaffolded.
  - Frontend built.
  - Backend finished.
  - Renamed to Lagsmith and pushed to GitHub.
