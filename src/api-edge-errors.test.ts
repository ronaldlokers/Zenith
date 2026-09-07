import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./api";
import "./i18n";

// The generic branch of request() reads the server's `{ error }` and falls
// back to the bare status code. Every Worker route and the global onError do
// set that key, so the fallback is dormant for app-level failures — but it
// fires unguarded when the response is not JSON at all, which is exactly what
// a Cloudflare edge error is. A 522 is an HTML page from in front of the app,
// and it reached the user as "Request failed (522)": a number, about a layer
// they have no idea exists, with nothing to do about it.
//
// These pin the distinction rather than the copy: what matters is that a
// response which never reached the Worker is described the way a dropped
// connection is, and that one which did reach it is not.
function respondWith(status: number, body: string, contentType: string) {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(body, { status, headers: { "Content-Type": contentType } }),
    ),
  );
}

const EDGE_PAGE = "<!DOCTYPE html><title>522 Origin Connection Time-out</title>";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("an error that never reached the Worker", () => {
  test("a failed write says the app could not be reached", async () => {
    respondWith(522, EDGE_PAGE, "text/html");
    await expect(api.create("applications", { title: "X" })).rejects.toThrow(
      /couldn't reach zenith/i,
    );
  });

  test("a failed read says so in the reading tense", async () => {
    // The two halves of networkErrorMessage: nothing was being saved on a
    // page that would not load, and the write copy says otherwise.
    respondWith(502, EDGE_PAGE, "text/html");
    await expect(api.list("applications")).rejects.toThrow(
      /couldn't be loaded/i,
    );
  });

  test("the status code is gone from what the person sees", async () => {
    respondWith(522, EDGE_PAGE, "text/html");
    await expect(api.create("applications", { title: "X" })).rejects.not.toThrow(
      /522/,
    );
  });
});

describe("an error that did reach the Worker", () => {
  test("the server's own words still win", async () => {
    respondWith(400, JSON.stringify({ error: "Title is required." }), "application/json");
    await expect(api.create("applications", { title: "" })).rejects.toThrow(
      "Title is required.",
    );
  });

  test("a route that forgot its error key still reads as a status, not as an outage", async () => {
    // The deliberate non-change. This response did reach the app, so telling
    // the reader Zenith could not be reached would be false — it is a bug in
    // a route, and there is nothing for them to do about it either way.
    respondWith(500, JSON.stringify({ oops: true }), "application/json");
    await expect(api.create("applications", { title: "X" })).rejects.toThrow(
      "Request failed (500)",
    );
  });
});
