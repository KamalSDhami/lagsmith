# Lagsmith UI critique (Operate mode, whole app)

Method: single-context review (no detector run; the impeccable launcher is not installed in the project, and the phase is read-only). Rendered every page with the mock backend at 1366x768 and 1100x700, scrolled to bottoms, opened the Storage and Gaming review dialogs, and compared to `docs/references/EXACT-all-screens.webp`. Screenshots: `test-results/critique/*.png` (`<page>-<width>-top|bottom.png`, `s-*.png`). Line numbers refer to the current tree.

Constraints used as the bar: clean SaaS, accent used rarely, light mode, no gradients, no emoji, no em dashes, fits 1366x768, Jakob's law, match the owner's design.

## Verdict

The visual system is sound: tokens, card radius, type scale, and colour restraint are consistent and close to the owner's design. The problems are structural, not cosmetic. The owner's four complaints map to concrete causes:

| Owner complaint | Root cause |
|---|---|
| Few sections feel bloated | Cards that explain instead of act (Gaming right column, Hardware tip and page-file cards, Storage "What's filling C" panel, Crash anti-cheat card repeated on Gaming); 5 of 10 Storage rows are "Not available yet" dead rows. |
| Spacing issue | Three spacing dialects: `Page` uses `mt-4` header gap and `gap-3` cards (Page.tsx:27), Memory uses `mt-6`/`mt-4`/`gap-4`/`p-[18px]` and its own header (MemoryPage.tsx:28,34,99), Dashboard uses `mt-4`/`mt-3`. Cards stretch to fill height (`flex-1`) so short content floats in tall white boxes (Hardware, Debloat, History, Gaming GPU card). |
| Components hard to access | Inner scroll regions hide rows below the fold at 1366x768 (Storage list loses 3 of 10 rows, Crash dumps list 1 of 2+, Memory table cuts off); Dashboard stat cards look clickable but are not; 18px checkboxes; 44x24 toggles are fine but labels are not clickable; the primary action sits in a footer inside a scrolling card. |
| Missing meaningful CTA | Stat cards with badges "Needs Attention", "Upgrade Tip", "Review" are inert; Crash page has no "fix this" path; Hardware memory tip has no action; Memory page has no action; Scan complete sends to Dashboard with "View results"; History empty state has no next step; Debloat has no bulk path. |
| Hard to navigate | Sidebar groups are fine but there is no back path or breadcrumb context after a cross-link, no "scan again / last scanned" status in the shell, no way to jump from a finding to the exact item (it lands on the top of the page), Settings is a placeholder in the nav. |

## Ranked fixes (top 10)

