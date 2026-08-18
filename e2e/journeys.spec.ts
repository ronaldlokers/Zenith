import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BASE, STATE } from "./setup";

// The two journeys #598 and #618 fixed, neither of which had browser
// coverage. Both are about not losing work, and both were reported from use
// rather than found by a test.
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);
afterAll(async () => {
  await browser?.close();
});

/**
 * The confirm dialog, not the form behind it. Both carry a Cancel button, so
 * an unscoped locator matches two elements and Playwright refuses it.
 */
function confirmDialog(page: import("playwright").Page) {
  return page.locator('[aria-modal="true"]').filter({ hasText: /discard/i });
}

async function open(title: string) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    storageState: STATE,
  });
  const page = await ctx.newPage();
  const made = await page.request.post(`${BASE}/api/applications`, {
    data: { title, role_type: "other" },
  });
  const app = (await made.json()) as { id: number };
  await page.goto(`${BASE}/board/${app.id}`);
  await page.waitForSelector(".bottombar");
  return { ctx, page, id: app.id };
}

// Which guard this exercises, established by falsifying both: Escape on the
// detail page (detail.tsx), not the navigation guard in App.tsx. Bypassing
// App's leaveGuarded leaves these passing; bypassing the Escape handler fails
// them. Worth stating, because the two produce the same dialog and it is easy
// to assume a test covers whichever one you were thinking about.
describe("leaving an edit form with unsaved changes", () => {
  it("asks first, and keeps the edits when the answer is no", async () => {
    // #598. The form holds around twenty fields, and Escape used to discard
    // them silently in the modal and do nothing on the page.
    const { ctx, page } = await open("E2E Unsaved Edits");
    await page.getByRole("button", { name: /^Edit$/ }).click();
    const title = page.locator("form input").first();
    await title.fill("E2E Unsaved Edits CHANGED");

    await page.keyboard.press("Escape");
    await confirmDialog(page)
      .getByRole("button", { name: /^Confirm$/ })
      .waitFor({ timeout: 10_000 });
    await confirmDialog(page).getByRole("button", { name: /^Cancel$/ }).click();

    // Declining keeps both the form and what was typed into it.
    expect(
      await page.locator("form input").first().inputValue(),
      "the edits were discarded despite answering no",
    ).toBe("E2E Unsaved Edits CHANGED");
    await ctx.close();
  }, 180_000);

  it("lets go when the answer is yes, without saving", async () => {
    const { ctx, page, id } = await open("E2E Discarded Edits");
    await page.getByRole("button", { name: /^Edit$/ }).click();
    await page.locator("form input").first().fill("E2E Discarded Edits CHANGED");

    await page.keyboard.press("Escape");
    await confirmDialog(page).getByRole("button", { name: /^Confirm$/ }).click();
    await page.waitForTimeout(1000);

    // The form is gone and nothing was written: a discard that silently saved
    // would be the same defect wearing the opposite label.
    expect(await page.locator("form input").count()).toBe(0);
    const row = await page.request
      .get(`${BASE}/api/applications`)
      .then((r) => r.json() as Promise<{ id: number; title: string }[]>);
    expect(row.find((a) => a.id === id)?.title).toBe("E2E Discarded Edits");
    await ctx.close();
  }, 180_000);
});

// Not covered here: #618, the undo button a burst of toasts could take away.
//
// The rule is a pure function of the toast stack — evict the oldest toast
// with no undo on it, and only fall back to the oldest of all when every one
// carries an undo — and it is tested where it lives, in
// src/toast-queue.test.tsx. Driving it through the UI needs three
// informational toasts in a row, and the actions that looked like they would
// emit them do not: pinning emits nothing at all, and a status change emits
// "Moved to Applied" with an Undo on it, which is the kind being protected
// rather than the kind doing the crowding.
//
// Left out rather than approximated with undo-carrying toasts, which would
// exercise the fallback branch while claiming to cover the main one.
