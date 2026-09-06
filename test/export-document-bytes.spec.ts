import { describe, expect, it } from "vitest";
import { EXPORT_DOCUMENT_BUDGET_BYTES } from "../worker/export-documents";
import { authedFetch } from "./helpers";

// The documents table stores an R2 key, a filename and a size — never the
// content. So a full export named every CV and cover letter the user had
// without including one of them: a person exporting their data in order to
// leave got a list of files they no longer had any way to fetch.
//
// The bytes travel base64 inside the same JSON rather than as signed download
// links. Links would mean a new route reachable without a session, on a
// product whose whole posture is invite-only, and they expire — an export is
// meant to still be readable in a year.
//
// Base64 is 4/3 the size and the Worker has 128 MB, so there is a budget. What
// matters is that going over it is stated rather than silent: an export that
// quietly drops a file is worse than one that says which files it dropped.
const BASE = "http://zenith.test";

async function seedApplication(title: string): Promise<number> {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, role_type: "other" }),
  });
  return ((await res.json()) as { id: number }).id;
}

const upload = (appId: number, filename: string, body: string) =>
  authedFetch(`${BASE}/api/applications/${appId}/documents?filename=${filename}`, {
    method: "POST",
    headers: { "Content-Type": "application/pdf", "Content-Length": String(body.length) },
    body,
  });

interface Export {
  documents: { filename: string; content_base64: string | null }[];
  omitted_documents: { filename: string; size: number; reason: string }[];
}

const exportJson = async (): Promise<Export> =>
  (await authedFetch(`${BASE}/api/export`)).json<Export>();

describe("what a data export contains", () => {
  it("carries the document, not just its name", async () => {
    const app = await seedApplication("Bytes fixture");
    expect((await upload(app, "cv.pdf", "%PDF-1.7 the actual bytes")).status).toBe(201);

    const dump = await exportJson();
    const doc = dump.documents.find((d) => d.filename === "cv.pdf");
    expect(doc, "the document is missing from the export entirely").toBeTruthy();
    expect(
      doc!.content_base64,
      "the export names the file but does not include it",
    ).toBeTruthy();
    expect(atob(doc!.content_base64!)).toBe("%PDF-1.7 the actual bytes");
  });

  it("round-trips bytes that are not text", async () => {
    // A real CV is a PDF. Anything that went through a text decode on the way
    // out would come back corrupted while the export still looked fine.
    //
    // The body is a Uint8Array, not a string: fetch UTF-8 encodes a string, so
    // a fixture written as "\xfa" would be stored as two bytes and the test
    // would fail on its own fixture rather than on the code.
    const app = await seedApplication("Binary fixture");
    const raw = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const res = await authedFetch(
      `${BASE}/api/applications/${app}/documents?filename=binary.pdf`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(raw.length),
        },
        body: raw,
      },
    );
    expect(res.status).toBe(201);

    const dump = await exportJson();
    const doc = dump.documents.find((d) => d.filename === "binary.pdf");
    const back = Uint8Array.from(atob(doc!.content_base64!), (ch) => ch.charCodeAt(0));
    expect([...back], "the bytes did not survive the round trip").toEqual([...raw]);
  });

  it("says which files it left out rather than dropping them quietly", async () => {
    expect(EXPORT_DOCUMENT_BUDGET_BYTES).toBeGreaterThan(0);
    const dump = await exportJson();
    // Nothing here exceeds the budget, so the list is empty — but it has to
    // exist, because its absence is what made the old behaviour invisible.
    expect(Array.isArray(dump.omitted_documents)).toBe(true);
  });
});
