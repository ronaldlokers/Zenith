---
name: Zenith
description: A job-hunt pipeline tracker built as a warm, instrumental climb — Ink Indigo ground, Struck Brass signal, five rising stage hues.
colors:
  night: "#14173a"
  night-raised: "#1b1f4d"
  gold: "#d6a441"
  gold-deep: "#c68a2f"
  gold-soft: "rgba(214, 164, 65, 0.14)"
  bg: "#f4f2ec"
  surface: "#ffffff"
  surface-sunken: "#faf9f5"
  ink: "#14173a"
  muted: "#5c5f76"
  faint: "#6f6c7a"
  border: "#e7e4db"
  line: "#efece4"
  accent: "#d6a441"
  accent-text: "#14173a"
  accent-ink: "#a9803a"
  accent-on-ink: "#e8c072"
  success: "#3f8f6b"
  warning: "#c98a2b"
  danger: "#b0453c"
  info: "#4a6ea3"
  scrim: "rgba(20, 23, 58, 0.45)"
  st-interested: "#5c6285"
  st-applied: "#4a55a8"
  st-screening: "#6a4aa8"
  st-interview: "#8a3f9c"
  st-offer: "#8a6410"
  st-dead: "#6b675e"
  heat-quiet: "#c98a2b"
  ev-touch: "#7a5fb8"
typography:
  display:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "2.125rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.06em"
  chrome:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Consolas, monospace"
    fontSize: "0.64rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.12em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "14px"
  full: "999px"
spacing:
  space-1: "0.25rem"
  space-2: "0.5rem"
  space-3: "0.75rem"
  space-4: "1rem"
  space-5: "1.5rem"
  space-6: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.9rem"
  button-primary-hover:
    backgroundColor: "#b68b37"
    textColor: "{colors.accent-text}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.4rem 0.8rem"
    height: "34px"
  button-secondary-hover:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "0.4rem 0.8rem"
    height: "34px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.accent-ink}"
    padding: "0"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.4rem 0.6rem"
  search-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0.4rem 0.6rem"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.85rem 0.95rem"
  modal:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.2rem 1.4rem"
    width: "26rem"
  row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.55rem 0.8rem"
    height: "44px"
  stat-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.8rem 0.9rem"
  stat-card-hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0.8rem 0.9rem"
  chip:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "0.2rem 0.3rem 0.2rem 0.6rem"
  filter-tab:
    backgroundColor: "#efece4"
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
    rounded: "{rounded.full}"
    padding: "0.22rem 0.6rem"
  filter-tab-active:
    backgroundColor: "{colors.gold-soft}"
    textColor: "{colors.accent-ink}"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.accent}"
    typography: "{typography.chrome}"
    rounded: "{rounded.sm}"
    padding: "0.08rem 0.4rem"
  nav-item:
    backgroundColor: "transparent"
    textColor: "#b9b8cc"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  nav-item-active:
    backgroundColor: "rgba(214, 164, 65, 0.16)"
    textColor: "{colors.accent}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  avatar:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.full}"
    size: "34px"
---

# Design System: Zenith

## Overview

**Creative North Star: "The Night Ascent"**

Two halves, and the name says both. The **ground is always Night** — the desktop rail and the sign-in stage are Ink Indigo in every theme, never re-tinted, because they are chrome, not content. Against that constant, everything that *moves* climbs: the five pipeline stages rise slate → lapis → iris → fuchsia → brass, and the single interaction accent is the brass at the top of that climb. A user reading a board is reading altitude.

The character is **warm and instrumental**. The precision is real — hairline 1px borders, a 10px control corner, uppercase Geist Mono chrome at 0.64rem with 0.12em tracking, tabular figures that don't jitter as numbers change. But the canvas is Bone (#f4f2ec), not white, the cards round at 14px, and the accent is a struck brass rather than a saturated primary. The result should read as a well-made instrument on a warm desk, not a terminal and not a SaaS dashboard.

