# Lagsmith layout spec (Operate mode, all pages)

Status: proposal for owner sign-off. Nothing here is built. Written 28 Nov 2026 as a shape brief (`impeccable shape`): it records decisions and the reasons for them, not CSS. Where a decision needs data or a backend change that does not exist yet, it is marked **DEP** and collected in section 14.

Inputs read: `docs/PRODUCT.md`, `docs/CONTEXT.md`, `docs/ANTI-CHEAT.md`, `docs/UI-CRITIQUE.md`, `docs/references/EXACT-all-screens.webp`, every file in `src/pages` and `src/components`, `src/index.css`, `src/lib/derive.ts`. Current screens were rendered with the mock backend at 1366x768 (`test-results/layout-spec/*.png`, gitignored).

Mode: **Operate**. The user is mid-task (a game stutters, Windows crashed). Familiar patterns beat expression. Brand lives in precision: one accent, quiet surfaces, exact alignment.

Constraints kept from the brief: clean SaaS, Apple-style colour restraint (accent is rare), no brutalism, no gradients, no emoji, no em dashes, Jakob's law, stay close to the owner's design image. Light stays the default and the reference; dark is added (section 6) because the owner decided it.

---

## 0. How this spec was researched (and what was not)

| Source | Result |
|---|---|
| Appllama MCP (`search_screens`, `search_apps`, `list_ui_elements`) | **Unavailable.** Every call returned "Appllama MCP is part of Pro and this membership isn't active". No screen or app references from it. |
| 21st.dev `search` | Worked, but returns component metadata and preview images only (comboboxes, search groups). Not useful for page-level patterns. Not used. |
| Microsoft Learn, NavigationView | **Verified.** Expanded at 1008 px and wider, icon-only compact pane at 641 to 1007 px, minimal below 641. |
| Notion and Linear sidebar shortcuts (web search) | **Verified.** Notion toggles the sidebar with Ctrl+\\. Linear collapses it with `[`, the sidebar border, or "Collapse" in the command menu. |
| lawsofux.com | **Verified.** Law names and one-line definitions used in section 13 were read from the site. |
| Windows 11 Settings, Microsoft PC Manager, CleanMyMac, Raycast, Apple System Settings, iStat Menus, Task Manager, VS Code, Discord, Figma, Notion layout | **General knowledge, not verified in this session.** Patterns are cited as "common practice" and should be treated as design reasoning, not evidence. |

Patterns taken from that general knowledge, used throughout:

- **Per-item settings lists** (Windows 11 Settings > Display > Graphics, Apple System Settings): one row per item, control at the right edge, search above the list, the page scrolls, the list never gets its own scrollbar.
- **Health card to fix** (PC Manager, CleanMyMac): one scan, one headline result, one primary button, then a "review details" step before anything changes.
- **Issue to fix to resolved** (Linear issues, Apple Settings "Software Update", Windows Security): an item has states Open, then Resolved. Resolved items stay visible, quieter, with the evidence, and can be hidden.
- **Page header** (Windows 11 Settings, Linear): title left, at most one primary action right, status in a quiet line, not another big control.
- **Empty states** (Linear, Apple): say what is true, then offer the one next step.
- **Staged changes** (VS Code Source Control, Windows Settings toggles that stack into "Apply"): changes accumulate in a bar with count, Discard and Apply.

---

## 1. Diagnosis: why the pages feel wrong

Measured on the current tree, not guessed. Line numbers are as of 28 Nov 2026.

| Owner complaint | Root cause in code | Shared fix (section) |
|---|---|---|
| Empty space in Storage left list, Hardware bottom row, Gaming bottom right | `Page` makes the body `flex-1 min-h-0` (Page.tsx:55) and cards use `flex-1` / `h-full`, so a card is as tall as the viewport whatever it holds. Storage list card stretches to 548 px with 5 rows. Hardware third row cards hug unequally. Gaming columns end at different heights with nothing below. | 2.1 scroll model, 2.3 column rules |
| Per-app GPU list too small, 2 rows in a tiny nested scroll | `GpuPrefCard` puts the list in `min-h-0 flex-1 overflow-y-auto` inside a half-width column that has to share the viewport with 3 other cards. | 2.1, 9 (Gaming) |
| Sections bloated | Cards that explain rather than act (Hardware tip, page file, adapters; Gaming disclosure; Repair "Last results"; Memory caption). | per page "removed / merged" |
| Spacing issues | Three spacing dialects, no scale. Card radius 18, paddings 12/14/16/18/20 all appear. | 4 tokens |
| Boxes uneven | Stretch rules are mixed: some columns stretch, some hug, tile rows have different anatomy. | 2.3 |
| Components hard to access | Nested scroll hides rows (Storage, Crash, Memory); primary action sits inside a scrolling card; toggles open one dialog each; header metrics compete with actions. | 2.1, 2.4 action bar |
| Missing CTAs | Findings and cards that inform but do not lead anywhere (Crash reports, Hardware tip, Memory, History empty). | 11 CTA map |
| Hard to navigate | No indication in the nav of where problems are; no collapse; Settings missing; cross-link context only via a back button. | 3 shell |

The mock data does **not** reproduce the nested-scroll clipping: at 1366x768 with mock data no list overflows and the GPU list has one row. The owner saw 2 visible rows with real data. So every list below is specified for **short and long** data, and these screenshots are not evidence of the clipping, only of the stretch and imbalance problems.

---

## 2. Layout rules (shared, apply to every page)

### 2.1 Scroll model (proposed rule change and its trade-off)

**Rule.** Two page types, set by one prop on `Page`:

- `fit` (**Dashboard only**): fills the viewport, never scrolls at 1366x768 or 1100x700 in the typical case. Content is budgeted (section 7).
- `flow` (**every other page**): content height. The page frame has no `h-full`. The `main` element is the only scroll container. No card uses `flex-1`, `h-full` or `max-h`. **No nested scroll areas.** Lists show every row (or a bounded "Show N more" inline expand). The only scroll containers besides `main` are dialogs (their own sheet).

Where this lives in code: `Page.tsx` (`flex h-full min-h-0 flex-col`, body `flex-1`) becomes a `variant` prop; `App.tsx` wrapper `flex h-full flex-col` (App.tsx:104) stops forcing height for `flow`. A new `ActionBar` component (2.4).

**What we give up.**

1. PRODUCT.md principle 5 ("fully usable on a 1366x768 screen") changes meaning: it is true for Dashboard as "fits", and for every other page as "primary action always reachable" (sticky action bar), not "everything visible without scrolling".
2. The Playwright `expectFits` assertions on non-Dashboard pages become wrong. Replace with: no horizontal overflow; zero nested scrollables (`overflow-y:auto` element with `scrollHeight > clientHeight` inside `main`); sticky bar visible when pending changes exist.
3. A user scrolls the page to see a long list instead of the list scrolling in place. This is what Windows Settings, Apple System Settings and Linear do, and it is what the owner asked for (GPU list).
4. Headers scroll away. Primary actions that matter while a long list is scrolled live in the sticky bar, not the header.

**What we gain.** No card ever stretches to the viewport, so no empty boxes. No hidden rows. One scrollbar, one place to look. List length no longer decides layout.

**At the 1100x700 minimum.** `flow` pages simply scroll a little more. Dashboard is budgeted for 1100x700 (section 7), loses at most one finding row of capacity, and with more findings than capacity it offers "Show N more" which expands inline and may then scroll (a user-chosen state, not the default).

### 2.2 Grid and width

- Content column: `max-width 1200`, centred in `main`, page padding 24 left/right, 20 top and bottom.
- 12 column grid, 16 gutter. Allowed splits: 12; 8+4; 6+6; 4+4+4. Anything else needs a reason in the page spec.
- Minimum content width to design for: **812 px** (window 1100, sidebar manually forced expanded at 240, padding 48). Normal widths: 1078 at 1366 with expanded sidebar; 988 at 1100 with the auto rail.
- Tile rows use `repeat(auto-fit, minmax(17rem, 1fr))` so 3 columns become 2 at narrow widths, never an orphan.

### 2.3 Column and equal-height rules (fixes "boxes are uneven")

- **E1 Tile rows are equal height with equal anatomy.** Cards in one row share the same internal rows (head, value, sub, visual, footer). Equal height comes from the grid, and no tile is half empty because every tile fills the same slots (a slot may hold a quiet "no data" line).
- **E2 Everything else aligns to the start and hugs its content.** Never `flex-1`. Bottom edges of neighbouring non-tile cards are not required to line up.
- **E3 Balance check.** If two side-by-side cards differ in height by more than 48 px, restructure: merge the short one into the tall one, move it to a full-width row, or stack the page in one column. Do not stretch the short one.
- **E4 Context rail.** An 8+4 page puts a long list on the left and a short context card on the right with `position: sticky; top: 20`. The rail follows the list so it never leaves a hole beside it. Use an 8+4 only when the left side is reliably longer than the rail. When list length is unpredictable (Crash, Memory, History) use one column.
- **E5 Empty and short states keep the same frame.** A short list is a short card (hugging), with the next-step CTA inside the card (see each page). Never a viewport-tall card holding one sentence.

### 2.4 Shared components added

