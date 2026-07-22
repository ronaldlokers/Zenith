// Reusable zero-diff capture. Run from the repo root with the dev server up.
//   OUT_DIR=after  VIEWS='/,/companies' node .claude/skills/zero-diff-verify/capture.mjs
// then `git stash push <changed files>`, rerun with OUT_DIR=control, `git stash pop`,
// then: for f in after/*.png; do compare -metric AE control/$(basename $f) $f null:; done
//
// VIEWS  — comma-separated routes to capture on load (default "/").
// VP     — "desktop", "mobile", or "both" (default "both").
// After capturing on-load views, screenshot interaction states by hand (open a
// modal, then page.screenshot) — see the skill's "Triggering hidden UI".
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT_DIR;
if (!OUT) throw new Error("set OUT_DIR (e.g. after / control)");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const AUTH = process.env.AUTH_STATE ?? ".auth.json";
const VIEWS = (process.env.VIEWS ?? "/").split(",").map((r) => {
  const route = r.trim();
  const name = route === "/" ? "overview" : route.replace(/^\//, "").replace(/\//g, "-");
  return [name, route];
});
const VPS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const which = process.env.VP ?? "both";
const viewports = which === "both" ? Object.entries(VPS) : [[which, VPS[which]]];

const browser = await chromium.launch();
for (const [vpName, viewport] of viewports) {
  const context = await browser.newContext({ viewport, storageState: AUTH });
  const page = await context.newPage();
  for (const [name, route] of VIEWS) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    // Fail loud rather than diff a login page: session expired.
    if (await page.getByLabel(/password/i).count()) {
      console.error(`session expired on ${route} — recreate ${AUTH}`);
      process.exit(1);
    }
    await page.evaluate(() => document.fonts.ready); // avoid cold-start FOUT
    await page.waitForTimeout(120);
    await page.screenshot({
      path: `${OUT}/${name}-${vpName}.png`,
      fullPage: true,
      animations: "disabled",
      timeout: 60000,
    });
    console.log(`captured ${name}-${vpName}`);
  }
  await context.close();
}
await browser.close();
