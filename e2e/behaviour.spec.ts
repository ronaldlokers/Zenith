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

describe("the admin user list", () => {
  it("groups each account's actions with that account", async () => {
    // "Remove" deletes an account. The buttons carry per-user aria-labels, so
    // the screen-reader path was already unambiguous — the visual one was not:
    // measured, the gap from a name to its own actions was 8px and from those
    // actions to the *next* name 6px, so by proximity the destructive control
    // grouped with the account it would not delete.
    //
    // Asserted as a comparison rather than against fixed numbers: what matters
    // is that a row holds together more tightly than rows separate, whatever
    // the spacing scale becomes.
    const page = await board(360);

    // A second account, so there is something to confuse. Fixed address and a
    // tolerated failure, because e2e setup does not delete users and this runs
    // repeatedly against the same local database.
    // Two, not one. The signed-in admin's own row has no actions — you cannot
    // remove yourself — so with a single invitee the only adjacent pair is
    // (self, other) and there is nothing to compare. The first version made
    // one account and measured nothing; it passed locally, where earlier runs
    // had left extra users behind, and failed on CI's clean database.
    const created = await page.evaluate(async () => {
      const make = async (n: number) => {
        const res = await fetch("/api/auth/admin/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `e2e-admin-row-${n}@example.com`,
            password: "e2e-admin-row-password",
            name: `E2E Admin Row ${n}`,
          }),
        });
        return `${res.status} ${(await res.text()).slice(0, 120)}`;
      };
      return [await make(1), await make(2)].join(" | ");
    });
    // Not swallowed. The first version of this did `.catch(() => {})`, and on
    // CI's fresh database the account was never made — so the measurement had
    // one row and nothing to compare. The vacuity guard below caught it, but
    // the failure said "no pair of rows" rather than why, which is a slower
    // way to learn the same thing. A duplicate is fine on a re-run; anything
    // else should say what happened.
    // Not swallowed. The first version did `.catch(() => {})`, so a failed
    // create surfaced only as "no pair of rows", which is a slower way to
    // learn the same thing.
    //
    // "already exists" is a 400 here, and it is the normal answer on every run
    // after the first — e2e setup deletes applications, not users. Rejecting
    // all 4xx made this pass on CI's clean database and fail the second time
    // anyone ran it locally, which is the same local-state trap in reverse.
    for (const line of created.split(" | ")) {
      expect(line, "could not create the extra accounts").toMatch(
        /^2\d\d |already exists/i,
      );
    }

    await page.goto(`${BASE}/admin`);
    await page.waitForLoadState("networkidle");
    await page.waitForSelector("li.admin-user .admin-user-actions");

    const gaps = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("li.admin-user")];
      const withActions = rows.filter((r) => r.querySelector(".admin-user-actions"));
      const intra = withActions.map((r) => {
        const n = r.querySelector(".admin-user-id")!.getBoundingClientRect();
        const a = r.querySelector(".admin-user-actions")!.getBoundingClientRect();
        return a.top - n.bottom;
      });
      const between: number[] = [];
      for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1].querySelector(".admin-user-actions");
        if (!prev) continue;
        between.push(
          rows[i].querySelector(".admin-user-id")!.getBoundingClientRect().top -
            prev.getBoundingClientRect().bottom,
        );
      }
      return { intra, between, rows: rows.length };
    });

    expect(gaps.rows, "needs two accounts to be ambiguous about").toBeGreaterThan(1);
    expect(gaps.between.length, "no pair of rows to compare").toBeGreaterThan(0);
    expect(
      Math.max(...gaps.intra),
      `actions sit closer to the next account than to their own (${Math.max(...gaps.intra)} vs ${Math.min(...gaps.between)})`,
    ).toBeLessThan(Math.min(...gaps.between));
  });
});

