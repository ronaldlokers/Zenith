# Handoff — design-system adoption Wave 2

You are taking over a multi-PR refactor mid-flight. Read this before touching anything.

- **Spec:** `docs/superpowers/specs/2026-07-29-ds-adoption-wave2-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-29-ds-adoption-wave2.md` (20 tasks, 5 PRs)
- **Project rules:** `CLAUDE.md` — read it in full, it is binding

## Where things stand

| PR | Contents | State |
| --- | --- | --- |
| #504 | Verification rig: harness routes, `scripts/seed-demo.sql` | merged |
| #505 | PR 1 — deleted dead App.css (5175 → 4809) | merged |
| #506 | PR 2 — all 38 controls behind `Button`, App.css recipes retired (→ 4771) | merged |
| #507 | Seed coverage + `scripts/storybook-shots.mjs` + a shipped-regression fix | merged |
| #508 | PR 3 — Tasks 11–14, component self-containment | open, auto-merge on |

**Remaining: PR 4 (Tasks 15–18) and PR 5 (Tasks 19–20).** Both are fully specified in the plan. Start by reading the plan's Task 15 section.

One correction to carry: the plan says Task 15 revises `SegmentedControl`'s "container only" decision. That decision is documented in `SegmentedControl.tsx`'s header comment — rewrite the comment to say why it changed, don't silently contradict it.

## Set up the rig first — nothing verifies without it

The bar for PRs 4 and 5 is pixel-level, so the local rig has to exist and match.

```bash
# 1. tools (this devcontainer ships without them; pacman, not apt)
compare --version || sudo pacman -S imagemagick
ls ~/.cache/ms-playwright || npx playwright install chromium

# 2. database
npx wrangler d1 migrations apply zenith --local
npx wrangler d1 execute zenith --local --file scripts/seed-demo.sql

# 3. a login for the harness. scripts/seed-admin.mjs needs a TTY; if you
#    cannot get one, hash a password yourself with better-auth's own
#    hashPassword and UPDATE the `user` + `account` rows exactly as that
#    script does. Write the password to a scratch file, never the repo.

# 4. dev server, left running
npm run dev

# 5. a saved Playwright session
npx playwright open --save-storage=.auth.json http://localhost:5173
#    or drive the login form headlessly and call context.storageState()
```

`DETAIL_ID` must be a real application id. The seed starts them at **9001**.

## The two harnesses, and why there are two

**`scripts/screenshot-baseline.mjs`** — captures the running app. 52 captures (14 views × 2 viewports, plus interaction states).

```bash
DETAIL_ID=9001 OUT_DIR=baseline node scripts/screenshot-baseline.mjs   # before
# ... make the change ...
DETAIL_ID=9001 OUT_DIR=after node scripts/screenshot-baseline.mjs      # after
for f in baseline/*.png; do n=$(basename "$f");
  printf "%-46s %s\n" "$n" "$(compare -metric AE "$f" "after/$n" null: 2>&1 | head -1)"; done
```

**`scripts/storybook-shots.mjs`** — captures every Storybook story, both themes, 112 shots.

```bash
npx storybook build
OUT_DIR=sb-baseline node scripts/storybook-shots.mjs
```

**They check different things and neither substitutes for the other.** The app harness cannot see a self-containment break, because the app always loads `App.css`; that only shows in Storybook, which loads none. The Storybook harness cannot see an app-layout regression, because stories render in isolation.

**Capture the baseline from the pre-change tree**, not from your own branch:

```bash
git checkout <parent-commit> -- src/      # NOT `git stash` — that stashes your harness edits too
DETAIL_ID=9001 OUT_DIR=baseline node scripts/screenshot-baseline.mjs
git checkout HEAD -- src/
```

## Architectural rules — each of these cost a review cycle to learn

1. **An `@layer app` rule can never reclaim a property from `@layer components`**, whatever its specificity. `src/app-styles.css` orders `reset, app, components`, and layer order beats specificity per-property. So a leak from `Button.css` **cannot** be fixed by editing `App.css`. Use either a named reusable `Button` variant (`close` is the precedent) or a feature-owned stylesheet in `@layer components` — see `src/timeline.css`, `src/settings/settings.css`, `src/cv/cv.css`, `src/feed.css`, `src/dashboard.css`, `src/outreach-composer.css`.
2. **Never put a selector naming a call-site class inside `Button.css`.** Tried, rejected on review: it turns the shared library into a directory of one-off consumers.
3. **An override must win on its own specificity, never on the order Vite emits chunks.** `:hover`, `:not(:disabled)`, `:focus-visible` and `:disabled` each count as one class-equivalent, so `.zui-btn--danger:hover:not(:disabled)` is (0,3,0). Four settings overrides once *tied* it and worked only by chunk-order accident. Repeating a class is the accepted way to break a tie.
4. **A component's stylesheet must fully describe it.** The one exception is `src/utilities.css` — `.muted`, `.small`, `.sr-only` — loaded by both the app and Storybook. `test-node/component-self-containment.spec.ts` enforces this.
5. No `!important`. No reordering `App.css`.

