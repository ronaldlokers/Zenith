# Design-system adoption — Wave 2, closed out

**The Wave 2 plan is complete. All five PRs are merged.** This file is no longer a mid-flight
handoff; it is the durable record of the verification rig the work was built on, the
architectural rules it established, the traps that actually bit, and the debt that was
deliberately deferred rather than forgotten.

- **Spec:** `docs/superpowers/specs/2026-07-29-ds-adoption-wave2-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-29-ds-adoption-wave2.md` (20 tasks, 5 PRs)
- **Project rules:** `CLAUDE.md` — read it in full, it is binding

## What shipped

| PR | Contents |
| --- | --- |
| #504 | Verification rig: harness routes, `scripts/seed-demo.sql` |
| #505 | PR 1 — deleted dead App.css (5175 → 4809) |
| #506 | PR 2 — all 38 controls behind `Button`, App.css recipes retired (→ 4771) |
| #507 | Seed coverage + `scripts/storybook-shots.mjs` + a shipped-regression fix |
| #508 | PR 3 — component self-containment (Tasks 11–14) |
| #510 | PR 4 — the three selection controls owned (Tasks 15–18), App.css → 4641 |
| #511 | PR 5 — the two defects the audit surfaced (Tasks 19–20) |

The plan's "Done when" list was checked item by item at the end of PR 5 and all of it holds:
the `btn-secondary`/`danger` grep returns nothing at all (not even in tests and stories);
`test-node/component-self-containment.spec.ts` passes and **has been shown to fail** on an
injected violation; `scripts/dead-css.mjs` reports 12 candidate blocks (18 lines), down from 58 (−79%);
and all 38 components in `src/components/` have both a `.stories.tsx` and a `.test.tsx`.

**Note on the plan document:** its line references do not resolve against `main`, but they are
not wrong — they are **anchored to `e57f6a3`**, the commit the plan was written against, where
`App.css` was 5175 lines. Every one of them is exact there. They stopped resolving because the
plan's own PRs 1–3 deleted ~534 lines above most of them and later PRs moved six of the cited
recipes out of `App.css` altogether. Read them with `git show e57f6a3:src/App.css`, which the
plan's own header now explains, along with a table of where each moved recipe went.

The lesson is about *citing*, not about that plan: a bare line number is only meaningful with the
commit it was taken against. Where a citation has to survive, name the selector too — and if it
is going into a component file, where it will read as a live pointer, name the commit. One
citation in this work shipped into `PillTabs.tsx` reading `App.css:1083`, correct at the anchor
but meaningless in the file it landed in; #511 corrected it.

The plan does carry one genuine content error: Task 16's prescribed `TabBar` signature types its
key as `string`, which forces a cast at every call site and silently accepts a typo'd tab key
that `main` rejected at compile time. The shipped components are generic in the key instead.
Treat the plan's code blocks as a strong draft, not as gospel.

## Rebuilding the rig — nothing verifies without it

The bar for this work was pixel-level, so the rig has to exist and match. Rebuilt from scratch
on the Omarchy host during PR 4; these are the steps that actually work, including the ones the
earlier version of this file got wrong.

```bash
# 1. dependencies. npm alone is not enough — esbuild and workerd link their
#    binaries in a postinstall that npm now withholds by default.
npm install
npm approve-scripts esbuild workerd sharp core-js

# 2. browsers — AFTER npm install, and both of them. Running this first fetches
#    a build that does not match the pinned playwright package, and
#    chromium.launch() then fails looking for the headless shell.
npx playwright install chromium chromium-headless-shell

# 3. tools (present on the Omarchy host; pacman, not apt, in a devcontainer)
compare --version || sudo pacman -S imagemagick

# 4. database
npx wrangler d1 migrations apply zenith --local
npx wrangler d1 execute zenith --local --file scripts/seed-demo.sql

# 5. dev server, left running
npm run dev
```

**A login for the harness.** `scripts/seed-admin.mjs` needs a TTY. Without one, mirror what it
does in a scratch script: import `hashPassword` from
`node_modules/better-auth/dist/crypto/index.mjs` **by absolute path** (a script living outside
the repo cannot resolve bare package names), then write the same `seed-admin-credential` row it
writes. Keep the password in a scratch file, never in the repo.

