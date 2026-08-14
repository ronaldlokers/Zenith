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