## Traps that have actually bitten

- **Property leaks from `Button.css`.** Six classes so far: `justify-content`, a variant-specific padding override, `font-weight`, `min-height`, `display` (`.zui-btn` is `inline-flex`, a raw `<button>` is `inline-block`), `border-radius`. Read `Button.css` in full before any swap and ask which properties the call site's own rule does *not* declare.
- **Vanished selectors.** Once `className="danger"` becomes `variant="danger"`, App.css rules keyed on the literal `.danger` **stop matching entirely**. Properties then need restating because App.css's contribution is *gone*, not because it was outranked. Two reviews had to correct comments that got this backwards.
- **Template-built class names.** `` `stage-${status}` ``, `` `u-${urgency}` ``, `` `mock-${role}` `` read as unreferenced to a grep. Dead-CSS sweeps nearly deleted live rules twice.
- **Multi-line selector groups.** `scripts/dead-css.mjs` reads only the line bearing the `{`, so `.form,` `.settings-field,` `.tag-chip {` is judged on `.tag-chip` alone. Its header documents both false-positive modes — read it.
- **Uncaptured surfaces.** A control that renders in no capture is invisible to the bar; the diff reads 0 and proves nothing. This has happened three times. **Before verifying, confirm the control you changed is actually in a capture.** If it needs an interaction, add one to `VIEWS` — it accepts a click *sequence* for nested surfaces.
- **Interaction order is load-bearing.** The grid toggle persists `zenith_contacts_view` to `localStorage`, which survives between interactions and poisoned every one after it. State-mutating interactions go last.

## Known debt — deliberately deferred, not forgotten

- **`AiKeyGate` is Storybook-verified only** and cannot be app-captured from this seed: the AI credential that makes `MockInterview`/`NegotiationRoleplay` render is exactly what closes its gate.
- **No hover state is ever captured** — `parkPointer` exists for determinism, and the side effect is that hover-only regressions are structurally invisible.
- **`freezeMotion` blanket-forces `animation: none` and `caret-color: transparent`**, so a broken spinner/shimmer animation or a wrong caret colour would render identically whether correct or defective.
- **Clock is pinned** to `2026-07-29T12:00:00.000Z`, so date-boundary bugs (off-by-one, pluralisation thresholds) are now invisible. There are no unit tests for the date-relative logic in `format.ts` — worth adding with fake timers.
- **`classesIn()` in the self-containment test** reuses a JS-shaped comment stripper on CSS; a `url(https://…)` would truncate the line. Latent — no current CSS has one, and it fails toward a false positive.
- Stale `App.css` line citations remain in `timeline.css` and `Documents.css`, and one `Button.css` paragraph needs its reasoning rewritten rather than a number swapped.

## How to run the work

Use `superpowers:subagent-driven-development`. The ledger is at
`.superpowers/sdd/2026-07-29-ds-adoption-wave2/progress.md` — **read it first**; it records every task, every review finding, and every ruling.

Two process notes worth inheriting:

- **Subagents get killed after ~600 s of silence.** They die when they redirect long commands to `/dev/null`. Require foreground execution with streaming output (`--reporter=verbose`, no redirect). Splitting a task into *implement* then *verify-and-commit* keeps either phase under the limit and has worked reliably.
- **Do not let an implementer explain away a non-zero diff.** The harness has had four determinism defects fixed (lingering pointer, transition race, partial rasterisation, clock drift) and is now byte-stable across runs. A non-zero line is a real defect. The one time an implementer reasoned around one it was right — and the habit still let a regression ship, which the next coverage extension caught.

## Verification gate for every task

```bash
npx tsc -b                                        # noUnusedLocals is on
npm run lint                                      # oxlint, zero warnings
npx vitest run --no-file-parallelism --reporter=verbose
npm run build
npx storybook build
```
Plus en/nl key parity, and `compare -metric AE` = 0 on every app capture. For PR 5 only, the diff is the deliverable and is reviewed rather than required to be zero.
