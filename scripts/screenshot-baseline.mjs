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
//
// The detail view needs a real application id. Pass DETAIL_ID=<id> if the
// seeded account's first application is not id 1; the run fails loudly if the
// route renders nothing to interact with.
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const OUT = process.env.OUT_DIR ?? "baseline";
const AUTH = process.env.AUTH_STATE ?? ".auth.json";

// Routes come from TAB_PATHS in src/routing.ts. Keep them in sync.
// Legacy paths (/jobs, /stats, /activity, /calendar) are deliberately absent:
// LEGACY_PATHS rewrites them to a canonical route, so capturing them would
// duplicate another view's shots and imply views that no longer exist.
//
// A third element is an interaction list: each entry clicks a selector and
// captures again under `<name>-<suffix>`. Local-state controls (detail's
// section tabs, the segmented groups) are invisible to a URL-only capture,
// and those are exactly what PR 4 rewrites.
//
// TRANSIENT SURFACES MUST BE CAPTURED TOO. A popover, menu or dialog that is
// closed in every capture is invisible to the zero-diff bar, so a regression
// inside one passes 36/36 while nothing has actually been checked. That is not
// hypothetical: swapping the card- and row-menu items onto <Button> leaked
// `justify-content: center` from Button.css into both popovers — every menu
// item's label centred — and the bar reported 0 on all 36 because no capture
// ever opened a menu. Any task that changes a surface only reachable by
// interaction adds the interaction here first, then verifies.
const VIEWS = [
  ["overview", "/", [{ suffix: "nextup-upcoming", click: ".today-nextup .zui-segmented button:nth-child(2)" }]],
  ["board", "/board", [{ suffix: "cardmenu", click: ".zui-cardmenu-btn" }]],
  ["detail", `/board/${process.env.DETAIL_ID ?? "1"}`, [
    { suffix: "tab-track", click: "#detail-tab-track" },
    { suffix: "tab-tailor", click: "#detail-tab-tailor" },
  ]],
  ["feed", "/feed", [{ suffix: "sort-match", click: ".feed-controls .zui-segmented button:nth-child(2)" }]],
  ["insights", "/insights"],
  ["companies", "/companies", [{ suffix: "grid", click: ".zui-segmented button:nth-child(2)" }]],
  ["people", "/people", [{ suffix: "grid", click: ".zui-segmented button:nth-child(2)" }]],
  ["cv", "/cv", [{ suffix: "rowmenu", click: ".zui-rowmenu-btn" }]],
  ["settings", "/settings"],
  ["settings-data", "/settings?s=data"],
  ["settings-feed", "/settings?s=feed"],
  ["admin", "/admin"],
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

// Playwright's virtual pointer stays wherever it last clicked, and it carries
// across page.goto — so after an interaction the NEXT view renders with
// :hover applied to whatever sits under those coordinates. That made
// board-desktop non-reproducible: the Next Up segment on /overview sits at
// (797, 342), which lands on a board card, and whether its hover background
// had painted by screenshot time varied per run. Two identical runs differed
// by 6px; with the hover fully applied the difference is 302px.
//
// A flaky capture is worse than a missing one: it trains everyone reading the
// diff to wave away non-zero results, which is exactly how a real regression
// gets through. Park the pointer off-canvas before every screenshot so hover
// is never part of what we capture.
const parkPointer = (page) => page.mouse.move(0, 0);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [vpName, viewport] of VIEWPORTS) {
  const context = await browser.newContext({ viewport, storageState: AUTH });
  const page = await context.newPage();
  for (const [name, route, interactions] of VIEWS) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    // Fail loudly rather than capture a login page: the session expired.
    if (await page.getByLabel(/password/i).count()) {
      console.error(`Session expired — ${route} rendered the login page. Re-create ${AUTH}.`);
      process.exit(1);
    }
    await parkPointer(page);
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
      await parkPointer(page);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/${name}-${suffix}-${vpName}.png`, fullPage: true });
      console.log(`captured ${name}-${suffix}-${vpName}`);
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    }
  }
  await context.close();
}
await browser.close();
