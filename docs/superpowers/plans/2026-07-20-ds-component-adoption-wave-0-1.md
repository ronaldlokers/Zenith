# DS Component Adoption — Wave 0 + Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `src/components/` infrastructure and prove the whole port pipeline end-to-end on `Button`, including swapping all 177 existing `<button>` call sites without visual regression.

**Architecture:** Design-system components are ported once into `src/` as owned TypeScript with co-located, `zui-` prefixed CSS. `.claude/skills/zenith-design/` stays a read-only visual reference, enforced by a test. Component unit tests run in a new jsdom vitest project alongside the untouched Cloudflare workers project.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4 (dual project: `@cloudflare/vitest-pool-workers` + jsdom), `@testing-library/react`, Storybook 10, oxlint.

## Global Constraints

- Never commit to `main`. Branch `feat/ds-components-wave-0-1`. Conventional-commit subjects, lowercase imperative.
- **Components are fully self-contained.** A component's CSS is the complete description of how it looks. It must not depend on any App.css rule — not band 4 normalization, not band 5 mobile repairs, not `button.primary`. Storybook loads only the DS tokens, never App.css, so a component that leans on App.css renders differently in the catalog than in the app.
- **Component CSS is wrapped in `@layer components { … }`.** Layer order outranks specificity, which is the only way to beat App.css's bare-element selectors (`button:not(:disabled):active` scores (0,2,1); `.zui-btn:active` scores (0,1,1) and loses).
- **Layers resolve conflicts, not presence.** A property App.css sets and the component never mentions still applies. Each component must declare the full property set it cares about.
- **`zui-` prefix on every new component class** — for legibility and collision-avoidance, not as the isolation mechanism.
- **No file under `src/` may import from `.claude/`.** Enforced by test, not convention.
- All user-facing strings externalized to `src/locales/en.json` **and** `nl.json` — strict key parity, every key in both.
- `src/App.css` content stays byte-identical. Only how it is imported changes (Task 3a). New component CSS goes in `src/components/*.css`, never App.css.
- `src/index.css` owns tokens. Components consume them, never redeclare them.
- Verification gate, all green before any commit that closes a task: `npx tsc -b` (noUnusedLocals is on — unused symbols are errors), `npm run build`, `npx oxlint` (must stay at exactly one warning: `src/feed.tsx` exhaustive-deps), `npx vitest run --no-file-parallelism`, `npx storybook build`.
- Local D1 must be migrated before `npm run dev`: `npx wrangler d1 migrations apply zenith --local`.

## File Structure

**Created:**
- `src/components/index.ts` — barrel, re-exports every component
- `src/components/Button.tsx` — owned TS port of the DS Button
- `src/components/Button.css` — co-located `zui-` styles
- `src/components/Button.stories.tsx` — Storybook story
- `src/components/Button.test.tsx` — jsdom unit tests
- `test-node/no-claude-imports.spec.ts` — import-guard test (node project, needs fs)
- `scripts/screenshot-baseline.mjs` — captures the pre-change baseline

**Modified:**
- `vitest.config.ts` — split into two projects
- `.storybook/main.js` — extend stories glob to `src/components/`
- `package.json` — new devDeps + `test:components` script
- `src/*.tsx` — 177 `<button>` call sites (Wave 2 tasks)
- `CLAUDE.md` — two corrections

---

### Task 1: Dual vitest project (workers + jsdom)

**Files:**
- Modify: `vitest.config.ts`
- Create: `src/components/smoke.test.tsx` (temporary, deleted in Task 2)
- Modify: `package.json`

**Interfaces:**
- Produces: a jsdom vitest project matching `src/**/*.test.tsx`, and a node project matching `test-node/**/*.spec.ts`. Later tasks put component tests in `src/components/*.test.tsx`.

- [ ] **Step 1: Install the test dependencies**

```bash
npm install --save-dev @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25
```

- [ ] **Step 2: Rewrite `vitest.config.ts` as three projects**

