# The Fizzy-philosophy shell — implementation plan

**Design:** `docs/superpowers/specs/2026-08-12-fizzy-shell-design.md`
**Prototype:** https://claude.ai/code/artifact/516d16be-183c-4b81-898b-e050dee6b13f

Eight PRs, each green on its own and each leaving `main` shippable. The order
is chosen so the riskiest reversals land early, while there is still little
built on top of them.

---

## PR 1 — Light only

**Why first:** every later PR gets designed and screenshotted against the
final ground. Doing it last would mean reworking all of them.

- `src/index.css`: delete the `@media (prefers-color-scheme: dark)` block and
  `:root[data-theme="dark"]`. Fold the Daylight values into `:root`.
- Step the structural hairline darker than `--border` (spec: `#cfc9b9`); keep
  `--border` for the softer internal divider. Both stay named tokens — no
  literals at call sites.
- Add `--on-stage` (light foreground for text on a stage fill) and
  `--on-accent`. The Ascent hues are dark on paper, so this is not cosmetic.
- `src/settings/appearance.tsx` (or wherever the theme control lives): remove
  the three-way control. Leave a static "Light" row.
- Remove `data-theme` handling from the shell and from the theme effect in
  `src/hooks.ts`.
- **Migration: none.** The `theme` column stays and the app stops reading it.
  Reversing light-only then costs code and not a migration. Note SQLite column
  drops rebuild the table — which is exactly how migration `0010` silently
  killed `0005`'s `status_history` triggers — so not dropping it also avoids
  that whole class of accident. Leave a comment in the code that reads the
  profile explaining why the column is inert.

**Verify:** `test-node/stage-palette.spec.ts` still passes unchanged (the
light set was already the enforced one). Contrast-check `--on-stage` against
all five hues at ≥4.5:1 — write this as a test beside the palette spec, since
it is the same class of guarantee.

**Docs:** update the "Three themes" bullet in `CLAUDE.md` in this PR, not a
later one.

---

## PR 2 — Tokens and spacing

- One gutter token `--g` (1rem / 1.4rem at ≥900px) and a five-step spacing
  scale in `src/index.css`.
- Sweep `src/App.css` for the 0.85/0.9/1.0/1.1/1.4rem edge values and replace
  with `--g`.
- Remove the `max-width: 1120px` page caps. Reading length moves onto the
  prose itself.

**Verify:** a left-edge probe — for each route at 390px and 1280px, assert
the title rule, the bottom bar and the first content block share one left
edge. This is the check that found the 22-vs-80px split; it is worth keeping
as a test rather than a one-off script.

---

## PR 3 — The shell

The big one. `src/shell.tsx` is rewritten; `src/App.css`'s `.app` layout grid
loses its rail column.

- Top bar: two corner icon buttons, centred wordmark button.
- Wordmark menu: three tiles (Today, Pipeline, Feed) + rows for the rest,
  each with its keycap.
- Bottom bar: Pinned · Search · Notifications, fixed, responsive labels.
- Page title component with the flanking hairline.
- **Shortcuts ship here, not later:** 1–6, `,`, C, S, P, N, A, Esc. They are
  what makes hiding the destinations defensible.
- Route table has seven entries. No `activity` route (merged into Today) and
  no `archive` route (folded into the board).

**Verify:** a keyboard test asserting every shortcut reaches its destination
and `Esc` unwinds overlays then detail. Note this is the harness issue #517
already identified as missing — building it here pays that debt too.

**Risk:** this PR cannot be zero-diff. The screenshot rig rebaselines
wholesale; that is the point of the change, not a regression. Capture a fresh
baseline in the same PR so later PRs still have a gate.

---

## PR 4 — One landing screen

- Merge the activity view into Today: three columns — Needs you today,
  Happened today, Gone quiet.
- Pinned moves to the bottom-bar slot only.
- Needs "what happened today" from the server: `status_history` already has
  it, and the stats payload already ships the rows. No new endpoint.

---

## PR 5 — Board

- Manual fold/unfold per stage, persisted in a `board_folded` column on
  `profile` — **not** localStorage. It should follow you between laptop and
  phone and survive a browser wipe. Debounce the write, or fold it into the
  existing profile `PUT` rather than adding an endpoint.