**`.auth.json`** does not need a windowed `npx playwright open`. Drive `Login.tsx` headlessly:
fill `input[type="email"]` and `input[type="password"]`, submit `form.login-card`, wait for
`.login-stage` to detach, then `context.storageState({ path: ".auth.json" })`.

The seeded admin owns all 15 applications, ids **9001–9015**, so `DETAIL_ID=9001`.

**Prove the harness is byte-stable before trusting any diff.** Two full runs into different
`OUT_DIR`s must differ on 0 of 52 captures. Once that holds, a non-zero line is a real defect —
see the process note at the end of this file.

## The two harnesses, and why there are two

**`scripts/screenshot-baseline.mjs`** — captures the running app. 52 captures (14 views × 2
viewports, plus interaction states).

```bash
DETAIL_ID=9001 OUT_DIR=baseline node scripts/screenshot-baseline.mjs   # before
# ... make the change ...
DETAIL_ID=9001 OUT_DIR=after node scripts/screenshot-baseline.mjs      # after
```

**`scripts/storybook-shots.mjs`** — captures every Storybook story, both themes, 112 shots.

```bash
npx storybook build
OUT_DIR=sb-baseline node scripts/storybook-shots.mjs
```

**They check different things and neither substitutes for the other.** The app harness cannot see
a self-containment break, because the app always loads `App.css`; that only shows in Storybook,
which loads none. The Storybook harness cannot see an app-layout regression, because stories
render in isolation.

**Capture the baseline from the pre-change tree**, not from your own branch:

```bash
git checkout <parent-commit> -- src/      # NOT `git stash` — that stashes your harness edits too
DETAIL_ID=9001 OUT_DIR=baseline node scripts/screenshot-baseline.mjs
git checkout HEAD -- src/
```

### Reading the diff — `compare -metric AE` needs care

```bash
for f in baseline/*.png; do n=$(basename "$f")
  ae=$(compare -metric AE "$f" "after/$n" null: 2>&1 | head -1 | awk '{print $1}')
  [ "$ae" != "0" ] && printf "DIFF %-42s %s\n" "$n" "$ae"
done
```

Two things about that command, both learned the hard way:

- **Parse AE as the first whitespace field.** `compare` prints `AE (normalized)`, so an
  identical pair prints `0 (0)` — and a naive `[ "$ae" != "0" ]` on the whole string reports
  *every* capture as differing. It will tell you 52 of 52 failed when nothing changed.
- **The AE number is not a usable pixel count on this host** (ImageMagick 7.1.2-27 Q16-HDRI): a
  1.296e+06-pixel capture reported `4.63591e+07`, ~36× its own pixel count, with both fields
  identical instead of `count (normalized)`. It remains perfectly reliable as a **zero /
  non-zero signal**, which is all a zero-diff bar needs. It only misleads when you need to
  *size* a deliberate change, as PR 5 did. For that:

```bash
# differing-pixel count
magick A.png B.png -compose difference -composite -colorspace Gray -threshold 0 \
  -format "%[fx:int(mean*w*h+0.5)]" info:
# bounding box of all differing pixels — the more valuable of the two
magick A.png B.png -compose difference -composite -colorspace Gray -threshold 0 -format "%@" info:
```

The bounding box is what lets you assert a change is **confined to the control you touched**
rather than merely small. PR 5 used it to show every differing pixel fell inside the subnav's own
band and inside `.cv-doc`'s box.

## Architectural rules — each of these cost a review cycle to learn

1. **An `@layer app` rule can never reclaim a property from `@layer components`**, whatever its
   specificity. `src/app-styles.css` orders `reset, app, components`, and layer order beats
   specificity per-property. So a leak from `Button.css` **cannot** be fixed by editing
   `App.css`. Use either a named reusable `Button` variant (`close` is the precedent) or a
   feature-owned stylesheet in `@layer components` — see `src/timeline.css`,
   `src/settings/settings.css`, `src/cv/cv.css`, `src/feed.css`, `src/dashboard.css`,
   `src/outreach-composer.css`.
