import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// An uploaded document's content type comes from whoever uploaded it, so the
// response that serves it must not invite a browser to render it on this
// origin — a session-cookie origin, holding everyone's CVs.
//
// nosniff (see test/security-headers.spec.ts) is the belt. Content-Disposition
// is the braces, and it is the one doing the real work: with `attachment` the
// file downloads whatever its declared type says.
//
// A source assertion rather than a request: the workers test runtime has no
// filesystem, and standing up R2 with a hostile upload to prove a header is
// present costs more than it tells you.
const SRC = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");

describe("document download", () => {
  it("serves uploads as attachments", () => {
    const at = SRC.indexOf('app.get("/api/documents/:id/download"');
    expect(at, "the download route moved or was renamed").toBeGreaterThan(-1);
    const route = SRC.slice(at, SRC.indexOf("});", at));
    expect(route).toContain("Content-Disposition");
    expect(route).toMatch(/attachment/);
  });
});