- The board carries **all eight stages**: the five live ones plus rejected,
  withdrawn and ghosted, folded by default. A closed stage renders no add
  block and no watch toggle.
- Folded rail: rotated label, stage-coloured count circle, still a drop
  target.
- Add block at the head of each open column, with the watching state.
- Narrow: one stage, edge peeks, segmented strip, arrow keys.

**Verify:** drag between an open column and a folded rail, at both widths.

---

## PR 6 — Application detail

- Stage-tinted plate, card mounted on it, rail inside the card, actions on the
  plate, tools hanging tight against it.
- Hatched history entries.
- Identity pill inside the card.

**Verify:** a DOM-structure assertion that the tool rails are *siblings* of
the plate and not descendants, and that their tops are level with it. A
missing `</div>` here renders plausibly and wrong — this exact bug happened
twice in the prototype.

---

## PR 7 — Insights and CV

- Insights: figures on a hairline band, three columns. The "why applications
  end" column is where the outcome data from #381 finally gets read.
- CV: the detail page's plate with variants as the rail.

No Archive screen — see PR 5. The menu's "Closed applications" row and `A`
open the closed stages on the board instead.

---

## PR 8 — Feed, People & companies, Settings

- Feed banded by match strength, with Track / Open / Not for me.
- People & companies leading with "Owe a reply".
- Settings: dotted leaders, ruled centred headings.

---

## Cross-cutting, every PR

- `npx tsc -b`, `npm run build`, `npm run lint`, `npx vitest run
  --no-file-parallelism`, en/nl key parity.
- Owned components in `src/components/` get updated in place rather than
  bypassed. Where a new one is needed, use the `component-extraction` skill.
- The zero-diff bar does **not** apply to this work — it is a deliberate
  visual change. Rebaseline in PR 3 and hold the new baseline after that.

## Settled

All four open questions were answered before this plan was scheduled:

1. **`theme` stays in the schema, inert.** No migration.
2. **Fold state lives on `profile`,** not localStorage.
3. **The bottom bar keeps three slots.** No fourth for Add and no floating
   button — the bar stays a navigation surface. Adding is two taps via the
   menu, or one from a column's add block. Accepted cost: adding a job is the
   most frequent write in a job tracker, and on a phone it has no one-tap
   route. Worth revisiting after the shell has been used for a while.
4. **Archive folds into the pipeline** as three stages rather than a screen.

---

## What shipped

The eight planned PRs became thirty-two, stacked on each other and none
merged while the series was in flight. Eleven built the design; the rest
are what auditing it turned up. Splits happened where a PR grew two
distinct halves (persistence vs the UI that consumes it, Insights vs CV).

### The design

| PR | Scope |
|---|---|
| #535 | This spec and plan |
| #536–#545 | PRs 1–3: light-only, spacing tokens, wordmark menu, shortcuts, bottom bar, rail removal, top bar |
| #546 | PR 4 — the landing screen |
| #547 | PR 5a — board fold state: migration, API, tests |
| #548 | PR 5b — board fold + the archive as a rail |
| #549 | PR 5c — board card + the narrow carousel |
| #550 | PR 6 — application detail on a stage-tinted plate |
| #551 | PR 7a — Insights: figures band, three columns |
| #552 | PR 7b — CV plate, variants as the rail |
| #553 | PR 8a — Feed banded by match strength |
| #554 | PR 8b — People "Owe a reply" + Settings headings |
| #555 | "Closed applications" — the behaviour the numbering had left homeless |

### What auditing it found

Every one of these was invisible on screen. That is the point of the list:
the design looked finished at #555, and none of what follows would have
been caught by looking at it again.

