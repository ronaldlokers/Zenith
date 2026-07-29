# Design-System Adoption Wave 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the design-system adoption started in `2026-07-20-ds-component-adoption-design.md` — delete the CSS of features that no longer exist, put every secondary/danger control behind `Button`, make six components describe themselves, own the three hand-rolled selection controls, and ship the three defects the audit found as one reviewed visual change.

**Architecture:** Five pull requests, sequenced. PRs 1–4 are structural and hold a strict zero-diff bar, verified by screenshot comparison against a single baseline captured before PR 1. PR 5 carries the deliberate visual changes, where the diff is the deliverable. Components live in `src/components/` as owned TypeScript with co-located CSS wrapped in `@layer components`; the cascade order is established by `src/app-styles.css` (`@layer reset, app, components`) and mirrored for Storybook by `.storybook/preview-styles.css`.

**Tech Stack:** React 19, TypeScript, Vite, vitest (three projects: `workers`, `components`, `node`), Storybook 10, Playwright (screenshot capture), ImageMagick `compare` (pixel diff), oxlint.

**Spec:** `docs/superpowers/specs/2026-07-29-ds-adoption-wave2-design.md`

## Global Constraints

- **Never commit to `main`.** One short-lived branch per PR: `fix/…`, `feat/…`, `refactor/…`, `docs/…`, `chore/…`. Conventional-commit subjects, lowercase imperative.
- **Zero-diff bar, PRs 1–4:** `compare -metric AE` must report `0` against the pre-PR-1 baseline for every captured view. A non-zero diff means a stylesheet is incomplete — fix the stylesheet, never accept the diff.
- **Every task ends green on:** `npx tsc -b`, `npm run build`, `npm run lint` (oxlint, zero warnings — `noUnusedLocals` is on, so dead symbols are compile errors), `npx vitest run --no-file-parallelism`, `npx storybook build`.
- **en/nl strict key parity.** Every key added to `src/locales/en.json` must exist in `src/locales/nl.json`. No hardcoded user-facing strings.
- **Component CSS lives entirely in `@layer components`** and must fully describe the component. Storybook loads no `App.css`.
- **Class prefix is `zui-`** for all component-owned classes.
- **Layer priority is per-property, not per-rule**, and **unlayered CSS beats all layered CSS** regardless of specificity.
- **`src/ui.tsx` is out of scope.** Do not touch it.
- Screenshot captures render **one variant per page load**. Stacked slots produce a spurious ~25k-pixel diff.

---

## File Structure

**Created:**
- `src/utilities.css` — the three shared text primitives (`.muted`, `.small`, `.sr-only`), single source, loaded by both the app and Storybook.
- `src/components/AiTranscript.css` — the `mock-*` shell recipe shared by `MockInterview` and `NegotiationRoleplay`.
- `src/components/MockInterview.stories.tsx`, `.test.tsx`
- `src/components/NegotiationRoleplay.stories.tsx`, `.test.tsx`
- `src/components/AiKeyGate.css`, `.stories.tsx`
- `src/components/QuickAddDialog.css`
- `src/components/TabBar.tsx`, `.css`, `.stories.tsx`, `.test.tsx` — underline tablist
- `src/components/SettingsNav.tsx`, `.css`, `.stories.tsx`, `.test.tsx` — vertical `aria-current` nav
- `src/components/PillTabs.tsx`, `.css`, `.stories.tsx`, `.test.tsx` — pill-capsule tablist
- `test-node/component-self-containment.spec.ts` — the guard test

**Modified:**
- `scripts/screenshot-baseline.mjs` — routes are stale; add interaction states
- `src/App.css` — delete dead blocks, delete `.muted`/`.small`/`.sr-only`, delete `.btn-secondary`/`.danger` once dead
- `src/app-styles.css`, `.storybook/preview-styles.css` — load `utilities.css`
- `src/components/SegmentedControl.tsx`, `.css`, `.stories.tsx`, `.test.tsx` — gains `Item`
- `src/components/CardMenu.css:29`, `src/components/RowMenu.css:79` — retarget to `.zui-btn--danger`
- 20 call-site files listed per task

---

# Phase 0 — the verification rig

Nothing in Phases 1–4 can be trusted until this is right. The zero-diff bar is the only mechanism that catches an incomplete stylesheet, and it currently measures the wrong set of views.

## Task 1: Repair the screenshot harness

`scripts/screenshot-baseline.mjs:22-32` lists routes that no longer match `src/routing.ts`:

- `/jobs` and `/calendar` are **legacy paths**. `LEGACY_PATHS` (`src/routing.ts:55`) rewrites them to `/board` and `/insights`, so they capture duplicates of other views.
- **`/insights` and `/admin` are never captured**, though both are canonical tabs in `TAB_PATHS`. PR 2 changes three controls in `insights.tsx` and one in `settings/admin.tsx`; PR 4 rewrites `admin.tsx`'s nav. Those changes would ship unverified.
- **The application detail view is never captured.** PR 2 changes four controls in `detail.tsx` and PR 4 builds `TabBar` from its tablist.
- Settings sections are URL-addressable (`/settings?s=…`, `src/settings/index.tsx:78-79`) but only the default section is captured.

**Files:**
- Modify: `scripts/screenshot-baseline.mjs:22-32` (VIEWS), `:50-64` (capture loop)

**Interfaces:**
- Produces: `baseline/<name>-<viewport>.png` for every entry in `VIEWS`, where an entry is `[name, route]` or `[name, route, interactions]` and `interactions` is an array of `{ suffix, click }` — `click` is a CSS selector pressed before the extra capture.

- [ ] **Step 1: Replace the VIEWS list**

Replace lines 18–32 with:

```js
// Routes come from TAB_PATHS in src/routing.ts. Keep them in sync.
// Legacy paths (/jobs, /stats, /activity, /calendar) are deliberately absent:
// LEGACY_PATHS rewrites them to a canonical route, so capturing them would
// duplicate another view's shots and imply views that no longer exist.
//
// A third element is an interaction list: each entry clicks a selector and
// captures again under `<name>-<suffix>`. Local-state controls (detail's
// section tabs, the segmented groups) are invisible to a URL-only capture,
// and those are exactly what PR 4 rewrites.
const VIEWS = [
  ["overview", "/", [{ suffix: "nextup-upcoming", click: ".today-nextup .zui-segmented button:nth-child(2)" }]],
  ["board", "/board"],
  ["detail", `/board/${process.env.DETAIL_ID ?? "1"}`, [
    { suffix: "tab-track", click: "#detail-tab-track" },
    { suffix: "tab-tailor", click: "#detail-tab-tailor" },
  ]],
  ["feed", "/feed", [{ suffix: "sort-match", click: ".feed-controls .zui-segmented button:nth-child(2)" }]],
  ["insights", "/insights"],
  ["companies", "/companies", [{ suffix: "grid", click: ".zui-segmented button:nth-child(2)" }]],
  ["people", "/people", [{ suffix: "grid", click: ".zui-segmented button:nth-child(2)" }]],
  ["cv", "/cv"],
  ["settings", "/settings"],
  ["settings-data", "/settings?s=data"],
  ["settings-feed", "/settings?s=feed"],
  ["admin", "/admin"],
];
```

- [ ] **Step 2: Teach the capture loop to run interactions**

Replace the inner `for` loop body (lines 53–62) with:

```js
  for (const [name, route, interactions] of VIEWS) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    // Fail loudly rather than capture a login page: the session expired.
    if (await page.getByLabel(/password/i).count()) {
      console.error(`Session expired — ${route} rendered the login page. Re-create ${AUTH}.`);
      process.exit(1);
    }
    await page.screenshot({ path: `${OUT}/${name}-${vpName}.png`, fullPage: true });
    console.log(`captured ${name}-${vpName}`);
    for (const { suffix, click } of interactions ?? []) {
      const target = page.locator(click).first();
      // A missing selector means the harness has drifted from the markup —
      // silently skipping it would make the diff pass while covering nothing.
      if (!(await target.count())) {
        console.error(`Interaction selector not found on ${route}: ${click}`);
        process.exit(1);
      }
      await target.click();
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/${name}-${suffix}-${vpName}.png`, fullPage: true });
      console.log(`captured ${name}-${suffix}-${vpName}`);
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    }
  }
```

- [ ] **Step 3: Note the detail-id requirement in the header comment**

Append to the comment block at the top of the file:

```js
// The detail view needs a real application id. Pass DETAIL_ID=<id> if the
// seeded account's first application is not id 1; the run fails loudly if the
// route renders nothing to interact with.
```

- [ ] **Step 4: Verify the harness runs**

Start the app and apply migrations first:

```bash
npx wrangler d1 migrations apply zenith --local
npm run dev
```

In a second shell:

```bash
npx playwright open --save-storage=.auth.json http://localhost:5173   # log in, close window
OUT_DIR=harness-check node scripts/screenshot-baseline.mjs
```

Expected: every view logs `captured …`, including `insights`, `admin`, `detail`, `detail-tab-track`, `detail-tab-tailor`, and the interaction shots. No `Interaction selector not found`. If a selector is not found, fix the selector against the real markup — do not delete the interaction.

- [ ] **Step 5: Commit**

```bash
git checkout -b chore/screenshot-harness-routes
git add scripts/screenshot-baseline.mjs
git commit -m "chore: capture the routes the app actually has

