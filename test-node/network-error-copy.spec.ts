import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A write that fails below the HTTP layer — no connection, DNS gone, a tab
// woken from sleep — surfaces from fetch() as a TypeError whose message is
// "Failed to fetch". That string was going straight into the app's error
// banner: the browser's own words, untranslated in a Dutch UI, naming
// neither the problem nor anything to do about it.
//
// The guard is that request() catches around the fetch itself. A later
// refactor that moves the await back outside the try restores the old
// behaviour silently, because nothing in the type system objects and the
// happy path is unaffected — so the shape is what gets pinned.
const api = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8");
const en = JSON.parse(
  readFileSync(new URL("../src/locales/en.json", import.meta.url), "utf8"),
);
const nl = JSON.parse(
  readFileSync(new URL("../src/locales/nl.json", import.meta.url), "utf8"),
);

describe("network error copy", () => {
  it("wraps the fetch itself, not just the response", () => {
    const body = api.slice(api.indexOf("async function request"));
    const tryAt = body.indexOf("try {");
    const fetchAt = body.indexOf("await fetch(");
    const catchAt = body.indexOf("} catch");
    expect(tryAt).toBeGreaterThan(-1);
    expect(fetchAt, "the fetch has to be inside the try").toBeGreaterThan(tryAt);
    expect(catchAt).toBeGreaterThan(fetchAt);
  });

  it("has both messages in both locales", () => {
    for (const [name, dict] of [
      ["en", en],
      ["nl", nl],
    ] as const) {
      expect(dict.errors?.offline, `${name} offline copy`).toBeTruthy();
      expect(dict.errors?.unreachable, `${name} unreachable copy`).toBeTruthy();
    }
  });

  it("says what happened and what to do, in plain words", () => {
    // The failure mode being guarded against is a message that is accurate
    // and useless. Both strings have to state that the change was not
    // saved — the thing the user actually needs to know — rather than only
    // naming the fault.
    for (const copy of [en.errors.offline, en.errors.unreachable]) {
      expect(copy).toMatch(/wasn't saved|not saved/i);
      expect(copy, "no browser jargon").not.toMatch(/fetch|XHR|network error|TypeError/i);
    }
    expect(en.errors.unreachable, "and a way forward").toMatch(/try again/i);
  });

  it("treats a 401 as an expired session, before the generic branch", () => {
    // Sign-in goes through auth-client, not this client, so a 401 here means
    // exactly one thing. It used to fall through to the generic branch and
    // show the server's own word — "unauthorized" — as the whole
    // explanation, on a page that still looked signed in.
    //
    // Order is the assertion: the status check has to precede the !res.ok
    // branch, or the generic message wins and nothing changes.
    const body = api.slice(api.indexOf("async function request"));
    const at401 = body.indexOf("res.status === 401");
    const atGeneric = body.indexOf("if (!res.ok)");
    expect(at401, "no 401 branch").toBeGreaterThan(-1);
    expect(at401, "the 401 branch must come before the generic one").toBeLessThan(
      atGeneric,
    );
    for (const dict of [en, nl]) expect(dict.errors?.sessionExpired).toBeTruthy();
    expect(en.errors.sessionExpired).toMatch(/sign in again/i);
    expect(en.errors.sessionExpired, "no wire jargon").not.toMatch(
      /unauthorized|401/i,
    );
  });

  it("still lets a server explain its own failure", () => {
    // The 401 branch must not swallow the rest: a server that answered with
    // a specific message knows more about the failure than this layer does.
    const body = api.slice(api.indexOf("async function request"));
    expect(body).toMatch(/\(body as \{ error\?: string \}\)\.error/);
  });

  it("only claims the user is offline when the browser is sure", () => {
    // navigator.onLine is trustworthy when false and unreliable when true:
    // a machine can be on a network that reaches nothing. Telling someone
    // they are offline while their browser works elsewhere sends them to
    // fix the wrong thing, so the certain branch has to be the false one.
    expect(api).toMatch(/navigator\.onLine === false/);
  });
});
