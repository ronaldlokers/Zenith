import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// App.tsx lazy()-loads seven tab bodies behind Suspense so only the active
// tab's chunk downloads. Insights was a static import sitting one line above
// them, so its 544 lines — and calendar.tsx, which only Insights imports —
// compiled into the main entry that every visitor downloads before seeing
// anything, to render a tab most sessions never open.
//
// Dashboard is eager on purpose: it is the default landing view, and its
// comment says so. Nothing said anything about Insights.
//
// Asserted against the built output rather than the import statement, because
// the import statement is not the thing that was wrong — a lazy() that some
// other module re-exports eagerly would still land in the entry chunk. CI runs
// `npm run build` before the tests, so dist is there.
const ROOT = new URL("..", import.meta.url).pathname;
const ASSETS = join(ROOT, "dist/client/assets");

// A string only that module's code can produce.
const MARKERS: Record<string, string> = {
  insights: "insights.headlineNumbers",
  settings: "settings.dangerZone",
};

function chunks(): { name: string; body: string }[] {
  expect(
    existsSync(ASSETS),
    "dist/client/assets is missing — run `npm run build` first",
  ).toBe(true);
  return readdirSync(ASSETS)
    .filter((f) => f.endsWith(".js"))
    .map((name) => ({ name, body: readFileSync(join(ASSETS, name), "utf8") }));
}

const entryOf = (all: { name: string; body: string }[]) => {
  const entry = all.find((c) => /^index-/.test(c.name));
  expect(entry, "no index-*.js entry chunk in the build").toBeTruthy();
  return entry!;
};

describe("what the first page load has to download", () => {
  it("does not carry the Insights tab", () => {
    const all = chunks();
    const entry = entryOf(all);
    expect(
      entry.body.includes(MARKERS.insights),
      `${entry.name} contains Insights; it should be its own chunk`,
    ).toBe(false);
  });

  it("still ships Insights somewhere, in a chunk of its own", () => {
    // Without this the first test passes if the marker is simply gone —
    // renamed copy, a deleted feature, a broken build.
    const all = chunks();
    const carrying = all.filter((c) => c.body.includes(MARKERS.insights));
    expect(carrying.length, "no chunk contains Insights at all").toBeGreaterThan(0);
    expect(carrying.every((c) => !/^index-/.test(c.name))).toBe(true);
  });

  it("keeps the other lazy tabs out of it too", () => {
    // The check that says the marker approach works: Settings has always been
    // lazy, so if this ever fails the test is measuring the wrong thing.
    const entry = entryOf(chunks());
    expect(entry.body.includes(MARKERS.settings)).toBe(false);
  });
});