Density is **calm-dense**. A heavy user holds around fifty applications, so nothing here is a data grid: rows are 44px minimum, lists breathe at 0.6rem gaps, and the app column is a single 720px measure until the rail appears at 900px. Colour is spent almost nowhere — the brass is the only voice raised, and the stage hues are locked to pipeline state and never used decoratively.

**Key Characteristics:**
- Ink Indigo chrome that never changes with the theme; Bone or night-sky content beneath it.
- One accent (Struck Brass) for every interactive meaning: primary action, link, focus ring, selection, offer.
- Five accessibility-locked stage hues that rise in both hue and lightness, reserved for pipeline state.
- Geist everywhere, Geist Mono strictly as chrome; figures set in Geist 600 with tabular numerals.
- Three elevation tiers, hover adds exactly one step.
- 1px hairlines and a 10px / 14px / pill corner vocabulary.

## Colors

A warm-neutral canvas carrying one metal accent, over an indigo chrome ground, with a five-step ascent reserved entirely for pipeline state.

### Primary

- **Struck Brass** (`accent` / `gold`): the only interaction colour in the system. Primary buttons, every link, the 2px focus ring, checkbox and radio tint, the active rail item, selected filter tabs, the hero KPI, and the offer stage. `accent-ink` is the darkened text-safe version for brass-on-light copy; `accent-on-ink` is the lightened one for brass on Night. `gold-soft` (14% brass) is the only fill tint it is allowed to make.
- **Aged Brass Deep** (`gold-deep`): pressed and deep-hover states only.

### Secondary

- **Ink Indigo** (`night`): the permanent chrome ground — the 210px desktop rail, the sign-in stage, the brand squircle, and the ink colour of every shadow in the light theme. It is also `ink`, the body text colour on light: the type and the chrome are literally the same pigment.
- **Ink Indigo Raised** (`night-raised`): the lighter pole of the sign-in radial ground, and nothing else.

### Tertiary

The Ascent — pipeline stage hues. **Reserved for pipeline state.** Each is exposed to descendants as `--sc` by a `.stage-*` ancestor, so rows, funnel bars, and dots read the current stage without hardcoding.

- **Graphite Blue** (`st-interested`): interested — the lowest rung, deliberately desaturated so it reads as "not yet moving".
- **Lapis** (`st-applied`): applied.
- **Iris** (`st-screening`): screening.
- **Fuchsia Ink** (`st-interview`): interview — the hottest hue, the highest-stakes live stage.
- **Aged Brass** (`st-offer`): offer — the climb resolves into the brand accent.
- **Ash** (`st-dead`): rejected, withdrawn, ghosted. Off the mountain; low chroma on purpose.

### Neutral

- **Bone Canvas** (`bg`): the page ground on light, and the resting fill of inputs inside surface panels.
- **Card White** (`surface`): raised surfaces — cards, rows, modals, the top bar, toolbar controls.
- **Bone Sunken** (`surface-sunken`): recessed wells beneath the canvas.
- **Ink Indigo** (`ink`): primary copy.
- **Slate Ink** (`muted`): secondary copy, labels, icon rest state.
- **Faint Slate** (`faint`): tertiary copy — counts, eyebrows, timestamps. Darkened from a legacy value specifically to clear 4.5:1 on both `surface` and `bg`; do not lighten it back.
- **Bone Border** (`border`): every hairline. **Ledger Line** (`line`) and the same value as `track` carry rules and progress-bar troughs.

### Semantic

`success` (a muted forest green), `warning` and `heat-quiet` (an amber that is deliberately *not* a stage hue, so "gone quiet" never reads as a stage), `danger` (a brick red, lightened in dark theme), `info` (a slate blue), `ev-touch` (a violet for interaction/touchpoint events that must not collide with stage colour), `scrim` (indigo at 45%).

### Named Rules

