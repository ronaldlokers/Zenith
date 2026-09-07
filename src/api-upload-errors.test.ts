import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./api";
import "./i18n";

// The document upload was the one write in the app with its own error
// handling. It could not call request() when it was written — that helper
// replaced its headers rather than merging them, so a raw file body would
// have gone out announced as JSON — so it hand-rolled the branch it needed
// and reproduced only the generic one.
//
// The cost was invisible until a session lapsed mid-upload: every other call
// said the session had expired, and this one said "Upload failed (401)".
// With no try/catch it also met a dropped connection with a raw TypeError
// rather than the offline copy.
//
// These assert the shared behaviour, not the implementation, so they still
// mean something if the upload ever needs its own path again.
function respondWith(status: number, body: unknown = {}) {
  vi.stubGlobal("fetch", () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

const upload = () =>
  api.uploadDocument(1, new File(["bytes"], "cv.pdf", { type: "application/pdf" }), null);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("what an upload says when it fails", () => {
  test("a lapsed session reads as a lapsed session, not as a number", async () => {
    respondWith(401, { error: "unauthorized" });
    await expect(upload()).rejects.toThrow(/session has expired/i);
  });

  test("a failed precondition reads as a stale edit", async () => {
    // Reachable the same way it is on any other write: the row moved on
    // between reading it and sending. The person needs to hear that nothing
    // was lost, which is a different sentence from "please sign in".
    respondWith(412, { error: "precondition failed" });
    await expect(upload()).rejects.toThrow(/changed somewhere else/i);
  });

  test("a dropped connection is a sentence, not a TypeError", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(upload()).rejects.toThrow(/couldn't reach zenith|you're offline/i);
  });

  test("the server's own words still win on an ordinary failure", async () => {
    // The generic branch has to keep working — this is the case the old
    // hand-rolled code did get right, and the one that carries the useful
    // message on a too-large or wrong-type upload.
    respondWith(413, { error: "That file is too large." });
    await expect(upload()).rejects.toThrow("That file is too large.");
  });
});
