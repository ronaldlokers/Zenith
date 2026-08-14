import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BASE, STATE } from "./setup";

// Every layer below this one tests a part. The workers specs drive real HTTP
// against real D1 and R2; the component tests render pieces in jsdom. Nothing
// walked a whole journey, and nothing ran in a browser at all — which is the
// gap that let a real defect through more than once:
//
//   - the bottom bar's controls had no accessible name below 700px, because
//     their label is display:none there. jsdom applies no CSS, so the axe
//     component test passes with the aria-labels removed. Checked.
//   - the focus ring was repainted in a colour that fails 1.4.11, which needs
//     a computed style from a real cascade to see.
//   - a card click flashed a modal for one frame, which needs a real paint.
const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

async function signedIn(width = 1440): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    storageState: STATE,
  });
  await context.addInitScript({ content: AXE });
  return context.newPage();
}

/**
 * Waits for a fading element to finish arriving. The dialogs animate in from
 * opacity 0 over ~0.18s, and axe run against a half-faded modal reports its
 * text as low-contrast against the scrim showing through — nine violations
 * that are an artefact of when the snapshot was taken, not of any colour.
 * It passed locally and failed on a slower CI runner, which is the shape of
 * every animation race.
 */
async function settled(page: Page, selector: string) {
  await page.waitForSelector(selector);
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && getComputedStyle(el).opacity === "1";
    },
    selector,
    { timeout: 10_000 },
  );
}

/**
 * Waits until nothing on the page is mid-animation. Three separate false
 * contrast readings have come from sampling a fade: the two dialogs, and a
 * toast on a route that redirects. Text at partial opacity measures against
 * whatever shows through it, which is a fact about the snapshot rather than
 * about any colour.
 */
async function animationsSettled(page: Page) {
  await page.waitForFunction(
    () => document.getAnimations().every((a) => a.playState !== "running"),
    undefined,
    { timeout: 10_000 },
  );
}

/** Violations axe can judge in a real browser, contrast included. */
async function axeViolations(page: Page) {
  await animationsSettled(page);
  return rawAxeViolations(page);
}

async function rawAxeViolations(page: Page) {
  return page.evaluate(async () => {
    const res = await (window as unknown as { axe: { run: (d: Document) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } })
      .axe.run(document);
    return res.violations
      // Content outside a landmark is a best-practice rule, not a WCAG
      // failure, and the app has a standing one on .page-title.
      .filter((v) => v.id !== "region")
      .map((v) => `${v.impact} ${v.id} (${v.nodes.length})`);
  });
}

// The state every account starts in, and the one every sweep this session
// missed. Two defects lived here undetected — a heading level skipped on the
// onboarding checklist, which only renders while the account is empty, and a
// link that stopped being distinguishable from its sentence — and both were
// found by CI rather than by any of the passes run against a database with
// data in it.
//
// Two ways in, because neither alone is enough. A filtered view is empty in
// any database, so it works on a developer machine with real data in it; the
// bare routes are only genuinely empty on a fresh checkout, which is what CI
// has. Between them the empty rendering is exercised wherever this runs.
describe("with nothing to show", () => {
  it("draws an empty result set without breaking anything", async () => {
    const page = await signedIn();
    const failures: string[] = [];
    for (const path of [
      "/board?q=zzz-nothing-matches-this",
      "/companies?q=zzz-nothing-matches-this",
      "/people?q=zzz-nothing-matches-this",
      "/feed?q=zzz-nothing-matches-this",
    ]) {
      await page.goto(BASE + path);
      await page.waitForSelector("main, .content");
      const violations = await axeViolations(page);
      if (violations.length) failures.push(`${path}: ${violations.join(", ")}`);
    }
    expect(failures).toEqual([]);
    await page.context().close();
  }, 180_000);

  it("keeps the heading order it promises on every page", async () => {
    // heading-order is how someone navigating by headings knows where they
    // are. The onboarding checklist skipped a level on the first screen a new
    // account shows, and nothing caught it because the checklist is gone as
    // soon as there is anything to see.
    const page = await signedIn();
    const failures: string[] = [];
    for (const path of ["/overview", "/board", "/insights", "/cv", "/settings"]) {
      await page.goto(BASE + path);
      await page.waitForSelector("main, .content");
      await animationsSettled(page);
      const levels = await page.evaluate(() =>
        [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
          .filter((h) => (h as HTMLElement).offsetParent !== null)
          .map((h) => Number(h.tagName[1])),
      );
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] - levels[i - 1] > 1) {
          failures.push(`${path}: h${levels[i - 1]} jumps to h${levels[i]}`);
        }
      }
    }
    expect(failures).toEqual([]);
    await page.context().close();
  }, 180_000);
});