**The One Gold Rule.** Struck Brass is the only accent. If something is interactive, selectable, focused, or the single most important number on the screen, it is brass; if it is none of those, it is ink, muted, or faint. Never introduce a second accent hue to distinguish two interactive things — distinguish them by weight, size, or position.

**The Stage-Colour Reservation.** The five ascent hues mean pipeline state and nothing else. Never use them as chart series colours, category tags, avatar fills, or decoration, and never redefine their values — they are contrast-locked as a set.

**The Always-Night Rule.** The rail and the sign-in stage are Ink Indigo in light theme and dark theme alike. Their text tones come from `--rail-ink` / `--rail-text` / `--rail-muted` / `--rail-faint`, declared once on `.side`. Never hardcode a rail hex, and never let `--ink` / `--muted` leak into rail descendants — those flip with the theme and the rail does not.

**The Dark-Parity Rule.** Explicit Dark and OS-dark share one palette, declared identically in `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`. A value added to one must be added to the other in the same commit, or the two themes silently diverge.

## Typography

**Display Font:** Geist 600 (`--serif`, with `-apple-system`, `BlinkMacSystemFont`, `system-ui` fallbacks)
**Body Font:** Geist 400 (`--sans`, same stack)
**Label/Mono Font:** Geist Mono (`--mono`, with `ui-monospace`, `SF Mono`, `Consolas`)

**Character:** One family in two registers plus a machine register. `--serif` is a stable token name that resolves to **Geist**, not to any serif — there is no serif anywhere in this brand, and the name is kept only because renaming it would churn every call site. Geist at 600 with negative tracking is the display voice; Geist at 400 is every word a human reads; Geist Mono, always uppercase and always tracked, is chrome.

### Hierarchy

- **Display** (Geist 600, `2.125rem`, line-height 1, `-0.02em`): the biggest moments — the modal close glyph scale, the sign-in wordmark family, hero figures.
- **Headline** (Geist 600, `1.375rem`, ~1.15, `-0.01em`): section and settings headings, the focused feed item's title (1.45rem), the settings-modal `h2` at 1.5rem over a hairline.
- **Title** (Geist 600, `0.95rem`, `-0.01em`): row primaries, card titles, the top-bar wordmark.
- **Body** (Geist 400, `0.875rem`, 1.5): all copy, every form control, every button label. Body line-height 1.5 is inherited by buttons through `button { font: inherit }` — primary buttons size their box off it, so do not override it.
- **Label** (Geist Mono, `0.75rem`, `0.06em`, uppercase): stage names, lane labels, meta rows, counts.
- **Chrome** (Geist Mono, `0.64rem`, `0.12em`, uppercase): eyebrows, tab labels, filter tabs, source lines, keyboard hints. The smallest type in the system; never used for a sentence.

### Named Rules

**The Mono-Is-Chrome Rule.** Geist Mono never sets a sentence. It marks structural furniture — eyebrows, tab and stage labels, sources, keys, counts — and it is always uppercase with `--track-chrome` (0.06em) or `--track-eyebrow` (0.12em). Prose in mono is a defect.

**The Figures-Speak Rule.** Numbers a user reads as a result — KPI values, funnel counts, stat figures — are set in the display voice: Geist 600, `font-variant-numeric: tabular-nums`, tight tracking. Mono keeps only the small inline values inside stat lines. Tabular numerals are mandatory anywhere a figure updates in place, so digits don't dance.

**The Negative-Tracking Rule.** Display and title sizes carry `-0.01em` to `-0.02em`; body carries `normal`; mono carries positive tracking. Tracking direction is how the three registers stay distinguishable at a glance.

## Layout

**The shell.** Below 900px the app is a single centred column: `max-width: 720px`, `0.75rem` side padding, `5rem` bottom padding to clear the fixed mobile tab bar. The top bar is sticky, full-bleed (negative side margins that cancel the column padding), and carries the brand, the ⌘K launcher, and the single "+ Add" affordance.

