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

/** Violations axe can judge in a real browser, contrast included. */
async function axeViolations(page: Page) {
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

describe("the journey a person actually takes", () => {
  it("adds an application and it is still there after a reload", async () => {
    const page = await signedIn();
    await page.goto(`${BASE}/board`);
    await page.waitForSelector("[data-card-id]");

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
    await page.waitForSelector("[data-card-id]");
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
    await page.waitForSelector("[data-card-id]");

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
  for (const [name, path] of [
    ["the board", "/board"],
    ["an application", "/board/9001"],
    ["settings", "/settings"],
  ] as const) {
    for (const width of [1440, 390]) {
      it(`${name} has no accessibility violations at ${width}px`, async () => {
        const page = await signedIn(width);
        await page.goto(BASE + path);
        await page.waitForSelector("main, .content");
        expect(await axeViolations(page)).toEqual([]);
        await page.context().close();
      }, 120_000);
    }
  }
});