- **`ActionBar`** (sticky bottom of `main`, 64 px, card style with `shadow-pop`, 16 px above the window edge, full content width). Appears only when there are pending changes. Left: count and size ("5 selected, 19.6 GB"). Right: Discard (ghost) and the primary ("Review 5 items"). 150 ms rise, none under reduced motion. `main` gets 88 px bottom padding while it shows so the last row is never covered. Used by Storage, Startup, Debloat, Gaming (GPU list).
- **`PageHeader`**: title (H1), subtitle (one line, 14/20 muted), right side: **at most one filled primary**, plus optional secondary and the "Back to X" ghost. No metric asides (they move to a summary strip or card).
- **`SummaryStrip`**: a 56 px single card under the header holding the 2 to 4 numbers that used to sit in the header aside.
- **`FindingChip`**: Open (severity colour), Resolved (success), Watching (neutral). See section 10.
- **`SampleDataBanner`**: section 3.4.

### 2.5 Staging rule (one change pattern app-wide)

- A **single** switch or select (Game Mode, Power mode) goes straight to the Review sheet for that one change, as today.
- A **list of many items** (Storage selection, Startup toggles, Debloat selection, GPU preferences) **stages** into the `ActionBar` and goes to one Review sheet. This removes one dialog per Startup toggle.
- Nothing is applied without Review. Nothing is undone without History.

---

## 3. App shell

### 3.1 Sidebar

Order, top to bottom: logo + collapse toggle; Dashboard, Scan PC; **Diagnostics** (Crash Detective, Hardware, Memory); **Optimization** (Storage Cleaner, Startup Manager, Gaming Mode); **System** (System Repair, Debloat, History & Undo); then, pinned to the bottom outside the scrolling nav: **Scan again** + last scan line, then **Settings**. (Common practice: settings sit at the bottom; VS Code, Discord and Linear do this.) Settings is the 12th page, id `settings`.

**Collapse logic** (Windows NavigationView reference verified; Linear and Notion shortcuts verified):

| Aspect | Decision |
|---|---|
| Widths | Expanded 240. Icon rail 64. (Currently 260 above 1200 and 220 below.) |
| Auto-collapse | When window width < **1200**, the sidebar becomes the 64 px rail. Expand again at >= 1224 (24 px hysteresis so dragging the window edge does not flap). Reason: Windows' own pattern collapses at 1008, but our minimum window is 1100 so a copy would never fire. Below 1200 the content column drops under about 900 px and 8+4 splits get cramped; the rail returns 176 px. |
| Preference | Persisted tri-state `sidebar: auto | expanded | collapsed`, default `auto`. |
| Manual toggle | A panel icon button next to the logo (in the rail it sits under the logo). Clicking sets `expanded` or `collapsed` explicitly and overrides auto. Settings has "Sidebar: Automatic, Expanded, Collapsed" to return to auto. A forced `expanded` is honoured down to the 1100 minimum (content 812 wide, see 2.2). |
| Shortcut | **Ctrl+B** toggles (VS Code and Visual Studio muscle memory on Windows; there is no rich text field to clash with). Shown in the toggle's tooltip: "Collapse sidebar (Ctrl+B)". Notion's Ctrl+\\ and Linear's `[` are not added: one shortcut, discoverable. |
| Rail icons | 20 px, 40 x 40 hit area, centred in the 64 px rail. Group labels become 1 px dividers. |
| Tooltips | Label to the right of the icon, 150 ms delay after the first, shown on hover and on keyboard focus. Tooltip for Scan again includes the last scan time. Name and shortcut where one exists. |
| Hover on rail | **No hover-to-expand.** Hover shows a tooltip and the standard hover fill. Expand-on-hover moves the content target under the cursor and is easy to trigger by accident (Fitts). Expansion happens only through the toggle. |
| Active indicator | 3 px by 16 px accent bar at the item's left edge, accent-soft pill behind the row (light) or neutral subtle pill (dark), and the **Filled** icon variant instead of Regular. Three cues, so it never relies on colour alone. `aria-current="page"` stays. |
| Finding dots | An 8 px dot at the top right of the nav icon (danger for critical, warning for warning) on pages that own an open finding, in both widths. Resolved findings remove the dot. Gives the rail the information the labels carried and tells the user where problems are (nav complaint). No numbers, no counts. |
| Transition | Width 180 ms ease-out; none under `prefers-reduced-motion`. Labels fade, never wrap during the animation. |
| Footer in rail | Scan again becomes a 40 px icon button (spins while scanning). Last scan text hidden; it is in the tooltip. Sample data state shows a 28 px "S" chip (3.4). |

Removed: the OS name line in the footer (it is on Hardware). "PC Optimizer" tagline stays only in the expanded logo block.

### 3.2 Page header

Same on every page: H1 (26/32 semibold), subtitle (14/20 muted, one line, no instructions longer than a sentence), right side primary or none. Titles equal the nav label ("Hardware", not "Hardware Overview"). "Back to <page>" ghost appears after a cross-link, as today.

### 3.3 Dashboard-only shell items

Greeting header. No bell, no avatar.

### 3.4 Sample data banner

Shown whenever the frontend runs without Tauri (`!inTauri` in `src/lib/api.ts`, which already exists), so preview screenshots are never mistaken for the real PC.

- A 28 px strip at the very top of the window, above sidebar and content, full width, `warning-soft` background, 13 px text: "Sample data. You are viewing a preview with made-up values, not this PC." Not dismissible. Info icon 16.
- The sidebar footer also shows a "Sample data" chip (a letter "S" chip in the rail).
- Every capture script prefixes file names with `sample-` when the banner is present.
- The Dashboard fit budget (section 7) is calculated **with** the banner, so mock-backed `expectFits` tests pass and the real app has 28 px to spare.
- The banner never renders inside the Tauri window (real builds).

---

## 4. Shared tokens

### 4.1 Spacing scale (one scale, 4 px base)

`--space-1 4`, `2 8`, `3 12`, `4 16`, `5 20`, `6 24`, `7 32`, `8 48`.

| Use | Token |
|---|---|
| Gap between cards, grid gutter | 16 (space-4) |
| Gap between a section heading and its card | 8 (space-2) |
| Gap between page sections (heading groups) | 24 (space-6) |
| Page padding | 24 sides, 20 top and bottom (space-6, space-5) |
| Header to first content | 16 |
| Card padding | 16 (space-4) |
| Row padding in lists | 12 vertical, 16 horizontal; min height 56 (compact table rows 44) |
| Icon to text | 12 |
| Inside a card, between sub-groups | 12 |

Retired values: 14, 18, 22, `p-[18px]`, `mt-6` in one page and `mt-4` in the next.

### 4.2 Radius and elevation

- Card 16 (was 18; 18 is off the 4 px grid and visually identical). Controls 10 (md), 8 (sm), pill for chips and tabs, icon tile 10. Dialog 20.
- Elevation: cards `shadow-card` in light (1 px hairline), none in dark (border only). Popover and ActionBar `shadow-pop` in light, border + slightly lighter surface in dark.

### 4.3 Buttons (one filled primary per page state)

| Level | Look | Use |
|---|---|---|
| Primary | filled ink (light) / filled near-white (dark) | The one action that advances the page's job. **Exactly one per page state.** State can move it (System Repair: SFC first, DISM after "could not repair"). |
| Secondary | outline | Alternatives, row-level actions ("Review", "Move..."). |
| Tertiary | ghost or accent text link | Navigation-ish: "Show all", "Back to", "Select all". |
| Destructive | outline with danger text; filled danger only inside a confirm dialog | Remove Store app, Undo. |

Heights: lg 48 (hero only), md 40, sm 32. Minimum hit height anywhere is 32. Whole list rows that navigate are clickable. Disabled buttons always have a visible reason within 8 px, not only a tooltip.

### 4.4 Components needing a spec in all states

default, hover, focus (global 2 px accent ring), active, disabled, loading (skeleton, not a spinner in content), error (inline with Try again), empty. `Show` already handles loading and error; every list adds the empty state from its page spec.

---

## 5. Type, font, icons

### 5.1 Font: keep Inter Variable, add Cascadia Mono for code-like data

Decision: **keep Inter** (bundled, `@fontsource-variable/inter`).

Reasons: (1) CSP is `font-src 'self'`, and a bundled font renders identically in the app, in the preview browser and in screenshots; Segoe UI Variable exists only on Windows 11 and not in the sample-data preview. (2) Inter's tall x-height holds up at 12 to 14 px on the 1366x768 non-HiDPI laptops this app targets. (3) It has tabular figures, which matter on a page full of sizes and percentages. (4) It is already what the owner's design uses, so no visual drift.

Cost: a little less "native Windows" feel. Mitigation: system stack fallback is `"Segoe UI Variable Text", "Segoe UI"`, which is correct if the font file fails.

Second family, only for code-like data (file names, paths, drivers such as `vgk.sys`, dump names, bugcheck codes, exe paths): **Cascadia Mono** (ships with Windows 11 Terminal), fallback Consolas, then `ui-monospace`. 13 px, regular. System fonts are not blocked by the CSP. Rejected: Geist (no gain here), Segoe UI Variable as primary (inconsistent across environments).

Numerals: `font-variant-numeric: tabular-nums` on every number that changes or aligns (sizes, percentages, times, counts).

### 5.2 Type scale (fixed rem, ratio about 1.15 to 1.2, 16 px base)

