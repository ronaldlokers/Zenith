import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BASE, STATE } from "./setup";

const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");

// Behaviours fixed this session that only exist in a browser. Each was found
// by hand, fixed, and then guarded by a unit test that cannot actually see the
// thing it is named after:
//
//   - focus after a route change (#596) — jsdom has no :focus-visible and no
//     real navigation
//   - the unsaved-edits prompt (#598) — needs a real beforeunload and a real
//     click on a control that navigates
//   - undo surviving a burst of toasts (#618) — needs the timers and the
//     rendered stack
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

async function board(width = 1440): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    storageState: STATE,
  });
  await context.addInitScript({ content: AXE });
  const page = await context.newPage();
  await page.goto(`${BASE}/board`);
  await page.waitForSelector(".bottombar");
  return page;
}

/** Creates one application through the UI and returns its title. */
async function addApplication(page: Page, title: string) {
  await page.keyboard.press("n");
  await page.waitForSelector('[aria-modal="true"]');
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.locator('[aria-modal="true"] button[type=submit]').click();
  await page.waitForSelector('[aria-modal="true"]', { state: "detached" });
  await page.goto(`${BASE}/board`);
  await page.waitForSelector(`[data-card-id]`);
  return title;
}

describe("opening an application", () => {
  it("puts the keyboard on it rather than back at the top", async () => {
    // /board/:id keeps the board's page title, so the shell's own
    // focus-on-title-change never fires for it — the defect #596 fixed.
    const page = await board();
    await addApplication(page, "E2E Focus Target");
    // The card body, which is the control that opens it. Clicking the title
    // text inside it lands on a span and focus ends up somewhere else — the
    // first version of this failed on that rather than on the behaviour.
    await page.locator("[data-card-id]").first().click();

    await page.waitForURL(/\/board\/\d+/);
    // The detail is lazy-loaded, so the URL changes before the component
    // mounts and its effect moves focus. Waiting on the URL alone reads the
    // card that was clicked and calls the fix broken — the same mistake as
    // sampling a dialog mid-animation.
    await page.waitForSelector(".detail-pane h2");
    await page.waitForFunction(
      () => document.activeElement?.tagName === "H2",
      undefined,
      { timeout: 10_000 },
    );
    // The one detail page the suite sees is this one — opened by clicking a
    // real application rather than guessing an id that CI's fresh database
    // does not have.
    const violations = await page.evaluate(async () => {
      const res = await (window as unknown as { axe: { run: (d: Document) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe.run(document);
      return res.violations
        .filter((v) => v.id !== "region")
        .map((v) => `${v.impact} ${v.id} (${v.nodes.length})`);
    });
    expect(violations, "the application detail page").toEqual([]);

    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName,
      text: document.activeElement?.textContent?.trim(),
    }));
    expect(
      focused.tag,
      "focus did not land on the application's own heading",
    ).toBe("H2");
    await page.context().close();
  }, 120_000);
});

// Not covered here: the unsaved-edits prompt (#598) and undo surviving a
// burst of toasts (#618). Both have been attempted and abandoned twice, and
// the note that used to sit here was wrong about why, so it is worth being
// exact.
//
// The controls exist and are visible. The detail page has Edit, Pin, Archive
// and Delete in its ActionBar — an earlier attempt concluded Edit was absent
// from a list of buttons that had been truncated before reaching it. What
// fails is driving them: getByRole with the accessible name matches nothing
// for the ActionBar buttons, and a text-filtered locator still times out on
// the click. Something about how those controls mount is not yet understood,
// and guessing at it a third time is how a suite ends up with a test that
// passes for the wrong reason.
//
// deleteWithUndo does belong to companies and people rather than the board,
// which archives — that part was right.
//
// Left uncovered on purpose. A red test that reports a working feature as
// broken teaches people to stop reading the suite, which costs more than the
// coverage is worth.

