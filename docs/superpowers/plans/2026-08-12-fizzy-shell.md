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
- Route table loses `activity`; keeps `archive`.

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