| PR | Found | How |
|---|---|---|
| #556 | The destination the spec calls "People & companies" shipped as "Network" | Sweeping every route at two widths |
| #557 | The landing screen rendered **two** columns, not three — a stale rule won on source order, putting "Happened today" below the fold | Measuring the computed grid |
| #558 | The wordmark's mark shipped at 22px, the exact size the spec calls "mush" | Measuring against the spec's own number |
| #559 | A locked decision ("never a filled ground with type on it") contradicted by three surfaces the shell fills | Re-measuring the rule's premise |
| #560 | 134 lines of CSS whose markup the shell had removed | The repo's own dead-css script |
| #561 | A tablist that controlled no panel; two radio groups that implement no arrow keys | Reading the ARIA against what it promises |
| #562 | Printing lost the application's stage entirely, and printed the plate as a slab of ink | Emulating print, which nothing in the build does |
| #563 | The share page's aggregate-only rule was structural, not enforced | Asking what would object to a comp column |
| #564 | The closed-applications shortcut stole the feed's own `a` key | Checking that every destination really is one keystroke away |
| #565 | A new user's first board offered five identical primary CTAs | Logging in as an account with no data |
| #566 | A three-digit rail count filled its badge edge to edge | Seeding 160 applications |

## Reviewing this stack

Read it bottom-up in merge order; each PR assumes the one below it. If time
is short, these are where the risk is:

- **#547** is the only migration and the only new API route. It is also the
  only PR here that can corrupt data.
- **#548, #549, #550** carry the largest behavioural changes: the Archive
  screen goes away, the board becomes a carousel below 900px, and the
  detail page is restructured. Everything after them is smaller.
- **#559 and #563** change or enforce standing rules, so they are worth
  disagreeing with explicitly if you are going to disagree at all.
- The rest are contained fixes with a test each.

What CI cannot check, and a human should:

1. **Is the board's fold model right?** Folding is a choice, not a rule about
   emptiness. That is a product opinion, not a bug class.
2. **Does "People & companies" want to be one screen?** The mockup says yes;
   this ships two tabs, because merging them is a routing change.
3. **The bottom bar.** Settled decision 3 says the bar is a navigation
   surface with no slot for adding, and accepts that adding has no one-tap
   route on a phone. The bar ships with Add in the first slot, and the third
   slot the design wanted (Pinned) is not a Zenith feature. Either the
   decision or the bar should change; nothing here decides that.

### Deviations from the mockups, and why

Each of these is a place where the approved mockup and the shipped app
differ. They are recorded here rather than left to be re-discovered as
bugs.

- **The feed is banded, not columned.** The mockup shows three columns by
  match strength. The feed has a two-pane triage the mockup did not model:
  `j`/`k` navigation, a focused-card detail pane, swipe on touch. Three
  columns means three focus rings and no single flat index for the detail
  pane to read. The bands are headings inside the one list instead, which
  keeps the keyboard flow and says the same thing.

- **Settings has no dotted leaders.** Leaders pair a label with a stated
  value. Zenith's settings are editable controls, so a leader running from
  "Language" to a dropdown is decoration rather than a reading aid.
  Converting the panel to read-rows-that-open-editors is a behavioural
  change, not a restyle, and wants its own decision.

- **People and Companies were not merged into one screen.** They are
  separate tabs with their own detail routes, search and list/grid state;
  merging them is a routing and IA change. The part the plan actually asked
  for — leading with "Owe a reply" — landed without it.

- **The detail page's stage rail is two columns, not one.** Eight stages in
  a single column left a block of dead space beside the title. The split is
  where the pipeline splits: the five stages an application moves through,
  then the three it stops at.

- **The folded rail's count circle is filled, not a ring.** The design doc
  said filled; an earlier reading of the contrast rule said that was
  impossible. Both were half right: white fails on the lighter `--sc` field
  colours (3.62:1 on interview) and clears on every `--sc-ink` (5.11:1 at
  the worst). The fill is the ink tone.

### One behaviour the numbering lost

The doc's Destinations section specifies a menu row and a shortcut that fold
the live stages and open the closed ones. It could not be built before the
board could fold (PR 5), and PR 8 did not come back to it. #555 closes it:
the toast offers "Back to live" and carries the previous fold set, because
someone who lands in that view has no way of knowing what was folded before
it. #564 then moved the key from `A` to `C` — the feed has answered to `a`
since #144, and the global shortcut was navigating people off the feed
mid-triage.

### The screenshot rig

Still not a CI gate: baselines are not committed, so nothing fails when a
render changes. Every visual claim in this series was checked by measuring
the live page instead — computed grid tracks, contrast ratios, element
boxes — which is what caught the defects a screenshot would have shown as
"looks fine". Committing baselines is a repo-weight decision, not a
technical one, and nothing here makes it.
