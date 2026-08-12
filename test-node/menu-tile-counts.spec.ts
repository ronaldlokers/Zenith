import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The shell spec: the menu's first three destinations are "large tiles ...
// carrying icon, label, live count and shortcut". WordmarkMenu has rendered
// the count since it was written — `{d.count != null ? `${d.count} · ` : ""}`
// — and its stories and its component test both pass counts, so Storybook
// showed tiles with numbers on them the whole time. App.tsx simply never
// passed one, so the shipped menu had none.
//
// That is the exact failure the owned-component architecture exists to
// prevent, arriving from the other direction: not a component that renders
// differently in the catalog, but a prop the catalog exercises and the app
// forgets. A component test cannot see it, because the component is right.
//
// This is a source assertion for the same reason test-node/auth-gate.spec.ts
// is: the wiring is what breaks, no test renders <App/>, and rendering the
// whole app to count a digit would be a worse trade than reading the file.
const APP = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("menu tile counts", () => {
  it("passes a count into the destinations the menu renders", () => {
    // The map that builds WordmarkMenu's destinations. Dropping `count:` from
    // it is a one-line edit that removes the numbers with nothing failing.
    const map = APP.match(/destinations=\{navItems\.map\([^}]*\}\)\)\}/s);
    expect(map, "could not find the destinations map in App.tsx").toBeTruthy();
    expect(
      map![0],
      "the menu tiles lose their live counts without this",
    ).toContain("count:");
  });

  it("derives those counts from the applications the screens show", () => {
    // A count the menu invents is worse than no count: it would disagree with
    // the screen it points at. Today's is the dashboard's "N things need you
    // today" (overdue or due, excluding dead), Pipeline's is the open
    // applications the board's strip totals.
    expect(APP).toContain("isOverdue");
    expect(APP).toContain("isDue");
    expect(APP).toContain("isDead");
    expect(APP).toMatch(/overview:\s*liveApps\.filter/);
    expect(APP).toMatch(/pipeline:\s*liveApps\.length/);
  });
});
