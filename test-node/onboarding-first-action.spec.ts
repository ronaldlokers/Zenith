import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The first-run overview stacks the onboarding checklist directly above the
// untracked hero, and both open the same dialog. The checklist said "Add your
// first job" and the hero said "Add your first application", so one action
// read as two — and PRODUCT.md's terminology section settles which noun:
// "application for a tracked role".
//
// Pinned as an equality between the two strings rather than by matching
// wording, so rephrasing the call to action stays free as long as both
// surfaces are rephrased together.
const ROOT = new URL("..", import.meta.url).pathname;
const LOCALES = ["en", "nl"] as const;

const load = (locale: string) =>
  JSON.parse(readFileSync(`${ROOT}src/locales/${locale}.json`, "utf8"));

describe("the first action a new account is offered", () => {
  it.each(LOCALES)("has one name in %s, not two", (locale) => {
    const t = load(locale);
    expect(
      t.onboarding.firstJob,
      "the checklist and the hero name the same action, on the same screen, opening the same dialog",
    ).toBe(t.today.addFirst);
  });

  it("loads the sample data rather than routing to where the button lives", () => {
    // A wiring check, not a render: there is no App-level test harness, and
    // the handler is defined inline in the props object. What matters is that
    // the link the copy describes as loading does not instead navigate — the
    // bait-and-switch the card is about.
    const app = readFileSync(`${ROOT}src/App.tsx`, "utf8");
    const handler = app.slice(app.indexOf("onLoadSample:"));
    const body = handler.slice(0, handler.indexOf("\n  };"));
    expect(body, "onLoadSample never calls loadSampleData").toContain("loadSampleData");
    expect(
      body,
      "onLoadSample still navigates to Settings, which is what the copy promised not to do",
    ).not.toMatch(/navigate\(/);
  });
});