2. **Never put a selector naming a call-site class inside `Button.css`.** Tried, rejected on
   review: it turns the shared library into a directory of one-off consumers.
3. **An override must win on its own specificity, never on the order Vite emits chunks.**
   `:hover`, `:not(:disabled)`, `:focus-visible` and `:disabled` each count as one
   class-equivalent, so `.zui-btn--danger:hover:not(:disabled)` is (0,3,0). Four settings
   overrides once *tied* it and worked only by chunk-order accident. Repeating a class is the
   accepted way to break a tie.
4. **A component's stylesheet must fully describe it.** The one exception is `src/utilities.css`
   — `.muted`, `.small`, `.sr-only` — loaded by both the app and Storybook.
   `test-node/component-self-containment.spec.ts` enforces this and picks up new components
   automatically by scanning `src/components/*.tsx`.
5. **A faithful copy reproduces absences too.** `TabBar` has `:hover`/`:focus-visible` rules
   because `.detail-tabs` had them; `PillTabs` has neither because `.subnav` had neither. Adding
   the missing states would be both scope creep and a visual change.
6. **App.css line citations in component files are archaeological, by convention.** ~150 of them
   exist across `src/`, many pointing at recipes long gone, and several say so explicitly. They
   are provenance notes, not live pointers — do not "fix" them wholesale, and do not treat a
   shrinking App.css as invalidating them.
7. No `!important`. No reordering `App.css`; new CSS goes in bands 1–3, never after the
   control-normalization layer.

## Traps that have actually bitten

- **Property leaks from `Button.css`.** Six classes so far: `justify-content`, a variant-specific
  padding override, `font-weight`, `min-height`, `display` (`.zui-btn` is `inline-flex`, a raw
  `<button>` is `inline-block`), `border-radius`. Read `Button.css` in full before any swap and
  ask which properties the call site's own rule does *not* declare.
- **Vanished selectors.** Once `className="danger"` becomes `variant="danger"`, App.css rules
  keyed on the literal `.danger` **stop matching entirely**. Properties then need restating
  because App.css's contribution is *gone*, not because it was outranked. Two reviews had to
  correct comments that got this backwards.
- **Shared grouped selectors must be retargeted, not deleted.** `.subnav button` appeared in two
  band-5 touch-target groups alongside six other live controls. Only the one line came out; the
  other six kept their repair, and the component restated the `34px`/`40px` minimums itself.
  Deleting either group wholesale would have failed WCAG 2.5.8 on phones, silently. The same
  shape appeared in Task 17, where a single `@media` block held both `.settings-page` (the
  two-pane grid, stays in App.css) and `.settings-nav` (moves to the component) — that block had
  to be **split**, not relocated.
- **Template-built class names.** `` `stage-${status}` ``, `` `u-${urgency}` ``,
  `` `mock-${role}` `` read as unreferenced to a grep. Dead-CSS sweeps nearly deleted live rules
  twice.
- **Multi-line selector groups.** `scripts/dead-css.mjs` reads only the line bearing the `{`, so
  `.form,` `.settings-field,` `.tag-chip {` is judged on `.tag-chip` alone. Its header documents
  both false-positive modes — read it.
- **Uncaptured surfaces.** A control that renders in no capture is invisible to the bar; the diff
  reads 0 and proves nothing. This has happened three times. **Before verifying, confirm the
  control you changed is actually in a capture.** If it needs an interaction, add one to `VIEWS`
  — it accepts a click *sequence* for nested surfaces.
- **A presence probe is necessary but not sufficient: Playwright's `isVisible()` ignores
  occlusion.** It returns true for any element with a non-empty box that is not
  `visibility: hidden`, regardless of what is painted on top. On `/people` with the contact
  dialog open, `.zui-pilltabs` probes as visible with a real bounding box, yet its capture is
  byte-identical across a change that definitely altered it — the dialog covers that region, and
  the zero is correct. **When a probe and a diff disagree, crop the actual capture and look:**
  `magick shot.png -crop WxH+X+Y +repage out.png` on the probed box settles it in one step.
- **The strongest check is not presence but computed style.** Measure the control's properties
  *before* the change, re-measure after, and assert that what you expected to move moved and the
  rest did not. That is what proved PR 4's touch-target repair survived (`min-height` 34px
  desktop / 40px mobile, identical box geometry) rather than merely that a diff read 0.
