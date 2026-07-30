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
  ["overview", "/", [
    { suffix: "nextup-upcoming", click: ".today-nextup .zui-segmented button:nth-child(2)" },
    // The bell popover holds "mark all read", which no capture ever opened.
    { suffix: "bell", click: ".zui-notification-bell .settings-btn" },
    // QuickAddDialog only opens from the top bar's + Add, so nothing captured
    // it — its stylesheet was verified in Storybook alone.
    { suffix: "quickadd", click: ".top-add" },
  ]],
  ["board", "/board", [{ suffix: "cardmenu", click: ".zui-cardmenu-btn" }]],
  ["detail", `/board/${process.env.DETAIL_ID ?? "1"}`, [
    { suffix: "tab-track", click: "#detail-tab-track" },
    { suffix: "tab-tailor", click: "#detail-tab-tailor" },
  ]],
  ["feed", "/feed", [{ suffix: "sort-match", click: ".feed-controls .zui-segmented button:nth-child(2)" }]],
  ["insights", "/insights"],
  ["companies", "/companies", [{ suffix: "grid", click: ".zui-segmented button:nth-child(2)" }]],
  // ORDER MATTERS HERE. Some controls persist their choice to localStorage,
  // which survives the re-navigation between interactions within a context —
  // so a state-mutating interaction poisons every one after it. The grid
  // toggle writes `zenith_contacts_view`, which flips the list to tiles and
  // made `.zui-row` disappear for the two interactions that follow. Keep
  // interactions that only reveal a surface before any that change a stored
  // preference.
  ["people", "/people", [
    // Contact dialog: holds the outreach composer.
    { suffix: "contact", click: ".zui-row" },
    // Two deep — open the contact, then its template manager, which is where
    // the template delete control lives. That control was previously verified
    // by CSS derivation alone because the harness could not reach it.
    { suffix: "templates", click: [".zui-row", ".outreach-composer-head .zui-btn--link"] },
    { suffix: "grid", click: ".zui-segmented button:nth-child(2)" },
  ]],
  ["cv", "/cv", [{ suffix: "rowmenu", click: ".zui-rowmenu-btn" }]],
  ["settings", "/settings"],
  ["settings-account", "/settings?s=account"],
  ["settings-integrations", "/settings?s=integrations"],
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
// gets through. Park the pointer at a fixed, deterministic spot before every
// screenshot so hover state is never part of what we capture. (0, 0) is the
// viewport's top-left corner, not off-canvas — a real element can sit there —
// but it is the same corner on every run, and nothing in this app renders a
// hover state worth capturing at that spot.
const parkPointer = (page) => page.mouse.move(0, 0);

// Parking the pointer is not enough on its own: moving off an element starts
// its hover transition, and Button.css:44 runs background/border/colour over
// 120ms. The 150ms settle below wins that race most of the time, which is the
// worst possible outcome — board-cardmenu-desktop drifted by a fraction of a
// pixel on roughly one run in three, and an intermittent non-zero diff is what
// teaches a reader to dismiss non-zero diffs.
//
// Freeze motion instead of widening the wait, which would only make the race
// rarer. This removes transitions and animations, never steady-state
// appearance, and it applies to baseline and comparison runs alike.
const freezeMotion = (page) =>
  page.addStyleTag({
    content: `*, *::before, *::after {
      transition: none !important;
      animation: none !important;
      caret-color: transparent !important;
    }`,
  });

mkdirSync(OUT, { recursive: true });
// Chromium re-rasterises only the tiles it considers damaged. This harness
// drives twelve views through ONE reused page per viewport, so which tiles are
// damaged when a given view paints depends on what that renderer painted
// before — and the rounded-rect edges of form controls then rasterise from a
// different starting state. The result was two stable variants of the same
// page differing by one 8-bit level on a 2x112 strip: not drift, a coin flip
// between two renderings, landing on roughly one run in three.
//
// Isolated by probe: a page loaded on its own is deterministic across eight
// fresh browser processes; only the full sequence reproduces it. Disabling
// partial raster fixes it (8/8 identical) and costs almost nothing visually
// (AE 1.3 against the un-flagged render, where --disable-lcd-text would have
// cost 3258). --disable-gpu does NOT fix it, so this is a raster-scheduling
// effect rather than a GPU one.
const browser = await chromium.launch({ args: ["--disable-partial-raster"] });
// Half the app's copy is relative to "now" — "due today", "overdue", "upd 2d",
// the calendar's today marker, the stale-hint thresholds. With a real clock the
// baseline silently expires at the next local midnight: a capture taken the
// following day differs from it on views nobody touched, and the diff then
// reads as a regression in whatever task happens to be running. That already
// happened mid-Task-8.
//
// Pin the clock instead, so a capture depends only on the code and the seeded
// data — both of which are fixed. scripts/seed-demo.sql hardcodes its dates
// around 2026-07 for the same reason. setFixedTime freezes what the page reads
// from Date without stopping timers, which is what a screenshot needs.
const FIXED_NOW = process.env.FIXED_NOW ?? "2026-07-29T12:00:00.000Z";

for (const [vpName, viewport] of VIEWPORTS) {
  const context = await browser.newContext({ viewport, storageState: AUTH });
  await context.clock.setFixedTime(new Date(FIXED_NOW));
  const page = await context.newPage();
  for (const [name, route, interactions] of VIEWS) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    // Fail loudly rather than capture a login page: the session expired.
    // A password *label* is the wrong signal — Settings > Account has its own
    // "Password" field (the 2FA form), which false-positived this check the
    // moment that view was added. `.login-stage` is Login.tsx's own wrapper
    // and nothing else in the app renders it.
    if (await page.locator(".login-stage").count()) {
      console.error(`Session expired — ${route} rendered the login page. Re-create ${AUTH}.`);
      process.exit(1);
    }
    await freezeMotion(page);
    await parkPointer(page);
    await page.screenshot({ path: `${OUT}/${name}-${vpName}.png`, fullPage: true });
    console.log(`captured ${name}-${vpName}`);
    for (const { suffix, click } of interactions ?? []) {
      // `click` is a selector or an ordered list of them. Sequences reach
      // surfaces one click cannot: the outreach template manager needs a
      // contact dialog opened first, and a control nested two deep was
      // previously verified by CSS derivation alone because the harness could
      // not express it.
      for (const selector of Array.isArray(click) ? click : [click]) {
        const target = page.locator(selector).first();
        // Wait for it rather than testing presence immediately: a step in a
        // sequence opens a surface the next step clicks, and on the mobile
        // viewport the contact dialog's composer mounted after the fixed
        // 120ms settle, so an instant count() failed the whole run
        // intermittently. Still fails loudly on a real drift — a missing
        // selector must stop the run, because silently skipping it would make
        // the diff pass while covering nothing.
        try {
          await target.waitFor({ state: "visible", timeout: 5000 });
        } catch {
          console.error(`Interaction selector not found on ${route}: ${selector}`);
          process.exit(1);
        }
        await target.click();
        await page.waitForTimeout(120);
      }
      await parkPointer(page);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/${name}-${suffix}-${vpName}.png`, fullPage: true });
      console.log(`captured ${name}-${suffix}-${vpName}`);
      // addStyleTag does not survive a navigation — re-apply for the next
      // interaction on this view.
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await freezeMotion(page);
    }
  }
  await context.close();
}
await browser.close();
