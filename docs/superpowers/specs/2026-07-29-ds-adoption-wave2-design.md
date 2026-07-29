# Finishing design-system adoption — Wave 2

**Date:** 2026-07-29
**Status:** approved, not yet implemented
**Supersedes the open half of:** `2026-07-20-ds-component-adoption-design.md`

## Problem

The 2026-07-20 adoption plan is most of the way done: 35 components live in
`src/components/`, 34 of them adopted (only `StatLine` has no call site), and
the cascade-layer architecture works as designed. What remains is not the
"port the components" work that spec described — that is finished — but the
consequences of stopping halfway through Wave 2.

An audit on 2026-07-29 found four of them.

**~38 controls still bypass `Button`.** It already ships `secondary`, `danger`,
`close` and `link` variants, yet 38 call sites still write
`className="btn-secondary"` or `className="danger"` on a raw `<button>` — 28 in
feature files, 10 inside owned components. Every one of them is a control whose
appearance is governed by App.css rather than by the component that exists to
govern it.

The CSS itself is *not* widely duplicated. The recipe has two canonical
definitions — App.css and `Button.css` — and the only component stylesheets
declaring a `danger` rule are `CardMenu.css:29` and `RowMenu.css:79`, both
scoped contextual overrides (`.zui-cardmenu-pop > button.danger`), which is
correct and stays. The cost of the raw call sites is that they sit outside the
component API, not that they copy its stylesheet.

Establishing that took more care than it should: grepping `\.danger` also
matches `var(--danger)`, and grepping `\.btn-secondary` also matches the
prose in `NotificationBell.css`'s header comment. Count class *definitions* by
selector position, not by substring.

**Six components are not self-contained.** The 2026-07-20 spec calls
self-containment its decisive argument — Storybook loads no App.css, so a
component that leans on App.css *renders differently in the catalog than in the
app*, which defeats the point of having a catalog. Six components do exactly
that:

| Component | Depends on | Own CSS |
| --- | --- | --- |
| `MockInterview` | `btn-secondary` | none at all |
| `NegotiationRoleplay` | `btn-secondary` | none at all |
| `Documents` | `tl-del danger` | present, defines neither |
| `NotificationBell` | `settings-btn`, `btn-secondary` | present, defines neither — deliberately |
| `AiKeyGate` | `ai-key-gate`, `muted`, `small` | none at all |
| `QuickAddDialog` | `quickadd-hint`, `quickadd-import-row`, `settings-field` | none at all |

`MockInterview` and `NegotiationRoleplay` also have no story and no test.

`NotificationBell` is the interesting one, because its dependency is documented
and argued (`NotificationBell.css:1-6`): *"The `.settings-btn` trigger and
`.btn-secondary` 'mark all read' button stay in App.css — both are shared with
other buttons elsewhere in the app."* That is a reasoned position, not an
oversight — and it is the same position the nine components using `muted` /
`small` / `sr-only` take implicitly.

**So the real defect is in the rule, not only in the components.**
Self-containment as written has no answer for a recipe that is genuinely shared
across components, and the only options it leaves are "copy it into every
component" or "quietly depend on App.css". Both are being practised. PR 3
amends the rule before any component is rewritten to satisfy it.

