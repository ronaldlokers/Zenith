import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// /board/:id is what push notifications, calendar entries, emails and
// bookmarks all point at, and any of them can outlive the row. The board
// used to render instead — dead id still in the address bar — so the tap
// read as "nothing happened" and a refresh repeated it.
//
// The fix is three lines and one of them is load-bearing in a way nothing
// on screen shows: the check is gated on `loading`, because the application
// list arrives after the first render. Ungate it and every healthy deep
// link announces "no longer here" in the moment before its data lands, then
// navigates away from the page it was about to show. That is a worse bug
// than the one being fixed, and it only appears on a slow connection.
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const en = JSON.parse(
  readFileSync(new URL("../src/locales/en.json", import.meta.url), "utf8"),
);
const nl = JSON.parse(
  readFileSync(new URL("../src/locales/nl.json", import.meta.url), "utf8"),
);

describe("dead deep link", () => {
  it("waits for the list before deciding an application is missing", () => {
    const decl = /const missingJob\s*=([\s\S]*?);/.exec(app);
    expect(decl, "the missingJob check went missing").toBeTruthy();
    const condition = decl![1];
    expect(
      condition,
      "without !loading this fires on every deep link before its data arrives",
    ).toContain("!loading");
    expect(condition).toContain("detailIdFromUrl");
    expect(condition).toContain("!routedJob");
  });

  it("canonicalizes the URL rather than leaving the dead id in it", () => {
    // Left in place, the toast fires again on every visit and a refresh
    // repeats the dead end. replace, so Back does not return to it.
    const effect = app.slice(app.indexOf("if (!missingJob) return;"));
    expect(effect.slice(0, 400)).toMatch(
      /navigate\("\/board",\s*\{\s*replace:\s*true\s*\}\)/,
    );
  });

  it("says what happened, in both locales", () => {
    for (const [name, dict] of [
      ["en", en],
      ["nl", nl],
    ] as const) {
      expect(dict.board?.applicationGone, `${name} copy`).toBeTruthy();
    }
    // Not "error" or "invalid": the row is gone, which is a fact about the
    // data rather than a fault of the person who tapped the link.
    expect(en.board.applicationGone).toMatch(/no longer|deleted/i);
  });
});