The harness still listed /jobs and /calendar, which LEGACY_PATHS rewrites to
/board and /insights, so two of its nine views were duplicates. /insights,
/admin and the application detail view — between them the target of eight
control swaps and two of the four components Wave 2 builds — were never
captured at all, and the segmented and section tabs are local state a URL-only
capture cannot reach. Adds an interaction list so those states are captured too,
and fails loudly on a selector that no longer matches rather than skipping it."
```

## Task 2: Capture the baseline

**Files:**
- Create: `baseline/*.png` (gitignored — confirm `baseline` is in `.gitignore`; add it if not)

**Interfaces:**
- Produces: the single reference set every PR in Phases 1–4 diffs against. Capture once, never recapture.

- [ ] **Step 1: Snapshot the local database**

Data mutations between captures would show as diffs that have nothing to do with CSS.

```bash
cp -r .wrangler/state .wrangler/state.baseline-backup
```

- [ ] **Step 2: Capture**

With `npm run dev` running:

```bash
OUT_DIR=baseline node scripts/screenshot-baseline.mjs
ls baseline | wc -l
```

Expected: **36** — 18 captures at each of two viewports. The 18 are 12 base views plus 6 interaction states (`overview-nextup-upcoming`, `detail-tab-track`, `detail-tab-tailor`, `feed-sort-match`, `companies-grid`, `people-grid`). A lower count means an interaction was skipped; the harness should have exited non-zero, so investigate rather than proceeding.

- [ ] **Step 3: Verify ImageMagick is present**

```bash
compare --version || sudo pacman -S imagemagick
```

The devcontainer ships without it; this is `pacman`, not `apt`.

- [ ] **Step 4: Prove the comparison works**

```bash
compare -metric AE baseline/board-desktop.png baseline/board-desktop.png null: 2>&1
```

Expected: `0`.

```bash
compare -metric AE baseline/board-desktop.png baseline/feed-desktop.png null: 2>&1
```

Expected: a large non-zero number. A comparison that reports `0` for two different views is misconfigured and would pass every later check while catching nothing.

- [ ] **Step 5: Record the diff command for later tasks**

Every "verify zero diff" step below means:

```bash
OUT_DIR=after node scripts/screenshot-baseline.mjs
for f in baseline/*.png; do
  n=$(basename "$f")
  printf "%-40s %s\n" "$n" "$(compare -metric AE "$f" "after/$n" null: 2>&1)"
done
```

Expected: `0` on every line. Any other value stops the task.

---

# Phase 1 — PR 1: delete the CSS of features that no longer exist

## Task 3: Delete the 58 dead rule blocks

**Files:**
- Modify: `src/App.css` (5175 → ~4862 lines)

**Interfaces:**
- Consumes: the baseline from Task 2.
- Produces: nothing other code references. This is pure deletion.

- [ ] **Step 1: Regenerate the dead list rather than trusting this document**

Write `scripts/dead-css.mjs`:

```js
// Reports App.css rule blocks whose selector mentions only classes that no
// file under src/, worker/ or index.html references.
//
// Template-built class names are invisible to this scan — `stage-${status}`,
// `u-${urgency}` and `mock-${role}` all read as unreferenced and are all live.
// The DEAD list this produces is a candidate list, never a delete list.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const walk = (d) => readdirSync(d).flatMap((e) => {
  const f = path.join(d, e);
  try { return statSync(f).isDirectory() ? walk(f) : [f]; } catch { return []; }
});
const haystack = [...walk("src"), ...walk("worker"), "index.html"]
  .filter((f) => /\.(tsx?|jsx?|html|json)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const css = readFileSync("src/App.css", "utf8");
const classes = [...new Set([...css.matchAll(/^\s*\.([a-zA-Z][\w-]*)/gm)].map((m) => m[1]))];
const dead = new Set(classes.filter((c) => !haystack.includes(c)));

const lines = css.split("\n");
const stack = [];
let total = 0;
for (let i = 0; i < lines.length; i++) {
  for (const ch of lines[i]) {
    if (ch === "{") stack.push({ start: i, sel: lines[i].trim(), at: lines[i].trim().startsWith("@") });
    else if (ch === "}") {
      const b = stack.pop();
      if (!b || b.at) continue;
      const cls = [...b.sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
      if (cls.length && cls.every((c) => dead.has(c))) {
        total += i - b.start + 1;
        console.log(`${b.start + 1}-${i + 1}  ${b.sel}`);
      }
    }
  }
}
console.log(`\n${total} lines`);
```

Run it:

```bash
node scripts/dead-css.mjs
```

Expected: ~58 blocks, ~313 lines.

- [ ] **Step 2: Prove the template-literal exclusions by hand**

```bash
grep -rn 'stage-\${\|u-\${\|mock-\${\|`stage-\|`u-\|`mock-' src --include="*.tsx"
```

Expected: matches in `board.tsx`, `dashboard.tsx`, `insights.tsx`, `detail.tsx`, `components/CardMenu.tsx`, `components/MockInterview.tsx`, `components/NegotiationRoleplay.tsx`.

Confirm the script's output contains **no** `stage-*`, `u-*` or `mock-*` block. If it does, the script is wrong and deleting its output would break the board, the dashboard and the AI transcripts. Stop and fix the script.

- [ ] **Step 3: Delete the blocks**

Delete them bottom-up (highest line number first) so earlier line numbers stay valid. The 40 dead class names, for cross-checking the script's output:

```
board-summary board-swimlanes board-toolbar card-main closed-co closed-date
closed-drawer closed-status closed-title dash-spark help-btn jobs-layout
jobs-main lane lane-cell lane-label lane-stages overview-cols overview-cta
overview-headline overview-main overview-recent overview-side pipeline-filters
pipeline-filters-toggle quick-add-fab ring-chart ring-dot ring-legend ring-total
show-archived streak-active streak-broken streak-label streak-milestone tag-chip
weekly-goal-btn weekly-goal-edit weekly-goal-label wins-journal
```

A block mixing a dead class with a live one is **not** deleted — a few of these names survive only in such compound selectors and produce no deletion.

Delete any band comment left describing only deleted rules. Leave the band structure and its header comment intact.

- [ ] **Step 4: Verify the file still parses and the app builds**

```bash
npx tsc -b && npm run build && npm run lint
```

Expected: all green.

- [ ] **Step 5: Verify zero diff**

Run the diff command from Task 2 Step 5. Expected: `0` on all 36 lines.

- [ ] **Step 6: Commit and open the PR**

```bash
git checkout -b fix/delete-dead-css
git add src/App.css scripts/dead-css.mjs
git commit -m "fix: delete the CSS of features that no longer exist

58 rule blocks across 40 class names, ~313 lines: the swimlane board, the donut
ring, the closed drawer, the old overview, the /jobs layout retired in #488, and
the weekly-goal, streak and wins-journal furniture the Today rebuild replaced
(#492).

scripts/dead-css.mjs reproduces the analysis. Its output is a candidate list,
not a delete list: template-built names (stage-*, u-*, mock-*) read as
unreferenced and are all live, so it excludes them by hand and any future sweep
must too."
gh pr create --fill
gh pr checks --watch
```

---

# Phase 2 — PR 2: put every secondary and danger control behind Button

38 call sites. `Button` already ships both variants — nothing new is built. Swap in the order below, running the diff after each task, because each swap moves a control off App.css's band-4 normalization and band-5 mobile repairs onto `Button.css`, and anything `Button.css` fails to declare is visible only in the pixel diff.

`Button` is imported as `import { Button } from "./components"` (or the correct relative path) and takes `variant`, `size`, `icon`, plus every native button attribute. It forwards `className`, so a call site keeping a layout class writes `<Button variant="secondary" className="zui-cal-nav">`.

**One branch for the whole phase:** `fix/button-adoption`. Commit per task.

## Task 4: Retarget the two scoped danger selectors, with their call sites

This must be one commit. `CardMenu.css:29` and `RowMenu.css:79` select the literal class `danger`; `<Button variant="danger">` renders `zui-btn zui-btn--danger`. Swapping the call sites without retargeting silently drops the colour from both popovers' destructive items — invisible to tsc, lint and the unit tests.

**Files:**
- Modify: `src/components/CardMenu.tsx:81`, `src/components/CardMenu.css:29`, `src/components/RowMenu.tsx:54`, `src/components/RowMenu.css:79`

**Interfaces:**
- Produces: the precedent every later task follows — a scoped override that qualifies `Button`'s recipe targets `.zui-btn--danger`, not `.danger`.

- [ ] **Step 1: Write the failing test**

Add to `src/components/CardMenu.test.tsx`, which already defines `mockApplication` and `noop`:

```tsx
// CardMenu.css scopes the destructive colour to the popover. It has to select
// the class Button actually renders, or the Archive item silently loses its
// colour — invisible to tsc, lint and every other test in this file.
test("the destructive item carries Button's danger class, not the app's", () => {
  render(
    <CardMenu
      a={mockApplication}
      onMove={noop}
      onSetFollowUp={noop}
      onOpenDetail={noop}
      onArchive={noop}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Actions for Staff Engineer" }));
  const archive = screen.getByRole("menuitem", { name: "Archive" });
  expect(archive).toHaveClass("zui-btn--danger");
  expect(archive).not.toHaveClass("danger");
});
```

Add to `src/components/RowMenu.test.tsx`:

```tsx
// Same trap as CardMenu: RowMenu.css scopes the destructive colour with a
// selector on the literal class `danger`, which Button does not render.
test("a danger item carries Button's danger class, not the app's", () => {
  render(
    <RowMenu
      label="Actions for Acme Corp"
      items={[
        { label: "Edit", onSelect: () => {} },
        { label: "Delete", onSelect: () => {}, danger: true },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Actions for Acme Corp" }));
  const del = screen.getByRole("button", { name: "Delete" });
  expect(del).toHaveClass("zui-btn--danger");
  expect(del).not.toHaveClass("danger");
});
```

Both files already import `fireEvent`, `render` and `screen` from `@testing-library/react`; check and add what is missing.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run --no-file-parallelism --project components src/components/CardMenu.test.tsx src/components/RowMenu.test.tsx
```

Expected: FAIL — the element has `danger`, not `zui-btn--danger`.

- [ ] **Step 3: Swap the call sites**

`src/components/CardMenu.tsx:81` — replace the raw `<button className="danger" …>` with `<Button variant="danger" …>`, keeping every other prop and the children unchanged. Close with `</Button>`.

`src/components/RowMenu.tsx:54` — the className is `item.danger ? "danger" : undefined`. Replace with `variant={item.danger ? "danger" : "default"}` on a `<Button>`, and drop the className expression.

- [ ] **Step 4: Retarget the two selectors**

`src/components/CardMenu.css:29`:

```css
  .zui-cardmenu-pop > button.zui-btn--danger { color: var(--danger); }
```

`src/components/RowMenu.css:79` — change `.zui-rowmenu-pop > button.danger` to `.zui-rowmenu-pop > button.zui-btn--danger`, leaving the declaration body unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project components src/components/CardMenu.test.tsx src/components/RowMenu.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Verify zero diff and commit**

Run the diff command from Task 2 Step 5 — the board and detail captures exercise both menus. Expected: `0` everywhere.

```bash
git checkout -b fix/button-adoption
git add src/components/CardMenu.tsx src/components/CardMenu.css src/components/CardMenu.test.tsx \
        src/components/RowMenu.tsx src/components/RowMenu.css src/components/RowMenu.test.tsx
git commit -m "fix: retarget the popover danger overrides onto Button's class

Both menus scope the destructive colour with a selector on the literal class
danger. Button renders zui-btn--danger, so swapping the call sites without
moving the selector drops the colour with nothing failing — tsc, lint and the
unit tests are all blind to it. Tests now assert the rendered class."
```

## Task 5: Swap detail, timeline and the app shell

**Files:**
- Modify: `src/detail.tsx:405,487,542,571` (`btn-secondary` ×4), `src/timeline.tsx:148` (`tl-del danger`), `src/App.tsx:359` (`btn-secondary job-back`)

**Interfaces:**
- Consumes: `Button` from Task 4's precedent.

- [ ] **Step 1: Swap the four detail controls**

Each is `className="btn-secondary"` → `<Button variant="secondary">`. Keep `onClick`, `disabled`, `title`, `aria-*` and children exactly as they are.

- [ ] **Step 2: Swap timeline and App**

`src/timeline.tsx:148` — `className="tl-del danger"` becomes `<Button variant="danger" className="tl-del">`. `tl-del` carries icon sizing and position, not the button recipe, so it stays as a forwarded class.

`src/App.tsx:359` — `className="btn-secondary job-back"` becomes `<Button variant="secondary" className="job-back">`.

- [ ] **Step 3: Verify the build**

```bash
npx tsc -b && npm run lint
```

Expected: green. If `noUnusedLocals` reports an unused import, remove it.

- [ ] **Step 4: Verify zero diff**

Run the diff command. The `detail`, `detail-tab-track`, `detail-tab-tailor` and `board` captures cover these. Expected: `0`.

If `tl-del` shifts: `.tl-del` in App.css may set properties `Button.css` now also sets, and per-property layer priority means the component layer wins. Add the missing property to the forwarded class, do not accept the diff.

- [ ] **Step 5: Commit**

```bash
git add src/detail.tsx src/timeline.tsx src/App.tsx
git commit -m "fix: put the detail, timeline and shell controls behind Button"
```

## Task 6: Swap the settings surface

**Files:**
- Modify: `src/settings/account.tsx:33,179,226,289,364`, `src/settings/admin.tsx:113`, `src/settings/api.tsx:141`

**Interfaces:**
- Consumes: `Button`.

- [ ] **Step 1: Swap the five account controls**

Lines 33, 289 and 364 are `className="danger"` → `variant="danger"`. Line 179 is `className="btn-secondary"` → `variant="secondary"`. Line 226 is `className={enabled ? "danger" : ""}` → `variant={enabled ? "danger" : "default"}`.

- [ ] **Step 2: Swap admin and api**

Both are `className="danger"` → `<Button variant="danger">`.

- [ ] **Step 3: Verify the build**

```bash
npx tsc -b && npm run lint
```

- [ ] **Step 4: Verify zero diff**

Run the diff command. `settings`, `settings-data`, `settings-feed` and `admin` cover these. Expected: `0`.

Watch `.settings-content p.muted` (App.css:183) — it constrains prose to 62ch inside settings and is higher-specificity than `.muted`, so it is unaffected by this task. If a settings capture diffs, the cause is the button recipe, not the measure rule.

- [ ] **Step 5: Commit**

```bash
git add src/settings/account.tsx src/settings/admin.tsx src/settings/api.tsx
git commit -m "fix: put the settings and admin controls behind Button"
```

## Task 7: Swap the CV surface

**Files:**
- Modify: `src/cv/sections.tsx:384,565,643` (`btn-secondary`), `:611` (`danger`), `src/cv/versions.tsx:122` (`danger`)

- [ ] **Step 1: Swap all five**

- [ ] **Step 2: Verify the build**

```bash
npx tsc -b && npm run lint
```

- [ ] **Step 3: Verify zero diff**

The `cv` capture covers these. Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add src/cv/sections.tsx src/cv/versions.tsx
git commit -m "fix: put the CV controls behind Button"
```

## Task 8: Swap the feed, dashboard, insights and outreach surfaces

**Files:**
- Modify: `src/feed.tsx:217,333` (`danger`), `:574,703,832` (`btn-secondary`), `src/dashboard.tsx:426` (`btn-secondary`), `src/insights.tsx:181` (`btn-secondary dash-offers-pdf`), `:193,211` (`btn-secondary insights-toggle`), `src/outreach-composer.tsx:205` (`danger`)

- [ ] **Step 1: Swap them**

The three insights controls keep their layout class: `<Button variant="secondary" className="dash-offers-pdf">` and `<Button variant="secondary" className="insights-toggle">`.

- [ ] **Step 2: Verify the build**

```bash
npx tsc -b && npm run lint
```

Expected: green, and **no new exhaustive-deps warning** — `src/feed.tsx` has one known warning; the count must not rise.

- [ ] **Step 3: Verify zero diff**

`feed`, `feed-sort-match`, `overview`, `overview-nextup-upcoming` and `insights` cover these. Expected: `0`.

`insights-toggle` is the phone-only Insights calendar toggle from #487 — check the **mobile** captures specifically.

- [ ] **Step 4: Commit**

```bash
git add src/feed.tsx src/dashboard.tsx src/insights.tsx src/outreach-composer.tsx
git commit -m "fix: put the feed, dashboard, insights and outreach controls behind Button"
```

## Task 9: Swap the remaining in-component controls

**Files:**
- Modify: `src/components/CalendarMonth.tsx:102,109,116`, `src/components/Documents.tsx:111`, `src/components/InterviewPrepSection.tsx:137`, `src/components/MockInterview.tsx:130`, `src/components/NegotiationRoleplay.tsx:134`, `src/components/NotificationBell.tsx:94`

**Interfaces:**
- Produces: `Documents` and `NotificationBell` become self-contained as a side effect — Phase 3 relies on this.

- [ ] **Step 1: Swap them**

`CalendarMonth` lines 102 and 109 keep their layout class: `<Button variant="secondary" className="zui-cal-nav">`. Line 116 is a plain `variant="secondary"`.

`Documents:111` — `className="tl-del danger"` → `<Button variant="danger" className="tl-del">`.

`NotificationBell:94` — `className="btn-secondary"` → `variant="secondary"`.

- [ ] **Step 2: Delete CalendarMonth.css's duplicate**

`CalendarMonth.css` declares `.btn-secondary` to make the catalog render. With the call sites behind `Button`, that declaration is dead — delete it. Leave `.zui-cal-nav` alone.

- [ ] **Step 3: Rewrite NotificationBell.css's header comment**

Lines 1–6 currently argue the App.css dependency:

> *"The .settings-btn trigger and .btn-secondary 'mark all read' button stay in App.css — both are shared with other buttons elsewhere in the app."*

That reasoning is now resolved rather than accepted. Replace the final sentence with:

```css
   The "mark all read" button is <Button variant="secondary">, so the shared
   recipe lives in Button.css rather than being copied here or borrowed from
   App.css. The .settings-btn trigger keeps only what is specific to the bell.
```

- [ ] **Step 4: Verify in Storybook**

```bash
npm run storybook
```

Open `CalendarMonth`, `Documents`, `NotificationBell`, `CardMenu` and `RowMenu` in light and dark. Every button must render as a real button — the point of the phase is that the catalog now matches production. `MockInterview` and `NegotiationRoleplay` will still look wrong; Phase 3 fixes them.

- [ ] **Step 5: Verify zero diff**

Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "fix: put the in-component controls behind Button"
```

## Task 10: Retire the App.css recipes

**Files:**
- Modify: `src/App.css` (delete `.btn-secondary` and `.danger` rule blocks)

- [ ] **Step 1: Prove there are no call sites left**

```bash
grep -rn 'className="[^"]*\b\(btn-secondary\|danger\)\b' src --include="*.tsx" | grep -v '\.test\.' | grep -v '\.stories\.'
grep -rn "className={[^}]*\bdanger\b" src --include="*.tsx" | grep -v '\.test\.' | grep -v '\.stories\.'
```

Expected: no output from either. Any hit is a missed swap — go back and finish it.

- [ ] **Step 2: Delete the rules**

Delete the `.btn-secondary` and `.danger` blocks from App.css, including any `:hover`, `:disabled` or media-query variants of them. Do **not** delete `--danger` / `--danger-text` from `index.css` — they are tokens, still consumed by `Button.css`, `CardMenu.css` and `RowMenu.css`.

- [ ] **Step 3: Verify**

```bash
npx tsc -b && npm run build && npm run lint && npx vitest run --no-file-parallelism && npx storybook build
```

Then the diff command. Expected: `0`.

- [ ] **Step 4: Commit and open the PR**

```bash
git add src/App.css
git commit -m "fix: retire the App.css secondary and danger recipes

Their last call site is gone; Button.css is now the only definition."
gh pr create --fill
gh pr checks --watch
```

---

# Phase 3 — PR 3: make every owned component describe itself

Branch: `fix/component-self-containment`.

## Task 11: Amend the rule — extract the shared text primitives

Nine owned components use `muted`, `small` or `sr-only` from App.css while only `LoadFailed.css` and `MomentumBand.css` restate them, so the codebase answers "may a component use a global utility?" both ways. Restating `muted` nine times would recreate exactly the duplication Phase 2 destroyed.

The amended rule: **a component's stylesheet must fully describe everything specific to that component, and may use shared primitives only from a stylesheet Storybook also loads.**

**Files:**
- Create: `src/utilities.css`
- Modify: `src/App.css` (delete `.muted` at 1656, `.small` at 1660, `.sr-only` at 1109), `src/app-styles.css`, `.storybook/preview-styles.css`, `CLAUDE.md`

**Interfaces:**
- Produces: `src/utilities.css`, loaded into the `app` layer by both the app and Storybook. Components may reference `.muted`, `.small`, `.sr-only` and nothing else global.

- [ ] **Step 1: Create the file**

Move the three rule bodies **verbatim** from App.css into `src/utilities.css`. Do not retype them — copy them, so no value drifts.

```css
/* The three text primitives shared across components, extracted from App.css
   so Storybook loads them too. A component that used .muted from App.css
   rendered untinted in the catalog, which is the exact failure
   self-containment exists to prevent — but restating .muted in each of the
   nine components that use it would recreate the duplication Wave 2 removed.
   These three are the whole exception: anything component-specific still
   belongs in that component's own stylesheet.

   Deliberately NOT layered here. app-styles.css and preview-styles.css each
   import it into layer(app), so it stays where App.css put it in the cascade
   and does not outrank component CSS. */
