import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./api";

// request() built its init as `{ headers: {...default}, ...init }`, so a
// caller that set any header of its own replaced the default rather than
// adding to it. The If-Match saves did exactly that: a PUT carrying a JSON
// body announced itself as text/plain.
//
// Nothing broke, which is why it survived — Hono parses the body regardless
// of the content type, confirmed against the worker (200, row updated). It
// was a request that described itself wrongly and worked by the leniency of
// one parser, in the module every network call in the app goes through.
//
// Found by coverage: api.ts sat at 10.9% of statements and 6.4% of its
// functions, the lowest in src/ and the most central.
let seen: Request | null = null;

function captureFetch(status = 200, body: unknown = {}) {
  seen = null;
  vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
    seen = new Request(`https://zenith.test${input}`, init);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("outgoing request headers", () => {
  test("a plain write is announced as json", async () => {
    captureFetch();
    await api.create("applications", { title: "X" });
    expect(seen!.headers.get("content-type")).toBe("application/json");
  });

  test("adding If-Match does not cost the content type", async () => {
    // The regression: the precondition header arrived and the default left
    // with it, so the body's type was whatever fetch guesses for a string.
    captureFetch();
    await api.update("applications", 1, { title: "X" }, "2026-08-14 09:00:00");
    expect(seen!.headers.get("if-match")).toBe("2026-08-14 09:00:00");
    expect(seen!.headers.get("content-type")).toBe("application/json");
  });

  test("omitting it sends no precondition at all", async () => {
    // The other half of the contract: callers that do not pass the expected
    // timestamp keep last-write-wins, so the header must be absent, not empty.
    captureFetch();
    await api.update("applications", 1, { title: "X" });
    expect(seen!.headers.get("if-match")).toBeNull();
    expect(seen!.headers.get("content-type")).toBe("application/json");
  });

  test("the document upload still sends the file's own type", async () => {
    // A separate path, not this merge: uploadDocument calls fetch directly.
    // Pinned here anyway because the merge was written with this case in mind
    // and it would be easy to later route the upload through request() and
    // quietly turn a PDF into application/json.
    captureFetch(201, { id: 1 });
    const file = new File(["bytes"], "cv.pdf", { type: "application/pdf" });
    await api.uploadDocument(1, file, null);
    expect(seen!.headers.get("content-type")).toBe("application/pdf");
  });
});
