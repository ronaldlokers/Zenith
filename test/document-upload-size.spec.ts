import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Content-Length is a client-supplied claim: `const size =
// Number(c.req.header("Content-Length") ?? 0)` used to be the only input to
// both the 10 MB cap check and the `size` column written to the row, while
// the raw body streamed straight to R2 without anyone counting it. A client
// that understated its own header could push an arbitrarily large file past
// the cap, and the stored size would permanently misreport what actually
// landed in the bucket.
const BASE = "http://zenith.test";
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

async function seedApplication(): Promise<number> {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Platform Engineer", role_type: "other" }),
  });
  return ((await res.json()) as { id: number }).id;
}

const bucketKeys = async () =>
  (await env.DOCS.list()).objects.map((o) => o.key).sort();

function upload(
  appId: number,
  filename: string,
  body: BodyInit,
  headers: Record<string, string>,
) {
  return authedFetch(
    `${BASE}/api/applications/${appId}/documents?filename=${filename}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/pdf", ...headers },
      body,
      // Required by fetch whenever the body is a stream rather than a
      // buffer of known length.
      duplex: "half",
    } as RequestInit,
  );
}

describe("document upload size enforcement", () => {
  it("accepts an honest upload under the cap and records its real size", async () => {
    const appId = await seedApplication();
    const content = "cv bytes";
    const res = await upload(appId, "cv.pdf", content, {
      "Content-Length": String(content.length),
    });
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { id: number; size: number };
    expect(doc.size).toBe(content.length);

    const row = await env.DB.prepare("SELECT size FROM documents WHERE id = ?")
      .bind(doc.id)
      .first<{ size: number }>();
    expect(row!.size).toBe(content.length);
  });

  it("rejects a declared size over the cap up front, without writing a new object to R2", async () => {
    const appId = await seedApplication();
    const before = await bucketKeys();
    const res = await upload(appId, "huge.pdf", "small body", {
      "Content-Length": String(MAX_DOCUMENT_BYTES + 1),
    });
    expect(res.status).toBe(413);
    expect(await bucketKeys()).toEqual(before);
  });

  it("rejects a body that exceeds the cap while its Content-Length claims otherwise, and leaves no object in R2", async () => {
    const appId = await seedApplication();
    const before = await bucketKeys();
    // A real Uint8Array body, not a synthetic stream: fetch computes its own
    // framing from the actual bytes, and the platform still lets a caller
    // set Content-Length to something else entirely — exactly the shape of
    // the attack the card describes. Built as a single typed array (not
    // chunk-by-chunk) so an 11 MB fixture costs one allocation, not a slow
    // loop.
    const oversized = new Uint8Array(MAX_DOCUMENT_BYTES + 1024);
    expect(oversized.byteLength).toBeGreaterThan(MAX_DOCUMENT_BYTES);

    const res = await upload(appId, "sneaky.pdf", oversized, {
      // Understated on purpose: an honest-looking header that has nothing
      // to do with what's actually in the body.
      "Content-Length": "100",
    });
    expect(res.status).toBe(413);
    // The bucket assertion is the one that matters: R2 had already accepted
    // the full object by the time the real count was known (put() only
    // resolves once the stream is fully consumed), so a status-only check
    // would pass while an 11 MB orphan sat in the bucket.
    expect(await bucketKeys()).toEqual(before);

    const rows = await env.DB.prepare(
      "SELECT COUNT(*) as n FROM documents WHERE application_id = ?",
    )
      .bind(appId)
      .first<{ n: number }>();
    expect(rows!.n).toBe(0);
  });

  it("rejects an oversized body sent with no Content-Length header at all", async () => {
    const appId = await seedApplication();
    const before = await bucketKeys();
    const oversized = new Uint8Array(MAX_DOCUMENT_BYTES + 1024);
    expect(oversized.byteLength).toBeGreaterThan(MAX_DOCUMENT_BYTES);
    // A stream body (rather than a plain buffer) is the only way to send a
    // request that genuinely carries no Content-Length at all — a buffer
    // body's length is known up front and the fetch implementation adds the
    // header itself whenever it isn't overridden.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversized);
        controller.close();
      },
    });

    const res = await upload(appId, "nolength.pdf", stream, {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await bucketKeys()).toEqual(before);
  });

  it("records the measured length, not an honest-looking but wrong header", async () => {
    const appId = await seedApplication();
    const real = new Uint8Array(2048);
    const res = await upload(appId, "mismatch.pdf", real, {
      // Under the cap either way, but wrong: only the measured count should
      // land in the row.
      "Content-Length": "10",
    });
    expect(res.status).toBe(201);
    const doc = (await res.json()) as { id: number; size: number };
    expect(doc.size).toBe(real.byteLength);

    const row = await env.DB.prepare("SELECT size FROM documents WHERE id = ?")
      .bind(doc.id)
      .first<{ size: number }>();
    expect(row!.size).toBe(real.byteLength);
  });
});