**The rail.** At `min-width: 900px` the shell becomes a flex row: a sticky, full-height, 210px Ink Indigo rail plus fluid content, and the 720px cap is released. The rail carries brand, nav, and a pinned account block; the top bar switches from brand to page title. Board views widen further, to `max-width: 1280px`.

**Breakpoints** (the whole set, in use order): `600px` (mobile ⇄ tablet — the tab bar goes fixed-bottom with icon-over-label, touch targets grow to 40px), `900px` (the rail; five-column board; two-column dashboard; the feed's list+detail split), `1000px` and `1100px` (side panels such as Next Up appear), plus narrow patches at `560px` and `599px` for search wrap and the "+ Add" label.

**Grids.** The board is `repeat(5, 1fr)` at ≥900px with each column capped at `calc(100vh - 8rem)` and scrolling internally, so a busy stage never grows the page. KPI tiles are `minmax(0, 1.3fr) repeat(3, minmax(0, 1fr))` — the hero column is wider by design, and the `minmax(0, …)` is load-bearing: it lets a long value shrink instead of pushing the grid past a phone viewport. The dashboard splits `1.05fr 0.95fr` at ≥900px. Forms are a two-column grid at `0.7rem` gaps with action rows spanning `1 / -1`.

**Rhythm.** A six-step spacing scale (`0.25` → `2rem`) with `0.6rem`–`0.8rem` as the working gap between stacked cards and rows. Toolbar controls share one height: 36px, 40px on phones. Rows have a 44px minimum.

### Named Rules

**The 720 Rule.** Content is one 720px column until the rail exists. Do not introduce a second content column below 900px; on phones the answer to "where does this go" is *further down*, not *beside*.

**The Internal-Scroll Rule.** A stage column, not the page, absorbs a busy stage. Any new column-shaped surface gets `max-height` + `overflow-y: auto` on its list, with the head pinned.

## Elevation & Depth

**Three structural tiers, and hover adds exactly one step.** Elevation encodes rank at rest; state adds a single step on top of that rank, never two.

- **Tier 1 — flat.** List rows, lanes, chips, filter tabs, toolbars. No resting shadow at all; separation comes from a 1px hairline and the 3px stage-coloured left border. A tier-1 row lifts to `--shadow-1` on hover, which is exactly why hover reads as "interactive".
- **Tier 2 — raised.** Cards, dashboard panels, KPI tiles, forms, the feed detail pane. `--shadow-1` at rest (a 1px contact shadow plus a soft 10px ambient). Clickable ones lift to `--shadow-2` with `translateY(-2px)` over 120ms.
- **Tier 3 — focal.** Overlays (modals, dropdowns, the command palette) sit at `--shadow-2` permanently over a `--scrim` backdrop. On a content screen, tier 3 is instead the **hero KPI**: a brass-tinted vertical gradient, a 40%-brass border, a 3px brass top edge, and a brass-cast shadow. One per screen.

Shadows are indigo-tinted on light (`rgba(20, 23, 58, …)`), not neutral black — they belong to the Night. In dark theme they are true black at much higher opacity, because the ground is already dark.

### Shadow Vocabulary

- **`--shadow-1`, raised** (`0 1px 2px rgba(20,23,58,.04), 0 2px 10px -3px rgba(20,23,58,.1)`): resting tier 2, and the hover state of tier 1.
- **`--shadow-2`, overlay** (`0 4px 14px -3px rgba(20,23,58,.12), 0 16px 40px -10px rgba(20,23,58,.2)`): modals, dropdowns, and the hover state of tier 2.
- **Hero cast** (`0 1px 2px rgba(20,23,58,.05), 0 10px 26px -6px` brass at 40%): the single tier-3 content tile. The only coloured shadow in the system.
- **Sign-in card** (`0 24px 60px -20px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.2)`): one deliberate exception — a light card floating on the Night stage needs a deeper throw than any in-app surface.

### Named Rules

**The One-Step Rule.** Hover moves a surface up exactly one tier and changes nothing else structural. Flat → `--shadow-1`. `--shadow-1` → `--shadow-2` plus a 2px rise. Never skip a tier, and never introduce a third shadow value.

**The Single Hero Rule.** At most one tier-3 focal element per screen. Two brass-tinted heroes cancel each other out and the eye lands nowhere — which is the exact failure the hero tile was introduced to fix.

## Shapes

A three-step corner vocabulary and a hairline-only border language.

- **10px (`--radius-md`)** is the dominant control corner: buttons, inputs, selects, cards, rows, dashboard panels, rail nav items, the ⌘K launcher.
- **14px (`--radius-lg`)** is the container corner: modals, the sign-in card, the feed detail pane, the brand squircle (a 44px square at rx 14 in the mark itself).
- **8px (`--radius-sm`)** is the small-object corner: badges, the settings icon button, keyboard `kbd` chips, settings-field inputs.
- **Pill (`--radius-full`, 999px)** belongs to anything that reads as a token: chips, filter tabs, the segmented control and its thumb, the win pill, and the 34px circular avatar.

**Borders are always 1px and always `--border`**, except three deliberate signals: the **3px left border** that carries stage colour on a row (`--sc` with a neutral fallback), the **3px left border** in brass that marks the dashboard's lead card, and the **3px top edge** on the hero KPI. A thick border in this system means "this has a state", never "this is a box".

The recurring silhouette is a **left-marked horizontal band** — a flat white row, hairline-bordered, with a 3px coloured spine on the leading edge. It is the board card, the list row, the lead panel, and the settings warning, and it is the single most repeated shape in the product.

### Named Rules

**The Ten-Pixel Rule.** If it is a control, it is 10px. If it is a container that holds controls, it is 14px. If it is a token you could imagine picking up, it is a pill. There is no fourth answer.

**The Hairline Rule.** Structural separation is 1px `--border`. Any border thicker than 1px is carrying meaning (stage, lead, focus) and must be justified by state, not by emphasis.

## Components

Components live in `src/components/` as self-contained TypeScript modules with their own CSS in `@layer components`. Each file must **fully describe** its component — it reproduces the App.css recipe it replaces and never depends on it, because Storybook loads no App.css. Two traps that have bitten repeatedly: layer priority applies **per property, not per rule**, and **unlayered CSS beats all layered CSS** regardless of specificity.

### Buttons

- **Shape:** 10px corners (`--radius-md`), no uppercase, `white-space: nowrap`, 120ms transitions on background / border-color / color.
- **Primary:** brass fill, Ink Indigo label, **no border at all** (`border: none`, not a transparent 1px — with border-box a transparent border still adds 2px), weight 650, padding `0.55rem 0.9rem`. Hover mixes 15% black into the brass. Deliberately declares no `font-size` and no `line-height`, so it inherits 1rem standing alone and `--text-body` inside an action bar — that dual behaviour is the shipped cascade and forcing one value breaks the other.
- **Secondary:** white fill, 1px `--border`, ink label, `min-height: 34px`, padding `0.4rem 0.8rem`, no font-weight (inherits ~400). Hover fills with Bone canvas.
- **Danger:** the secondary recipe with a `--danger` label and a border mixed 40% danger into `--border`. No danger-specific hover — it falls through to secondary's.
- **Ghost / Dark / Link / Close:** ghost is transparent with a muted label and a `--hover` fill; dark is Night with Bone text; link is a borderless inline `--accent-ink` underline that must render `display: inline-block` to sit on the text baseline; close is a borderless `--text-display` glyph in muted.
- **Focus:** `2px solid var(--accent)` at `2px` offset — the same ring the global `:focus-visible` sets, on every focusable thing in the app. **Active:** `filter: brightness(0.97)` globally.
- **Disabled:** `opacity: 0.5`, `cursor: not-allowed`.

### Inputs / Fields

- **Style:** 1px `--border`, 10px corners, `--text-body`, padding `0.4rem 0.6rem`. The fill is context-dependent by design: `--bg` (Bone) inside a white panel, `--surface` (white) on the page ground, so a field always reads as recessed relative to whatever holds it.
- **Search:** the toolbar variant — white fill, `flex: 1`, and a full-width row of its own below 560px.
- **Filter selects:** mono, uppercase, `--text-meta`, `--track-chrome` — a select that filters is chrome, so it takes the chrome voice while a select that *enters data* takes the body voice.
- **Focus:** the global brass ring; no border-colour shift, no glow.
- **Control height:** 36px in a toolbar, 40px on phones.

### Cards / Containers

- **Corner:** 10px for cards and panels, 14px for modals and the feed detail pane.
- **Background:** `--surface`. **Border:** 1px `--border`. **Shadow:** `--shadow-1` at rest; clickable variants rise 2px to `--shadow-2` over 120ms.
- **Padding:** `0.85rem 0.95rem` for dashboard cards, `0.8rem 0.9rem` for KPI tiles, `1.2rem 1.4rem` for modals, `0.9rem` for forms.
- **Heading:** the card eyebrow is mono, `0.6rem`, `--track-eyebrow`, uppercase, `--faint`, with `0.55rem` beneath it.

### Rows (the signature component)

The `.zui-row` band is the most repeated object in the product: white, 1px hairline, 10px corners, `overflow: hidden`, `min-height: 44px`, padding `0.55rem 0.8rem`, and a **3px stage-coloured left border** from `--sc` with `--border` as the neutral fallback for network rows that have no stage. Flat at rest; hover fills with `--hover` and lifts to `--shadow-1`; active dips 3% brightness. Line 1 is a flex row with a `--text-title` primary and a muted company pushed right by `margin-left: auto`; line 2 wraps meta at `0.4rem` gaps.

### Chips

- **Chip:** Bone fill, hairline border, pill, `--text-meta`, asymmetric padding (`0.2rem 0.3rem 0.2rem 0.6rem`) that leaves room for a trailing borderless remove button. The matched variant tints 15% brass and takes a brass border and label.
- **Filter tab:** pill on `--track`, mono chrome, uppercase, `--track-eyebrow`; active swaps to `--accent-soft` with an `--accent-ink` label. Counts inside use `--faint` and tabular numerals.
- **Badge:** an inline mono `--text-chrome` pill in 8px corners whose border is `currentColor`, so each variant only has to move `color` — brass by default, danger for warnings, `--sc` for stage.

### Navigation

- **Desktop rail (≥900px):** 210px, Ink Indigo, sticky full height. Brand at 20px Geist 600. Items are 14px, `9px 12px`, 10px corners, 18px icons, `--rail-muted` at rest; hover lifts to `rgba(255,255,255,.06)` with `--rail-text`; **active is brass on a 16% brass wash**. The account block pins to the foot above a `rgba(255,255,255,.08)` rule.
- **Tablet strip (600–900px):** the same tabs as bordered mono pills — 10px corners, `--text-chrome`, uppercase, `--track-eyebrow`, muted; active turns brass with a brass border and weight 700.
- **Mobile bar (≤600px):** fixed to the bottom with `env(safe-area-inset-bottom)` padding and a `--vv-bottom-offset` hook for the visual viewport. Borders and fills drop entirely; each tab becomes an equal-width icon-over-label column at `0.6rem`, sized so eight tabs fit a 320px phone without scrolling or clipping.

### Stat tiles

The KPI tile is white, 10px, `--shadow-1`, with the figure in Geist 600 at `2rem`, line-height 1, `-0.02em`, tabular numerals, over a `0.74rem` muted label. The **hero** variant is the system's one focal treatment: a vertical gradient into 7% brass, a 40%-brass border, a 3px brass top edge, a brass-cast shadow, a `2.7rem` figure, and an `--accent-ink` semibold label.

### Motion

Short and functional. Micro-transitions run **120–180ms ease**; nothing in the system exceeds 250ms. The vocabulary is exactly five moves: `card-enter` (150ms, 2px rise + fade, fired naturally as filtered rows mount), `toast-in` (180ms, 8px rise), `modal-in` (180ms, 8px rise + `scale(0.98)`), `backdrop-in` (150ms fade), and `skeleton-shimmer` (1.4s loop). Every one of them is cancelled under `prefers-reduced-motion: reduce` — a new animation without a reduced-motion escape is a defect.

### The brand mark

A Night squircle (44px at rx 14 on a 48 viewBox) holding three rungs that rise and narrow — periwinkle `#6f78c4`, violet `#8f7bd0`, brass `#d6a441` — topped by a brass four-point star. Fills are **fixed brand hex, never `currentColor`**, so the in-app `<Logo>` matches `favicon.svg` and the PWA icons exactly. It pairs with the "Zenith" wordmark in Geist 600 at `-0.02em`.

## Do's and Don'ts

### Do:

- **Do** spend Struck Brass on interaction only — primary action, link, focus ring, selection, the one hero figure. If a screen has brass in more than a few places, something non-interactive stole it.
- **Do** read stage colour through `--sc`, set by a `.stage-*` ancestor. Never hardcode a stage hex in a rule.
- **Do** set every figure a user reads as a result in Geist 600 with `font-variant-numeric: tabular-nums`.
- **Do** give any new animation a `@media (prefers-reduced-motion: reduce)` escape in the same block, and keep it at or under 250ms.
- **Do** put new CSS in App.css bands 1–3, never after the control-normalization layer at band 4 — that layer exists to collapse per-context variants and must stay last.
- **Do** make a new owned component's CSS fully self-describing inside `@layer components`, reproducing the App.css recipe it replaces rather than depending on it. Verify a swap is pixel-identical with the screenshot baseline plus `compare -metric AE` = 0; eyeballing misses sub-pixel shifts.
- **Do** add every new dark-theme value to **both** the `prefers-color-scheme` block and the `[data-theme="dark"]` block.
- **Do** draw icons as 24×24 line-art SVG, `currentColor`, `strokeWidth` 2.

### Don't:

- **Don't** change a stage hue. The five are contrast-locked as a set; adjusting one breaks the pairwise separation the whole ascent depends on.
- **Don't** add a second accent colour, or use a stage hue as a chart series, a category tag, or decoration.
- **Don't** reach for the SaaS gradient-blob look — no purple-to-pink hero gradients, glow orbs, mesh backgrounds, or floating glass. The system's only gradients are the hero KPI tint, its 3px top edge, and the sign-in radial ground.
- **Don't** use emoji anywhere in the UI, and don't introduce mascots or stock vector illustration.
- **Don't** build dense enterprise-dashboard chrome: no data-grid density, no stacked toolbars, no ten-colour chart palettes. Fifty applications is the ceiling, not fifty thousand rows.
- **Don't** let colour carry meaning alone. A stage hue always travels with a label or a position.
- **Don't** hardcode a rail hex or let `--ink` / `--muted` reach a rail descendant — use `--rail-ink` / `--rail-text` / `--rail-muted` / `--rail-faint`.
- **Don't** use `--muted` on empty-state icons; `--empty-stroke` exists because muted drops to about 1.6:1 at those icons' internal opacities on dark.
- **Don't** lighten `--faint` — its current value is the one that clears 4.5:1 on both `--surface` and `--bg`.
- **Don't** set `line-height` on a button. Buttons inherit the body's 1.5 through `button { font: inherit }`, and primary sizes its box off it; forcing 1 shortens every primary by roughly 7px and shifts the whole content column.
- **Don't** invent a fourth corner radius or a third shadow value.
