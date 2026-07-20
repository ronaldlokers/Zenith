# Design-system component adoption

**Date:** 2026-07-20
**Status:** approved, not yet implemented

## Problem

Zenith has a design system published as a Claude Design project and synced into
`.claude/skills/zenith-design/` (39 components, 1672 LOC). Storybook now renders
those components (see the Phase 1 wiring in `.storybook/`), but the app does not
use them: `src/` re-implements the same controls as raw elements plus classes
from `src/App.css`.

We want the app to use real components with the design system's prop API, so the
catalog and the shipped UI stop being two independent implementations of the same
visual contract.

## Why we are not importing the DS components directly

Three findings rule out `import { Button } from ".claude/skills/zenith-design/..."`:

1. **The DS components are inline-styled re-implementations, not the source of
   truth.** `Button.jsx` builds a `style={{…}}` object; its own comment reads
   "Plain `<button>` in the source, styled by App.css; this wraps the same visual
   contract into a variant/size API." The app is 789 `className=` against 8
   inline `style={{`, with 177 raw `<button>` elements styled by `button.primary`
   / `button.danger`.
2. **Inline styles would bypass the App.css band system.** Band 4 is the
   control-normalization layer ("one recipe per control family; must stay after
   everything it normalizes") and band 5 is the mobile touch-target and hover
   repairs. Inline styles beat the cascade and cannot express media queries, so
   adopting them would silently drop mobile parity — a locked product decision.
3. **`.claude/skills/zenith-design/` is design-sync managed and gets
   overwritten.** Observed during the 2026-07-20 pull: the `ui_kits` HTML files
   lost their `@dsCard` markers. Importing from there makes a routine design pull
   an unreviewed production change.

Tokens are not a blocker: DS tokens are a strict superset of `src/index.css` —
all 59 app tokens present, plus 22 extras (motion, dataviz, focus ring).

## Approach

Port each DS component **once** into `src/` as owned TypeScript, converting its
inline styles to classes. The design project becomes a pure visual reference with
no code coupling to the app.

### Layout

```
src/components/
  <Name>.tsx           owned TypeScript, props derived from the DS .d.ts
  <Name>.css           co-located, imported by <Name>.tsx
  <Name>.stories.tsx   ported from the DS story
  index.ts             barrel
```

`src/App.css` keeps its content byte-identical. `src/index.css` keeps owning
tokens; components consume them and never redeclare them.

### Components are fully self-contained

**A component's own CSS is the complete description of how it looks. It must not
depend on any App.css rule.**

The decisive argument is Storybook fidelity: Storybook loads the design-system
`styles.css` (tokens only), never `App.css`. A component that relies on App.css
therefore renders *differently in the catalog than in the app* — the catalog
would misrepresent what ships, which defeats the point of having it.

### Isolation mechanism: cascade layers

Class naming alone cannot deliver this. App.css contains bare-element selectors
that match a component's rendered element regardless of its classes:

- `src/App.css:4527` — `button:not(:disabled):active { filter: brightness(0.97) }`
- `src/App.css:5204` — `button { display: none !important }` inside `@media print`

The specificity is unwinnable: `button:not(:disabled):active` scores (0,2,1)
while `.zui-btn:active` scores (0,1,1) and loses. Cascade layers resolve this
without a specificity arms race, because layer order outranks specificity.

A new `src/app-styles.css` becomes App.tsx's stylesheet import:

```css
@layer app, components;
@import "./App.css" layer(app);
```

Component CSS wraps its rules in `@layer components { … }`. App.css's internal
band ordering is preserved intact inside the `app` layer; the `components` layer
sits above it and wins every conflict.

Verified against Vite 8: the build emits `@layer app{…}` followed by
`@layer components{…}`, with App.css content correctly nested in the `app`
layer. `src/index.css` is imported separately by `main.tsx` and stays
**unlayered**, so its `:root` custom properties remain visible to every layer.

**Two deliberate limitations:**

1. **Layers resolve conflicts, not presence.** If App.css sets a property the
   component never mentions, that rule still applies — there is nothing to
   conflict with. Each component must therefore declare the full property set it
   cares about. This is tractable because the DS inline style objects already
   enumerate exactly that set; it is what makes the port mechanical.
2. **Print styles stay global on purpose.** `@media print { button { display:
   none } }` should keep applying to components. Re-implementing print rules per
   component would be worse.

### Class namespacing

**Every component class still carries a `zui-` prefix**, now for readability and
collision-avoidance rather than as the isolation mechanism. Chosen over CSS
Modules deliberately: the prefix keeps classes legible in DevTools and matches
the codebase's existing class-based idiom.

### Reference-only enforcement

No file under `src/` may import from `.claude/`. Enforced by a test, not a
convention — a convention will not survive a design-sync pull.

## Port recipe (per component)

1. Read the DS `.jsx` and `.d.ts`.
2. Write `<Name>.tsx` with real TypeScript props derived from the `.d.ts`. Do not
   carry over the hand-maintained `.d.ts`; eliminating that drift risk is part of
   the point.
3. Convert the inline style object into `zui-` prefixed classes in
   `<Name>.css`, wrapped in `@layer components { … }`, using existing tokens.
   The stylesheet must describe the component **completely** — colour, spacing,
   states (hover, active, focus, disabled) and its own responsive rules. Do not
   rely on any App.css rule, including the band 4 normalization and band 5
   mobile repairs the old markup used to inherit.
4. Replace hardcoded `aria-label` strings with i18n keys, added to **both**
   `en.json` and `nl.json`. The DS components ship English aria labels
   ("Close", "Next page", "Previous month", "Loading", "Clear search",
   "Pagination", "Breadcrumb", "Command palette", "Dismiss"). There is no
   hardcoded body copy.
5. Port the DS story to `<Name>.stories.tsx`.
6. Verify in Storybook in light and dark, against the DS card as the visual
   reference.

## Sequencing

### Wave 0 — infrastructure

- Create `src/components/` and the barrel.
- Extend the Storybook glob to `src/components/**/*.stories.tsx`, alongside the
  existing DS glob so the full catalog stays browsable throughout.
- Add the import-guard test.
- **Capture the screenshot baseline**: every app view, desktop and mobile
  viewports, before any app code changes.

### Wave 1 — port the components with real call sites

Provisional list, to be confirmed by an audit in Wave 0 (the current list comes
from a name-mention grep and overcounts): Modal, Badge, Toast, Table, Timeline,
Alert, Tooltip, Avatar, Combobox, CommandPalette.

Ported and story-verified, but **no call sites swapped**. The app does not change
in this wave, so it cannot regress.

### Wave 2 — swap call sites, one view at a time

Migrate per view (dashboard, board, detail, settings, cv, network, feed,
calendar, chrome). Screenshot-diff against the Wave 0 baseline after each view; a
diff must be explained before moving on. This is where the 177 `<button>`
elements are swapped, and it carries the bulk of this plan's risk.

### On-demand — the remaining components

Not scheduled. When a feature needs one, port it then using the recipe above:
roughly 43 lines plus CSS plus a story. Porting later also means porting from the
current upstream version rather than a stale snapshot.

Deferred (28): Card, StageStepper, StatCard, StatusBadge, Accordion, BarChart,
DonutChart, FunnelChart, Pagination, ProgressBar, EmptyState, ModalProvider,
Spinner, SplashScreen, ToastProvider, DatePicker, FileUpload, Input,
SearchField, Slider, Icon, Breadcrumb, ContextMenu, Popover, SegmentedControl,
Sidebar, Tabs, TopBar.

Accounting: 39 total = 10 (Wave 1) + 1 (Button, ported in Wave 2 as the subject
of the 177-element swap) + 28 deferred.

## Verification

Run and confirm green at every wave:

- `npx tsc -b`
- `npm run build`
- `npx oxlint` — must stay at the single known `src/feed.tsx` exhaustive-deps
  warning; no new warnings
- `npx vitest run --no-file-parallelism`
- `npx storybook build`
- en/nl key parity
- screenshot diff against the Wave 0 baseline
- the import-guard test

## Risks

- **Wave 2 is the risk concentration.** Swapping 177 call sites moves them off
  App.css's band 4/5 rules and onto the component's own stylesheet. Anything the
  component CSS forgot to declare shows up as a visual change the type checker
  and unit tests cannot see. The screenshot baseline is the only thing that
  catches this; it is not optional, and the bar is **zero diff** — any
  difference means the component's CSS is incomplete.
- **Self-containment shifts effort from Wave 2 to Wave 1.** Each component's CSS
  must now reproduce the full visual contract rather than layering onto App.css,
  including its own responsive rules for the mobile parity requirement.
- **File count.** Each ported component adds three files. Wave 1 alone adds ~30.
- **`src/ui.tsx` overlaps.** Its `Dialog` and the DS `Modal` are the same
  concept, as are `LoadingSkeleton`/`Spinner` and `LoadFailed`/`EmptyState`.
  Leave `ui.tsx` untouched through Wave 2 and reconcile deliberately afterwards —
  do not fold it into a port wave.

## Documentation changes

`CLAUDE.md` needs two corrections independent of this work:

1. It claims the whole UI lives in `src/App.tsx` with a split as a known TODO.
   The split already happened: `App.tsx` is 755 lines, and the UI lives across
   `detail.tsx` (1491), `settings.tsx` (1249), `cv.tsx` (996), `board.tsx` (939),
   `network.tsx` (908), `feed.tsx` (722), and others.
2. It documents `App.css` as the single stylesheet. The co-located
   `src/components/*.css` convention needs describing alongside the band system,
   including the `zui-` prefix rule and why it exists.
