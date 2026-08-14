import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, STATE } from "./setup";

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

// Not covered here, deliberately. Two more journeys were written for the
// unsaved-edits prompt (#598) and undo surviving a burst of toasts (#618),
// and both were driving controls that do not exist where I assumed: the
// detail page has no Edit button among its controls, and the board's card
// menu offers Archive rather than Delete — deleteWithUndo belongs to
// companies and people. Both tests failed on their own selectors rather than
// on the behaviour, which makes them worse than nothing: a red suite that
// says something is broken when it is not teaches people to skip it. They
// want a pass over the real affordances first.
