import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// An uploaded document's content type comes from whoever uploaded it, so the
// response that serves it must not invite a browser to render it on this
// origin — a session-cookie origin, holding everyone's CVs.
//
// nosniff (see test/security-headers.spec.ts) is the belt. Content-Disposition
// is the braces, and it is the one doing the real work: with `attachment` the
// file downloads whatever its declared type says.
//
// The header is also asserted for real, against a document uploaded through
// R2 in the workers runtime, in test/document-filename.spec.ts — which turned
// out to cost very little, contrary to what this file used to say. This stays
// as the cheap tripwire for the route losing the header altogether, and now
// has to follow one indirection: the value is built by contentDisposition(),
// so the literal no longer sits in the route.
// Every worker file, not index.ts alone. The download route moved to
// worker/documents.ts in #93 and this broke — the fifth guard in this repo
// anchored to a filename rather than to the thing it checks. What it needs is
// the route, wherever the route lives.
const WORKER_DIR = new URL("../worker/", import.meta.url);
const SRC = readdirSync(WORKER_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(new URL(f, WORKER_DIR), "utf8"))
  .join("\n");

describe("document download", () => {
  it("serves uploads as attachments", () => {
    const at = SRC.indexOf('app.get("/api/documents/:id/download"');
    expect(at, "the download route moved or was renamed").toBeGreaterThan(-1);
    const route = SRC.slice(at, SRC.indexOf("});", at));
    expect(route).toContain("Content-Disposition");
    expect(
      route,
      "the route no longer builds the header through contentDisposition()",
    ).toMatch(/contentDisposition\(/);

    const helper = SRC.slice(SRC.indexOf("function contentDisposition("));
    expect(helper.slice(0, helper.indexOf("\n}"))).toMatch(/attachment/);
  });
});