| Role | Size / line | Weight | Use |
|---|---|---|---|
| Page title (H1) | 26 / 32, -0.01em | 600 | one per page |
| Section heading | 18 / 24, -0.01em | 600 | Dashboard "Top findings", Settings section headings |
| Card title | 15 / 20 | 600 | every card header |
| Metric | 22 / 28, tabular | 600 | stat values, summary strip |
| Body | 14 / 20 | 400 | row text, descriptions |
| Label / button | 14 / 20 | 500 | row titles, buttons, table cell names |
| Secondary | 13 / 18 | 400 | muted descriptions, sub lines |
| Caption | 12 / 16 | 400 | evidence/source lines, chips, tooltips |
| Code | 13 / 18 Cascadia Mono | 400 | paths, files, drivers |

Rules: weights 400, 500, 600 only. Minimum text size 12. Muted text is `--muted` (`#5f5f67` light, 6.4 to 1 on white; dark value in 6.2). One H1, then H2 section headings, then card titles as H2/H3 in order (no skipped levels). Row titles never exceed 15.

### 5.3 Icons

Decision: **Fluent System Icons (Regular), via `@fluentui/react-icons`**, replacing Lucide. One family, one weight (Regular everywhere). The only weight change is **Filled for the active nav item**, which is state, not decoration.

Why Fluent: Lagsmith is a Windows 11 app whose users live in Settings, PC Manager and Task Manager, so Fluent icons are native vocabulary (Jakob). It ships pixel-snapped 16, 20 and 24 sizes (crisp on 1366x768 non-HiDPI screens, where scaled 1.75 px strokes blur). It has the domain icons we need (game controller, hard drive, memory, shield, battery, wrench). It has a Regular/Filled pair that gives a non-colour active cue. MIT licence, imported per icon so unused icons are tree-shaken.

Why not Phosphor: broad weight range but not Windows-native, and the duotone variant adds a second tone per icon, working against the colour-restraint rule. Why not keep Lucide: generic web feel and size-scaled strokes; the owner asked for richer, more professional.

Sizes by context (always pick the matching pixel variant, never scale):

| Context | Size | Style | Colour |
|---|---|---|---|
| Sidebar nav | 20 | Regular; Filled when active | `--muted`; active uses accent |
| Card header glyph (in 32 tile, radius 10) | 20 | Regular | tile ink (accent on tile) |
| Row leading icon (in 36 tile) | 20 | Regular | status tile colour or subtle |
| Inline with text or in buttons | 16 | Regular | inherits text colour |
| Status marks (check, warning, info) | 16 | Regular | status colour |
| Empty state and hero | 24 in a 48 tile | Regular | muted / accent |

Migration table (verify exact export names at install; if a name has no match, draw one to the same 20 px grid rather than mixing in another family):

| Current (Lucide) | Fluent |
|---|---|
| House | Home |
| Search | Search |
| TriangleAlert | Warning |
| Cpu | DeveloperBoard |
| MemoryStick | Memory (or custom RAM glyph if absent) |
| Layers (Storage Cleaner) | Broom or HardDrive |
| Power (Startup) | Power |
| Gamepad2 | XboxController |
| Wrench | Wrench |
| LayoutGrid (Debloat) | Apps |
| History | History |
| Settings (new) | Settings |
| Monitor | Desktop |
| Battery | Battery |
| ShieldCheck | Shield |
| Info / CircleCheck / CircleX | Info / CheckmarkCircle / DismissCircle |

---

## 6. Colour and dark mode

Accent stays rare: active nav, selected checkbox and tab, toggles on, progress, links. Light tokens stay as in `src/index.css`. Dark tokens below are the new spec.

### 6.1 Dark palette: Apple-style neutral greys

Owner rejected greenish and bluish darks, so every surface and text value is a **true neutral (R = G = B)**. Hue appears only in the accent and status colours.

| Token | Light | Dark | Note |
|---|---|---|---|
| canvas | `#f6f6f8` | `#161616` | page background |
| sidebar | `#f0f0f3` | `#1c1c1c` | one step lighter than canvas |
| surface (cards) | `#ffffff` | `#202020` | |
| raised (dialog, popover, ActionBar) | `#ffffff` | `#2a2a2a` | |
| subtle (chips, hover) | `#eeeef2` | `#292929` | |
| line | `#e7e7ec` | `#353535` | 1 px borders |
| ink | `#1c1c1f` | `#f5f5f5` | |
| muted | `#5f5f67` | `#a3a3a3` | about 6.4 to 1 on `#202020` (check) |
| accent | `#4f4cd0` | `#9d9bf5` | about 6.5 to 1 on surface (check) |
| accent-soft | `#e8e7fb` | `#2e2e3d` | tab and chip fill only; selected nav uses the neutral subtle pill in dark |
| primary button | bg `#1c1c1f` text white | bg `#f5f5f5` text `#161616` | inverted, same hierarchy |
| danger / soft | `#b4232b` / `#fdeced` | `#ff8f94` / `#3a2123` | |
| warning / soft | `#8a5300` / `#fdf1d8` | `#f2b84b` / `#372d17` | |
| success / soft | `#1b7136` / `#e3f5e8` | `#6fcf8a` / `#1d3123` | |
| info / soft | `#2462c9` / `#e7effc` | `#86b6ff` / `#1c2a3f` | |
| focus ring | accent | accent | 2 px, 2 px offset |
| data (bar segments, timeline dots) | `#5b58dc #8f8dea #c2c0f2 #8e8e98` | `#9d9bf5 #7a78d8 #5a58a8 #8a8a8a` | |
| shadow | card hairline | none (border only) | |

All values are first proposals. Contrast numbers are estimates: run every text and status pair through a WCAG AA checker before sign-off (PRODUCT.md requires AA in both themes).

### 6.2 Theme mechanics

- Setting: Light, Dark, System (Settings > Appearance). Default System. Light remains the reference design.
- Implementation: `data-theme="light|dark"` on `<html>` plus `color-scheme`. System follows `prefers-color-scheme` live.
- **Flash prevention**: the theme must be applied before first paint, but the CSP is `script-src 'self'`, so an inline script is blocked. Ship a tiny `public/theme-init.js` (same origin) loaded synchronously in `<head>`.
- Persisted via the app settings file (**DEP**), with `localStorage` as the preview-only fallback.
- Hard-coded colours to replace with tokens before dark can ship: timeline dots and grid (`#5b58dc`, `#ececf1`, `#5f5f67` in CrashPage), scan ring strokes (ScanPage), Storage segment colours, History expanded background `#fafafb`, sidebar hover `#e7e7ec`, primary hover and disabled (`#33333a`, `#55555c`), card hover border `#d4d4dc`, Dashboard hero colours and `mix-blend-mode: multiply` on the laptop image (multiply renders a black box in dark; needs a transparent PNG and a dark-friendly hero, **DEP** asset).

---

## 7. Dashboard

**One job:** answer "is my PC OK, and what do I do first?" in one glance.
**Primary action:** **Scan Now** (hero). After a scan the best next step is the top finding's button.

Layout type: `fit`. Single column, five blocks, top to bottom.

| # | Region | Width | Height | Content |
|---|---|---|---|---|
| 1 | Header | 12 | 56 | Greeting. Subtitle: "Last scan 2 min ago, 4 findings" or "Not scanned yet" (replaces the generic sentence). |
| 2 | Scan hero | 12 | 88 | Laptop image 64 px, title, one line, **Scan Now** (lg button). Flat tint, no wave. |
| 3 | Stat tiles (5, E1 equal) | auto-fit min 9rem | 136 | Stability, Storage, Memory, Graphics, Startup. Fixed anatomy: icon + title row, value (22), one sub line (13), chip row (24). Whole tile is the link (kept). Chip states: Needs attention, Stable, Resolved, Watching, Single channel, Driver up to date, "1 slot free". The "via Windows Update" micro line is folded into the chip. |
| 4 | Top findings | 12 | remaining | Section heading with count. One card, rows 56 each. Open findings first, then a collapsed "Resolved (N)" row. |

Findings row (56): severity tile 36, title (15/500) + one muted line (13) that contains evidence and source separated by middle dots ("2 blue screens in the last 7 days. Windows Event Log"), button right (outline sm, outcome-worded: "Find the cause", "Free up space", "See upgrade tip"). The old two-line body is dropped; the full text sits in the destination page.

**Height budget (with the 28 px sample banner, worst case).**

| | 1366x768 | 1100x700 |
|---|---|---|
| Main height (viewport minus banner minus 40 padding) | 700 | 632 |
| Header 56 + 16, hero 88 + 16, tiles 136 + 16, findings heading 36 | 364 | 364 |
| Resolved row (collapsed) | 44 | 44 |
| Left for open findings | 292 (5 rows of 56) | 224 (4 rows of 56) |

