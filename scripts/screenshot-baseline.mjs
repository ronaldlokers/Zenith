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