The existing workers config moves verbatim into a project entry. Do not change its `include`, `setupFiles`, or plugin options — the 42 passing suites depend on them.

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";
import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  test: {
    projects: [
      {
        // Unchanged: the existing worker/API suites.
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations(
                  path.join(__dirname, "migrations"),
                ),
              },
            },
          })),
        ],
        test: {
          name: "workers",
          include: ["test/**/*.spec.ts"],
          setupFiles: ["./test/apply-migrations.ts"],
        },
      },
      {
        // React component tests.
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test-setup.ts"],
        },
      },
      {
        // Repo-level guards that need real filesystem access.
        test: {
          name: "node",
          environment: "node",
          include: ["test-node/**/*.spec.ts"],
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Create the jsdom setup file**

Create `src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Write a temporary smoke test proving jsdom works**

Create `src/components/smoke.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

test("jsdom project renders React", () => {
  render(<p>hello</p>);
  expect(screen.getByText("hello")).toBeInTheDocument();
});
```

- [ ] **Step 5: Run the full suite — the 42 existing suites must still pass**

Run: `npx vitest run --no-file-parallelism`

Expected: all three projects run. `workers` reports **42 passed suites / 91 passed tests** exactly as before. `components` reports 1 passed. `node` reports "no test files found" (not an error at this stage).

**If the workers count differs from 91, stop.** The split has broken the existing suites; fix before proceeding.

- [ ] **Step 6: Add a components-only script**

In `package.json` scripts, after `"test": "vitest run"`:

```json
    "test:components": "vitest run --project components",
```

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/test-setup.ts src/components/smoke.test.tsx package.json package-lock.json
git commit -m "test: split vitest into workers, components, and node projects"
```

---

### Task 2: Import-guard test

**Files:**
- Create: `test-node/no-claude-imports.spec.ts`
- Delete: `src/components/smoke.test.tsx`

**Interfaces:**
- Consumes: the `node` vitest project from Task 1.
- Produces: a permanent guard that fails if any `src/` file imports from `.claude/`.

- [ ] **Step 1: Write the failing test**

Create `test-node/no-claude-imports.spec.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

// The design-system bundle under .claude/ is design-sync managed and is
// overwritten wholesale by a pull. Importing it from src/ would turn a
// routine design sync into an unreviewed production change.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test("no file under src/ imports from .claude/", () => {
  const offenders = walk("src")
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /from\s+["'][^"']*\.claude/.test(readFileSync(f, "utf8")));
  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Prove the test actually catches a violation**

Temporarily add this line to the top of `src/ui.tsx`:

```ts
import _probe from "../.claude/skills/zenith-design/components/core/Button.jsx";
```

Run: `npx vitest run --project node`

Expected: FAIL, with `src/ui.tsx` listed in the offenders array.

- [ ] **Step 3: Remove the probe import**

Delete the line added in Step 2 from `src/ui.tsx`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project node`

Expected: PASS, 1 test.

- [ ] **Step 5: Delete the temporary smoke test**

```bash
rm src/components/smoke.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add test-node/no-claude-imports.spec.ts
git rm --cached src/components/smoke.test.tsx 2>/dev/null || true
git add -A src/components
git commit -m "test: guard against src/ importing the design-sync bundle"
```

---

### Task 3: Screenshot baseline

**Files:**
- Create: `scripts/screenshot-baseline.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `baseline/<view>-<viewport>.png` for every app view, used as the diff target by every Wave 2 task.

- [ ] **Step 1: Install Playwright**

The screenshots taken during design review used the Playwright MCP server, which
is not an npm dependency. A scripted baseline needs the package itself.

```bash
npm install --save-dev playwright@^1
npx playwright install chromium
```

Verify it resolves: `node -e "require.resolve('playwright')" && echo ok`
Expected: `ok`.

- [ ] **Step 2: Add the baseline output and session state to `.gitignore`**

Insert before the `# wrangler files` block:

```
# screenshot baseline for component migration (local only, regenerated)
baseline/
after/

# saved browser session for the baseline script — never commit
.auth.json
```

- [ ] **Step 3: Write the capture script**

Create `scripts/screenshot-baseline.mjs`. It drives the already-installed Playwright via the dev server.

```js
// Captures every app view at desktop and mobile widths. Run BEFORE any
// component swap, then again after, and diff. Mobile is a locked
// first-class target, so both widths are mandatory.
//
// Requires a saved session: src/AuthGate.tsx renders <Login/> whenever there
// is no session, so an unauthenticated run would silently capture the login
// page for every view — and every later diff would then pass while catching
// nothing. Create the state once with:
//   npx playwright open --save-storage=.auth.json http://localhost:5173
// log in in the window that opens, then close it.
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = process.env.OUT_DIR ?? "baseline";
const AUTH = process.env.AUTH_STATE ?? ".auth.json";

// Routes come from TAB_PATHS in src/routing.ts. Keep them in sync.
// /stats is deliberately absent: PATH_TABS maps it to "overview" (#346 folded
// /stats and /activity into the Dashboard), so capturing it would duplicate
// the overview shots and imply a view that no longer exists.
const VIEWS = [
  ["overview", "/"],
  ["jobs", "/jobs"],
  ["board", "/board"],
  ["feed", "/feed"],
  ["calendar", "/calendar"],
  ["companies", "/companies"],
  ["people", "/people"],
  ["cv", "/cv"],
  ["settings", "/settings"],
];
const VIEWPORTS = [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
];

if (!existsSync(AUTH)) {
  console.error(
    `No session state at ${AUTH}. Create it with:\n` +
      `  npx playwright open --save-storage=${AUTH} ${BASE}\n` +
      `then log in and close the window. Refusing to capture a login-page ` +
      `baseline, which would make every later diff meaningless.`,
  );
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [vpName, viewport] of VIEWPORTS) {
  const context = await browser.newContext({ viewport, storageState: AUTH });
  const page = await context.newPage();
  for (const [name, route] of VIEWS) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    // Fail loudly rather than capture a login page: the session expired.
    if (await page.getByLabel(/password/i).count()) {
      console.error(`Session expired — ${route} rendered the login page. Re-create ${AUTH}.`);
      process.exit(1);
    }
    await page.screenshot({ path: `${OUT}/${name}-${vpName}.png`, fullPage: true });
    console.log(`captured ${name}-${vpName}`);
  }
  await context.close();
}
await browser.close();
```

- [ ] **Step 4: Migrate the local database**

Run: `npx wrangler d1 migrations apply zenith --local`

Expected: migrations applied, no error.

- [ ] **Step 5: Start the dev server**

Run in a background shell: `npm run dev`

Wait for it to report a local URL. Confirm the port matches `BASE_URL` (default `http://localhost:5173`); if Vite picked a different port, pass `BASE_URL` explicitly in the next step.

- [ ] **Step 6: Create the session state (manual, one-off)**

**This step needs a human.** The app gates on auth, so the script refuses to run
without a saved session.

```bash
npx playwright open --save-storage=.auth.json http://localhost:5173
```

Log in in the window that opens, then close it. Confirm `.auth.json` exists and
is git-ignored (`git status --short` must not list it).

- [ ] **Step 7: Capture the baseline**

Run: `node scripts/screenshot-baseline.mjs`

Expected: 18 lines of `captured <view>-<viewport>`, and 18 PNGs in `baseline/`
(9 views × 2 viewports).

If it exits with "No session state" or "Session expired", redo Step 6 — do not
work around it. The script fails closed precisely because a login-page baseline
would make every later diff pass while catching nothing.

**Then verify by eye**: open two or three PNGs and confirm they show real
rendered views with actual data, not empty states.

- [ ] **Step 8: Stop the dev server and commit the script**

```bash
git add scripts/screenshot-baseline.mjs .gitignore package.json package-lock.json
git commit -m "chore: add screenshot baseline capture for component migration"
```

---

### Task 3a: Cascade layer infrastructure

**Files:**
- Create: `src/app-styles.css`
- Modify: `src/App.tsx:19`

**Interfaces:**
- Produces: an `app` layer containing all of App.css, and a declared `components` layer above it. Every component CSS file from Task 4 onward wraps its rules in `@layer components { … }`.

This task must land before any component CSS exists, so that the first component
is authored against the final cascade.

- [ ] **Step 1: Create the layer wrapper**

Create `src/app-styles.css`:

```css
/* App.css is imported into a named layer so component stylesheets can win
   conflicts against it without a specificity arms race. App.css contains
   bare-element selectors (button:not(:disabled):active at :4527, and the
   print rules at :5204) that match any component's rendered element
   regardless of its classes; those score higher than any single class
   selector, so layer order is the only mechanism that works.

   App.css's own band ordering is preserved intact inside layer(app). */
@layer reset, app, components;
@import "./index.css" layer(reset);
@import "./App.css" layer(app);
```

- [ ] **Step 2: Point App.tsx at the wrapper**

In `src/App.tsx` line 19, replace:

```ts
import "./App.css";
```

with:

```ts
import "./app-styles.css";
```

- [ ] **Step 3: Build and verify the layers survive bundling**

```bash
npm run build
CSS=$(ls dist/client/assets/index-*.css | head -1)
grep -o '@layer[^{;]*[{;]' "$CSS" | head -5
```

Expected output, in this order:

```
@layer reset{
@layer app{
@layer components;
```

If `@layer app{` does not appear, the `@import … layer()` was flattened and the
whole isolation model is broken — stop and reassess before continuing.

- [ ] **Step 4: Verify tokens are still unlayered**

```bash
CSS=$(ls dist/client/assets/index-*.css | head -1)
head -c 300 "$CSS"
```

Expected: the `:root{--night:…}` custom property block appears **before**
`@layer app{`, i.e. outside any layer. `src/index.css` is imported separately by
`main.tsx`; unlayered CSS beats layered CSS, so tokens stay visible to every
layer. If `:root` ended up inside `layer(app)`, tokens still resolve, but confirm
no component override depends on it.

- [ ] **Step 5: Confirm the app is visually unchanged**

At this point no component CSS exists, so the `components` layer is empty and the
rendered output must be identical to before. With the dev server running,
spot-check two views against `baseline/` from Task 3.

Expected: no visual difference whatsoever. A difference here means the `@import`
reordered App.css relative to `index.css`.

- [ ] **Step 6: Run the gate**

```bash
npx tsc -b && npm run build && npx oxlint && npx vitest run --no-file-parallelism
```

- [ ] **Step 7: Commit**

```bash
git add src/app-styles.css src/App.tsx
git commit -m "refactor: import App.css into a cascade layer for component isolation"
```

---

### Task 4: Port Button

**Files:**
- Create: `src/components/Button.tsx`
- Create: `src/components/Button.css`
- Create: `src/components/Button.test.tsx`
- Create: `src/components/index.ts`
- Reference (read only, never import): `.claude/skills/zenith-design/components/core/Button.jsx`, `.claude/skills/zenith-design/components/core/Button.d.ts`

**Interfaces:**
- Produces: `Button` with props `{ variant?: "default" | "primary" | "ghost" | "dark" | "danger"; size?: "sm" | "md" | "lg"; icon?: React.ReactNode }` extending `React.ButtonHTMLAttributes<HTMLButtonElement>`. Wave 2 tasks import it as `import { Button } from "./components"`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/Button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  test("renders its children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  test("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  // The component must be self-contained: no App.css class names, because
  // Storybook never loads App.css and the catalog must match production.
  test("emits only zui- classes, never legacy App.css class names", () => {
    render(<Button variant="primary">Save</Button>);
    const cls = screen.getByRole("button").className.split(/\s+/);
    expect(cls).not.toContain("primary");
    expect(cls).not.toContain("danger");
    expect(cls).toContain("zui-btn--primary");
  });

  test("applies the zui size class", () => {
    render(<Button size="sm">Save</Button>);
    expect(screen.getByRole("button")).toHaveClass("zui-btn--sm");
  });

  test("renders a leading icon before the label", () => {
    render(<Button icon={<svg data-testid="icon" />}>Save</Button>);
    const button = screen.getByRole("button");
    expect(button.firstElementChild).toHaveAttribute("data-testid", "icon");
  });

  test("forwards arbitrary button attributes", () => {
    render(<Button aria-label="Close dialog" disabled />);
    const button = screen.getByRole("button", { name: "Close dialog" });
    expect(button).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project components`

Expected: FAIL — `Failed to resolve import "./Button"`.

- [ ] **Step 3: Write the component**

Create `src/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

// Ported from the design system (components/core/Button.jsx), which expressed
// this as inline styles. Button.css is the complete description of how this
// looks — it must not lean on any App.css rule, because Storybook loads only
// the design tokens and the catalog has to match what ships.
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual emphasis. */
  variant?: "default" | "primary" | "ghost" | "dark" | "danger";
  /** Control height / type scale. */
  size?: "sm" | "md" | "lg";
  /** Optional leading icon element. */
  icon?: ReactNode;
}

export function Button({
  variant = "default",
  size = "md",
  icon,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ["zui-btn", `zui-btn--${size}`, `zui-btn--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Write the stylesheet**

Create `src/components/Button.css`. This is the **complete** description of the
control — every property the old markup used to inherit from App.css is
reproduced here.

Values are taken from what the app renders **today**, not from the DS source,
wherever the two disagree. They do disagree: App.css `button.primary` pads
`0.55rem 0.9rem` while the DS `md` size pads `0.5rem 0.75rem`. App.css has
drifted from the design system. Matching current values keeps the zero-diff bar
meaningful; realigning to the DS is a separate, deliberate decision, not
something to smuggle into a migration.

```css
/* Complete, self-contained. Deliberately reproduces the rules the old raw
   <button> markup inherited from App.css, because Storybook never loads
   App.css and the catalog has to match production:
     - App.css:1212 button.primary     — accent fill, radius, padding
     - App.css:1222 button.primary:hover
     - App.css:1226 button.danger      — danger text colour
     - App.css:4527 band 4             — :active brightness
     - App.css:1503 @media max-600px   — 44px touch target
   Layer order (not specificity) is what lets these win; see src/app-styles.css. */
@layer components {
  .zui-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    font-family: var(--sans);
    font-weight: 500;
    line-height: 1;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
    white-space: nowrap;
    transition:
      background 120ms ease,
      border-color 120ms ease,
      color 120ms ease;
  }

  /* Reproduces App.css band 4 (button:not(:disabled):active). */
  .zui-btn:not(:disabled):active {
    filter: brightness(0.97);
  }

  /* Matches the global focus geometry (App.css:1853). */
  .zui-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .zui-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .zui-btn--sm {
    padding: 0.35rem 0.6rem;
    font-size: var(--text-meta);
  }

  /* 0.55/0.9 matches App.css button.primary as it ships today. */
  .zui-btn--md {
    padding: 0.55rem 0.9rem;
    font-size: var(--text-body);
  }

  .zui-btn--lg {
    padding: 0.6rem 1rem;
    font-size: var(--text-title);
  }

  .zui-btn--primary {
    background: var(--accent);
    color: var(--accent-text);
    border-color: transparent;
    font-weight: 700;
  }

  .zui-btn--primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--accent) 85%, black);
  }

  .zui-btn--danger {
    color: var(--danger);
  }

  .zui-btn--ghost {
    background: transparent;
    border-color: transparent;
    color: var(--muted);
  }

  .zui-btn--dark {
    background: var(--night);
    color: #f4f2ec;
    border-color: transparent;
  }

  /* Mobile touch target. App.css applied this per-container
     (.card-actions button, .toolbar button at max-width 600px); a
     self-contained component cannot know its container, so it guarantees
     its own. Mobile parity is a locked product decision. */
  @media (max-width: 600px) {
    .zui-btn {
      min-height: 44px;
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --project components`

Expected: PASS, 7 tests.

- [ ] **Step 6: Create the barrel**

Create `src/components/index.ts`:

```ts
export { Button } from "./Button";
export type { ButtonProps } from "./Button";
```

- [ ] **Step 7: Run the full gate**

```bash
npx tsc -b && npm run build && npx oxlint && npx vitest run --no-file-parallelism
```

Expected: tsc clean; build succeeds; oxlint reports exactly one warning (`src/feed.tsx` exhaustive-deps); all three vitest projects pass with workers still at 91 tests.

- [ ] **Step 8: Commit**

```bash
git add src/components/Button.tsx src/components/Button.css src/components/Button.test.tsx src/components/index.ts
git commit -m "feat: port Button from the design system into src/components"
```

---

### Task 5: Button story in Storybook

**Files:**
- Create: `src/components/Button.stories.tsx`
- Modify: `.storybook/main.js`
- Reference (read only): `.claude/skills/zenith-design/stories/Core.stories.jsx`

**Interfaces:**
- Consumes: `Button` from Task 4.

- [ ] **Step 1: Extend the Storybook glob**

In `.storybook/main.js`, replace the `stories` array:

```js
  stories: [
    "../src/components/**/*.stories.@(ts|tsx)",
    "../.claude/skills/zenith-design/stories/**/*.stories.@(js|jsx)",
  ],
```

The DS glob stays so the full catalog remains browsable while only some components are ported.

- [ ] **Step 2: Write the story**

Create `src/components/Button.stories.tsx`:

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Ported/Button",
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Variants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="default">Default</Button>
      <Button variant="dark">Dark</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button disabled>Disabled</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};
```

- [ ] **Step 3: Verify the story renders**

Run: `npm run storybook`

Navigate to **Ported → Button → Variants**. Confirm: six buttons render, the primary one is gold, and the story appears alongside the existing DS catalog entries.

**Toggle the theme to Dark and confirm the buttons remain legible.** Then open the **Accessibility** panel and confirm axe reports no violations.

- [ ] **Step 4: Compare against the design reference**

Open **Core → Buttons** (the DS story) in the same Storybook and compare side by side with **Ported → Button → Variants**. Per the project's design rule, diff each element rather than assuming a match: padding, radius, font weight, gold hue, border treatment. Note any difference and fix `Button.css` before continuing.

- [ ] **Step 5: Confirm Storybook still builds**

Run: `npx storybook build`

Expected: `Storybook build completed successfully`.

- [ ] **Step 6: Commit**

```bash
git add src/components/Button.stories.tsx .storybook/main.js
git commit -m "feat: add Button story and index src/components in storybook"
```

---

### Task 6: Swap Button call sites — low-risk views first

**Files:**
- Modify: `src/stats-view.tsx` (1 button), `src/timeline.tsx` (2), `src/Login.tsx` (3), `src/calendar.tsx` (5)

**Interfaces:**
- Consumes: `Button` from Task 4.

These four files hold 11 of the 177 buttons and are the smallest blast radius. They prove the swap before it reaches the dense views.

- [ ] **Step 1: Confirm the working tree is clean and the baseline exists**

```bash
git status --short
ls baseline/*.png | wc -l
```

Expected: no uncommitted changes; 18 baseline PNGs (9 views x 2 viewports).

- [ ] **Step 2: Swap the buttons in `src/stats-view.tsx`**

For the single `<button>` in this file: replace the element with `<Button>`, add `import { Button } from "./components";`, and map the existing classes — `className="primary"` becomes `variant="primary"`, `className="danger"` becomes `variant="danger"`, no class becomes no `variant` prop. Any other class stays in `className`.

- [ ] **Step 3: Repeat for `src/timeline.tsx`, `src/Login.tsx`, and `src/calendar.tsx`**

Same mapping. Work one file at a time and re-read each `<button>` before replacing it — several carry `onClick`, `disabled`, `aria-label`, or `title` attributes that must survive the swap verbatim.

- [ ] **Step 4: Run the gate**

```bash
npx tsc -b && npm run build && npx oxlint && npx vitest run --no-file-parallelism
```

Expected: all clean, oxlint still at exactly one warning.

- [ ] **Step 5: Re-capture and diff the screenshots**

With `npx wrangler d1 migrations apply zenith --local` already applied and `npm run dev` running:

```bash
OUT_DIR=after node scripts/screenshot-baseline.mjs
```

Then compare each pair visually — `baseline/calendar-desktop.png` against `after/calendar-desktop.png`, and the same for mobile.

**Every difference must be explained before continuing.** The bar is zero diff.

The likely source of a diff is **container-contextual App.css rules**, which
still match the new markup (it is still a `<button>` inside `.card-actions`) but
now lose to the `components` layer on any conflicting property. The known cases:

- `.card-actions button` at `@media (max-width: 600px)` sets `padding: 0.5rem
  0.8rem`; `.zui-btn--md` sets `0.55rem 0.9rem` and now wins. Mobile screenshots
  of card action rows will differ.
- `.toolbar button` at the same breakpoint sets `min-height: 40px`; the component
  sets `44px` and now wins.

When one of these appears, choose deliberately and record the choice:

1. **Accept it** if the component's value is the better one — 44px is the
   accessible touch target, and 40px was the outlier.
2. **Add a prop** if the context genuinely needs a different size, e.g. render
   those call sites with `size="sm"`.

Do not resolve it by reaching back into App.css — that reintroduces the coupling
this design removes.

- [ ] **Step 6: Commit**

```bash
git add src/stats-view.tsx src/timeline.tsx src/Login.tsx src/calendar.tsx
git commit -m "refactor: swap Button call sites in stats-view, timeline, login, calendar"
```

---

### Task 7: Swap Button call sites — remaining views

**Files:**
- Modify: `src/dashboard.tsx` (9), `src/chrome.tsx` (11), `src/App.tsx` (13), `src/feed.tsx` (13), `src/network.tsx` (17), `src/board.tsx` (20), `src/cv.tsx` (21), `src/settings.tsx` (29), `src/detail.tsx` (30), `src/ui.tsx` (3)

**Interfaces:**
- Consumes: `Button` from Task 4.

166 buttons across ten files. **Do one file per commit** — a screenshot diff that only spans one view is diagnosable; one spanning ten is not.

Under subagent-driven execution this task is dispatched as **ten separate
implementer runs (7a–7j), one per file**, each with its own review gate, so a
reviewer can reject one file while approving its neighbour.

- [ ] **Step 1: Swap one file, smallest first**

Start with `src/dashboard.tsx`. Apply the identical mapping from Task 6 Step 2: `className="primary"` → `variant="primary"`, `className="danger"` → `variant="danger"`, bare `<button>` → `<Button>` with no variant, all other attributes preserved verbatim. Add `import { Button } from "./components";`.

- [ ] **Step 2: Run the gate for that file**

```bash
npx tsc -b && npm run build && npx oxlint && npx vitest run --no-file-parallelism
```

- [ ] **Step 3: Screenshot-diff that view**

```bash
OUT_DIR=after node scripts/screenshot-baseline.mjs
```

Compare the affected view at both viewports against `baseline/`. Explain every difference before continuing.

- [ ] **Step 4: Commit that file**

```bash
git add src/dashboard.tsx
git commit -m "refactor: swap Button call sites in dashboard"
```

- [ ] **Step 5: Repeat Steps 1–4 for each remaining file**

In order: `chrome.tsx`, `App.tsx`, `feed.tsx`, `network.tsx`, `board.tsx`, `cv.tsx`, `settings.tsx`, `detail.tsx`, `ui.tsx`.

`src/ui.tsx` last and with care: its three buttons sit inside `ConfirmHost` and `LoadFailed`, and `ui.tsx` is slated for a separate reconciliation against the DS `Modal`/`EmptyState`. Swap the buttons only — change nothing else in that file.

- [ ] **Step 6: Confirm no raw buttons remain**

```bash
grep -c '<button' src/*.tsx
```

Expected: no matches, or only matches you can justify — for example a `<button>` rendered inside `Button.tsx` itself.

---

### Task 8: Documentation corrections

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Correct the stale architecture claim**

In the **Stack → Frontend** bullet, replace this exact text:

```
The whole UI lives in `src/App.tsx` (large; a split is a known TODO).
```

with:

```
The UI is split across view modules — `detail.tsx`, `settings.tsx`, `cv.tsx`,
`board.tsx`, `network.tsx`, `feed.tsx`, `chrome.tsx`, `dashboard.tsx`,
`calendar.tsx`, `stats-view.tsx`, `timeline.tsx` — with `src/App.tsx` (755
lines) as the shell and shared primitives in `src/ui.tsx`.
```

- [ ] **Step 2: Document the component CSS convention**

Add to the Frontend section, alongside the existing App.css band description:

```markdown
- **Ported DS components** live in `src/components/` as owned TypeScript with
  co-located CSS (`Button.tsx` + `Button.css`), classes `zui-` prefixed.
  A component's CSS is the **complete** description of how it looks — it must
  never depend on an App.css rule, because Storybook loads only the design
  tokens and the catalog has to match production.
- **Cascade layers enforce that.** `src/app-styles.css` declares
  `@layer app, components` and imports App.css into `layer(app)`; component CSS
  wraps its rules in `@layer components { … }`. Layer order outranks
  specificity, which is the only way to beat App.css's bare-element selectors
  (`button:not(:disabled):active`). Note layers resolve *conflicts* only — a
  property App.css sets and the component never mentions still applies, so each
  component must declare its full property set. Print rules stay global on
  purpose.
- `.claude/skills/zenith-design/` is a read-only reference — importing it from
  `src/` fails `test-node/no-claude-imports.spec.ts`.
```

- [ ] **Step 3: Document the test projects**

Update the verification section to note that `npx vitest run --no-file-parallelism` now runs three projects — `workers` (the D1/API suites), `components` (jsdom React tests in `src/**/*.test.tsx`), and `node` (repo guards in `test-node/`) — and that `npm run test:components` runs the React tests alone.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: correct architecture claim and document component conventions"
```

---

### Task 9: Open the pull request

- [ ] **Step 1: Run the full gate one final time**

```bash
npx tsc -b && npm run build && npx oxlint && npx vitest run --no-file-parallelism && npx storybook build
```

Expected: all clean; oxlint at exactly one warning; workers project still at 91 tests.

- [ ] **Step 2: Verify locale parity**

Confirm `src/locales/en.json` and `src/locales/nl.json` still have identical key sets. This task added no strings, so the sets should be unchanged from `main`.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/ds-components-wave-0-1
gh pr create --title "feat: adopt DS Button into src/components" --body "$(cat <<'EOF'
Implements Wave 0 and the Button half of Wave 1 from
docs/superpowers/specs/2026-07-20-ds-component-adoption-design.md.

- splits vitest into workers / components / node projects
- adds the import guard against the design-sync bundle
- ports Button to src/components with zui- prefixed co-located CSS
- swaps all 177 raw <button> call sites, one view per commit
- corrects the stale CLAUDE.md architecture claim

Button keeps emitting the legacy `primary`/`danger` class names so App.css
bands 4 and 5 continue to match. Every view was screenshot-diffed at desktop
and mobile against a pre-change baseline.
EOF
)"
```

- [ ] **Step 4: Watch CI**

Run: `gh pr checks <n> --watch`

Expected: both "checks" and "preview" jobs pass.

---

## Out of scope

- **The remaining 7 Wave 1 components** — Card (17 sites), EmptyState (17), Badge (6), Tabs (2), Toast, Avatar, Table (1). Identical recipe; own plan once Button has proven it.
- **The 28 deferred components** — on-demand only, per the spec.
- **`src/ui.tsx` reconciliation** — its `Dialog`/`LoadingSkeleton`/`LoadFailed` overlap the DS `Modal`/`Spinner`/`EmptyState`. Deliberate follow-up.
- **`src/timeline.tsx` reconciliation** — an existing 165-line component overlapping the DS `Timeline`.
- **Dead App.css rules.** Once every `<button>` call site is swapped,
  `button.primary` / `button.danger` and the band 5 `.form-actions
  button.primary:hover` repairs have no markup left to match. Deleting them is a
  separate cleanup — App.css content stays byte-identical in this plan.
- **Realigning to DS values.** App.css has drifted from the design system
  (`button.primary` pads `0.55rem 0.9rem`; the DS `md` size pads `0.5rem
  0.75rem`). This plan reproduces current app values to keep the zero-diff bar
  meaningful. Closing that gap is a deliberate design decision for later.
