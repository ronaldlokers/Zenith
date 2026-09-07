import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every tab body in App.tsx is lazy()-loaded behind the Suspense boundary in
// <main> so only the active tab's chunk downloads (perf review, #446/#700).
// Dashboard is the one deliberate exception — it's the default landing view,
// per the comment above the lazy() block in App.tsx — and nothing else is
// allowed to be. Nothing else stops a tab body being switched back to a
// static import: the bundle would grow, no other test would fail, and the
// next perf review would file the same card again.
//
// "Tab body" is identified structurally rather than by a hardcoded name
// list, which would rot: routing.ts's `Tab` union is the source of truth for
// which tabs exist, and App.tsx names every tab body's component after its
// tab with a `Tab`/`Page` suffix (DashboardTab, InsightsTab, ..., AdminPage,
// SettingsPage) and renders it as `<Name` somewhere in the file. Matching
// that suffix convention and cross-checking the count against the Tab union
// means a renamed or added tab is still caught — if the convention breaks,
// the count assertion fails instead of the guard silently checking nothing.
const ROOT = new URL("..", import.meta.url).pathname;
const APP_TSX = readFileSync(join(ROOT, "src/App.tsx"), "utf8");
const ROUTING_TS = readFileSync(join(ROOT, "src/routing.ts"), "utf8");

// The deliberate exception, per the comment above App.tsx's lazy() block.
const EAGER_EXCEPTION = "DashboardTab";

function tabValues(): string[] {
  const union = ROUTING_TS.match(/export type Tab =\s*([\s\S]*?);/);
  expect(union, "src/routing.ts no longer declares `export type Tab`").toBeTruthy();
  return [...union![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
}

function tabBodyComponents(): string[] {
  return [
    ...new Set(
      [...APP_TSX.matchAll(/<([A-Z][A-Za-z0-9]*(?:Tab|Page))\b/g)].map(
        (m) => m[1],
      ),
    ),
  ];
}

function isLazy(name: string): boolean {
  return new RegExp(`const\\s+${name}\\s*=\\s*lazy\\s*\\(`).test(APP_TSX);
}

describe("every tab body reached from App.tsx", () => {
  const components = tabBodyComponents();
  const tabs = tabValues();

  it("is found by the Tab/Page naming convention, one per routed tab", () => {
    // Guards the vacuous pass: a broken parse that finds zero components
    // would otherwise make every assertion below trivially true.
    expect(components.length, "found zero *Tab/*Page components in App.tsx").toBeGreaterThan(0);
    expect(
      components.sort(),
      `expected one *Tab/*Page component per entry in routing.ts's Tab union (${tabs.length} tabs), found: ${components.join(", ")}`,
    ).toEqual(
      [
        "DashboardTab",
        "InsightsTab",
        "PipelineTab",
        "FeedTab",
        "CompaniesTab",
        "ContactsTab",
        "CVTab",
        "AdminPage",
        "SettingsPage",
      ].sort(),
    );
  });

  it("is lazy-loaded, except the one deliberate exception", () => {
    const eager = components.filter((name) => !isLazy(name));
    expect(
      eager.sort(),
      `expected only ${EAGER_EXCEPTION} to be eager; found eager tab body/bodies: ${eager.join(", ") || "(none)"}`,
    ).toEqual([EAGER_EXCEPTION]);
  });

  it.each(components.filter((name) => name !== EAGER_EXCEPTION))(
    "%s is imported lazily",
    (name) => {
      expect(
        isLazy(name),
        `expected "${name}" to be declared as \`const ${name} = lazy(...)\` in src/App.tsx, but it is not — a tab body was switched to a static import, which undoes the route-level code splitting (perf review) and bloats the entry chunk`,
      ).toBe(true);
    },
  );

  it(`${EAGER_EXCEPTION} stays the only sanctioned eager tab body`, () => {
    expect(
      isLazy(EAGER_EXCEPTION),
      `${EAGER_EXCEPTION} is now lazy — update EAGER_EXCEPTION in this spec (or remove it) if that was deliberate`,
    ).toBe(false);
  });
});