// The third state a page can be in, after "has data" and "has none": the
// load failed. It renders a different screen entirely — LoadFailed, with the
// retry #597 added — and nothing has ever looked at it. That is the same gap
// the empty state turned out to be, and the empty state held two defects.
// The fourth state, and the first one every visit passes through. The
// skeleton is aria-hidden — correct, three empty cards are not worth reading
// aloud — which left nothing at all to say content was on its way.
describe("while the data is still coming", () => {
  it("tells someone who cannot see the skeleton that it is loading", async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: STATE,
    });
    // Held open long enough to observe. Without the delay the load wins the
    // race on a fast machine and the assertion reads an already-loaded page.
    await context.route("**/api/**", async (route) => {
      if (/auth|session/.test(route.request().url())) return route.continue();
      await new Promise((r) => setTimeout(r, 2500));
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/board`);

    await page.waitForSelector(".zui-skeleton");
    const announced = await page.evaluate(() =>
      [...document.querySelectorAll('[role="status"]')]
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean),
    );
    expect(
      announced.join(" "),
      "the skeleton is aria-hidden and nothing else says anything is happening",
    ).toMatch(/loading/i);
    await context.close();
  }, 180_000);
});

describe("when the data does not arrive", () => {
  /** A page whose API calls all fail, session aside. */
  async function broken(width = 1440): Promise<Page> {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      storageState: STATE,
    });
    await context.addInitScript({ content: AXE });
    await context.route("**/api/**", (route) =>
      /auth|session/.test(route.request().url())
        ? route.continue()
        : route.fulfill({
            status: 500,
            contentType: "application/json",
            body: '{"error":"boom"}',
          }),
    );
    return context.newPage();
  }

  it("says so, offers a way back, and is readable while doing it", async () => {
    const page = await broken();
    const failures: string[] = [];
    for (const path of ["/board", "/overview", "/insights", "/cv"]) {
      await page.goto(BASE + path);
      await page.waitForSelector("main, .content");
      await animationsSettled(page);

      const retry = await page
        .getByRole("button", { name: /retry|try again/i })
        .count();
      if (!retry) failures.push(`${path}: no way to retry`);

      const violations = await axeViolations(page);
      if (violations.length) failures.push(`${path}: ${violations.join(", ")}`);
    }
    expect(failures).toEqual([]);
    await page.context().close();
  }, 180_000);

  it("does not claim the account is empty", async () => {
    // The failure #597 fixed: a board that could not load drew "Nothing
    // tracked yet" over an account with fifteen applications in it, and
    // offered to load sample data.
    const page = await broken();
    await page.goto(`${BASE}/board`);
    await page.waitForSelector("main, .content");

    // Dismissing the banner is part of the reproduction, not incidental. The
    // original defect was that a dismissed error left the board's own empty
    // state behind it — and a version of this test that skipped the dismiss
    // passed with the fix removed, which is the only reason it is here.
    const dismiss = page.locator(".error-dismiss");
    if (await dismiss.count()) await dismiss.first().click();
    await animationsSettled(page);

    const text = await page.locator("main, .content").first().innerText();
    expect(
      text,
      "a failed load is being reported as an account with nothing in it",
    ).not.toMatch(/nothing tracked yet|sample data/i);
    await page.context().close();
  }, 180_000);
});

describe("the journey a person actually takes", () => {
  it("adds an application and it is still there after a reload", async () => {
    const page = await signedIn();
    await page.goto(`${BASE}/board`);
    // The board's own chrome, not a card: a fresh database has no
    // applications, and waiting for one is how this passed on a developer
    // machine and timed out in CI.
    await page.waitForSelector(".board-bar, .bottombar");

    await page.keyboard.press("n");
    await page.waitForSelector('[aria-modal="true"]');
    // By its label, not by type: neither field in the dialog declares one,
    // and the first input is the paste-a-link box rather than the title.
    await page.getByLabel("Title", { exact: true }).fill("E2E Platform Engineer");
    await page.locator('[aria-modal="true"] button[type=submit]').click();
    await page.waitForSelector('[aria-modal="true"]', { state: "detached" });

    // The board, not wherever the save routed to — and after a reload, which
    // is what proves the row reached D1 rather than React state.
    await page.goto(`${BASE}/board`);
    await page.waitForSelector(".board-bar, .bottombar");
    await expect
      .poll(() => page.getByText("E2E Platform Engineer").count(), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);
    await page.context().close();
  }, 120_000);

  it("keeps the board usable at a phone width", async () => {
    // 390px is where the bottom bar's labels are display:none, which is where
    // the accessible-name defect lived and where jsdom cannot follow.
    const page = await signedIn(390);
    await page.goto(`${BASE}/board`);
    await page.waitForSelector(".bottombar");

    const names = await page.evaluate(() =>
      [...document.querySelectorAll(".bottombar-slot")].map(
        (el) => (el.getAttribute("aria-label") || el.textContent || "").trim(),
      ),
    );
    expect(names.every((n) => n.length > 0), `a bottom bar control has no name: ${JSON.stringify(names)}`).toBe(true);
    await page.context().close();
  }, 120_000);
});

describe("what a browser can judge and jsdom cannot", () => {
  // Every signed-in route, both widths, in two contexts rather than twelve:
  // launching a context per assertion was most of the suite's runtime.
  for (const width of [1440, 390] as const) {
    it(`every page is clean at ${width}px`, async () => {
      const page = await signedIn(width);
      const failures: string[] = [];
      // No hardcoded application id: CI starts from an empty database, where
      // /board/9001 is a dead deep link that redirects to the board with a
      // toast — and the toast, caught mid-fade, read as a contrast failure.
      // A real application is opened by clicking one, in behaviour.spec.
      for (const path of [
        "/board",
        "/overview",
        "/insights",
        "/feed",
        "/companies",
        "/people",
        "/cv",
        "/settings",
      ]) {
        await page.goto(BASE + path);
        await page.waitForSelector("main, .content");
        const violations = await axeViolations(page);
        if (violations.length) failures.push(`${path}: ${violations.join(", ")}`);
      }
      expect(failures).toEqual([]);
      await page.context().close();
    }, 180_000);
  }

  it("the pages a stranger can reach are clean too", async () => {
    // No session: the sign-in page and the public share link. Both were
    // missing a main landmark until #608 and #610, and both are the first
    // thing someone sees.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript({ content: AXE });
    const page = await context.newPage();
    const failures: string[] = [];
    for (const path of ["/", "/shared/demo-share-token"]) {
      await page.goto(BASE + path);
      await page.waitForSelector("main");
      const violations = await axeViolations(page);
      if (violations.length) failures.push(`${path}: ${violations.join(", ")}`);
    }
    expect(failures).toEqual([]);
    await context.close();
  }, 180_000);

  it("a dialog is clean while it is open", async () => {
    // Only reachable with something on screen: axe over a page at rest never
    // sees the notification list, which is where a defect sat until #608.
    const page = await signedIn();
    await page.goto(`${BASE}/board`);
    await page.waitForSelector(".bottombar");

    await page.keyboard.press("n");
    await settled(page, '[aria-modal="true"]');
    expect(await axeViolations(page), "the quick-add dialog").toEqual([]);
    await page.keyboard.press("Escape");

    await page.click('button[aria-label^="Notifications"]');
    await settled(page, ".zui-notification-panel");
    expect(await axeViolations(page), "the notification panel").toEqual([]);
    await page.context().close();
  }, 180_000);
});