- **Interaction order is load-bearing.** The grid toggle persists `zenith_contacts_view` to
  `localStorage`, which survives between interactions and poisoned every one after it.
  State-mutating interactions go last.
- **`.first()` selectors are fragile to class convergence.** The harness reaches the
  companies/people grid toggle via `.zui-segmented button:nth-child(2)`, taking the first match.
  That works because those views hold exactly one `.zui-segmented`. If anything ever makes the
  network subnav a `.zui-segmented` too — which the PR 5 convergence question nearly did — the
  first match becomes the subnav, the `-grid` captures stop showing a grid, and the diff becomes
  meaningless in both directions without failing.

## Remaining debt — deliberately deferred, not forgotten

**Accessibility follow-ups, now cheap.** These were preserved rather than changed because PRs 1–4
held a strict zero-diff bar and the bar cannot see behaviour.

- **No arrow-key roving focus** on `TabBar`/`PillTabs`, which the ARIA tabs pattern expects. This
  is pre-existing behaviour faithfully preserved — the raw markup already declared
  `role="tablist"`/`role="tab"` with no key handling. The current state is the *benign* failure
  mode: no tab carries `tabIndex={-1}`, so every tab is still Tab-reachable and Enter/Space
  operable. **Do not half-implement it** — adding `tabIndex={-1}` without arrow handling would be
  a hard regression. The win banked by PR 4 is that this is now a two-file edit instead of five.
- **`SettingsNav` emits `aria-current="true"`** while the shell's primary nav uses
  `aria-current="page"`. Since the sections *are* deep-linked URLs (`/settings?s=…`), `page` is
  the more apt token; `"true"` is what the replaced markup used and is valid. Natural companion
  to the roving-focus change.
- **`TabBar` emits `aria-controls` pointing at ids that do not exist.** `src/detail.tsx` renders
  only the *active* panel, so two of three `aria-controls` dangle on every render. Faithful to
  the source markup, so not a regression — but note `PillTabs` took the opposite view for its own
  case (it omits `idPrefix` entirely rather than dangle), and its header comment now explains the
  divergence instead of asserting a family rule the family does not follow.
- **The network view renders no `role="tabpanel"`.** `CompaniesTab`/`ContactsTab` would need the
  role threaded into both components; wrapping them would change the DOM under a layout parent.
  This is why `PillTabs` passes no `idPrefix`.

**The last non-token elevation shadow — and why tokenising it is the wrong fix.**
`src/App.css:242` (`.login-card`) still carries a literal two-layer elevation shadow. PR 5
deliberately left it, and the reason matters: `.login-stage` is *a committed Night ground in both
themes* (`App.css:218`), while the shadow tokens are per-theme "since shadow needs the ground"
(`index.css:201`). So `var(--shadow-2)` there would cast a light-ground Ink-Indigo shadow onto a
Night ground — **actively wrong, not merely untokenised**. Tellingly the literal's first-layer
alpha `rgba(0,0,0,0.55)` is exactly *dark* `--shadow-2`'s. The real task is to give
`.login-stage` a Night shadow scope (redeclare `--shadow-1`/`--shadow-2` to their Night values
inside the always-Night scope, then use the token) — a design decision needing its own approval,
on a surface the app harness **structurally cannot capture**, since it exits by design if
`.login-stage` renders. It is arguably not a DESIGN.md "third shadow value" at all, because that
rule governs the elevation ramp on the app's *themed* ground and `.login-stage` is deliberately
off it.

**Two capsule recipes that may yet merge.** `PillTabs.css` and `SegmentedControl.css` are
near-duplicates — same border, `radius-full`, filled-accent active state, same `34px`/`40px`
floor. PR 5 asked whether they converge and answered **no, on measurement**: five properties
differ (container `background-color`, `overflow`, `gap`, `margin`, and the button's own
`background`), and the two capsules genuinely read differently on a `--bg` ground — PillTabs
shows a `--surface` gutter between pills, SegmentedControl abutting segments inside a transparent
padding ring. `PillTabs.tsx`'s header records this so the question is not reopened. If it ever is:
`margin` is inherited call-site spacing, not a design decision, and a future reader may
legitimately move it to the call site. The two files also express the shared touch-target floor
differently (folded into the button rule vs restated to carry a provenance note) — reconcile that
if they ever merge. `SegmentedControl` also sits in Storybook's `Core/` while the three new
controls introduced `Navigation/`; a merge would have a `Core/` component absorb a `Navigation/`
one.