.sr-only { /* copied verbatim from App.css:1109 */ }
.muted { /* copied verbatim from App.css:1656 */ }
.small { /* copied verbatim from App.css:1660 */ }
```

Keep the `.sr-only` explanatory comment that sits above it in App.css.

- [ ] **Step 2: Wire it into the app**

`src/app-styles.css` — add **before** the App.css import:

```css
@import "./utilities.css" layer(app);
@import "./App.css" layer(app);
```

- [ ] **Step 3: Wire it into Storybook**

`.storybook/preview-styles.css` — add after the `index.css` import:

```css
@import "../src/utilities.css" layer(app);
```

This is the first thing the `app` layer holds in Storybook. Update the header comment, which currently states App.css is deliberately absent and there is no `app` layer content — that is now half true and the next reader needs to know which half.

- [ ] **Step 4: Delete the three rules from App.css**

- [ ] **Step 5: Verify zero diff — this is the risky step**

Within a layer, source order decides only between selectors of **equal** specificity. Moving these to the top of the `app` layer changes an outcome only where an equal-specificity rule earlier in App.css sets the same property on the same element. The known scoped overrides (`.settings-content p.muted`, App.css:183) are higher specificity and are unaffected.

Run the diff command. Expected: `0`.

**If the diff is non-zero: abandon the extraction.** Revert this task, restate the three utilities inside each of the nine components that use them, and record in the spec that the shared-primitive route was tried and failed. Do **not** fix it by reordering App.css — that trades a measured risk for an unmeasured one.

- [ ] **Step 6: Document the rule**

Add to `CLAUDE.md`, in the owned-components paragraph, after the sentence about a component's CSS fully describing it:

```markdown
The one exception is `src/utilities.css` — `.muted`, `.small`, `.sr-only` —
which both the app and Storybook load, so a component may use those three and
nothing else global.
```

- [ ] **Step 7: Commit**

```bash
git checkout -b fix/component-self-containment
git add src/utilities.css src/app-styles.css src/App.css .storybook/preview-styles.css CLAUDE.md
git commit -m "fix: give the shared text primitives a home Storybook also loads