Without the banner (real app) add 28. If open findings exceed capacity: the list shows the capacity and a footer row "Show N more", which expands in place (the page may then scroll; that is the user's choice).

**Resolved findings** appear here (section 10): a collapsed "Resolved (N)" row below the open ones, expandable to rows with a success tick, the evidence ("No blue screen since Nov 27"), and the same destination link, text style quiet. A finding that just resolved on the latest scan shows once in the open group with a "Resolved" chip, then moves into the Resolved row on the next scan.

**Short data.**

- No findings: one 56 px success row ("No issues found. Last scan 2 min ago") with a ghost "Scan again". Tiles still show their values.
- Before the first scan: tiles show real values from the startup read; findings card shows a single row "Nothing scanned yet" with a ghost "Scan Now" (the hero button is the primary).
- Loading: skeleton tiles and three skeleton rows (current behaviour).
- Partial failure: unchanged "Some checks couldn't run. Try again."

**CTAs.** Every tile opens its page (Stability to Crash Detective, Storage to Storage Cleaner, Memory to Memory, Graphics to Hardware, Startup to Startup Manager). Every finding has a button to the exact item (focus id). Info-only findings (Memory Integrity) have no button and no hover state; they are marked "Info" and sort last.

**Removed or merged:** hero wave and extra decoration, "View all N" link (replaced by in-place Show more), duplicated "Needs Attention" badge text (now the chip), the "Windows 11" chip (already removed).

---

## 8. Scan PC

**One job:** read the PC once and tell the user the outcome.
**Primary action:** Start scan (idle). During: Cancel scan (outline). Done: the top finding's action (filled), with "View all N findings" secondary.

Layout: `flow`, centred column `max-width 800`, top aligned (not vertically centred).

| Region | Width | Content |
|---|---|---|
| Header | 12 | Title changes with state ("Scan PC", "Scanning your PC", "Scan complete"). |
| Progress block | 4 + 8 | Left: ring 200 px with percent. Right: steps card, five rows, always five (Not run / Reading / Done / Couldn't read). Below the ring: one caption line "3 of 5 steps, 0:24" (replaces the separate two-stat row). |
| Action row | 12 | Button as above. Idle caption: "Lagsmith only reads. Nothing on your PC changes during a scan." |

Done state: the summary card shows the headline ("4 findings. Top: Recent blue screens"), the one-line evidence, and, from the second scan on, **"Resolved since last scan: Low disk space"** (a success row, section 10).

**Short data.** Zero findings: success summary, button "Back to Dashboard". Failed steps: row says "Couldn't read" with a Try again link, summary counts them. Cancelled: "Scan cancelled. Results that already arrived are kept." with Start scan.

**CTAs.** Done to top finding destination; "View all N findings" to Dashboard.

**Removed:** the separate stat strip, the vertical centring that left 200 px empty below.

---

## 9. Page specs

Each page: one job, one primary, regions (width and order), short-data behaviour, CTAs, removals.

### 9.1 Crash Detective

**One job:** understand why Windows crashed and what to do about it.
**Primary:** **Analyze dumps** (header; needs one UAC prompt, stated next to the button: "Windows will ask for admin permission to read dump files"). After analysis the header button becomes secondary "Re-analyze", and the page's filled primary is the "How to fix" step inside the top crash (so there is still exactly one).

Layout: `flow`, **one column** (list lengths are unpredictable, so no 8+4).

| # | Region | Width | Content |
|---|---|---|---|
| 1 | Header | 12 | Title, subtitle, range segmented control (Last 7 days, Last 30 days) in the aside, Analyze dumps primary. |
| 2 | Timeline card | 12 | One card: legend with counts on the top row (blue screens, shutdowns, app crashes, driver resets "30 days, no dates"), dot plot below. The three stat tiles are already merged here. |
| 3 | Blue screens | 12 | Card with header (title, count, suspect chip "vgk.sys in 2 of 2 dumps" after analysis). Rows: icon tile, code and meaning, time, severity chip, suspect chip, dump file (mono), and a **How to fix** button that expands the row in place. |
| 4 | App crashes | 12 | Compact table (44 px rows): app, faulting module, time. Show 5, "Show all N" expands in place. |
| 5 | Other dump files | 12 | Collapsed disclosure listing dump files not matched to a report (name, date, size). Replaces the separate "Crash dumps" card. |

**How to fix (per crash, expands inside the row; never a dialog).** Content depends on state:

| State | What shows | Primary CTA |
|---|---|---|
| Not analyzed, dump exists | One line: "Find out which driver was involved." | **Analyze dumps** (runs the UAC task; progress inline) |
| Not analyzed, no dump saved | "No dump was saved, so the driver can't be named. Windows may not be set to save dumps." Steps: update graphics driver (Hardware), run SFC (System Repair). | **Open System Repair** |
| Analyzed, suspect is a graphics driver, or code is 0x116 / 0x117 | "A video timeout. Update the graphics driver." with driver status. | **Check driver update** (Hardware, driver status) |
| Analyzed, suspect is another non-protected driver | "<driver> was named. Update or reinstall the software that installs it." | **Check driver update** if class matches, else none. |
| Analyzed, **suspect is `vgk.sys`** | **Advice-only card**, below. | **Open Riot support** (link) |
| Analyzed, no suspect | "No single driver was named in this dump." Steps: update graphics driver, run SFC then DISM. | **Open System Repair** |

The code to advice table (0xCE, 0x50, 0x116, 0x117, 0x133, others) is content owned by the owner; Lagsmith never says a file is corrupted unless an SFC result says so.

**vgk.sys advice-only card** (inside the row; also the only content shown for protected suspects):

- Title: "Riot Vanguard (vgk.sys) was named in N of M dumps"
- Wording depends on `driversLabel`: `cause` gives "named as the cause in N of M dumps"; `drivers present` gives "was loaded in N of M dumps" (weaker, never "caused").
- Body: "Lagsmith never changes Vanguard. A clean reinstall is the usual next step: 1. Open Settings, Apps, Installed apps, find Riot Vanguard and uninstall it. 2. Restart your PC. 3. Open the Riot client and start VALORANT; it reinstalls Vanguard."
- Buttons: filled **Open Riot support** (external link) and outline **Open Apps settings** (`ms-settings:appsfeatures`).
- **Never** the phrase "corrupted files" or any claim about file damage: there is no evidence for it.
- It is a one-line note plus numbered steps; no Lagsmith action ever targets Vanguard (ANTI-CHEAT.md rules 5 and 6; Lagsmith does not read the Vanguard folder either).

Dependencies for this card: N of M exists **only after an admin analysis in this session** (it is not persisted). Before analysis the CTA is Analyze dumps. The Riot support URL must be verified before shipping (do not recall it from memory). **DEP:** an external-open path (there is no `opener` plugin or open-URL command and the CSP is strict); add a Rust command with a hard allow-list of hosts and protocol handlers (`https://support-leagueoflegends.riotgames.com` family, `ms-settings:`), no free-form URL.

**Short data.**

- Zero blue screens in range: success row "No blue screens in the last 30 days. Last one: Nov 27." The timeline still draws. How to fix is absent.
- One blue screen: the Blue screens card is one row tall (E5); the page is short and honest. No right rail to unbalance it.
- No app crashes: the card collapses to one line "No app crashes in this range" (no empty box).
- Resolved: header chip "No blue screen since Nov 27" when criteria in section 10 are met.

**Removed or merged:** Anti-cheat status card (already removed), separate Crash dumps card (now inline in reports plus a collapsed list), the three stat tiles (legend carries the numbers).

### 9.2 Hardware

**One job:** show what the PC has and flag the one thing worth upgrading or checking.
**Primary:** none. The page is informational. Secondary in the header: **Copy system info** (cheap, clipboard; gamers paste it into support threads).

Layout: `flow`. Two tile rows, each row equal height (E1). Cards are CTAs with info.

| Row | Cards | Anatomy |
|---|---|---|
| 1 (light tiles, 136) | **CPU** (name, cores, threads), **System** (OS, device, BIOS short "N24ET81W", full BIOS string in a tooltip), **Battery** | head, value, sub |
| 2 (rich tiles, about 200) | **Graphics**, **Memory**, **Storage** | head, value, sub, visual, footer CTA |

- **Graphics** (merged with adapters): primary GPU name, driver version, driver status chip (up to date, update available, from `check_driver_updates`), and each adapter as a small row with its role ("Used for the display", "Used by games"); more than 2 adapters show "+N". Footer CTA: **Check driver update** (opens the driver check), or "Set GPU preference" to Gaming when a dual-GPU PC has an app on power saving.
- **Memory** (merged with the upgrade tip and page file): total and speed, "1 of 2 slots, Single channel", page file as one compact row ("Page file 2.4 GB, 0.6 GB in use"), a one-line tip when single channel ("Add a matching stick for dual channel"). Footer CTA: **Memory details** to Memory.
- **Storage** (mini breakdown): one bar per drive; for the system drive, a segmented mini bar (programs, WSL, app data, your folders) with the biggest segment named. Footer CTA: **Free up space** to Storage Cleaner (only shown when below the low-disk ratio; otherwise "Open Storage Cleaner" as a ghost link). **DEP:** the segments need `get_disk_usage`, which loads lazily and slowly; until it arrives the card shows the plain drive bars and a skeleton for the breakdown, never a blocking spinner.
- **Battery**: health bar (full-charge capacity over design capacity) with the percentage; state ("Plugged in, Balanced plan"). Fields can be null: show "Battery details aren't available on this PC" (neutral). **DEP:** `hasBattery` from the backend; when false, hide the card and let the row use two columns (auto-fit), so a desktop never shows a dead battery tile.
- **System**: OS name and build, device model, short BIOS; hover or focus on the BIOS shows the full string.

**Short data.** Missing hardware read: tile shows skeleton, then "Couldn't read hardware info. Try again". Row 1 with two cards widens to two columns via auto-fit.

**CTAs.** Graphics: driver check or Gaming; Memory: Memory page; Storage: Storage Cleaner; Battery (worn, below 50%): "See replacement tips" is not offered (no URL); only a muted explanation. CPU and System: none, they are facts.

**Removed or merged:** Memory upgrade tip card, Page file card, Graphics adapters card. Total 6 cards (was 9).

### 9.3 Storage Cleaner

**One job:** free disk space safely.
**Primary:** **Review N items** (ActionBar, bottom, sticky). Count and total shown with it.

Layout: `flow`, single column (the right "What's filling" panel is merged into the summary card).

| # | Region | Width | Content |
|---|---|---|---|
| 1 | Header | 12 | Title, subtitle. No metric aside. |
| 2 | Summary card | 12 | Left: system drive bar and "12.2 GB free of 158.6 GB". Right: **19.6 GB can be freed** (metric). Below: the "What's filling C:" stacked bar with legend (programs, WSL disks, app data, your folders; largest item each). One card, 3 rows, about 150 px. |
| 3 | Tabs | 12 | Safe to clean (5), Move (2), Yours (3). |
| 4 | List card | 12 | Header row: "5 selected" with Select all / Clear (ghost). Rows 56: checkbox 18 inside a full-row label, name, path caption, size, badge (Safe / Move / Yours). Sorted by size, largest first. Hugs its rows. |
| 5 | ActionBar | 12 | Sticky when 1 or more selected: "5 selected, 19.6 GB" / Clear / **Review 5 items**. |

Rows are never stretched; the page scrolls if the list is long (long data: a user with 30 cache folders sees 30 rows, scrolls the page). The "What's filling" legend moved up, so there is no empty column beside the list.

**Short data.**

- 1 to 2 safe rows: the list card is 1 to 2 rows tall, followed by a quiet card "Nothing else is safe to clean. The biggest item on C: is WSL Ubuntu, 18.3 GB, which can move to another drive." with **Move it** (switches to the Move tab). The next step fills the space meaningfully, no empty box.
- 0 safe rows (nothing to clean): success row "Nothing to clean right now", same Move suggestion if there is a movable item, else "C: has 46.7 GB free".
- Move and Yours tabs: info rows only, no disabled checkboxes. Move rows have **Move...** (opens the existing dialog, then Review). Yours rows have no action (never cleaned automatically); a muted note says so.
- Measuring folders: partial summary card, skeleton for the breakdown only.

**After a clean.** The summary card shows an evidence line "Freed 16.6 GB, C: now 28.8 GB free" from History, and the Dashboard disk finding resolves when the free ratio crosses the threshold (section 10).

**Removed or merged:** right "What's filling" card (into the summary), header "Potential space" metric (into the summary), the repeated footer total.

### 9.4 Startup Manager

**One job:** stop apps you do not need from launching with Windows.
**Primary:** **Apply N changes** (ActionBar). Toggling a switch stages the change (section 2.5), shows pending state on the row, and no dialog opens until Apply.

Layout: `flow`, single column.

| # | Region | Content |
|---|---|---|
| 1 | Header | Title, subtitle ("Switch off what you don't need before a game. Every change is in History & Undo."). |
| 2 | Summary strip | "4 on of 9 startup apps". Right: Select none / "Turn off all that are on" is **not** offered (no impact data to justify it). |
| 3 | Table card | Columns: App (icon tile, name, command in mono, truncated with full text on hover), Source ("You", "All users", "Startup folder"; the registry path in the tooltip), Startup (switch). The old Status badge column is removed because the switch already says on or off. On rows first, then Off, each alphabetical. Rows 56, hugging. |
| 4 | ActionBar | Pending changes. |

Locked rows: lock icon, one short reason in the Startup column, full reason in the tooltip ("Anti-cheat software is never changed by Lagsmith", "Machine-wide: change it in Task Manager"). Anti-cheat entries never offer a switch.

**DEP:** `StartupApp` has no publisher or impact field, so there is no Impact column (the owner's design has Publisher and Impact). Until the backend adds `publisher` (from file version info) and an impact value, the page cannot rank apps; it must not invent impact. When added: Publisher column after App, Impact column before Startup, sort by impact. "Turn off (admin)" for machine-wide entries depends on a helper task that does not exist yet; until then the row says "Needs admin" and links to Task Manager guidance.

**Short data.** 1 to 3 apps: the card is 1 to 3 rows, followed by a quiet line "Nothing else starts with Windows." Zero: "No startup apps found" success state. Long: 40 rows, page scrolls.

**CTAs.** Row switch (stages); ActionBar Apply; Dashboard's startup finding lands on the table with the on rows first.

**Removed:** Status column and the metric aside.

### 9.5 Gaming Mode

**One job:** get the PC ready for a game.
**Primary:** **Review and apply N changes** (banner). "Already optimized" when nothing differs.

Layout: `flow`.

| # | Region | Width | Content |
|---|---|---|---|
| 1 | Banner | 12, 72 | Icon, "Optimize for gaming", which settings differ ("To change: Power mode"), primary button. |
| 2 | Row, equal height (E3 check) | 8 + 4 | Left: **Optimization settings** card (Game Mode, Game Bar recording, Power mode, power note) plus a footer line "Changes go through Review and can be undone from History". Right: **VALORANT readiness** (anti-cheat service rows, Secure Boot, TPM, the "Lagsmith never changes anti-cheat software" line; footer link **How to enable Secure Boot / TPM** when failing, external, DEP). Measured heights today: left 224, right 272; the footer line brings left to within 48. The row stretches (allowed, within the E3 limit). |
| 3 | **Per-app GPU preference** | 12 | Full width, page-scrolling list. See below. |
| 4 | "What Lagsmith explains but never changes" | 12, 48 collapsed | Disclosure: game tips, Memory Integrity, Hyper-V and WSL. Closed by default. |

**Per-app GPU preference list (the owner's complaint).**

- A full-width card. Header: title, a **search field** (filters by app name or path; shown always once there are more than 5 rows, otherwise hidden), and a tertiary **Add a game** button that reveals the add row inline.
- Rows (56): app icon tile, app name (15/500), exe path (mono, truncated in the middle, full path in the tooltip), a source chip ("You added it", "Windows setting"), and a **3-option segmented control** (Windows decides, Power saving, High performance) instead of a native select (3 options, always visible, fewer clicks: Hick and Fitts).
- Sorted: apps with a non-default preference first, then alphabetical.
- Changes **stage** to the ActionBar ("2 GPU changes, Review and apply").
- **No inner scroll.** 40 apps means 40 rows and the page scrolls. Search is the shortcut.
- Add row (footer): labelled path input "Add a game .exe", the segmented control, **Set**. **Browse** is **DEP** (no file-dialog plugin today); until then the field stays and says "Paste the full path".
- Empty: "No per-app preferences yet. Windows decides for every app." with the Add row open.
- Single-GPU PC (no dual GPU, from `hasDualGpu`): the whole card becomes one info row, "This PC has one graphics adapter (Intel UHD 620), so a GPU preference has no effect", and the list is hidden. Honest and short.

**Short data.** Nothing to optimize: banner reads "Already optimized". Readiness failing: note card inside the readiness card with the plain reason. Anti-cheat missing: "No anti-cheat software found" row.

**CTAs.** Banner Apply; each switch and select opens Review for one change; readiness footer link; GPU Add and ActionBar; Dashboard findings land on `valorant`, `power-mode`, `gpu-pref` anchors.

**Removed or merged:** nothing new removed; the tips, Memory Integrity and Hyper-V stay in one collapsed disclosure (already done). The right column no longer ends in a hole because the GPU list moved out of it to full width.

### 9.6 Memory

**One job:** see how RAM is used and free some of it when needed.
**Primary:** **Clean memory** (button inside the "Free up memory" card, which is the first card after the summary).

Layout: `flow`, single column.

| # | Region | Width | Content |
|---|---|---|---|
| 1 | Header | 12 | Title, subtitle, **Refresh** (ghost icon button) in the aside. The permanent explanatory caption is removed. |
| 2 | Summary card | 12 | One card: a segmented bar (In use, Cached, Free) with legend and values (Total, Available, In use %, replacing the three stat cards), and a thin second bar for **Commit charge** ("9.6 GB of 13.8 GB"). |
| 3 | **Free up memory** card | 12, split 6 + 6 | Left: **Clean memory** (below). Right: **Auto-clean** (below). A vertical divider between the halves. |
| 4 | Top apps | 12 | Table with 44 px rows: App, Processes, Memory. Shows 8, **Show all N** expands in place (no inner scroll). |

**Clean memory (manual, left half).**

- Button **Clean memory** (filled primary) and a checkbox beneath it: "Also clear the standby list (needs admin permission)". Ticking it makes the button say "Clean memory (asks for admin)" and the result runs through the helper with a UAC prompt.
- Honest copy: "Frees memory held by background apps right now. Windows refills RAM as you work, so the effect fades, and apps can feel slower for a moment while they reload."
- What it does: trims the working set of normal user apps. It **never** touches game or anti-cheat processes: protected names are excluded **before** any handle is opened (ANTI-CHEAT.md rules 1 and 4; the same list as `scan/protected.rs`).
- Disabled during a game session (`is_game_session`): the button is disabled and the card shows "Paused while a game or anti-cheat is running" in text next to it (not only a tooltip).
- Running: button shows "Cleaning..." with progress for the admin variant. Result (inline strip under the card header, replaced next run): "Freed 1.2 GB. Available memory 2.1 GB to 3.3 GB. Windows will use it again." The change is recorded in History as "Memory cleaned" with "Can't be undone" (there is nothing to undo).
- Nothing frees much: "Not much to free: your apps are already using little extra memory" (success, not a failure).

**Auto-clean (right half; decided by the owner).**

- Switch **Auto-clean**, **off by default**.
- When on: "Clean when memory use passes [85] %" (stepper, 60 to 95 in steps of 5, default 85), plus a status line "Now 73%. Cleans above 85%."
- **No timed interval.** It evaluates on the memory reads the app already takes and fires **one** clean when use crosses the threshold, then waits until use drops 10 points below the threshold before it can fire again (hysteresis, not a timer).
- Paused while a game session or `vgc.exe` is running (status line "Paused while VALORANT is running"); never touches protected processes (same exclusion, same list); never runs the admin standby purge on its own (that always needs a user click and UAC).
- Copy states the trade-off: "Can cause brief slowdowns when apps reload."
- It only runs while Lagsmith is running. **DEP:** if the owner wants it to work with the window closed, that needs the tray icon (Settings, 9.12) so the process stays alive.
- The same switch and stepper also live in Settings > Memory (9.12). One stored value, two places to edit it; Memory page shows it where the decision is made, Settings is where people look for it. Both stay in sync.
- Decision: an optional extra safety, **recommended** and listed as an open question in section 14, is to also pause when Windows reports a fullscreen D3D app (`SHQueryUserNotificationState`, which opens no process handle) so unrecognised games are protected too.

**Short data.** Few top apps: the table is a short card; page below it is empty because nothing is stretched. Loading: skeleton summary. Error: inline Try again.

**CTAs.** Clean memory; Auto-clean; each top app row has no action (a "Close before gaming" list is a later feature, not shown). Dashboard Memory tile links here; the Hardware Memory card links here.

**Removed or merged:** the permanent caption (replaced by the honest copy inside the Clean memory half), three stat cards (into the summary).

### 9.7 Debloat

**One job:** remove leftover Microsoft Store apps.
**Primary:** **Remove N apps** (ActionBar), nothing preselected (the action cannot be undone).

Layout: `flow`, single column.

| # | Region | Content |
|---|---|---|
| 1 | Header | Title, subtitle ("Leftover Microsoft Store apps you can remove."). |
| 2 | Notice | One 40 px warning-soft strip: "Removing an app can't be undone in Lagsmith. You can reinstall it from the Microsoft Store." |
| 3 | List card | Rows 56: checkbox, icon tile, name, publisher. No per-row Remove button (it duplicated the bar); the whole row toggles. Hugs its rows. |
| 4 | ActionBar | "2 apps selected" / Clear / **Remove 2 apps** (destructive outline until the Review sheet, where the confirm is the filled button). |
| 5 | Footnote | "Lagsmith only shows a fixed list of Store apps. Nothing outside the list is touched." |

**Short data.** 1 to 2 apps: a 1 to 2 row card plus the footnote. Zero: "Nothing to remove" success row, with **Free space in Storage Cleaner** as the next step.

**CTAs.** Row select, ActionBar Remove, empty state to Storage.

**Removed:** the stretched card, the per-row Remove buttons, the warning from the subtitle.

### 9.8 System Repair

**One job:** repair damaged Windows system files in the right order.
**Primary:** the next step in the sequence. **Run SFC** by default; **Run DISM** when the last SFC result was "could not repair" (state moves the filled button).

Layout: `flow`, one card with three sections, one per step, replacing three equal tiles plus a "Last results" card.

| Section | Content |
|---|---|
| Background repair banner | Stays above the card when a repair outlived the window. |
| 1 Create restore point (optional) | Icon, title, one line, last result chip and date, **Create Restore Point** (outline). |
| 2 Check system files (SFC) | Icon, title, "Scans protected Windows files and repairs corrupt ones. Can take 10 to 60 minutes." **Run SFC** (primary by default), last result chip ("No problems", "Repaired", "Could not repair") with date and the plain explanation. |
| 3 Repair Windows image (DISM) | Same pattern; **Run DISM** (outline unless SFC said it could not repair). Last result from this session only (honest "Not run in this session" until a log reader exists). |

Header subtitle carries the order: "Start with SFC. If it can't repair files, run DISM, then SFC again. Windows asks for admin permission first." A shield glyph sits on every button (admin expectation at the control).

Running state: the section expands with a progress bar, stage text, percentage, and the other sections' buttons show "Waiting for SFC to finish". Cancel is not offered (SFC/DISM should not be interrupted); the close guard stays.

**Short data.** Never run before: each section says "Not run yet" (no apology text). All results present: sections show chip and date, no empty space.

**CTAs.** Each section's button; after "Could not repair" the DISM button takes over as primary. If System Repair is reached from a crash with no suspect, the Crash "Open System Repair" CTA lands on SFC.

**Removed:** the "Last results" card (moved into the sections), three equal filled-looking tiles.

### 9.9 History & Undo

**One job:** review what Lagsmith changed and undo it where Windows allows.
**Primary:** none (per-row **Undo** is secondary; Undo is a reversal, not the page's advance). The page summary shows total freed.

Layout: `flow`, single column.

| # | Region | Content |
|---|---|---|
| 1 | Header | Title, subtitle. |
| 2 | Summary strip | "16.6 GB freed in total, 4 change sets", and, when relevant, "2 findings resolved". |
| 3 | Day groups | A small heading per day ("Today", "Yesterday", "Nov 24") over one card per group. Row (56): outcome tile, title, "6 changes, 16.6 GB freed", state chip (Undone, Can't be undone), expand chevron (whole left side is the button), **Undo N changes** (outline sm). Expanded: the item list inline. |
| 4 | Filters | Only when there are more than 15 sets: chips All, Cleanup, Startup, Gaming, Repair. |

Rows that resolved a finding show a quiet chip **"Resolved: Low disk space"** (only when the re-scan evidence says the condition is gone; section 10). Memory clean entries show "Can't be undone" and a disabled Undo with the reason beside it.

**Short data.** Empty: the card hugs ("No changes yet. Lagsmith hasn't changed anything on this PC.") with two CTAs: **Free space in Storage Cleaner** and **Open Gaming Mode**. One set: one row, the page is short. Long: loads 20, then **Show older** (no inner scroll).

**CTAs.** Undo; expand; Resolved chip to the related page; empty state to Storage and Gaming.

### 9.10 Settings (new, 12th page)

**One job:** control how Lagsmith behaves and look at what it is.
**Primary:** none. Settings apply instantly (no Save). Each change is visible where it is made.

Layout: `flow`, single column, `max-width 720`, left aligned. Section headings (18/24) sit **outside** cards; each section is one card of rows (Apple System Settings and Windows 11 Settings pattern). Row: label (14/500) and one-line description (13 muted) on the left, control on the right, min height 56.

| Section | Rows |
|---|---|
| General | **Start Lagsmith with Windows** (switch; a per-user Run entry, reversible; an app setting, not a History change set). **Show tray icon** (switch; cheap in Tauri 2 if scope is icon plus Open and Quit menu; when on, the close button can minimise to tray, and CloseGuard still protects running repairs). Mark the tray behaviour **DEP**. |
| Appearance | **Theme**: segmented Light, Dark, System (default System). **Sidebar**: Automatic, Expanded, Collapsed. |
| Memory | **Auto-clean memory** (switch, off by default). **Clean when memory use passes** [85] % (stepper 60 to 95). Description repeats the key rule: "Paused during games. Never touches game or anti-cheat processes. No timer." Mirrors the Memory page controls. |
| Permissions | **Admin helper**: status row ("Ready", "Not installed") and a plain line: "Lagsmith asks for admin permission once per action. It never keeps admin rights." Read-only. |
| About | Version and build, **Licences** (opens `THIRD-PARTY-NOTICES`), **Privacy** (plain statement: "Lagsmith reads Windows event logs, hardware data and folder sizes on this PC. Nothing is sent anywhere." **Verify that this is literally true before shipping**; there must be no telemetry), project link, "Sample data" state when in preview. |

**Short data.** No empty states; every row always renders. Read failures show a row with "Couldn't read" and Try again.

**CTAs.** Switches and selects only. Licences and the project link are external (**DEP**, opener path).

---

## 10. Resolved markers (derived from evidence, never from a click)

**Principle.** A finding becomes Resolved only when a later scan shows the condition is gone. Pressing Apply, Review, Clean or any button never marks anything resolved. There is no "Mark as resolved" control anywhere.

**States.** Open (condition present), Watching (condition gone but the evidence window has not fully cleared, Crash only), Resolved (condition gone after having been Open), Came back (Resolved then Open again, shown as Open with "Came back" in the evidence).

**Per finding.**

| Finding | Open when | Resolved when | Evidence text |
|---|---|---|---|
| Recent blue screens | blue screen in the last 7 days | previously Open and now 0 in 7 days | "No blue screen since Nov 27" (date of the **last crash** from the Event Log, not a fix date) |
| Low disk space | free ratio under 15% | ratio back at or above 15% | "46.7 GB free (was 12.2 GB)" |
| Power mode on efficiency while plugged in | mode is best_efficiency and not on battery | no longer true | "Power mode is Best performance (was Best power efficiency)" |
| App set to power-saving graphics | any app preference is power_saving on a dual-GPU PC | none | "All apps use High performance or Windows' choice" |
| Many startup apps | more than 6 on | 6 or fewer | "4 apps on at startup (was 9)" |
| VALORANT requirements | Secure Boot or TPM failing | both pass | "Secure Boot On, TPM 2.0" |
| Single channel memory | 1 stick on integrated graphics | 2 sticks | "Dual channel" |
| Worn battery | health under 50% | none (hardware; never resolves unless the battery is replaced) | |
| Memory Integrity on | info only | never resolves; stays Info | |

**Attribution** (optional, secondary): if a History change set touched the same thing and the condition is now gone, add "Changed by Gaming optimization on Nov 28" to the evidence. Attribution never decides Resolved; evidence does.

**Vanguard is a special case.** A Vanguard reinstall happens outside Lagsmith (and Lagsmith never reads or touches Vanguard files), so there is no fix date to anchor on. The Crash marker uses the Event Log only: "No blue screen since <date of the last crash>". It appears after 7 clear days at the latest. Before that, "Last blue screen 2 days ago" (Watching, neutral).

**Where markers show.**

- **Dashboard:** the finding row (success tick, "Resolved" chip, evidence); the Resolved group; the stat tile chip (Stable, Resolved).
- **Nav:** the finding dot disappears when the page has no open finding.
- **The owning page:** a one-line status under the header ("Resolved: no blue screen since Nov 27" in Crash; "Resolved: 46.7 GB free (was 12.2 GB)" in Storage; "Resolved" chip beside the setting in Gaming; the Dashboard-linked row for startup). Same `FindingChip`, same wording.
- **History:** a "Resolved: ..." chip on the change set that touched the condition, if any.
- **Scan PC (done):** "Resolved since last scan: ..." lines.

**DEP (backend).** `deriveFindings` today emits only present conditions, and scan state lives in memory for the session. Resolved needs **persisted prior findings**: a small store `findings.json` of `{ id, firstSeen, lastSeen, lastEvidence, state, resolvedAt, resolvedEvidence }` written after every scan, read on startup. Retention: Resolved items stay visible 30 days, then drop. The first scan after install has no prior record and shows no resolved items (it cannot know). Without this store the feature must not ship.

---

## 11. CTA map (every card and finding has a next step)

| Surface | Item | CTA label | Destination |
|---|---|---|---|
| Dashboard tile | Stability | (whole tile) | Crash Detective |
| Dashboard tile | Storage | (whole tile) | Storage Cleaner |
| Dashboard tile | Memory | (whole tile) | Memory |
| Dashboard tile | Graphics | (whole tile) | Hardware, Graphics card |
| Dashboard tile | Startup | (whole tile) | Startup Manager |
| Finding | Recent blue screens | Find the cause | Crash Detective, newest crash, How to fix open |
| Finding | Low disk space | Free up space | Storage Cleaner, summary |
| Finding | VALORANT requirements | Check requirements | Gaming, readiness card |
| Finding | Power mode on efficiency | Fix in Gaming Mode | Gaming, power row |
| Finding | App on power saving | Fix in Gaming Mode | Gaming, GPU list |
| Finding | Single channel memory | See upgrade tip | Hardware, Memory card |
| Finding | Many startup apps | Review startup apps | Startup Manager |
| Finding | Worn battery | See battery | Hardware, Battery card |
| Finding | Memory Integrity | none (info) | none |
| Crash row | any blue screen | How to fix | expands in the row |
| Crash row | vgk.sys suspect | Open Riot support | external (DEP) |
| Crash header | dumps | Analyze dumps | admin task |
| Hardware | Graphics | Check driver update / Set GPU preference | Hardware driver check / Gaming |
| Hardware | Memory | Memory details | Memory |
| Hardware | Storage | Free up space | Storage Cleaner |
| Storage | few rows | Move it | Move tab |
| Storage | any selection | Review N items | Review sheet |
| Startup | any toggle | Apply N changes | Review sheet |
| Gaming | banner | Review and apply N changes | Review sheet |
| Gaming | GPU list | Review and apply | Review sheet |
| Memory | manual | Clean memory | direct action |
| Memory | auto | Auto-clean switch | Settings mirrored |
| Debloat | any selection | Remove N apps | Review sheet |
| Debloat | empty | Free space in Storage Cleaner | Storage |
| Repair | SFC failed | Run DISM | admin task |
| History | empty | Free space / Open Gaming Mode | Storage / Gaming |
| History | Resolved chip | (chip) | related page |
| Scan done | top finding | its action | its page |

---

## 12. Cross-cutting behaviours

- **Navigation context:** a cross-link opens the target with the focus id highlighted for 1.5 s and a "Back to Dashboard" ghost, as today. The nav dots (3.1) show where open findings live.
- **Loading (Doherty):** every page paints its frame in under 100 ms with skeletons; slow reads (disk usage, dump analysis, driver check) fill their own slot and never block the page; any action under 400 ms shows a pressed state, any above shows progress text.
- **Motion:** 150 to 250 ms, state only: ActionBar rise, sidebar width, disclosure, switch. None under reduced motion.
- **Keyboard:** Ctrl+B toggles the sidebar. Rows with checkboxes toggle on Space anywhere on the row. Focus moves to the H1 on page change (kept).
- **Errors:** inline `Show` pattern with Try again, as today.

---

## 13. Laws of UX applied (lawsofux.com set)

| Law | Decision in this spec |
|---|---|
| Jakob's Law | Left nav with groups and Settings pinned at the bottom; page header with title and one action; Fluent icons because users know Windows Settings; collapse to a rail like Windows NavigationView; Ctrl+B like VS Code; switches, segmented controls and tables used in their usual places. |
| Fitts's Law | Whole rows and whole stat tiles are click targets; 18 px checkboxes sit inside full-row labels; min hit height 32; primary actions at the end of the line they belong to; sticky ActionBar keeps Apply within reach at the window bottom; no hover-expand on the rail. |
| Hick's Law / Choice Overload | One filled primary per page state; Storage tabs cut from five to three; Startup drops its Status column; GPU preference is a 3-option segmented control, not a menu; Settings has 5 sections; filters in History appear only above 15 sets. |
| Miller's Law and Chunking | Dashboard shows up to 5 findings and 5 tiles; sections of at most 7 rows before a heading; Settings grouped into 5 chunks by job. |
| Postel's Law | Add-a-game accepts quoted, trimmed paths; theme System follows the OS; dates and sizes are shown strictly (one format) in every row. |
| Peak-End Rule | The end of every flow shows a result with evidence ("Freed 16.6 GB, C: now 28.8 GB free"; "Resolved: no blue screen since Nov 27"); Scan done leads with the top finding and its fix; the peak (finding to fix) never dead-ends. |
| Aesthetic-Usability Effect | Equal-height tiles, one spacing scale, one radius, one icon family, aligned baselines; no empty boxes. |
| Von Restorff (Isolation) Effect | Accent and the filled primary appear once per view; severity colour only on real problems; the Resolved chip is the only success-green on a page of neutrals. |
| Tesler's Law | Complexity is moved into Lagsmith, not the user: the staging bar batches changes; How to fix pre-selects the right steps per crash; one UAC prompt is explained next to the button; the helper handles admin. |
| Doherty Threshold | Skeleton frames at once; progress inside 400 ms; slow reads do not block the page. |
| Goal-Gradient Effect | Scan ring and step list show progress; System Repair shows the sequence (1 of 3) and a progress bar; ActionBar count rises as you tick. |
| Serial Position Effect | First rows are the most severe findings; last item on the Dashboard is the quiet Resolved group; the page primary sits at the end of its line or bar. |
| Zeigarnik Effect | Pending changes stay visible in the ActionBar until applied or discarded; a Watching finding ("last blue screen 2 days ago") keeps the open loop honest; the nav dot marks unfinished business. |
| Law of Proximity | 16 px between cards, 8 inside a card group, 12 icon-to-text; each CTA sits beside the thing it acts on. |
| Law of Common Region | Cards are the unit; the Memory controls card holds both halves of one decision; the Storage summary card holds bar, number and breakdown together. |
| Law of Similarity | Same row anatomy in every list (icon tile, title, caption, control); same chip shapes; same button levels; same icon family and size by context. |
| Law of Prägnanz | Plain shapes: card, row, bar, switch; one stacked bar instead of a legend plus a second chart; Fluent glyphs kept simple. |
| Law of Uniform Connectedness | A divider links the two halves of the Memory card; the expanded How to fix panel is visually joined to its crash row; ActionBar attaches to the list it acts on. |
| Cognitive Load / Working Memory | No inner scroll states to remember; evidence beside each claim; the count in the ActionBar tells you what you have staged without opening it. |
| Mental Model | Resolved means "not a problem any more", derived from the same scan the user trusts; the rail icons match the labels; undo lives in History. |
| Occam's Razor / Pareto | Removed cards (Hardware 9 to 6, Repair 4 cards to 1, Crash 5 to 3), merged footers and metric asides; most value comes from 6 changes (section 15). |
| Selective Attention | Severity dots in nav pull the eye to problems; everything else is neutral. |
| Flow | No modal for How to fix; sticky bar instead of a dialog per toggle; page scroll instead of nested scroll. |
| Paradox of the Active User | No manual: copy sits at the control ("Windows will ask for admin permission"), tooltips on rail icons, explanations inline. |

---

## 14. Dependencies, risks, docs that must change

### Backend or data (DEP list)

1. **Persisted findings store** (section 10): without it Resolved cannot exist.
2. **External open command** with a hard allow-list (Riot support, `ms-settings:`, project and licence links). No `opener` plugin and a strict CSP today.
3. **Settings store** (theme, sidebar, auto-clean threshold and switch, start with Windows, tray) in an app settings file; `localStorage` only as the preview fallback.
4. **Memory clean commands**: user-level trim (exclusion by name before any handle, `is_game_session` gate), admin helper task for the standby purge (same `EXIT_GAME_RUNNING` pattern), auto-clean evaluator with hysteresis.
5. **Start with Windows** (Run key) and **tray icon** (Tauri `tray-icon`); tray plus CloseGuard interaction.
6. **`StartupApp.publisher` and an impact value**; helper task for machine-wide startup entries.
7. **`hasBattery`** so a missing battery hides the card; battery fields can still be null.
8. **Dump analysis N of M** exists only after an admin run, only in memory. Persisting it would let the vgk card survive a restart; recommended.
9. **File-dialog plugin** for Browse in Add a game.
10. **Transparent laptop PNG and a dark-friendly hero** for dark mode.
11. **Fluent icon export names** to verify at install.

### Docs that must change when this ships

- `PRODUCT.md`: Memory paragraph (currently "no automatic threshold-based RAM purging"; now manual Clean memory plus opt-in threshold auto-clean, paused in games, no timer); add Settings to the v1 list; principle 5 (fits for Dashboard, primary action reachable elsewhere); Platform line (light and dark).
- `ANTI-CHEAT.md`: add to Allowed "trimming working sets of **non-protected** user processes while no game session is running"; keep rule 4 for protected processes; state that the process list is filtered by name before any handle opens; state that auto-clean is gated by `is_game_session`.
- `CONTEXT.md`: hard rule "No timed RAM cleaning" becomes "No timed RAM cleaning; threshold auto-clean is opt-in and off by default".
- `UI-CRITIQUE.md`: retire items now superseded (Storage right panel, Gaming layout, Repair "Last results").
- `MemoryPage.tsx` caption ("Lagsmith doesn't automatically 'clean' RAM...") must be removed or it contradicts the feature.
- Playwright: `expectFits` on non-Dashboard pages; add the no-nested-scroll assertion; sample banner presence in mock; theme tests.

### Risks and open questions for the owner

- Is the auto-collapse breakpoint of 1200 right, or should the 1100 to 1199 range keep the expanded bar?
- Tray: ship with Settings v1 or later? (It decides whether auto-clean can run with the window closed.)
- Extra safety for unrecognised games (pause auto-clean on a fullscreen D3D app): yes or no?
- The advice table (code to steps) is content the owner must approve; Lagsmith must never claim file corruption without SFC evidence.
- Privacy statement wording needs a check that the app really sends nothing.
- Startup Impact column: build the backend data, or stay without it?

---

## 15. The ten biggest layout decisions

1. Two page types: Dashboard fits, every other page flows; no card stretches to the viewport and there is no nested scroll (trade-off stated in 2.1).
2. Equal-height only for tile rows with equal anatomy; everything else hugs and aligns to the start; a 48 px balance check forces a restructure instead of a stretch.
3. One sticky `ActionBar` and one staging rule: lists stage, single switches go straight to Review; the primary is always reachable.
4. Hardware drops from 9 cards to 6 equal-anatomy tiles that are CTAs with info (Graphics merges adapters and driver status; Memory merges the tip and page file; Storage gets a mini breakdown and "Free up space").
5. Gaming moves per-app GPU preference to a full-width, page-scrolling, searchable list with a segmented control; single-GPU PCs get one info row.
6. Storage becomes one column: a summary card absorbs the drive bar, "can free" number and "what's filling" breakdown; the list hugs its rows; short data gets a "Move it" next step.
7. Crash Detective: one column, timeline then reports, per-crash inline **How to fix**, and an advice-only vgk.sys card (clean reinstall steps, Riot support link, no corruption claims, Lagsmith never touches Vanguard).
8. Resolved markers come only from persisted re-scan evidence ("No blue screen since <last crash date>"), shown on Dashboard, nav dots, owning pages and History; never from a click.
9. Memory page: Clean memory plus opt-in threshold auto-clean in one controls card, honest copy, protected processes excluded by name, paused in games; mirrored in the new Settings page.
10. Shell: collapsing sidebar (rail below 1200, Ctrl+B, tooltips, no hover-expand, nav finding dots), Settings pinned at the bottom, Sample data banner, one spacing/type/radius/button scale, Fluent icons, Inter plus Cascadia Mono, and neutral-grey dark tokens.

---

## Appendix A. Shell implemented (28 Nov 2026) and hand-off to the page work

Built: tokens (`src/index.css`), theme init (`public/theme-init.js`), Fluent icons, sidebar, Settings, sample banner, `Page` flow/fit, `ActionBar`, `Tooltip`, `Segmented`, `FindingChip`, `SummaryStrip`.

### A.1 Icon mapping (Lucide to Fluent, package `@fluentui/react-icons`)

Import per icon (`import { HomeRegular, HomeFilled } from "@fluentui/react-icons"`), size with `fontSize={20}` (nav, card glyph), `16` (inline, buttons, status). There is no `strokeWidth`. Regular everywhere; Filled only for the active nav item. Verified exports exist in v2.0.347.

| Lucide (current) | Fluent |
|---|---|
| House | `HomeRegular` |
| Search | `SearchRegular` |
| TriangleAlert | `WarningRegular` |
| Cpu | `DeveloperBoardRegular` |
| MemoryStick | `RamRegular` |
| Layers (Storage Cleaner) | `BroomRegular` (drives: `HardDriveRegular`, `StorageRegular`) |
| Power | `PowerRegular` |
| Gamepad2 | `XboxControllerRegular` |
| Wrench | `WrenchRegular` |
| LayoutGrid | `AppsRegular` |
| History | `HistoryRegular` |
| Settings | `SettingsRegular` |
| Monitor | `DesktopRegular` |
| Battery | `Battery10Regular` (also `BatteryChargeRegular`, `BatteryWarningRegular`) |
| ShieldCheck | `ShieldRegular` (`ShieldCheckmarkRegular` also exists) |
| Info | `InfoRegular` |
| CircleCheck | `CheckmarkCircleRegular` |
| CircleX | `DismissCircleRegular` |
| ArrowLeft | `ArrowLeftRegular` |
| ArrowRight | `ArrowRightRegular` |
| RefreshCw | `ArrowSyncRegular` |
| LoaderCircle | `SpinnerIosRegular` (add `motion-safe:animate-spin`) |
| Plus / Minus | `AddRegular` / `SubtractRegular` |
| ChevronDown / Right | `ChevronDownRegular` / `ChevronRightRegular` |
| X | `DismissRegular` |
| Check | `CheckmarkRegular` |
| Lock | `LockClosedRegular` |
| Play | `PlayRegular` |
| Trash2 | `DeleteRegular` |
| Undo2 | `ArrowUndoRegular` |
| Activity (Stability tile) | `PulseRegular` |
| Download / external link | `ArrowDownloadRegular` / `OpenRegular` |

Names not in this table: look up the export in `node_modules/@fluentui/react-icons/lib/icons/chunk-*.d.ts` (`grep "NameRegular"`). If none fits, draw a 20 px glyph; never mix in another family. `lucide-react` is still a dependency because unconverted pages import it; remove it when the last import is gone.

### A.2 Tokens and classes to use

- Colours: only theme utilities (`bg-surface`, `bg-raised`, `bg-subtle`, `bg-hover`, `text-ink`, `text-muted`, `border-line`, `bg-accent-soft`, `bg-off`, `bg-primary text-primary-ink`, `bg-data-1..4`, status `*-soft`). Never a hex literal: dark mode only works through the variables. Replace the leftover hex values listed in section 6.2.
- Type utilities: `text-h1 text-h2 text-card text-metric text-body text-secondary text-caption` (size and line height together), weights 400/500/600. Code data: `<code>` or `font-code` (Cascadia Mono). Tabular numbers: `tnum`.
- Radius: card 16 (`Card`), controls 10, small 8, dialog 20. Spacing 4 px scale via normal Tailwind steps (`gap-4`, `p-4`).
- `Badge` is now a 24 px pill (caption size); `Button` has `destructive` and sm/md/lg heights 32/40/48.

### A.3 Scroll model: what each page must do

`PAGE_LAYOUT` in `src/pages/nav.ts` maps every page to `"fit"` (legacy: body fills the viewport, cards scroll inside) or `"flow"` (content height; `main` is the only scroller). Only `settings` is `flow` today. When a page is converted: flip its entry to `"flow"`, remove `flex-1`, `h-full`, `max-h-*`, `overflow-y-auto` from its cards, and put staged changes in `<ActionBar>` as the last child of the page. Dashboard stays `"fit"`. The content column is `max-w-[1200px]`, padding 24/20.

### A.4 Known leftovers outside the shell files

- `ScanHero` is light-only (hard-coded tint, laptop image uses `mix-blend-multiply`): in dark the hero title is unreadable and the button blends in. Needs token colours and a transparent laptop PNG (DEP 10).
- Hard-coded hex colours remain in CrashPage, ScanPage, StoragePage, HistoryPage (see 6.2).
- Pages still import Lucide and `ICON_STROKE`.
- `get_settings` / `set_settings` are called through a local wrapper in `src/lib/settings.ts` (not `api.ts`); move it there when the types land. The backend stores only `sidebarCollapsed` (bool); the Automatic/Expanded/Collapsed tri-state is kept in `localStorage` and "Collapsed" maps to `true`.
- Settings rows deferred: tray icon (DEP), Admin helper status chip (no command), Licences and project link are plain text (no external-open command, DEP 2).