**Blind spots in the bar itself** — structural, and worth knowing before trusting a green run:

- **`AiKeyGate` is Storybook-verified only** and cannot be app-captured from this seed: the AI
  credential that makes `MockInterview`/`NegotiationRoleplay` render is exactly what closes its
  gate.
- **No hover state is ever captured** — `parkPointer` exists for determinism, and the side effect
  is that hover-only regressions are structurally invisible.
- **`freezeMotion` blanket-forces `animation: none` and `caret-color: transparent`**, so a broken
  spinner/shimmer animation or a wrong caret colour would render identically whether correct or
  defective.
- **The clock is pinned** to `2026-07-29T12:00:00.000Z`, so date-boundary bugs (off-by-one,
  pluralisation thresholds) are invisible. There are still no unit tests for the date-relative
  logic in `format.ts` — worth adding with fake timers.
- **`.cv-doc` renders at desktop only.** At 390px it is not in the DOM at all, so a mobile
  capture showing no change to the CV preview is correct rather than suspicious.

**Smaller items.**

- `classesIn()` in the self-containment test reuses a JS-shaped comment stripper on CSS; a
  `url(https://…)` would truncate the line. Latent — no current CSS has one, and it fails toward
  a false positive.
- `SegmentedItemProps` extends the full `ButtonHTMLAttributes`. The `aria-pressed` override hole
  was closed in PR 4 by spreading `...rest` *before* the derived attribute, but the prop type
  still admits keys the component means to own.
- Stale `App.css` line citations remain in `timeline.css` and `Documents.css`, and one
  `Button.css` paragraph needs its reasoning rewritten rather than a number swapped. See
  architectural rule 6 before "fixing" these: the convention is archaeological.
- `.subnav` got no "moved to the owned component" breadcrumb in `App.css`, though
  `.board-group-toggle` has one at `App.css:2158`. Minor consistency gap left by PR 4.

## Verification gate for every task

```bash
npx tsc -b                                        # noUnusedLocals is on
./node_modules/.bin/oxlint; echo "EXIT=$?"        # prints NOTHING when clean — read the exit code
npx vitest run --no-file-parallelism --reporter=verbose
npm run build
npx storybook build
```

Plus en/nl key parity, and `compare -metric AE` = 0 on every app capture for a refactor that
should be invisible. For a deliberate visual change, the diff is the deliverable: state the
expected change first, then show that the measured bounding boxes fall only inside the controls
you touched.

Do not use `npm run lint` on the Omarchy host — a local hook mangles its output. oxlint prints
nothing at all when clean, so the exit code is the only signal.

## Process notes worth inheriting

- **Subagents get killed after ~600 s of silence.** They die when they redirect long commands to
  `/dev/null`. Require foreground execution with streaming output (`--reporter=verbose`, no
  redirect). Splitting a task into *implement* then *verify-and-commit* keeps either phase under
  the limit and has worked reliably.
- **Do not let an implementer explain away a non-zero diff.** The harness has had four
  determinism defects fixed (lingering pointer, transition race, partial rasterisation, clock
  drift) and is byte-stable across runs — re-confirmed on the Omarchy host during PR 4 with two
  full runs differing on 0 of 52 captures. A non-zero line is a real defect.
- **Run the pixel gate yourself rather than delegating it.** The implementer is the party with an
  incentive to reason around a non-zero result. Across PR 4 the gate ran nine times — after every
  task and every fix commit, plus once after the squash-merge to confirm the claim survived it.
- **Where the plan and a review collide, that is the human's call, not the agent's.** PR 4's one
  Important finding was a type-safety regression the plan's own prescribed code caused; the
  deviation was approved explicitly before it was implemented, and the fix was verified by
  injecting bad keys and watching the compiler reject them.