Self-containment as written had no answer for a recipe shared across
components, so nine of them quietly used .muted from App.css and rendered
untinted in the catalog. Restating it nine times would recreate the duplication
Wave 2 just removed. .muted, .small and .sr-only move to src/utilities.css,
imported into layer(app) by both the app and Storybook — the whole exception,
written down in CLAUDE.md so the next component does not have to guess."
```

## Task 12: Give the two AI transcripts a stylesheet, a story and a test

`MockInterview` and `NegotiationRoleplay` have no CSS, no story and no test, and they render the **same shell** — both use `.mock-interview`, `.mock-start`, `.mock-transcript`, `.mock-msg`, `.mock-answer`, `.mock-answer-actions`. One shared stylesheet, imported by both, satisfies the amended rule without duplication: Storybook loads it because the components import it.

**Files:**
- Create: `src/components/AiTranscript.css`, `src/components/MockInterview.stories.tsx`, `src/components/MockInterview.test.tsx`, `src/components/NegotiationRoleplay.stories.tsx`, `src/components/NegotiationRoleplay.test.tsx`
- Modify: `src/components/MockInterview.tsx`, `src/components/NegotiationRoleplay.tsx`, `src/App.css` (delete the moved recipe)

**Interfaces:**
- Produces: `zui-transcript*` class names, replacing `mock-*` in both components.

- [ ] **Step 1: Create the shared stylesheet**

Copy App.css's `.mock-interview` (2848), `.mock-start` (2884), `.mock-start:disabled` (2895), `.mock-transcript` (2900), `.mock-msg` (2909), `.mock-assistant` (2918), `.mock-user` (2925), `.mock-answer` (2931), `.mock-answer textarea` (2937), `.mock-answer-actions` (2949), `.mock-answer-actions button:first-child` (2954) and `:disabled` (2964) into `src/components/AiTranscript.css`, **verbatim bodies**, renamed:

| App.css | AiTranscript.css |
| --- | --- |
| `.mock-interview` | `.zui-transcript` |
| `.mock-start` | `.zui-transcript-start` |
| `.mock-transcript` | `.zui-transcript-log` |
| `.mock-msg` | `.zui-transcript-msg` |
| `.mock-assistant` | `.zui-transcript-msg--assistant` |
| `.mock-user` | `.zui-transcript-msg--user` |
| `.mock-answer` | `.zui-transcript-answer` |
| `.mock-answer-actions` | `.zui-transcript-actions` |

Wrap the whole file in `@layer components { … }` and head it with a comment naming the two components that share it and why it is not a component.

`.mock-answer-actions button:first-child` targets a raw button; Task 9 left that one raw (it is the primary submit, not a secondary). Keep the selector shape.

- [ ] **Step 2: Rename in both components**

`MockInterview.tsx` lines 79, 94, 96, 102, 107, 113, 126 and `NegotiationRoleplay.tsx` lines 83, 98, 100, 106, 111, 117, 130 — apply the mapping. The template literal `` `mock-msg mock-${m.role}` `` becomes `` `zui-transcript-msg zui-transcript-msg--${m.role}` ``. Add `import "./AiTranscript.css";` to both.

`className="muted small"` stays — those are the shared primitives from Task 11.

- [ ] **Step 3: Delete the moved rules from App.css**

Verify nothing else uses them first:

```bash
grep -rn "mock-" src worker --include="*.tsx" --include="*.ts" | grep -v components/
```

Expected: no output.

- [ ] **Step 4: Write the tests**

`src/components/MockInterview.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MockInterview } from "./MockInterview";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const props = {
  title: "Staff Engineer",
  company: "Acme Corp",
  jobDescription: null,
  onError: () => {},
};