describe("losing the connection mid-session", () => {
  it("keeps the app on screen instead of reloading into a browser error", async () => {
    // #633: going offline replaced the document with
    // chrome-error://chromewebdata/ — #root gone, and anything typed gone
    // with it. #634 found why: an offline dynamic import reports the same
    // message as a chunk a deploy removed, so ChunkBoundary reloaded, and a
    // reload cannot fix having no network.
    //
    // #634 said this was not verifiable here, on the grounds that
    // setOffline leaves navigator.onLine true. That was wrong — it flips it,
    // and so does CDP. The earlier reading of `true` came from evaluating on
    // the error page after the navigation had already happened.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: STATE,
    });
    const page = await context.newPage();
    const navigations: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations.push(f.url());
    });

    await page.goto(`${BASE}/board`);
    await page.waitForSelector(".bottombar");
    navigations.length = 0;

    await context.setOffline(true);
    // Provoke a lazy import: that is the fetch that fails offline and the one
    // the boundary used to react to.
    await page
      .getByRole("button", { name: /open the menu/i })
      .click()
      .catch(() => {});
    await page.waitForTimeout(4000);

    const state = await page.evaluate(() => ({
      hasRoot: !!document.getElementById("root"),
      rootLen: document.getElementById("root")?.innerHTML.length ?? 0,
      onLine: navigator.onLine,
    }));
    await context.setOffline(false);
    await context.close();

    expect(
      navigations,
      "the page navigated away — a reload offline lands on the browser's error page",
    ).toEqual([]);
    expect(state.hasRoot, "the document was replaced").toBe(true);
    expect(state.rootLen, "the app rendered nothing").toBeGreaterThan(100);
    // The premise of the guard: the app has to know it is offline for the
    // boundary to decline the reload.
    expect(state.onLine, "the browser never reported being offline").toBe(false);
  }, 180_000);
});

describe("the chunk boundary while offline", () => {
  // #634 stopped the automatic reload from landing on the browser's error
  // page. It left two halves of the same failure untouched, both found by
  // going offline and opening a tab whose chunk was not already loaded.
  async function reachTheBoundary(browser: Browser) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: STATE,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/board`);
    await page.waitForSelector(".bottombar");
    await ctx.setOffline(true);
    await page
      .getByRole("link", { name: /people|compan/i })
      .first()
      .click()
      .catch(() => {});
    await page.waitForSelector(".error", { timeout: 20_000 });
    return { ctx, page };
  }

  it("does not blame a release for what the network did", async () => {
    // The boundary declined to reload *because* it knew the network was gone,
    // and then explained the failure as "a new version was released while you
    // had Zenith open". It had already ruled that cause out.
    const { ctx, page } = await reachTheBoundary(browser);
    const text = await page.locator(".error-text").innerText();
    await ctx.setOffline(false);
    await ctx.close();
    expect(
      text,
      "the offline message names a deploy as the cause",
    ).not.toMatch(/new version|nieuwe versie/i);
    expect(text, "the message does not say what actually happened").toMatch(
      /offline/i,
    );
  }, 180_000);

  it("keeps the app on screen when retry is pressed offline", async () => {
    // The button called window.location.reload() unconditionally — the exact
    // navigation the automatic path refuses to make while offline. Guarding
    // one path and not the other left the defect behind a control whose whole
    // purpose is to be pressed when something is broken.
    const { ctx, page } = await reachTheBoundary(browser);
    const navigations: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations.push(f.url());
    });

    await page.locator(".error-dismiss").click();
    await page.waitForTimeout(3000);

    const state = await page.evaluate(() => ({
      hasRoot: !!document.getElementById("root"),
      rootLen: document.getElementById("root")?.innerHTML.length ?? 0,
      onLine: navigator.onLine,
    }));
    await ctx.setOffline(false);
    await ctx.close();

    expect(
      navigations,
      "retry navigated away — offline that is the browser's error page",
    ).toEqual([]);
    expect(state.hasRoot, "the document was replaced").toBe(true);
    expect(state.rootLen, "the app rendered nothing").toBeGreaterThan(100);
    expect(state.onLine, "the browser never reported being offline").toBe(false);
  }, 180_000);
});