1. Make the five Dashboard stat cards real links (P0). StatCards.tsx:90-130, 274-291. Whole card is a `<button>` that calls `onOpen`: Stability to Crash Detective, Storage to Storage Cleaner, Memory to Memory, Graphics to Hardware, Startup to Startup Manager. Add a trailing `ArrowRight` that appears on hover and on focus. Badges stay as status, not as fake buttons. Copy: Memory badge "Upgrade Tip" becomes "Single channel". Startup badge "Review" becomes "4 apps on".
2. Fix the inert "Last 30 days" control (P0). CrashPage.tsx:153-156 renders a bordered span that looks like a select. Either make it a real segmented control (7 days, 30 days, 90 days) that filters the counts and timeline, or delete it and put "Last 30 days" in the subtitle. Recommendation: real control, because the Dashboard says "last 7 days" and Crash says 30; the two numbers then disagree for the same blue screens.
3. Storage Cleaner: remove dead rows and make the primary action always visible (P0). StoragePage.tsx:310-376. Rows with "Not available yet" (Android SDK, Downloads, .cache, Documents) are 4 of 10 and push real caches into a scroll area. Fix: default tab "Caches" shows only actionable rows; "Move data" and "Your files" become informational tabs with no disabled checkboxes; move the 3 "Your files" rows into the right panel only (they are already listed there). Pin the "5 items selected (19.6 GB)" + "Review & Clean" bar to the card bottom outside the scroll (it already is; keep). Change the button copy to "Review 5 items" so the count carries to the dialog. Remove the redundant `Move...` button beside the `Move` pill on Ubuntu (StoragePage.tsx:343): the pill is the label, the button is the action; drop the pill on actionable rows.
4. Cross-link findings to the exact thing, not the page top (P1). derive.ts:111-211, TopFindings.tsx:50, App.tsx:69-76. Pass a target with the page id (`{page:"storage", focus:"c-drive"}`, `{page:"crash", focus:"0xCE"}`). Pages scroll to and highlight the row for 1.5 s. At minimum the Low disk finding should land on Storage with the cache rows selected and the Review bar showing "Free 19.6 GB". Rename actions to verbs: "View crashes" becomes "Find the cause", "View storage" becomes "Free 19.6 GB", "View hardware" becomes "See upgrade tip", "Fix in Gaming Mode" stays.
5. Dashboard: show all findings, drop "View all N" (P1). TopFindings.tsx:21,93-111. Collapsing 4 to 3 hides one item behind a link to save 60 px; there is ~130 px of empty space under the list at 1366x768 (`dashboard-1366-top.png`). Raise `COLLAPSED` to 5. Also at 1100 wide the stat grid breaks into 3+2 with an orphan gap (StatCards.tsx:296, dashboard-1100-bottom.png); use `grid-cols-5` with smaller type below 1240 or `grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]`, and let the sidebar shrink to 220 px below 1200 (Sidebar.tsx:8).
6. System Repair: one primary, not three (P1). RepairPage.tsx:144-151, 165-178. Three black full-width buttons side by side break the colour restraint and give no order. Fix: "Run SFC" is the single filled button; "Run DISM" and "Create Restore Point" are outline. Add one line under the page subtitle: "Start with SFC. If it can't repair files, run DISM, then SFC again." Reorder so Restore Point is first and labelled "Optional, recommended" only if the helper flow wants it before repairs; otherwise keep it last. Show "Last run: Nov 26, Repaired" inside each card instead of a separate "Last results" card (RepairPage.tsx:180-226), which removes 180 px of bloat and puts the result next to the control.
7. Gaming Mode: cut the right column to what drives a decision (P1). GamingPage.tsx:220-335. Six cards (settings, GPU, anti-cheat, requirements, tips, Memory Integrity, Hyper-V) fight the one task. Fix: keep "Optimize for gaming" banner and the three settings; fold Anti-cheat status + VALORANT requirements into one "VALORANT readiness" card (Running, Secure Boot On, TPM 2.0); turn Game tips, Memory Integrity, and Hyper-V into one collapsed "What Lagsmith explains but never changes" disclosure (default closed). Per-app GPU card: hide the empty middle (GamingPage.tsx:112-125, tall empty white area in `gamingmode-1366-top.png`) by not stretching with `flex-1`; the app-path input (152-170) needs a visible label "Add a game .exe" and a Browse button instead of a bare text input. Banner copy: "Apply Optimization" becomes "Review and apply 3 changes" and the banner states which of the 3 are already on (Game Mode is already on in the screenshot, so the button promises work that does not exist; disable and say "Already optimized" when nothing differs).
8. Startup Manager: say what to do and fix the dead-end lock text (P1). StartupPage.tsx:14-18, 48-110. "Needs admin (coming soon)" is stale: the admin helper exists (CONTEXT.md). Replace with a real "Turn off (admin)" action that goes through the helper, or "Admin needed. Not available yet" without "coming soon". The header aside shows "9 startup apps, 4 on" but the Dashboard says "4 apps"; align wording ("4 on of 9"). Add a column-free sort: put On rows first, and mark high-impact apps (the owner's design has an Impact column; ours dropped it, so users cannot tell what to switch off). Add a one-line CTA above the table: "Switch off what you do not need before a game. Every change is in History & Undo."
9. Debloat: cut the empty card and add a path (P2). DebloatPage.tsx:21-53. Two rows in a viewport-tall white card (`debloat-1366-top.png`). Do not stretch (`flex-1` on the card, line 23); let the card hug its content. Move the irreversibility warning out of the 90-character subtitle into a one-line notice above the list. Add checkboxes plus a "Remove selected" footer only if the list grows beyond 3; otherwise keep per-row Remove but style it destructive-outline text, since it is irreversible. Cross-link from the empty state: "Nothing to remove. Free space in Storage Cleaner."
10. Scan flow: give the result a destination (P1). ScanPage.tsx:56-69, 141-158. Idle state is a blank page with one sentence and one button; finished state ends with "View results" back to the Dashboard, so the user sees the same Dashboard they left. Fix idle: show last scan time and what it will read as four checklist rows (same rows as the running state, all "Not run"), so the page does not change shape when the scan starts. Fix done: the summary card shows the top finding and its action ("2 blue screens on Nov 25 and 26. Find the cause"), with "View all 4 findings" as the secondary. Also make "Scan Now" on the Dashboard ScanHero show "Last scanned 2 min ago" once data exists, and add a persistent "Scan again" in the TopBar of every page (it is only reachable from Dashboard and Scan PC today).

## Page by page

### Dashboard (App.tsx:50-62, StatCards.tsx, TopFindings.tsx, ScanHero.tsx)
- Hard to access: stat cards inert (see fix 1). Bell popover is empty ("No notifications yet", TopBar.tsx:28): remove it until it holds something, or it reads as a broken control. Avatar circle (TopBar.tsx:31) is not interactive; fine, but it looks like an account menu (Jakob). Remove or make it open Settings.
- Bloat: ScanHero gradient and SVG wave (ScanHero.tsx:11,14-22) are decoration; the owner's design has them, so keep the soft tint but drop the extra wave paths and use a flat `#eeedfb` to respect "no gradients". Hero is 116 px for one button; at 1366x768 that is acceptable but the description is truncated at 1100 (`truncate`, line 36): let it wrap to two lines.
- Spacing: stat grid `mt-3`, findings `mt-4`, hero `mt-4` (three different values for same-level gaps). Use `mt-4` for all. Empty band of ~130 px at the bottom at 1366x768: use it for findings (fix 5).
- CTA: "Scan Now" is the primary (correct). Findings buttons are all outline (correct), but their labels are page names, not outcomes (fix 4). Row layout `grid-cols-[2.25rem_1fr_minmax(9rem,13rem)_9.5rem]` makes the evidence column (`2 blue screens (Windows Event Log)`) compete with the title; show source as a small caption under the title and drop the column to give the body text room (TopFindings.tsx:34,44-47). Body text is truncated mid-sentence on every row; with the column gone it fits.
- Nav: "Windows 11" footer chip in the sidebar (Sidebar.tsx:45-49) looks like a button and is not. Make it plain text, or replace it with "Last scan 2 min ago, Scan again".

### Scan PC (ScanPage.tsx)
See fix 10. Running state: Ring is 200 px plus a 3-row card plus stats plus Cancel: it matches the owner's design. Spacing: `gap-10 px-6` around the ring, then `mt-6` twice; the whole block floats high in the viewport with ~200 px empty below. Centre it vertically (Page with `justify-center`) or tighten.

### Crash Detective (CrashPage.tsx)
- Fix 2 for the fake control.
- Bloat: Anti-cheat status card (third column) duplicates Gaming Mode's card and is not about crashes. Keep one line instead: a chip "Vanguard running" in the Crash reports header with a link to Gaming Mode. The freed column goes to the crash dumps list, which is currently squeezed into the bottom of the App crashes card (CrashPage.tsx:224-280, `max-h-[10.5rem]`), so dumps are the hardest thing to reach even though they are the key evidence.
- Missing CTA: the headline 0xCE report has no action. Add "Analyze dumps" as the primary button in the Crash reports card header ("Find the faulting driver"), and show the result (vgk.sys) back on the report row. Today "Analyze dumps" is a small outline button in a lower card (CrashPage.tsx:241). After the analysis, add the next step: "vgk.sys is Riot Vanguard. Lagsmith will not change it. See Gaming Mode requirements."
- Layout: the 3 stat cards at the top (2 / 0 / 2) restate numbers that the timeline and lists show below; at 1366x768 they cost 72 px. Merge them into the timeline legend ("2 blue screens, 0 driver resets, 2 app crashes") and give the height to reports and dumps.
- Responsive: at 1100 the subtitle wraps and the dump filenames truncate to `11252...` (crashdetective-1100-top.png); drop the third column below 1200.

### Hardware (HardwarePage.tsx)
- Bloat: nine cards for a read-only page. "Page file" (201-248) and "Graphics adapters" (250-277) and "Memory upgrade tip" (202-226) are stretched to fill height with half-empty bodies. Fix: stop `flex-1` stretching; merge Page file into Memory's card as one more row; merge Graphics adapters into Graphics.
- Data trust: "No battery data" with "Plugged in, Balanced plan" (HardwarePage.tsx:160-188) on a ThinkPad reads as a bug. If there is no battery, show "No battery" or hide the card; if there is, show charge.
- CTA: the memory upgrade tip has no action. Add "See memory details" linking to Memory, and a secondary "Check compatible RAM" only if a real URL exists; otherwise no button.
- Spacing: first row of cards uses `p-4`, second row the same, third row `p-4` with a title: consistent, good. The 14 px vertical rhythm differs from Memory's 18 px.

### Memory (MemoryPage.tsx)
- Spacing: only page that does not use `Page` (header with Refresh at line 93, `mt-6` at 99, `mt-4` after), so its title/gaps differ from the rest (`memory-1366-top.png`). Port to `Page` with `aside={<Refresh/>}`.
- Bloat: the info banner (99-107) is a full card for a permanent explanation. Make it a one-line muted caption under the subtitle with a "Why?" disclosure.
- Hard to access: the Top apps table is cut after 5 rows with no visible scrollbar affordance; the row `Google Chrome 24 processes 1.9 GB` is the actionable finding. Add a row action only where it is safe and real, e.g. "Close before gaming" (planned, see PRODUCT.md) as a disabled-with-reason control, not a missing one. At minimum, label the sections and cap at 8 rows with "Show all".
- Cross-link: if available is under ~25% of total, show a finding on the Dashboard and link to this page.

### Storage Cleaner (StoragePage.tsx)
See fix 3. Extra: the right panel "What's filling C:" (title has a stray colon) repeats the list data and leaves 250 px empty (`storagecleaner-1366-top.png`); replace with a single stacked bar (programs, WSL, app data, your folders) and a legend. Header aside "19.6 GB Potential space to free" and the footer "5 items selected (19.6 GB)" say the same number twice; keep the header, make the footer "5 selected" plus the button. Filter chips with counts (All 10, Developer 4, System 1, Move data 2, Your files 3) are 5 choices for 10 rows: drop to three (Safe to clean, Move, Yours).

### Startup Manager (StartupPage.tsx)
See fix 8. Spacing: table row height ~61 px, 9 rows fill the card with room; at 1100 it holds. The Source column ("Current user (HKCU)") is registry jargon (Product principle 3: plain English first). Show "You" / "All users" and put the registry key in a title or expand.

### Gaming Mode (GamingPage.tsx)
See fix 7. At 1100 the page scrolls (28 px) and the Hyper-V card is cut off (`gamingmode-1100-bottom.png`); the collapse in fix 7 removes the overflow. Power mode and GPU selects are native `<select>`s with default chrome (GamingPage.tsx:134-165, 249); fine for Jakob, but widen them to 9 rem so "Let Windows decide" is not clipped.

### System Repair (RepairPage.tsx)
See fix 6. Extra: the "Requires admin rights" in the subtitle should be a shield glyph on the buttons (the UAC prompt expectation belongs at the control). The DISM "Last results" text ("Lagsmith can't read past DISM results yet", 180-226) is an apology, not information; say "Not run yet" and move on.

### History & Undo (HistoryPage.tsx)
- Empty state (96-103) is a viewport-tall card with one sentence. Add the next step: "Nothing changed yet. Free space in Storage Cleaner" with a link, and shrink the card to content. 
- With data (owner's design): row = title, date, count, "View details", "Undo All". Ours shows per-set `Undo` and expandable details (HistoryPage.tsx:17-60); keep, but make the whole row header clickable, not only the chevron (aria-expanded button at ~49), and add the freed-space total in the page aside, like Storage and Startup do.
- Undo dialog copy "Undo changes" is fine; add the count ("Undo 6 changes").

### Debloat (DebloatPage.tsx)
See fix 9. Subtitle is 95 characters and repeats the warning the review dialog already shows.

### Settings
Nav item leads to "Coming in a later build" (Placeholder.tsx). A dead nav item costs trust and a click. Hide Settings until it has content, or ship one real setting (reduce motion, helper status, version, "Report a problem").

## Navigation and cross-cutting

- Sidebar (Sidebar.tsx): grouping is good (Diagnostics, Optimization, System). Memory sits under Diagnostics, which is right, but Debloat under Optimization next to Storage Cleaner is a destructive page next to safe ones; move it to System. Active state (accent-soft pill plus accent icon) is clear and matches the design. Heights flex with window height (`h-8 / h-9 / h-10`), which is thoughtful; keep.
- Keyboard: sidebar and buttons are real buttons (good); focus ring exists (`index.css:54`). Missing: a skip link to main, `Ctrl+1..9` or `G then D` page shortcuts (Alex persona), and Esc closes dialogs only. Add `aria-live` page-change announcement (title is an `h1` already; move focus to it on navigation so screen-reader users hear the page change, App.tsx:44-47).
- Back paths: after "View crashes" the user cannot return except via the sidebar. Add a small "Back to Dashboard" ghost link in the page aside when the user arrived from a finding.
- Tiny targets: Storage row checkboxes are 18x18 (`Select npm cache 18x18`); wrap in a 40 px high row-click target (the whole row toggles) and keep the checkbox visual 18 px. Dashboard "View all 4" is 65x21 (fix 5 removes it).
- Fit: every page fits 1366x768 with inner scrolling; Dashboard at 1100x700 scrolls the whole page by 111 px and Gaming by 28 px. Acceptable at the 1100 minimum, but the inner-scroll regions are what the user cannot reach on Storage/Crash/Memory.
- Colour restraint: accent is used for active nav, selected checkboxes, the "View all" link, toggles, the progress bar. Fine. Warning amber is used for the disk bar on Dashboard, Storage, and Hardware (three places for one fact); acceptable because it is the same fact, but only the Dashboard card should carry colour, the others neutral.
- Copy: no emoji, no em dashes found in rendered text. Titles are inconsistent: "Hardware Overview" (page) vs "Hardware" (nav), "Optimize for gaming" vs "Gaming Mode". Match page `h1` to the nav label.

## Persona red flags

- Jordan (first-timer, laggy PC): Dashboard says "2 blue screens, Needs Attention" and nothing happens on click (fix 1). Crash page names `0xCE` before the plain-English meaning. Memory and Hardware pages teach but never ask for a decision.
- Alex (power user): no shortcuts, no select-all in Storage beyond defaults, no way to sort Startup by impact, Startup HKLM entries cannot be changed even though the admin helper exists.
- Sam (keyboard/screen reader): focus ring present and dialogs are native `<dialog>` (good). Focus is not moved on page change; fake "Last 30 days" control is not focusable, which is an inconsistent affordance; disabled Storage checkboxes carry no reason in their accessible name for 4 of 5 rows.

## Compared to the owner's design (EXACT-all-screens.webp)

Matches: sidebar structure, card style, scan ring, hero card, Storage layout with side panel, Startup table, Gaming layout, History rows.
Diverges, and the owner's design is the better one in each case:
- Startup lost the Publisher and Impact columns (design: App, Publisher, Impact, Startup), which is what makes the page decision-ready.
- Storage rows in the design show Safe/Move badges only on rows that act and have `>` chevrons to expand; ours adds "Not available yet" text on half the rows.
- History in the design is a list of change sets with "View Details" and a single "Undo All"; ours is per-set Undo with no aggregate.
- Dashboard in the design has four stat cards and three findings, each with an outcome-worded button; ours has five cards and a collapsed fourth finding.
- Crash page in the design has no anti-cheat card; it is two columns (timeline above, reports below).

## Status (27 Nov 2026)

Verified with `npx playwright test --project=mock` (67 pass, 8 new in `e2e/mock/navigation.spec.ts`), `npm run build`, and screenshots at 1366x768 and 1100x700 (`node scripts/screenshots.mjs`, output in gitignored `test-results/ui/`). Not run: `test-real.ps1`, any Rust.

Top 10:
1. DONE. Stat cards are whole-card links with a hover/focus arrow and the global focus ring. Memory badge is now "N slot(s) free" (real slot count) and the Startup badge is gone ("on at startup, N listed"), because "Single channel" and "4 apps on" repeated the text beside them. Graphics card now opens Hardware instead of a popover.
2. DONE. Real "Last 7 days / Last 30 days" control on Crash Detective; counts, timeline and both lists filter by their own timestamps. 90 days SKIPPED: Rust reads 30 days only. Driver resets have no dates, so they stay labelled "30 days, no dates". Default stays 30.
3. DONE. Tabs are Safe to clean / Move / Yours; default tab has only actionable rows; no disabled checkboxes; whole row toggles; "Review N items"; "What's filling" is a stacked bar plus legend. Move/Yours keep information rows (Android SDK etc.) in their own tabs.
4. DONE. Findings pass `focus` ids; the target scrolls into view and flashes 1.5 s; outcome-worded labels. "Free 19.6 GB" SKIPPED: cache sizes load only on Storage, so the label has no figure.
5. DONE. COLLAPSED 5, evidence folded into the title line, stat grid auto-fit, sidebar 220 px under 1200.
6. PARTLY. One filled button (SFC), outline for the rest, shield glyphs, "start with SFC" line. "Last results" card kept (compacted): moving results into cards would duplicate badges and break the V2-9 region tests.
7. DONE. Gaming: banner proposes only settings that differ ("Already optimized" when none); readiness card merges anti-cheat and VALORANT requirements; tips, Memory Integrity and Hyper-V sit in a closed disclosure; GPU card hugs content; visible "Add a game .exe" label. Browse button SKIPPED: no file-dialog plugin.
8. PARTLY. Honest machine-wide wording (no new elevated action), "You/All users" style source labels, On rows first, CTA line, "4 on of 9" wording. Publisher/Impact columns SKIPPED: `StartupApp` has no such data.
9. DONE. Card hugs rows, warning moved out of the subtitle, destructive-outline Remove, empty state links to Storage. Bulk "Remove selected" SKIPPED (2 items).
10. PARTLY. Idle Scan page shows the five steps as "Not run"; done state shows the top finding with its action plus "View all N findings"; sidebar footer has "Scan again" and "Last scan N min ago" (this session only); hero shows "Last scanned" after a scan. Persistent TopBar button replaced by the sidebar one.

Page items done: bell and avatar removed; Settings nav removed (placeholder deleted); Debloat moved to System; OS chip is plain text; Memory ported to `Page`, one-line caption, top 8 apps with Show all; Hardware title "Hardware", memory tip has "See memory details", cards hug content; History row header is the expand button, freed total in the header, empty state links to Storage, "Undo N changes"; ScanHero flat colour, wrapping text; one spacing rhythm (`Page` gap 16 px); skip link, focus moves to the page `h1` on navigation, "Back to <page>" after a cross-link.
SKIPPED: Ctrl+1..9 shortcuts (undiscoverable without UI); battery "No battery" wording (cannot tell absent from unreadable); merging Page file and Graphics adapters on Hardware; Crash stat tiles merged into the legend (done) but no per-row "fix" beyond Analyze dumps.
