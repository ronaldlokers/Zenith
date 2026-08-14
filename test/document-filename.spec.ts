import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Content-Disposition carried the stored filename with nothing but the double
// quotes stripped out, and a filename is whatever the uploader called the
// file. Measured against the worker:
//
//   "Lebenslauf Müller.pdf"  ->  filename="Lebenslauf Müller.pdf"   (mojibake)
//   "履歴書.pdf"              ->  filename="履歴書.pdf"               (mojibake)
//   "line\nbreak.pdf"        ->  500, permanently
//
// The last one is the bad one: the upload succeeds, so the file exists and
// cannot be fetched, and deleting it is the only way out.
const BASE = "http://zenith.test";

async function seedApp() {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Platform Engineer", status: "applied" }),
  });
  return (await res.json()) as { id: number };
}

/** Uploads one document and returns the download response for it. */
async function roundTrip(filename: string) {
  const app = await seedApp();
  const content = "bytes";
  const uploaded = await authedFetch(
    `${BASE}/api/applications/${app.id}/documents?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(content.length),
      },
      body: content,
    },
  );
  expect(uploaded.status).toBe(201);
  const doc = (await uploaded.json()) as { id: number };
  return authedFetch(`${BASE}/api/documents/${doc.id}/download`);
}

describe("downloading a document with an awkward name", () => {
  it("survives a name the header cannot hold", async () => {
    // A control character in a header value throws where the Response is
    // built, so this used to be a file you could store and never retrieve.
    const res = await roundTrip("line\nbreak.pdf");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("bytes");

    const cd = res.headers.get("Content-Disposition")!;
    expect(cd).toContain('filename="line_break.pdf"');
    expect(cd).toContain("filename*=UTF-8''line%0Abreak.pdf");
  });

  it("sends a non-ASCII name in a form a browser can read", async () => {
    const cd = (await roundTrip("履歴書.pdf")).headers.get(
      "Content-Disposition",
    )!;
    // The real name, percent-encoded as UTF-8 per RFC 6266.
    expect(cd).toContain("filename*=UTF-8''%E5%B1%A5%E6%AD%B4%E6%9B%B8.pdf");
    // And an ASCII stand-in for agents that do not implement filename*.
    expect(cd).toContain('filename="___.pdf"');
    // Order is load-bearing: an agent that does not implement filename* is
    // specified to ignore it after filename, and would otherwise take the
    // percent-encoded form as the literal name.
    expect(cd.indexOf('filename="')).toBeLessThan(cd.indexOf("filename*="));
  });

  it("keeps an accented name legible in both halves", async () => {
    const cd = (await roundTrip("Lebenslauf Müller.pdf")).headers.get(
      "Content-Disposition",
    )!;
    expect(cd).toContain("filename*=UTF-8''Lebenslauf%20M%C3%BCller.pdf");
    expect(cd).toContain('filename="Lebenslauf M_ller.pdf"');
  });

  it("still tells the browser to download rather than render", async () => {
    // The property this header exists for: an uploaded document's content
    // type comes from whoever uploaded it, and this origin carries the
    // session cookie and everyone's CVs. Both halves of the RFC 6266 form
    // have to sit behind "attachment", not just the fallback.
    const cd = (await roundTrip("履歴書.pdf")).headers.get(
      "Content-Disposition",
    )!;
    expect(cd.startsWith("attachment;")).toBe(true);
  });

  it("leaves an ordinary name alone", async () => {
    const cd = (await roundTrip("cv.pdf")).headers.get("Content-Disposition")!;
    expect(cd).toBe("attachment; filename=\"cv.pdf\"; filename*=UTF-8''cv.pdf");
  });

  it("does not let a quote break out of the fallback", async () => {
    const cd = (await roundTrip('weird".pdf')).headers.get(
      "Content-Disposition",
    )!;
    expect(cd).toContain('filename="weird.pdf"');
    expect(cd).toContain("filename*=UTF-8''weird%22.pdf");
  });
});
