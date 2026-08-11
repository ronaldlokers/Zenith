# The Fizzy-philosophy shell — design

**Date:** 2026-08-12
**Status:** approved (design); not yet scheduled
**Prototype:** https://claude.ai/code/artifact/516d16be-183c-4b81-898b-e050dee6b13f
**Reference:** Fizzy (37signals), studied from two screen recordings and four
screenshots supplied by the owner. Not a product we can link to; the
observations below are the record.

## Goal

Replace Zenith's app shell and page composition with the philosophy Fizzy
uses: no navigation chrome, one centred axis, keyboard-first with the
shortcuts advertised, structure carried by type and hairlines rather than
boxes, and colour rationed to the one thing that means something.

This is a shell-and-composition change, not a feature. No new capability
ships with it; every existing capability has to keep working.

## What the philosophy is

Six observations, each load-bearing:

1. **No navigation chrome.** A centred wordmark opens the destinations. One
   circular icon button per top corner. Nothing else competes with content.
2. **One centred axis.** Titles, filters, empty states, action rows and
   timestamps all sit on the same centre line. The page title has the
   hairline running *through* it, left and right of the words — the title is
   the break in the rule, which is what makes it read as a chapter heading
   rather than a header underline.
3. **Keyboard-first, and it says so.** Every action carries its keycap.
4. **Structure from type, not boxes.** Hairline rules through centred
   headings, dotted leaders in settings, uppercase mono for meta.
5. **Colour is rationed.** Hairline borders, almost no fills, so the little
   colour there is carries meaning.
6. **Labels turn sideways.** A stage you are not working in folds to a
   rotated label and a count, handing its width back.

## Locked decisions this changes

Three standing decisions in `CLAUDE.md` are overturned. They are listed here
so the reversal is explicit rather than discovered in a diff.

### Light only

**Was:** three themes — Automatic, Light, Dark.
**Becomes:** Light only. Automatic and Dark are removed.

Note this is the *inverse* of the reference: Fizzy is dark-only. The warm
paper ground becomes Zenith's identity.

One consequence is not optional: **the hairline has to step darker than
`--border`.** At 1px on `#f4f2ec`, `--border: #e7e4db` is invisible, and this
entire layout is carried by hairlines. The prototype uses `#cfc9b9` for the
structural hairline and keeps `#e3dfd4` for the softer internal divider.

A second consequence: the Ascent hues are **dark** on paper, so anything
sitting *on* a stage colour needs a light foreground. That is a new token,
`--on-stage`, distinct from `--accent-text`.

**Cost being accepted:** removing Dark removes the option people use in low
light, and that some need for photophobia or migraine. This is a deliberate
call by the owner, recorded here so it is not re-litigated as an oversight.

### Stage colour: Ascent hues, no monochrome alternative

**Was:** five hues, ΔE2000 ≥ 10 across normal vision and all three
dichromacies, enforced by `test-node/stage-palette.spec.ts`.
**Stays exactly as is.** The monochrome treatment explored during the study
is dropped outright — a switch that can silently remove colour-blind-safe
state identity is not worth carrying.

The hues get **more** use than before, not less: the folded rail's count
circle is filled with its stage colour, and the application detail page
mounts its card on a plate tinted with the current stage. Both are still
"colour means pipeline state", so the reserved-hue rule holds. Everything
else on screen surrenders its colour to make room.

### No sidebar

**Was:** a rail with seven primary tabs.
**Becomes:** a centred wordmark menu, and nothing else.

**The single-key shortcuts are part of this decision, not a follow-up.**
Hiding seven destinations is only defensible because every one of them is one
keystroke away. They ship together or the change does not ship.

## Shape

### Chrome

- **Top:** one circular icon button per corner (all applications, settings),
  centred wordmark with the real mark from `public/logo.svg` at 25px — it
  carries three rungs and a star and is mush below about 22px.
- **Title:** centred, `2rem` at ≥900px, with the hairline flanking it.
- **Bottom bar:** fixed, three slots — Pinned · Search · Notifications. Labels
  and keycaps at ≥700px; icons and a count badge below that.

### One landing screen

Today and the activity view are **one screen**, not two. Three columns:

| Column | Answers |
|---|---|
| Needs you today | What you owe someone. Always first, never below the fold. |
| Happened today | What changed, as sentences with the application underlined, clock times as dividers between groups. |
| Gone quiet | What has stopped replying, with the day count. |

Pinned does not get a column: it has its own bottom-bar slot.

### Destinations

Seven: Today, Pipeline, Feed, People & companies, CV, Insights, Settings.
Plus Archive, which is a real screen and not a menu stub. The first three are
large tiles in the menu carrying icon, label, live count and shortcut; the
rest are compact rows.

### Board

Stages fold and unfold **by choice, not by emptiness.** Fizzy keeps a stage
folded while it still holds cards, and that is the point — the room goes to
the stage you are working in. Click a header to fold, a rail to open. A
folded rail still accepts a dropped card.

The count circle on a folded rail carries the stage colour; the rail itself
stays on the page ground.

Each open column leads with an add block: the primary action, then the
watching state stated plainly beneath it rather than buried in a menu.

Narrow: one stage at a time, edge-peek slivers for the neighbours, a
horizontal segmented strip, and arrow keys.

### Application detail

The most Fizzy-signature screen, and the one most easily got wrong:

- The card is **mounted on a plate tinted with the current stage** — that is
  how state is shown without labelling it.
- The **stage rail lives inside the card**, level with the title.
- The **primary actions sit on the plate**, under the card.
- Secondary tools **hang tight against the plate**, two per side, as circular
  buttons — they belong to the card, not to the viewport.
- The identity pill floats inside the card with margin; it is not flush to
  the edge the way the board card's meta strip is.
- History entries are **hatched**, so a record of what happened cannot be
  mistaken for a card you can act on.

### Insights

Figures are type on a single hairline band — no stat tiles. Then three
columns: funnel (one block per stage, each carrying its conversion from the
stage before), why applications end (neutral gold bars, because an outcome is
not pipeline state), and what actually moved this week as sentences.

### CV

Borrows the detail page wholesale: the CV is a document on a plate with the
**variants as the rail**, so picking a variant works exactly as picking a
stage does.

### Settings

Centred headings with the rule through them, and a dotted leader carrying the
eye from each label to its control — a settings page is a contents page.

## Spacing

One gutter and one scale. Before the study the page used 0.85, 0.9, 1.0, 1.1
and 1.4rem for the same edge, and the `max-width` caps put text screens at an
80px inset while the title rule and the board sat on the 22px gutter — two
different left edges on one page.

`--g` is 1rem narrow, 1.4rem wide. Everything uses it. Reading length is held
by the prose (`max-width` in ch on paragraphs), never by a page container.

## Traps found while prototyping

Each of these rendered *plausibly* and was wrong. They are recorded because
they will recur in the real implementation.

1. **Padding on an inline `<span>` does not indent block children.** A card
   title inside `.jbody` broke straight out to the card edge until the span
   was blockified.
2. **`height` on an inline box is ignored.** Every funnel bar rendered as
   nothing outside its original grid row.
3. **`margin-inline: auto` on a grid or flex item cancels `stretch`** and
   sizes the item to its content. The timeline collapsed to 329px and the
   composer to 212px while both claimed a `max-width` in the hundreds.
4. **`scrollIntoView` scrolls every scrollable ancestor**, not just the one
   you meant — it nudged the whole document 4px sideways. Set `scrollLeft`.
5. **With `flex-wrap`, an over-wide *base* size wraps the row before
   shrinking is considered.** `flex: 0 1 860px` threw the right-hand tool rail
   onto its own line just under 1024px; `flex: 1 1 0` with a `max-width` does
   not.
6. **Equal-specificity rules are decided by source order.** A base
   `.col-rail .count` rule sitting *after* an override silently kept
   `--faint`, which is unreadable on a filled hue.
7. **Inline `stopPropagation` kills event delegation.** The whole menu
   rendered and every item was dead.
8. **One missing `</div>` nests the rest of the page inside a container.**
   The CV's tool rails ended up inside the plate. A DOM-structure assertion
   caught it; looking at the screenshot did not.

## Out of scope

- No new capability. Everything the app does today it must still do.
- No change to the public share page, the calendar feed, the v1 API or
  webhooks.
- Storybook stories and the 52-capture screenshot rig will need rebaselining
  wholesale; that is expected work, not a surprise.