describe("MockInterview", () => {
  // Self-contained: only zui- and shared-primitive classes, so the catalog
  // matches production without App.css (which Storybook never loads).
  test("emits zui-transcript, never the legacy mock- names", () => {
    const { container } = render(<MockInterview {...props} />);
    expect(container.innerHTML).toContain("zui-transcript");
    expect(container.innerHTML).not.toMatch(/class="[^"]*\bmock-/);
  });

  // Before any exchange exists the component is just the prompt and its
  // start control; the transcript log only appears once a turn has run.
  test("offers a way to start before any exchange exists", () => {
    render(<MockInterview {...props} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
```

`MockInterviewProps` is `{ title: string; company: string | null; jobDescription: string | null; onError: (message: string | null) => void }` (`MockInterview.tsx:13-18`). Write the same pair for `NegotiationRoleplay` against its own props signature — read it rather than assuming it matches.

- [ ] **Step 5: Run the tests**

```bash
npx vitest run --no-file-parallelism --project components src/components/MockInterview.test.tsx src/components/NegotiationRoleplay.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Write the stories**

Model them on `src/components/LoadFailed.stories.tsx` — `Meta`/`StoryObj` from `@storybook/react-vite`, `title: "AI/MockInterview"`, `tags: ["autodocs"]`, `import "../i18n"`. Give each two stories: the pre-start prompt and a transcript with a couple of exchanges.

- [ ] **Step 7: Verify in Storybook**

```bash
npm run storybook
```

Both must now render fully styled in light and dark — they rendered unstyled before this task.

- [ ] **Step 8: Verify zero diff and commit**

```bash
git add src/components/ src/App.css
git commit -m "fix: give the two AI transcripts a stylesheet of their own

MockInterview and NegotiationRoleplay had no CSS, no story and no test, and
rendered unstyled in the catalog. They share one shell, so they share one
stylesheet — AiTranscript.css, imported by both, which is how Storybook gets
it. The mock- recipe leaves App.css."
```

## Task 13: Finish AiKeyGate and QuickAddDialog

**Files:**
- Create: `src/components/AiKeyGate.css`, `src/components/AiKeyGate.stories.tsx`, `src/components/QuickAddDialog.css`
- Modify: `src/components/AiKeyGate.tsx`, `src/components/QuickAddDialog.tsx`, `src/App.css`

- [ ] **Step 1: AiKeyGate**

Its only App.css rule is `.ai-key-gate a { color: var(--accent-ink) }` (App.css:2856). Create `AiKeyGate.css` with that rule under `@layer components`, renamed `.zui-ai-key-gate a`; rename the class in the component; add the import; delete the App.css rule. `muted small` stays.

- [ ] **Step 2: AiKeyGate story**

Model on `LoadFailed.stories.tsx`. `title: "AI/AiKeyGate"`. One story is enough — the component has one state.

- [ ] **Step 3: QuickAddDialog**

It uses `quickadd-hint` (App.css:3602), `quickadd-import-row` and `quickadd-import-row input` (3594). Move all three into `QuickAddDialog.css` as `.zui-quickadd-hint`, `.zui-quickadd-import-row`; rename in the component; delete from App.css.

`settings-field` is a **form-layout recipe, not a shared primitive** — it does not join `utilities.css`. Copy what the dialog needs from App.css:171 into `QuickAddDialog.css` as `.zui-quickadd-field` and rename the usage. Check App.css:207 (`.settings-field select, .settings-field input`) and 4760 for descendant rules that also apply and must come along.

- [ ] **Step 4: Verify in Storybook**

`QuickAddDialog` already has a story. Open it plus the new `AiKeyGate` story in light and dark.

- [ ] **Step 5: Verify zero diff and commit**

```bash
git add src/components/ src/App.css
git commit -m "fix: give AiKeyGate and QuickAddDialog their own stylesheets"
```

## Task 14: Enforce self-containment with a test

Six violations and a documented argument for keeping one of them prove a convention does not hold on its own. The existing `test-node/no-claude-imports.spec.ts` is the precedent.

**Files:**
- Create: `test-node/component-self-containment.spec.ts`

**Interfaces:**
- Consumes: `src/utilities.css` from Task 11.
- Produces: a test that fails when a component's markup references a class defined neither in its own stylesheet, nor in a stylesheet it imports, nor in `src/utilities.css`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

// A component that borrows a class from App.css renders differently in
// Storybook (which loads no App.css) than in the app — the catalog then
// misrepresents what ships, which is the whole reason the components are
// self-contained. Six components did exactly that before Wave 2, one of them
// with a comment arguing for it, so this is a test rather than a convention.
//
// Static className strings only. Template segments like
// `zui-transcript-msg--${role}` cannot be resolved without running the
// component, so the interpolated part is skipped — the same limitation the
// dead-CSS sweep has, and the reason neither is the only check.
const DIR = "src/components";

const UTILITIES = new Set(["muted", "small", "sr-only"]);

function classesIn(css: string): Set<string> {
  return new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
}

function definedFor(tsxPath: string): Set<string> {
  const src = readFileSync(tsxPath, "utf8");
  const defined = new Set(UTILITIES);
  // Every stylesheet the component imports, not just its own — a shared
  // sheet like AiTranscript.css counts because Storybook loads it via
  // the same import.
  for (const m of src.matchAll(/import\s+["'](\.\/[^"']+\.css)["']/g)) {
    const cssPath = path.join(path.dirname(tsxPath), m[1]);
    for (const c of classesIn(readFileSync(cssPath, "utf8"))) defined.add(c);
  }
  return defined;
}

function usedIn(src: string): string[] {
  const used: string[] = [];
  // className="a b" and className={`a b ${x}`} — the ${…} parts are dropped.
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const literal = (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, " ");
    used.push(...literal.split(/\s+/).filter(Boolean));
  }
  return used;
}

const components = readdirSync(DIR).filter(
  (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx") && !f.endsWith(".stories.tsx"),
);

describe("owned components are self-contained", () => {
  test.each(components)("%s uses no class it does not define", (file) => {
    const full = path.join(DIR, file);
    const defined = definedFor(full);
    const orphans = [...new Set(usedIn(readFileSync(full, "utf8")))].filter(
      (c) => !defined.has(c),
    );
    expect(orphans).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it pass**

```bash
npx vitest run --no-file-parallelism --project node test-node/component-self-containment.spec.ts
```

Expected: PASS for every component — Tasks 9, 12 and 13 removed the violations. **If any component fails, that is a real violation this plan missed** — fix the component, not the test.

- [ ] **Step 3: Prove the test can fail**

Temporarily add `className="btn-secondary"` to any element in `src/components/Badge.tsx`, re-run, and confirm `Badge.tsx` fails with `["btn-secondary"]`. Revert the edit. A guard test that cannot fail is worse than none.

- [ ] **Step 4: Commit and open the PR**

```bash
git add test-node/component-self-containment.spec.ts
git commit -m "fix: fail the build when a component borrows a class it does not define

Six components borrowed from App.css and rendered wrong in the catalog; one
carried a comment arguing the borrow was correct. A convention did not hold, so
this is a test. Static className strings only — template segments are skipped,
which is a known hole, not an oversight."
gh pr create --fill
gh pr checks --watch
```

---

# Phase 4 — PR 4: own the three selection controls

Branch: `feat/selection-controls`.

## Task 15: Give SegmentedControl an item

`SegmentedControl` is adopted at five groups but only as a container. `SegmentedControl.tsx:4-13` documents the decision: *"does not own selection state or a11y grouping."* Every call site hand-writes the item, and they have already diverged — contacts, companies and feed set `aria-pressed`; `dashboard.tsx`'s NextUp buttons set nothing.

**Files:**
- Modify: `src/components/SegmentedControl.tsx`, `.css`, `.stories.tsx`, `.test.tsx`, `src/contacts.tsx:94,101`, `src/companies.tsx:92,99`, `src/feed.tsx:592,599,613`, `src/dashboard.tsx:378,384`

**Interfaces:**
- Produces: `SegmentedControl.Item`, props `{ active: boolean } & ButtonHTMLAttributes<HTMLButtonElement>`. Renders `<button type="button" className="active"?  aria-pressed={active}>`. The container keeps `.zui-segmented button` as its selector, so the item needs no new class and the recipe does not move.

- [ ] **Step 1: Write the failing test**

Add to `src/components/SegmentedControl.test.tsx`:

```tsx
describe("SegmentedControl.Item", () => {
  // The whole reason the item exists: aria-pressed was set at three of the
  // five call sites and forgotten at the fourth.
  test("marks the active item with aria-pressed", () => {
    render(
      <SegmentedControl>
        <SegmentedControl.Item active>List</SegmentedControl.Item>
        <SegmentedControl.Item active={false}>Grid</SegmentedControl.Item>
      </SegmentedControl>,
    );
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "false");
  });

  test("carries the active class the container styles", () => {
    render(
      <SegmentedControl>
        <SegmentedControl.Item active>List</SegmentedControl.Item>
      </SegmentedControl>,
    );
    expect(screen.getByRole("button", { name: "List" })).toHaveClass("active");
  });

  // Inside a <form> a bare <button> is an implicit submit; a view toggle
  // never is.
  test("is type=button", () => {
    render(
      <SegmentedControl>
        <SegmentedControl.Item active={false}>Grid</SegmentedControl.Item>
      </SegmentedControl>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project components src/components/SegmentedControl.test.tsx
```

Expected: FAIL — `SegmentedControl.Item` is not a function.

- [ ] **Step 3: Implement it**

In `src/components/SegmentedControl.tsx`:

```tsx
export interface SegmentedItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected state — drives both the styling hook and aria-pressed. */
  active: boolean;
}

function Item({ active, className, type = "button", ...rest }: SegmentedItemProps) {
  const classes = [active ? "active" : null, className].filter(Boolean).join(" ");
  return <button type={type} className={classes || undefined} aria-pressed={active} {...rest} />;
}

SegmentedControl.Item = Item;
```

Add `ButtonHTMLAttributes` to the type import on line 1.

Rewrite the header comment: the container no longer merely receives raw children, and the next reader needs the reason the documented decision changed. State that `aria-pressed` was set at three of five call sites and missing at a fourth, and that owning the item makes that unforgettable rather than remembered.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project components src/components/SegmentedControl.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Adopt at all five groups**

- `src/contacts.tsx:94,101` and `src/companies.tsx:92,99` — `<SegmentedControl.Item active={view === "list"} onClick={() => setViewAndPersist("list")}>`, dropping the hand-written `className` and `aria-pressed`.
- `src/feed.tsx:592,599` (sort) and `:613` (the `[0,1,2,3]` fit map) — same shape, `active={sortBy === "newest"}` / `active={minFit === n}`.
- `src/dashboard.tsx:378,384` — same shape. **This is the one that gains `aria-pressed`**; it had none.

- [ ] **Step 6: Add a story for the item**

Add a story to `SegmentedControl.stories.tsx` showing a two-item and a four-item group with a live selection, so the catalog shows the API callers now use.

- [ ] **Step 7: Verify zero diff**

`aria-pressed` is invisible to a pixel diff, so the bar still applies in full. `companies-grid`, `people-grid`, `feed-sort-match` and `overview-nextup-upcoming` exercise the non-default states.

Expected: `0`.

- [ ] **Step 8: Commit**

```bash
git checkout -b feat/selection-controls
git add src/components/SegmentedControl.tsx src/components/SegmentedControl.test.tsx \
        src/components/SegmentedControl.stories.tsx src/contacts.tsx src/companies.tsx \
        src/feed.tsx src/dashboard.tsx
git commit -m "feat: give SegmentedControl an item that owns its own state

The container-only design meant five call sites hand-wrote the item, and they
had already diverged: three set aria-pressed, the Next Up group set nothing.
The item now owns the active class and aria-pressed, so the dashboard's missing
attribute is fixed by construction rather than by remembering."
```

## Task 16: Build TabBar and adopt it in detail

**Files:**
- Create: `src/components/TabBar.tsx`, `.css`, `.stories.tsx`, `.test.tsx`
- Modify: `src/detail.tsx:672-712`, `src/App.css` (delete `.detail-tabs` 4512-4542), `src/components/index.ts`

**Interfaces:**
- Produces: `TabBar` with props `{ tabs: Array<{ key: string; label: string }>; active: string; onSelect: (key: string) => void; idPrefix: string; "aria-label": string }`. Renders a `role="tablist"` container of `role="tab"` buttons, each with `id={`${idPrefix}-tab-${key}`}`, `aria-selected`, and `aria-controls={`${idPrefix}-panel-${key}`}`. The panel stays with the caller.

- [ ] **Step 1: Write the failing test**

`src/components/TabBar.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TabBar } from "./TabBar";

const TABS = [
  { key: "track", label: "Track" },
  { key: "prep", label: "Prep" },
];

describe("TabBar", () => {
  test("exposes a tablist of tabs with the active one selected", () => {
    render(<TabBar tabs={TABS} active="prep" onSelect={() => {}} idPrefix="detail" aria-label="Sections" />);
    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Prep" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Track" })).toHaveAttribute("aria-selected", "false");
  });

  // The panel lives with the caller, so the wiring between tab and panel is
  // the component's contract — a wrong id silently unlabels the panel.
  test("wires each tab to its panel by id", () => {
    render(<TabBar tabs={TABS} active="prep" onSelect={() => {}} idPrefix="detail" aria-label="Sections" />);
    const tab = screen.getByRole("tab", { name: "Track" });
    expect(tab).toHaveAttribute("id", "detail-tab-track");
    expect(tab).toHaveAttribute("aria-controls", "detail-panel-track");
  });

  test("reports the selected key", () => {
    const onSelect = vi.fn();
    render(<TabBar tabs={TABS} active="prep" onSelect={onSelect} idPrefix="detail" aria-label="Sections" />);
    fireEvent.click(screen.getByRole("tab", { name: "Track" }));
    expect(onSelect).toHaveBeenCalledWith("track");
  });

  test("emits zui- classes only", () => {
    const { container } = render(<TabBar tabs={TABS} active="prep" onSelect={() => {}} idPrefix="detail" aria-label="Sections" />);
    expect(container.innerHTML).not.toMatch(/class="[^"]*\bdetail-tabs/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project components src/components/TabBar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```tsx
import "./TabBar.css";

// The underline tab bar from the application detail view (App.css:4512):
// a hairline-bottomed row whose active tab is marked by a 2px accent
// underline, not a fill. Distinct from SegmentedControl, which is the pill
// capsule — same job, different shape, and the two are not interchangeable.
//
// TabBar.css fully describes it rather than depending on App.css, which
// Storybook never loads. The panel stays with the caller; this owns only the
// tablist and the id wiring between the two.
export interface TabBarTab {
  key: string;
  label: string;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  active: string;
  onSelect: (key: string) => void;
  /** Namespaces the tab/panel ids: `${idPrefix}-tab-${key}` / `-panel-`. */
  idPrefix: string;
  "aria-label": string;
}

export function TabBar({ tabs, active, onSelect, idPrefix, ...rest }: TabBarProps) {
  return (
    <div className="zui-tabbar" role="tablist" aria-label={rest["aria-label"]}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${key}`}
          aria-selected={active === key}
          aria-controls={`${idPrefix}-panel-${key}`}
          className={active === key ? "active" : undefined}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write TabBar.css**

Copy App.css:4512-4542 verbatim, renaming `.detail-tabs` → `.zui-tabbar`, wrapped in `@layer components`. All five rules come across: the container, `button`, `button:hover`, `button.active`, `button:focus-visible`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project components src/components/TabBar.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Adopt in detail.tsx**

Replace the hand-written tablist at `src/detail.tsx:672-703` with:

```tsx
<TabBar
  tabs={[
    { key: "track", label: t("detail.tabTrack") },
    { key: "prep", label: t("detail.tabPrep") },
    { key: "tailor", label: t("detail.tabTailor") },
  ]}
  active={secTab}
  onSelect={(k) => setSecTab(k as "track" | "prep" | "tailor")}
  idPrefix="detail"
  aria-label={t("detail.sections")}
/>
```

Leave the `<div className="detail-panel" role="tabpanel" id={…} aria-labelledby={…}>` exactly as it is — the ids `TabBar` generates match what it already expects.

- [ ] **Step 7: Delete `.detail-tabs` from App.css, export from the barrel, verify zero diff**

Add `TabBar` to `src/components/index.ts`. The `detail`, `detail-tab-track` and `detail-tab-tailor` captures cover all three states. Expected: `0`.

- [ ] **Step 8: Write the story and commit**

Model on `LoadFailed.stories.tsx`; `title: "Navigation/TabBar"`; two stories — three tabs with the first active, and with a middle one active.

```bash
git add src/components/TabBar.tsx src/components/TabBar.css src/components/TabBar.test.tsx \
        src/components/TabBar.stories.tsx src/components/index.ts src/detail.tsx src/App.css
git commit -m "feat: own the underline tab bar"
```

## Task 17: Build SettingsNav and adopt it in settings and admin

**Files:**
- Create: `src/components/SettingsNav.tsx`, `.css`, `.stories.tsx`, `.test.tsx`
- Modify: `src/settings/index.tsx:207-220`, `src/admin.tsx:44-57`, `src/App.css` (delete `.settings-nav` 3999-4030 and its `@media` variant at 4053), `src/components/index.ts`

**Interfaces:**
- Produces: `SettingsNav` with props `{ sections: Array<{ key: string; label: string }>; active: string; onSelect: (key: string) => void; "aria-label": string }`. Renders `<nav>` of buttons carrying `aria-current="true"` on the active one — matching the existing markup, which uses `aria-current`, not `aria-selected`.

- [ ] **Step 1: Write the failing test**

`src/components/SettingsNav.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { SettingsNav } from "./SettingsNav";

const SECTIONS = [
  { key: "account", label: "Account" },
  { key: "data", label: "Data" },
];

describe("SettingsNav", () => {
  // aria-current, not aria-selected: this is a nav, not a tablist, and the
  // markup it replaces used aria-current.
  test("marks the active section with aria-current", () => {
    render(<SettingsNav sections={SECTIONS} active="data" onSelect={() => {}} aria-label="Settings" />);
    expect(screen.getByRole("button", { name: "Data" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Account" })).not.toHaveAttribute("aria-current");
  });

  test("names the nav for assistive tech", () => {
    render(<SettingsNav sections={SECTIONS} active="data" onSelect={() => {}} aria-label="Settings" />);
    expect(screen.getByRole("navigation", { name: "Settings" })).toBeInTheDocument();
  });

  test("reports the selected key", () => {
    const onSelect = vi.fn();
    render(<SettingsNav sections={SECTIONS} active="data" onSelect={onSelect} aria-label="Settings" />);
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(onSelect).toHaveBeenCalledWith("account");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project components src/components/SettingsNav.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```tsx
import "./SettingsNav.css";

// The section rail of the Settings/Admin two-pane layout (App.css:3999).
// Admin reuses the same shell — App.css:3361 records that — so the two call
// sites were identical hand-written markup.
//
// A nav, not a tablist: the sections are page-level destinations (Settings
// deep-links them via /settings?s=…), so the active one is marked with
// aria-current, matching the markup this replaces. Do not "upgrade" it to
// role="tab" — that would promise arrow-key roving this does not implement.
//
// SettingsNav.css fully describes it rather than depending on App.css, which
// Storybook never loads — including the mobile block, which is the layout on
// a phone and not an optional extra.
export interface SettingsNavSection {
  key: string;
  label: string;
}

export interface SettingsNavProps {
  sections: SettingsNavSection[];
  active: string;
  onSelect: (key: string) => void;
  "aria-label": string;
}

export function SettingsNav({ sections, active, onSelect, ...rest }: SettingsNavProps) {
  return (
    <nav className="zui-settingsnav" aria-label={rest["aria-label"]}>
      {sections.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={active === key ? "active" : undefined}
          aria-current={active === key ? "true" : undefined}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: Write SettingsNav.css**

Copy App.css:3999-4030 (`.settings-nav`, `.settings-nav button`, `:hover`, `.active`) and the `@media` block at 4053 verbatim, renaming to `.zui-settingsnav`, wrapped in `@layer components`. The media block is the mobile layout — the responsive-parity constraint makes it mandatory, not optional.

- [ ] **Step 5: Run the tests to verify they pass**

Expected: PASS.

- [ ] **Step 6: Adopt at both call sites**

`src/settings/index.tsx:207-220` and `src/admin.tsx:44-57`. Both map over a sections array and translate with `t(\`settings.section.${s}\`)` / `t(\`admin.section.${s}\`)`; build the `{ key, label }` array from that. Keep the surrounding `.settings-page` wrapper — it is the two-pane grid and is not part of this component.

- [ ] **Step 7: Delete `.settings-nav` from App.css, export from the barrel, verify zero diff**

`settings`, `settings-data`, `settings-feed` and `admin` cover this, at both viewports. Expected: `0`.

- [ ] **Step 8: Write the story and commit**

```bash
git add src/components/SettingsNav.tsx src/components/SettingsNav.css src/components/SettingsNav.test.tsx \
        src/components/SettingsNav.stories.tsx src/components/index.ts src/settings/index.tsx src/admin.tsx src/App.css
git commit -m "feat: own the settings and admin section nav"
```

## Task 18: Build PillTabs and adopt it in the network subnav

**Files:**
- Create: `src/components/PillTabs.tsx`, `.css`, `.stories.tsx`, `.test.tsx`
- Modify: `src/App.tsx:421-444`, `src/App.css` (delete `.subnav` 1083-1106; **retarget**, do not delete, the touch-target rules at 4862 and 4877), `src/components/index.ts`

**Interfaces:**
- Produces: `PillTabs` with props `{ tabs: Array<{ key: string; label: string }>; active: string; onSelect: (key: string) => void; idPrefix?: string; "aria-label": string }`. Same shape as `TabBar` except `idPrefix` is optional, because the network view renders no tabpanel. Renders a pill-capsule `role="tablist"`.

- [ ] **Step 1: Write the failing test**

`src/components/PillTabs.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PillTabs } from "./PillTabs";

const TABS = [
  { key: "companies", label: "Companies" },
  { key: "contacts", label: "People" },
];

describe("PillTabs", () => {
  test("exposes a tablist of tabs with the active one selected", () => {
    render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} idPrefix="network" aria-label="Network" />);
    expect(screen.getByRole("tablist", { name: "Network" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Companies" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "People" })).toHaveAttribute("aria-selected", "false");
  });

  test("wires each tab to its panel when panel ids exist", () => {
    render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} idPrefix="network" aria-label="Network" />);
    const tab = screen.getByRole("tab", { name: "People" });
    expect(tab).toHaveAttribute("id", "network-tab-contacts");
    expect(tab).toHaveAttribute("aria-controls", "network-panel-contacts");
  });

  // The network view renders no tabpanel, so without idPrefix the component
  // must emit no aria-controls at all — an aria-controls pointing at an id
  // that does not exist is a worse defect than the missing association.
  test("omits aria-controls when no idPrefix is given", () => {
    render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} aria-label="Network" />);
    const tab = screen.getByRole("tab", { name: "People" });
    expect(tab).not.toHaveAttribute("aria-controls");
    expect(tab).not.toHaveAttribute("id");
  });

  test("reports the selected key", () => {
    const onSelect = vi.fn();
    render(<PillTabs tabs={TABS} active="companies" onSelect={onSelect} aria-label="Network" />);
    fireEvent.click(screen.getByRole("tab", { name: "People" }));
    expect(onSelect).toHaveBeenCalledWith("contacts");
  });

  test("emits zui- classes only", () => {
    const { container } = render(<PillTabs tabs={TABS} active="companies" onSelect={() => {}} aria-label="Network" />);
    expect(container.innerHTML).not.toMatch(/class="[^"]*\bsubnav/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project components src/components/PillTabs.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```tsx
import "./PillTabs.css";

// The network subnav's pill tablist (App.css:1083): a bordered capsule whose
// active tab is a filled accent pill, as against TabBar's underline.
//
// This is the same SHAPE as SegmentedControl — same border, same radius-full,
// same filled-accent active state — and differs only in voice: body text here,
// mono uppercase there. That difference is type-ramp drift, not a decision, and
// PR 5 of the Wave 2 plan resolves whether these two components merge. Kept
// separate here so the structural change and the visual one stay reviewable
// apart.
//
// PillTabs.css fully describes it rather than depending on App.css, which
// Storybook never loads — including the band-5 touch-target minimum, which the
// raw markup inherited from a grouped selector.
export interface PillTabsTab {
  key: string;
  label: string;
}

export interface PillTabsProps {
  tabs: PillTabsTab[];
  active: string;
  onSelect: (key: string) => void;
  /**
   * Namespaces the tab/panel ids: `${idPrefix}-tab-${key}` / `-panel-`.
   * Omit where the caller renders no tabpanel — the network view does not,
   * and an aria-controls pointing at an id that does not exist is worse than
   * no association at all.
   */
  idPrefix?: string;
  "aria-label": string;
}

export function PillTabs({ tabs, active, onSelect, idPrefix, ...rest }: PillTabsProps) {
  return (
    <div className="zui-pilltabs" role="tablist" aria-label={rest["aria-label"]}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          id={idPrefix ? `${idPrefix}-tab-${key}` : undefined}
          aria-selected={active === key}
          aria-controls={idPrefix ? `${idPrefix}-panel-${key}` : undefined}
          className={active === key ? "active" : undefined}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

**Follow-up worth filing, not doing here:** the network view's `CompaniesTab` / `ContactsTab` render no `role="tabpanel"`, so the tablist has no panel to associate with. Wrapping them would change the DOM under a layout parent and break the zero-diff bar; giving them the role properly means threading props into both components. Out of scope for this PR.

- [ ] **Step 4: Write PillTabs.css — including the touch-target repair**

Copy App.css:1083-1106 verbatim, renaming `.subnav` → `.zui-pilltabs`.

Then add the band-5 repair the raw markup inherits today. `.subnav button` appears in two grouped selectors:

- App.css:4862 — `min-height: 34px`
- App.css:4877, inside `@media (max-width: 600px)` — `min-height: 40px`

Both must be reproduced in `PillTabs.css`:

```css
  /* The documented control height (#499); 40px on a phone. Inherited from
     App.css's band-5 group selector by the raw markup this replaces —
     dropping it would fail WCAG 2.5.8 on mobile, silently. */
  .zui-pilltabs button {
    min-height: 34px;
  }

  @media (max-width: 600px) {
    .zui-pilltabs button {
      min-height: 40px;
    }
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Expected: PASS.

- [ ] **Step 6: Adopt in App.tsx**

Replace `src/App.tsx:421-444` with:

```tsx
<PillTabs
  tabs={[
    { key: "companies", label: t("tabs.companies") },
    { key: "contacts", label: t("tabs.people") },
  ]}
  active={tab}
  onSelect={(k) => setTab(k as "companies" | "contacts")}
  aria-label={t("tabs.network")}
/>
```

**No `idPrefix`** — the current markup emits no `aria-controls` and there is no tabpanel to point at, so passing one would add a dangling reference the raw markup never had. Keep the `{(tab === "companies" || tab === "contacts") && …}` guard around it.

- [ ] **Step 7: Remove `.subnav` from App.css correctly**

Delete the `.subnav` block at 1083-1106. In the **grouped** selectors at 4862 and 4877, remove only the `.subnav button,` line — the other selectors in those groups (`.board-bar .search`, `.board-bar-btn`, `.board-bar select`, `.board-sort select`, `.keyword-chips input`, `.settings-list li > button`) are live and must keep their repair.

- [ ] **Step 8: Verify zero diff — check mobile especially**

`companies` and `people` at both viewports. A mobile-only diff means the 40px repair did not come across. Expected: `0`.

- [ ] **Step 9: Write the story, and open the PR**

```bash
git add src/components/PillTabs.tsx src/components/PillTabs.css src/components/PillTabs.test.tsx \
        src/components/PillTabs.stories.tsx src/components/index.ts src/App.tsx src/App.css
git commit -m "feat: own the network pill tablist

Same shape as SegmentedControl — border, radius-full, filled-accent active —
differing only in voice, which PR 5 resolves. Carries the band-5 touch-target
repair the raw markup inherited from a grouped selector; dropping it would have
failed WCAG 2.5.8 on phones with nothing to show for it."
gh pr create --fill
gh pr checks --watch
```

---

# Phase 5 — PR 5: the defects the audit surfaced

Branch: `fix/design-system-defects`. **The zero-diff bar does not apply here.** State the expected change in the PR body before showing the captures.

## Task 19: Put the pill tablist in the chrome voice

`.subnav` set its labels in body text while `.zui-segmented` sets the identical shape in mono/uppercase with `--track-eyebrow`. DESIGN.md's Mono-Is-Chrome Rule names "tab and stage labels" as exactly the mono case, so this is type-ramp drift #501 missed.

**Files:**
- Modify: `src/components/PillTabs.css`; possibly delete `src/components/PillTabs.*` entirely

**Interfaces:**
- Consumes: `PillTabs` from Task 18.
- Produces: either a `PillTabs` in the chrome voice, or nothing — if the two components converge, `PillTabs` is deleted and `App.tsx` uses `SegmentedControl`.

- [ ] **Step 1: Apply the chrome voice**

Add to `.zui-pilltabs button` in `PillTabs.css`, matching `SegmentedControl.css`:

```css
    font-family: var(--mono);
    text-transform: uppercase;
    letter-spacing: var(--track-eyebrow);
```

- [ ] **Step 2: Diff the two stylesheets**

```bash
diff <(grep -v '^\s*/\*\|^\s*\*' src/components/PillTabs.css) \
     <(grep -v '^\s*/\*\|^\s*\*' src/components/SegmentedControl.css | sed 's/zui-segmented/zui-pilltabs/g')
```

- [ ] **Step 3: Decide, on the evidence**

If the only remaining differences are the container's `gap` and `margin`, the two controls have converged. Then: delete `PillTabs.tsx/.css/.test.tsx/.stories.tsx`, change `App.tsx` to render `SegmentedControl` with `SegmentedControl.Item` children carrying `role="tab"` and `aria-selected`, and move the `gap`/`margin` onto the call site as a forwarded `className`. Remove `PillTabs` from `src/components/index.ts`.

If other properties differ, keep both components and record in `PillTabs.tsx`'s header comment exactly which properties keep them apart, so the next reader does not re-open the question.

- [ ] **Step 4: Capture and review the diff**

Run the capture. `companies` and `people` **will** differ — that is the deliverable. Confirm the change is the type voice and nothing else: no size, position or colour shift. Attach before/after to the PR.

- [ ] **Step 5: Commit**

```bash
git checkout -b fix/design-system-defects
git add src/components/ src/App.tsx
git commit -m "fix: put the network tablist in the chrome voice

The pill tablist set its labels in body text while the identical shape in
SegmentedControl sets them in mono uppercase. DESIGN.md's Mono-Is-Chrome Rule
names tab labels as exactly the mono case, so this was type-ramp drift #501
missed. Visual change, intended."
```

## Task 20: Put the last elevation shadow on a token

**Files:**
- Modify: `src/App.css:2998`

- [ ] **Step 1: Read the rule and its neighbours**

```bash
sed -n '2990,3005p' src/App.css
```

- [ ] **Step 2: Replace the hardcoded value**

`box-shadow: 0 1px 4px rgba(20, 23, 58, 0.12)` becomes `var(--shadow-1)` or `var(--shadow-2)` — pick by which tier the surface belongs to under DESIGN.md's One-Step Rule (flat → `--shadow-1`; `--shadow-1` → `--shadow-2` plus a 2px rise). Check the token values in `src/index.css` and choose the nearer one.

The other six non-token `box-shadow` values in App.css are focus rings (`0 0 0 1px`, `0 0 0 2px`), a 1px hairline overlay and an inset stage marker. They are not elevation and **stay**.

- [ ] **Step 3: Capture and review**

A small diff on the affected surface is expected if the token value differs from the hardcoded one. Confirm it is a shadow change and nothing else.

- [ ] **Step 4: Commit and open the PR**

```bash
git add src/App.css
git commit -m "fix: put the last elevation shadow on a token"
gh pr create --fill
gh pr checks --watch
```

---

## Done when

- `npx tsc -b`, `npm run build`, `npm run lint`, `npx vitest run --no-file-parallelism` and `npx storybook build` are green.
- `grep -rn 'className="[^"]*\b\(btn-secondary\|danger\)\b' src --include="*.tsx"` returns nothing outside tests and stories.
- `test-node/component-self-containment.spec.ts` passes for every component, and has been shown to fail when a violation is introduced.
- `node scripts/dead-css.mjs` reports substantially fewer candidate blocks than the 58 it started with.
- Every component in `src/components/` has a `.stories.tsx` and a `.test.tsx`.
- The five PRs are merged with `gh pr merge <n> --squash --delete-branch`.