**313 lines of App.css describe features that no longer exist.** 58 rule
blocks across 40 class names: the swimlane board, the donut ring, the closed
drawer, the old overview, the `/jobs` layout retired in #488, and the
weekly-goal / streak / wins-journal furniture replaced by the Today rebuild
(#492).

**Selection controls are hand-rolled in nine places.** `SegmentedControl` is
adopted at five groups but only as a *container* — by a documented decision
(`SegmentedControl.tsx:4-13`: "does not own selection state or a11y grouping"),
every call site hand-writes the item button, its `active` class and its own
aria. They have already diverged: contacts, companies and feed set
`aria-pressed`; dashboard's NextUp segmented buttons set nothing. Two further
selection controls — the vertical settings/admin nav and two tablists — are
inline markup in four more files.

## What this is not

Three things the audit checked and found healthy, recorded so nobody re-checks
them:

- **Dark parity holds exactly.** Both dark blocks in `index.css` declare the
  same 39 tokens; neither has a token the other lacks.
- **Radii are effectively tokenized.** Nine raw-px `border-radius` values
  survive in App.css, all of them 1–5px markers or `999px`/`100px` pill
  restatements — no control or container bypasses the Ten-Pixel Rule.
- **Adoption is near-total.** 34 of 35 components have real call sites.

## Approach

Five pull requests, sequenced. The first four are **structural and hold a
strict zero-diff bar**; the fifth carries the deliberate visual changes the
audit turned up, where the diff is the deliverable.

The split is the point. A zero-diff bar is the only mechanism that catches a
component stylesheet that forgot a property — the type checker and the unit
tests cannot see it. Allowing "intended" diffs into the structural PRs would
make a real regression and a deliberate change indistinguishable in the
`compare` output, which is precisely where the bar earns its keep.

### Baseline

Capture the screenshot baseline with `scripts/screenshot-baseline.mjs` **before
PR 1**, every view at desktop and mobile viewports, and diff every subsequent
PR against that same baseline rather than against its predecessor. Render one
variant per page load — stacked slots produce a spurious ~25k-pixel diff.

---

### PR 1 — `fix: delete the CSS of features that no longer exist`

Delete the 58 rule blocks whose every selector class is dead. The 40 dead
classes:

```
board-summary board-swimlanes board-toolbar card-main closed-co closed-date
closed-drawer closed-status closed-title dash-spark help-btn jobs-layout
jobs-main lane lane-cell lane-label lane-stages overview-cols overview-cta
overview-headline overview-main overview-recent overview-side pipeline-filters
pipeline-filters-toggle quick-add-fab ring-chart ring-dot ring-legend ring-total
show-archived streak-active streak-broken streak-label streak-milestone tag-chip
weekly-goal-btn weekly-goal-edit weekly-goal-label wins-journal
```

Deletion is **per block, where every class in the selector is dead**. A block
mixing a dead class with a live one stays; a few of the names above survive only
in such compound selectors and will not produce a deletion.

**`stage-*` and `u-*` are not dead** despite reading as unreferenced. They are
built by template literal — `` `stage-${a.status}` `` (board, dashboard,
insights, detail, CardMenu), `` `u-${urgency}` `` (board) — as is `mock-user`
via `` `mock-${m.role}` ``. Any future dead-CSS sweep must repeat this check
before trusting a grep.

The reference set for "unreferenced" is `src/**`, `worker/**` and `index.html`
together, so the server-rendered `/shared/:token` page is covered.

App.css: 5175 → ~4862 lines.

---

### PR 2 — `fix: put every secondary and danger control behind Button`

Swap ~38 raw call sites to `<Button variant="secondary">` / `variant="danger">`
— 28 in feature files, 10 inside owned components. Nothing new is built;
`Button` already has both variants.

**`CardMenu.css:29` and `RowMenu.css:79` must be rewritten in the same commit
that swaps their call sites.** Both are scoped contextual overrides — 
`.zui-cardmenu-pop > button.danger { color: var(--danger) }` — and they select
on the literal class `danger`. `<Button variant="danger">` renders
`zui-btn zui-btn--danger`, so the moment those call sites are swapped the
selectors stop matching and the popover's destructive item silently loses its
colour. Retarget them to `.zui-btn--danger`. Do **not** work around it by
passing `className="danger"` through `Button` — that keeps a dead app class
alive at a call site whose whole purpose is to stop using one.

This is the class of failure the zero-diff bar exists to catch, and the reason
each view is diffed before the next is swapped.

App.css keeps the canonical `.btn-secondary` / `.danger` rules until the last
raw call site is gone, then loses them too.

Swap **one view at a time**, diffing against the baseline after each. This is
the risk concentration the 2026-07-20 spec named: each swap moves a control off
App.css's band-4 normalization and band-5 mobile repairs onto `Button.css`, and
anything `Button.css` fails to declare shows up only in the pixel diff. A
non-zero diff means `Button.css` is incomplete — fix the stylesheet, do not
accept the diff.

---

### PR 3 — `fix: make every owned component describe itself`

**First, amend the self-containment rule**, because as written it has no answer
for shared recipes and that gap is what produced four of the six violations.

The evidence that it is a gap and not laziness: nine owned components use
`muted`, `small` or `sr-only` from App.css while only `LoadFailed.css` and
`MomentumBand.css` restate them, and `NotificationBell.css:1-6` argues its
dependency explicitly. The codebase answers the question both ways because the
rule never answered it.

The amendment: **a component's stylesheet must fully describe everything
specific to that component, and may use shared primitives only from a stylesheet
Storybook also loads.** The catalog stays honest — which is the property
self-containment was protecting — without nine copies of `muted`.

Concretely, `muted`, `small` and `sr-only` are shared primitives.
`settings-btn`, `btn-secondary` and `tl-del` are **not**: they are control
recipes that `Button` already owns, so `NotificationBell` and `Documents` are
resolved by PR 2's swap rather than by an exception. `NotificationBell.css`'s
header comment is rewritten to record that.

Extract `.muted`, `.small` and `.sr-only` from App.css into `src/utilities.css`,
imported into the `app` layer by `src/app-styles.css` **before** App.css, and
into the same layer by `.storybook/preview-styles.css` — which today imports
only `index.css`, and is why these components look wrong in the catalog.

Within a layer, source order decides. Moving these rules from App.css:1109/1656/1660
to the top of the `app` layer changes the outcome only where a rule *earlier*
than line 1656 conflicts with them — where a later rule conflicts, that rule
already wins today and still will. The set is small and the screenshot diff
proves it either way. **If the diff is non-zero, abandon the extraction and
restate the utilities per-component instead**; do not fix it by reordering
App.css.

Then, per component:

- `MockInterview`, `NegotiationRoleplay` — a complete `.css` reproducing what
  App.css lends them today, plus `.stories.tsx` and `.test.tsx`.
- `Documents` and `NotificationBell` — nothing to define. PR 2 turns their
  `tl-del danger`, `btn-secondary` and `settings-btn` buttons into `<Button>`,
  which resolves both. Verify that here rather than assuming it; whatever
  `tl-del` and `settings-btn` contribute beyond the button recipe (icon sizing,
  positioning) does belong in the component's own stylesheet.
- `AiKeyGate` — define `ai-key-gate`, plus a story.
- `QuickAddDialog` — define `quickadd-hint`, `quickadd-import-row` and its use
  of `settings-field`. `settings-field` is a form-layout recipe, not a text
  utility, so it does **not** join `utilities.css`; the component restates what
  it needs.

Finally, **enforce it with a test**, in `test-node/` alongside
`no-claude-imports.spec.ts`: fail when a component's markup references a class
that neither its own stylesheet nor `utilities.css` defines. The existing
import-guard proves the pattern; six violations and five duplicate recipes prove
a convention alone does not hold. The test parses static `className` strings and
skips template-literal segments, which it cannot resolve — the same limitation
the dead-CSS sweep hit, and the reason a grep is never sufficient on its own.

---

### PR 4 — `feat: own the three selection controls`

**`SegmentedControl.Item`** — owns the `active` class and `aria-pressed`.
Adopted at all five existing groups (`contacts.tsx`, `companies.tsx`,
`feed.tsx` ×2, `dashboard.tsx`). This revises the documented "container only"
decision; the comment at `SegmentedControl.tsx:4-13` gets rewritten to say why
it changed. Dashboard's missing `aria-pressed` is then fixed by construction
rather than by remembering — and because an aria attribute is invisible to a
pixel diff, that fix lands here rather than in PR 5.

**`TabBar`** — the underline tablist from `detail.tsx` (App.css:4512):
`border-bottom` container, active item marked by a 2px accent underline. Owns
`role="tab"`, `aria-selected`, `aria-controls`, and the `id` /
`aria-labelledby` wiring between tab and panel.

**`SettingsNav`** — the vertical `aria-current` nav (App.css:3999), identical in
`settings/index.tsx` and `admin.tsx`.

**`PillTabs`** — `App.tsx`'s `.subnav` (App.css:1083): a pill capsule carrying
`role="tab"` / `aria-selected`. Its stylesheet reproduces `.subnav` **exactly**,
including the band-5 `min-height: 34px` (40px under 600px) touch-target repair
from App.css:4862/4877 that the raw markup inherits today.

`.subnav` and `.zui-segmented` are the same shape — same border, same
`radius-full`, same filled-accent active state — and differ only in voice.
Merging them is PR 5's job, not this one; here `PillTabs` stays a separate
component at zero diff.

---

### PR 5 — `fix: the three defects the adoption audit surfaced`

Here the diff is the deliverable and is reviewed as a visual change.

1. **`.subnav`'s voice.** It sets its labels in body text while
   `.zui-segmented` sets the identical shape in mono/uppercase with
   `--track-eyebrow`. DESIGN.md's Mono-Is-Chrome Rule names "tab and stage
   labels" as exactly the mono case, so this is type-ramp drift #501 missed.
   Move `PillTabs` onto the segmented voice; if the two then differ only in
   container margin, fold `PillTabs` into `SegmentedControl` and delete it.
2. **The stray elevation shadow** at App.css:2998
   (`0 1px 4px rgba(20, 23, 58, 0.12)`) onto `--shadow-*`, per the One-Step
   Rule. The other six non-token `box-shadow` values are focus rings, 1px
   hairline overlays and an inset stage marker — not elevation, and they stay.
3. Anything PR 1–4 deferred by the same reasoning.

---

## Verification

Every PR, all green before it opens:

- `npx tsc -b` — `noUnusedLocals` is on, so dead symbols are errors
- `npm run build`
- `npm run lint` — zero warnings; do not add an exhaustive-deps warning
- `npx vitest run --no-file-parallelism`
- `npx storybook build`
- en/nl key parity — every key in both locales
- `compare -metric AE` = 0 against the pre-PR-1 baseline, for PRs 1–4

For PR 5 the screenshot diff is reviewed, not required to be zero, and the
expected change is stated in the PR body before the captures are shown.

## Risks

- **PR 2 is where a regression would hide.** 38 controls move off App.css's
  band-4/5 rules onto `Button.css` in one PR. Per-view sequencing plus a diff
  after each view is the mitigation; a diff that cannot be explained stops the
  PR.
- **The utility extraction in PR 3 is the one place the zero-diff bar might
  legitimately fail.** The fallback (restate per-component) is written into the
  step so the decision does not get re-litigated mid-implementation.
- **`PillTabs` may be short-lived.** If PR 5 folds it into `SegmentedControl`,
  PR 4 will have built a component that lasts one PR. That is deliberate: it
  keeps the structural change and the visual change separable, which is the
  whole reason for the five-PR split.
- **`src/ui.tsx` stays untouched**, as the 2026-07-20 spec directed. Its
  `Dialog` overlaps the design system's `Modal` concept; reconciling them is
  its own decision and is not in this scope.

## Out of scope

`StatLine` has no call site. It is not deleted here — whether an unused
component is debt or catalog is a separate question, and this push is about
what ships.