describe("reflow at 320px", () => {
  it("does not make the page scroll sideways", async () => {
    // WCAG 1.4.10: content has to reflow into a 320px viewport without a
    // horizontal scrollbar — that width is 1280px at 400% zoom, which is how
    // someone who needs large text actually reads this.
    //
    // The dashboard failed it. A company name in the "Moved this week" list
    // inherited `white-space: nowrap` from the rule that truncates the *other*
    // rows, but those rows wrap their name in a .side-co-name child for the
    // ellipsis to act on and these render bare text — so there was nothing to
    // truncate and the name ran straight past the viewport: span.side-co
    // scrollWidth 364 in a 257px box, document at 395.
    //
    // Asserted on the document rather than per element on purpose. The board's
    // stage strip is a deliberate horizontal scroller and its own scrollWidth
    // exceeds its width by design; what must never happen is the *page*
    // scrolling sideways.
    const page = await board(320);

    // Seeded here, not assumed. The name that first exposed this was left in
    // the local database by an earlier run; e2e setup deletes E2E rows, so a
    // test relying on it passes with the fix removed — which is exactly what
    // the first version of this did.
    await page.evaluate(async () => {
      const post = (url: string, body: unknown) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      const company = (await post("/api/companies", {
        name: "E2E Interminably Long Talent Partners International Consolidated",
      })) as { id: number };
      const app = (await post("/api/applications", {
        title: "E2E Reflow Target",
        company_id: company.id,
        status: "interested",
      })) as { id: number };
      // A status change is what puts the row in "Moved this week", which is
      // the list whose company name did not wrap.
      await fetch(`/api/applications/${app.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "applied" }),
      });
    });

    for (const route of ["/", "/board", "/cv", "/insights"]) {
      await page.goto(`${BASE}${route}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      const size = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(
        size.scroll,
        `${route} scrolls sideways at 320px (${size.scroll} > ${size.client})`,
      ).toBeLessThanOrEqual(size.client + 1);
    }
  });
});

describe("the job title the detail pane focuses", () => {
  it("is not ringed like an editable field", async () => {
    // The two paths that actually paint one. Chromium's :focus-visible
    // heuristic declines on a mouse click but matches a keyboard activation
    // and a cold deep link — so a keyboard user saw a stray box on every card
    // open, and so did anyone following a link straight to an application.
    //
    // Reading outlineStyle rather than screenshotting: the ring's presence is
    // the defect, and a computed style says so without a pixel baseline to
    // maintain.
    const page = await board();
    await addApplication(page, "E2E Ring Target");
    const id = await page.locator("[data-card-id]").first().getAttribute("data-card-id");

    const ring = async () => {
      await page.waitForSelector(".detail-pane h2");
      await page.waitForFunction(
        () => document.activeElement?.tagName === "H2",
        undefined,
        { timeout: 10_000 },
      );
      return page.evaluate(
        () => getComputedStyle(document.querySelector(".detail-pane h2") as HTMLElement).outlineStyle,
      );
    };

    await page.locator("[data-card-id]").first().focus();
    await page.keyboard.press("Enter");
    expect(await ring(), "opening a card from the keyboard rings the title").toBe("none");

    await page.goto(`${BASE}/board/${id}`);
    expect(await ring(), "a deep link to an application rings its title").toBe("none");
  });
});

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

    // The focus move is right; the ring it painted was not. The global
    // :focus-visible rule drew a 2px --accent-ink outline around a heading
    // nobody can act on, which reads as a broken editable field.
    //
    // Measured in Chromium rather than reasoned about, because whether
    // :focus-visible matches a programmatic focus is a UA heuristic:
    //
    //   click a card      none    (the heuristic declines — this path)
    //   Enter on a card   solid 2px
    //   open /board/:id   solid 2px
    //
    // The card above was clicked, so this path never showed a ring and cannot
    // prove the fix. The deep-link path below is the one that reproduced.
    const ringAfterClick = await page.evaluate(
      () => getComputedStyle(document.querySelector(".detail-pane h2") as HTMLElement).outlineStyle,
    );
    expect(ringAfterClick, "the mouse path changed behaviour").toBe("none");

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

describe("a write that fails while the session is gone", () => {
  // "+ Add job" belongs to the board's empty state, so a locator built on it
  // passes alone and fails in a full run, where earlier specs have left
  // applications behind. The shortcut works in both, but pressed straight
  // after a navigation it lands before its handler is mounted — so press it
  // until it takes.
  async function openQuickAdd(page: Page) {
    await expect
      .poll(async () => {
        await page.keyboard.press("n");
        return page.locator('[aria-modal="true"]').count();
      }, { timeout: 20_000 })
      .toBeGreaterThan(0);
  }

  it("keeps the typed job across the reload it tells you to do", async () => {
    // The session can expire with the dialog open, and the tab has no way to
    // know until it writes. That part was already handled: the 401 leaves the
    // dialog up, keeps the fields, and says so.
    //
    // What it says is "reload the page and sign in again" — which discards
    // the typed job, because it lived only in component state. The advice was
    // sound and destroyed the thing it was protecting.
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: STATE,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/board`);
    await page.waitForSelector(".bottombar");

    await page.keyboard.press("n");
    await page.waitForSelector('[aria-modal="true"]');
    await page.getByLabel("Title", { exact: true }).fill("E2E Draft Survives");

    // The 401 is served here rather than by clearing the cookie. Clearing it
    // mid-write aborts a request wrangler dev does not survive: it answered
    // the next document with its own crash page and then stopped listening,
    // which failed every spec after this one with ERR_CONNECTION_REFUSED.
    // The code under test is the client's, and it sees the same response
    // either way.
    await page.route("**/api/applications", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });
    await page.locator('[aria-modal="true"] button[type=submit]').click();
    await page.waitForFunction(
      () => /expired|verlopen/i.test(document.body.innerText),
      undefined,
      { timeout: 20_000 },
    );
    await page.unroute("**/api/applications");

    // Do exactly what the message asks: start again on a fresh document.
    // A new document on the same origin, so sessionStorage carries across
    // exactly as it does for someone who reloads and signs back in.
    await page.goto(`${BASE}/board`);
    await page.waitForSelector(".bottombar");
    // The visible control rather than the "n" shortcut: pressed straight after
    // a reload the key lands before its handler is mounted, which fails the
    // test for a reason that has nothing to do with drafts.
    await openQuickAdd(page);

    const title = await page
      .getByLabel("Title", { exact: true })
      .inputValue();
    const note = await page
      .locator('[aria-modal="true"] [role="status"]')
      .first()
      .innerText()
      .catch(() => "");

    // One-shot: closing and reopening must not resurrect it, or every
    // abandoned job comes back the next time the dialog is opened.
    await page.keyboard.press("Escape");
    await page.waitForSelector('[aria-modal="true"]', { state: "detached" });
    await openQuickAdd(page);
    const second = await page
      .getByLabel("Title", { exact: true })
      .inputValue();

    await ctx.close();
    expect(title, "the typed job did not survive the reload").toBe(
      "E2E Draft Survives",
    );
    expect(note, "nothing told the person their draft was kept").toMatch(
      /kept|bewaard/i,
    );
    expect(second, "the draft came back a second time").toBe("");
  }, 180_000);
});

describe("the network view's tabs", () => {
  it("points the tablist at a panel that is really there", async () => {
    // #517 left this view with a tablist and no tabpanel: the tabs announced
    // themselves as controlling something that did not exist in the
    // accessibility tree. Checked in a browser rather than jsdom because the
    // association is only worth anything once both halves are rendered by the
    // real app.
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: STATE,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/companies`);
    await page.waitForSelector('[role="tablist"]');

    const active = page.locator('[role="tab"][aria-selected="true"]');
    const controls = await active.getAttribute("aria-controls");
    expect(controls, "the active tab points at no panel").toBeTruthy();

    const panel = page.locator(`#${controls}`);
    expect(await panel.count(), "the panel the tab names is not rendered").toBe(1);
    expect(await panel.getAttribute("role")).toBe("tabpanel");
    // The panel names itself with the tab, which is what a screen reader
    // reads out when focus lands inside it.
    expect(await panel.getAttribute("aria-labelledby")).toBe(
      await active.getAttribute("id"),
    );

    // The inactive tab must not point at anything, since its panel is not
    // rendered.
    const inactive = page.locator('[role="tab"][aria-selected="false"]').first();
    expect(await inactive.getAttribute("aria-controls")).toBeNull();
    await ctx.close();
  }, 180_000);

  it("changes the selected tab with the arrow keys", async () => {
    // Asserts selection, not focus. Measured: with the explicit focus move
    // deleted from tablist-keys.ts, this view still ends with focus on the
    // newly selected tab — these tabs are routes, so the re-render comes from
    // the router and the browser arrives at the same end state on its own.
    // A focus assertion here would therefore pass either way, which is worth
    // saying rather than leaving a test that looks like it covers something
    // it cannot. The focus move is covered in
    // src/components/tablist-keyboard.test.tsx, where removing it fails.
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState: STATE,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/companies`);
    await page.waitForSelector('[role="tablist"]');

    const before = await page
      .locator('[role="tab"][aria-selected="true"]')
      .getAttribute("id");
    await page.locator('[role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      (was) =>
        document.querySelector('[role="tab"][aria-selected="true"]')?.id !== was,
      before,
      { timeout: 10_000 },
    );

    const now = await page
      .locator('[role="tab"][aria-selected="true"]')
      .getAttribute("id");
    expect(now, "the arrow key did not change the selected tab").not.toBe(before);
    // The panel follows the tab, which is the half a stale aria-controls
    // would break.
    const controls = await page
      .locator('[role="tab"][aria-selected="true"]')
      .getAttribute("aria-controls");
    expect(await page.locator(`#${controls}`).count()).toBe(1);
    await ctx.close();
  }, 180_000);
});

describe("the identity strip on a board card", () => {
  it("truncates a long company with an ellipsis instead of cutting mid-word", async () => {
    // The cell is a flex container so its dividing border stretches full
    // height, and text-overflow does nothing on one — the text inside is an
    // anonymous flex item, not the container's own inline content. So the
    // ellipsis the cell declared never drew and company names clipped
    // mid-word ("SOLACE SYSTEMS · DIE"). jsdom resolves no cascade and has no
    // layout, so only a real browser can tell the fix from the defect.
    const page = await board(1440);

    // A company long enough to overflow the cell at any board width. Created
    // through the app's own API so it carries the session and the same
    // validation a person's input would.
    const company = `E2E Interminably Long Talent Partners International ${Date.now()}`;
    const created = await page.evaluate(async (name) => {
      const post = (url: string, body: unknown) =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then((r) => r.json());
      const c = await post("/api/companies", { name });
      await post("/api/applications", {
        title: "E2E Ellipsis Target",
        company_id: c.id,
        status: "interested",
      });
      return c.id as number;
    }, company);
    expect(created, "the fixture company was not created").toBeTruthy();

    await page.goto(`${BASE}/board`);
    await page.waitForSelector("[data-card-id]");
    const cell = page.locator(".bstrip .bco").filter({ hasText: "Interminably" }).first();
    await cell.waitFor({ timeout: 10_000 });

    const measured = await cell.evaluate((el) => {
      const inner = el.querySelector<HTMLElement>(".strip-text");
      if (!inner) return null;
      const cs = getComputedStyle(inner);
      return {
        display: cs.display,
        textOverflow: cs.textOverflow,
        whiteSpace: cs.whiteSpace,
        overflowing: inner.scrollWidth > inner.clientWidth + 1,
      };
    });

    expect(measured, "no .strip-text inside the company cell").not.toBeNull();
    // Blockified as a flex item, which is what lets it carry the ellipsis at
    // all. Were this flex again, the property would silently do nothing.
    expect(measured!.display, "the truncating child must not be a flex container").toBe("block");
    expect(measured!.textOverflow).toBe("ellipsis");
    expect(measured!.whiteSpace).toBe("nowrap");
    // Without this the assertions above pass on a cell that has nothing to
    // truncate, which is the version of this test that proves nothing.
    expect(measured!.overflowing, "the fixture company did not overflow its cell").toBe(true);

    await page.context().close();
  }, 180_000);
});

describe("the top bar at 200% text on a 320px screen", () => {
  it("compresses instead of forcing the page sideways", async () => {
    // WCAG 1.4.10 Reflow. .bottombar carries this fix already, with the
    // reasoning in its own comment: a grid item's min-width defaults to auto,
    // so a 1fr track refuses to shrink below its content. .top has the same
    // three-track layout and fixed 38px corner circles, and never got it — so
    // every route scrolled sideways at this size.
    //
    // jsdom cannot see this: it has no layout, so scrollWidth is always 0.
    const ctx = await browser.newContext({
      viewport: { width: 320, height: 700 },
      storageState: STATE,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/feed`);
    await page.waitForSelector(".bottombar");
    // After goto, not addInitScript: that runs before document.documentElement
    // exists, so setting fontSize there silently does nothing and the whole
    // sweep reports clean for the wrong reason.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.waitForTimeout(300);

    const m = await page.evaluate(() => {
      const top = document.querySelector(".top") as HTMLElement;
      const d = document.documentElement;
      return {
        topOverflow: top.scrollWidth - top.clientWidth,
        pageOverflow: d.scrollWidth - d.clientWidth,
        // Proves the zoom actually applied — without this the assertions
        // below pass on an un-zoomed page, which is the version of this test
        // that checks nothing.
        rootFontSize: getComputedStyle(d).fontSize,
      };
    });

    expect(m.rootFontSize, "the 200% zoom did not apply").not.toBe("16px");
    expect(m.topOverflow, "the top bar overflows its own box").toBeLessThanOrEqual(0);
    expect(m.pageOverflow, "the page scrolls sideways on /feed").toBeLessThanOrEqual(0);
    await ctx.close();
  }, 180_000);
});

describe("the card menu when focus leaves it", () => {
  it("closes on Tab instead of leaving a live backdrop over the page", async () => {
    // The WAI-ARIA menu-button pattern requires Tab to dismiss. It did not:
    // the menu and its position:fixed backdrop stayed mounted while focus
    // moved on, so the next click anywhere hit the invisible catcher instead
    // of the control it was aimed at.
    //
    // Only a browser can see this. jsdom has no tab order, so nothing in the
    // component suite can move focus off the last item the way a person does.
    const page = await board(1440);
    await addApplication(page, "E2E Menu Focus");

    await page.locator(".zui-cardmenu-btn").first().focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[role="menu"]');
    expect(await page.locator(".zui-cardmenu-backdrop").count()).toBe(1);

    // Enough presses to walk the items and fall off the end. The popup is
    // portalled to <body>, past everything in tab order, so focus goes to
    // nothing before wrapping round to the top bar.
    for (let i = 0; i < 10; i++) {
      if ((await page.locator('[role="menu"]').count()) === 0) break;
      await page.keyboard.press("Tab");
      await page.waitForTimeout(80);
    }

    expect(await page.locator('[role="menu"]').count(), "the menu survived tabbing out of it").toBe(0);
    expect(
      await page.locator(".zui-cardmenu-backdrop").count(),
      "the full-page click-catcher outlived the menu",
    ).toBe(0);
    await page.context().close();
  }, 180_000);

  it("stays open when a submenu replaces its items", async () => {
    // The regression the fix could easily cause. Choosing "Move to stage"
    // remounts the items, so focus passes through the document for a frame —
    // a focusout/relatedTarget check reads that as leaving and closes the
    // menu the moment it is opened. focusin cannot, because nothing receives
    // focus during the gap.
    const page = await board(1440);
    await addApplication(page, "E2E Menu Submenu");

    await page.locator(".zui-cardmenu-btn").first().focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[role="menu"]');
    await page.locator('[role="menu"] [role="menuitem"]').first().click();
    await page.waitForTimeout(300);

    expect(
      await page.locator('[role="menu"]').count(),
      "opening the submenu closed the menu",
    ).toBe(1);
    // And focus landed inside it, which is what keeps the keyboard usable.
    const inside = await page.evaluate(() =>
      document.querySelector(".zui-cardmenu-pop")?.contains(document.activeElement) ?? false,
    );
    expect(inside, "focus left the popup when the submenu opened").toBe(true);
    await page.context().close();
  }, 180_000);
});

describe("target size (WCAG 2.5.8)", () => {
  it("keeps the stage-rail step at least 24px tall for a mouse, not only pointer: coarse", async () => {
    // The rail's touch fix is `@media (pointer: coarse) { min-height: 44px }`
    // — real on a phone, absent on a mouse or trackpad, and 2.5.8's 24px
    // floor is not touch-specific. Measured before this fix: 88x20.
    const page = await board(1440);
    await addApplication(page, "E2E Target Size Rail");
    await page.locator("[data-card-id]").first().click();
    await page.waitForURL(/\/board\/\d+/);
    await page.waitForSelector(".detail-pane h2");

    const rect = await page.evaluate(() => {
      const el = document.querySelector(".detail-rail-step");
      return el ? el.getBoundingClientRect().toJSON() : null;
    });
    expect(rect, ".detail-rail-step did not render on the detail page").not.toBeNull();
    expect(
      rect!.height,
      "stage-rail step is under the 24px target-size floor for a mouse pointer",
    ).toBeGreaterThanOrEqual(24);
    await page.context().close();
  }, 120_000);

  it("gives the CV delete-variant control real spacing instead of a 24px box", async () => {
    // .cv-rail-del stays under 24px on both axes (13x21) — it is the "×"
    // glyph, not a label a wider box would help — so 2.5.8 only passes it
    // through the spacing exception: a 24px-diameter circle centred on the
    // target must not reach the real box of its neighbour, the row's own
    // .cv-rail-step. That circle extends (12 - halfWidth) past the target's
    // own edge. Before this fix the row's flex gap (3.2px) was the only
    // separation and measured short of that by a good margin — this was not
    // actually exempt despite an earlier read of the audit's "75.7px to the
    // nearest target" saying otherwise, which measured the wrong pair. The
    // margin below is what closes the real gap.
    const page = await board(1440);
    await page.goto(`${BASE}/cv`);
    await page.waitForSelector(".cv-rail");
    await page.locator(".cv-rail-add").click();
    await page.getByPlaceholder("Version name (e.g. Backend-focused)").fill("E2E Target Size Variant");
    await page.getByRole("button", { name: "Save current" }).click();
    await page.waitForSelector(".cv-rail-del");

    const measured = await page.evaluate(() => {
      const del = document.querySelector(".cv-rail-del")?.getBoundingClientRect();
      const row = document.querySelector(".cv-rail-del")?.closest(".cv-rail-row");
      const step = row?.querySelector(".cv-rail-step")?.getBoundingClientRect();
      if (!del || !step) return null;
      const gap = Math.max(step.left - del.right, del.left - step.right);
      const needed = 12 - del.width / 2;
      return { gap, needed };
    });
    expect(measured, ".cv-rail-del or its row neighbour did not render").not.toBeNull();
    expect(
      measured!.gap,
      "the gap to the nearest target is too small for the WCAG 2.5.8 spacing exception",
    ).toBeGreaterThanOrEqual(measured!.needed);
    await page.context().close();
  }, 120_000);
});
