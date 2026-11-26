# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Desktop app for Windows 11 built with Tauri 2 (web UI in a native window). Window minimum 1100x700; must also work on a 1366x768 laptop screen.

## Stack

App: Tauri 2, Rust backend, React + TypeScript frontend. Design-exploration deliverable: a single static HTML page (delegated; user wants one page holding all variants to choose from).

## Users

Gamers and developers on modest Windows laptops (example: ThinkPad T480, Intel UHD 620, 8 GB RAM, nearly full C: drive) whose PC has become laggy or unstable. They open the app when a game stutters, the graphics driver stops responding, or Windows blue-screens, often right before or after a gaming session. They want to know what is wrong and fix it without breaking their machine.

## Product Purpose

Find out why a Windows PC is slow or crashing, show the evidence, and apply only the fixes the user ticks, with every change reversible. Success: the user understands the cause in plain language, frees space or stops crashes, and trusts that nothing was changed behind their back.

## Positioning

Diagnose first, then fix with consent. Every finding cites its source (Windows Event Log, crash dumps, WMI hardware data, measured folder sizes). Not a "PC booster": no fake health scores, no RAM cleaners, no registry optimizers.

## Operating Context

Flow: Scan, Report, Review and tick, Apply, Results with Undo. Long-running admin jobs (SFC, DISM) take 10 to 60 minutes and must show live progress. Admin rights are requested per action through a separate elevated helper.

## Capabilities and Constraints

v1: Dashboard, Scan, Crash Detective (event logs and dump suspects), Hardware Check (RAM slots and channels, graphics, disks), Storage Cleaner (fixed allow-list of known caches only: npm, Gradle, uv, Dart, pip, cargo, temp), Startup Manager (Task Manager's reversible StartupApproved toggle), Gaming Mode (Game Mode, Game Bar capture, power mode), Review and Apply, Results, History and Undo, Settings.
v2: data mover (WSL, SDKs) with free-space checks, System Repair runner (SFC/DISM with live progress), Debloat (fixed Store-app list), exact faulting-driver analysis from dumps.
Memory (decided 26 Nov 2026, user asked for Mem Reduct-like features): no automatic threshold-based RAM purging, which empties the standby cache and causes game stutter. Instead: v1 read-only memory panel (per-app usage, compressed memory, standby and modified lists, page file); later a "close before gaming" list, an optional one-time "trim background apps" before a game, and a standby-list purge only when a real problem is detected, opt-in and explained (needs the admin helper). Implemented from Windows APIs directly; no Mem Reduct (GPLv3) code.
App name: Lagsmith (renamed from System Ready on 26 Nov 2026; the design still shows the old name). Approved design: light dashboard on Doop canvas KQV3ZmmkNI, references in references/EXACT-light.webp.
Never auto-deletes unknown folders or user data (for example Hugging Face models). Memory Integrity is explained, never toggled automatically. Name: Lagsmith.

## Evidence on Hand

Real diagnostic data from one session on the user's own ThinkPad T480: two bugchecks (0xCE on 25 Nov, 0x50 on 24 Nov), vgk.sys present in both dumps, C: 12.2 GB free of 158.6 GB before cleanup and 46.7 GB after, caches freed 16.6 GB (npm 4.5, Gradle 9.5, uv 2.1, Dart 2.2), WSL Ubuntu 18.3 GB moved to D:, five startup apps disabled. No testimonials, user counts, ratings, or benchmarks exist; do not invent them.

## Product Principles

1. Every number has a source the user can see.
2. Nothing changes without a review step, and everything that can be undone can be undone from History.
3. Plain English first, technical detail on expand.
4. Calm by default: red only for real crashes and errors, never to pressure a click.
5. Readable and fully usable on a 1366x768 laptop screen.

## Accessibility & Inclusion

WCAG AA contrast in both dark and light themes, full keyboard navigation, respects reduced motion.
