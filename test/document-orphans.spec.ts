import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// documents rows are pointers; the files are in R2. Deleting an application
// drops its documents through an ON DELETE CASCADE — which runs inside SQLite,
// where none of our code does — so nothing ever saw the keys.
//
// Measured before the fix: delete=204, rowsLeft=0, objectsBefore=2,
// objectsAfter=2. Both uploads left in the bucket with every row that could
// name them gone, on the path people take routinely.
const BASE = "http://zenith.test";

async function seedApplication(title = "Platform Engineer"): Promise<number> {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, role_type: "other" }),
  });
  return ((await res.json()) as { id: number }).id;
}

async function upload(appId: number, filename: string): Promise<string> {
  const content = "cv bytes";
  const res = await authedFetch(
    `${BASE}/api/applications/${appId}/documents?filename=${filename}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(content.length),
      },
      body: content,
    },
  );
  expect(res.status).toBe(201);
  const doc = (await res.json()) as { id: number };
  const row = await env.DB.prepare("SELECT key FROM documents WHERE id = ?")
    .bind(doc.id)
    .first<{ key: string }>();
  return row!.key;
}

const bucketKeys = async () =>
  (await env.DOCS.list()).objects.map((o) => o.key).sort();

describe("deleting an application", () => {
  it("takes its stored files with it", async () => {
    const appId = await seedApplication();
    await upload(appId, "cv.pdf");
    await upload(appId, "cover.pdf");
    expect(await bucketKeys()).toHaveLength(2);

    const res = await authedFetch(`${BASE}/api/applications/${appId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(await bucketKeys()).toEqual([]);
  });

  it("leaves another application's files alone", async () => {
    // The direction that would be expensive to get wrong: one delete taking
    // out attachments belonging to a job that is still open.
    const doomed = await seedApplication("Doomed");
    const kept = await seedApplication("Kept");
    await upload(doomed, "doomed.pdf");
    const keeper = await upload(kept, "keeper.pdf");

    await authedFetch(`${BASE}/api/applications/${doomed}`, {
      method: "DELETE",
    });
    expect(await bucketKeys()).toEqual([keeper]);

    // And the surviving row still resolves to a file that is really there.
    const download = await authedFetch(
      `${BASE}/api/applications/${kept}/documents`,
    );
    const docs = (await download.json()) as { id: number }[];
    expect(docs).toHaveLength(1);
    const served = await authedFetch(
      `${BASE}/api/documents/${docs[0].id}/download`,
    );
    expect(served.status).toBe(200);
  });

  it("deletes an application that has no documents at all", async () => {
    // The empty-key path: R2 rejects a delete of nothing in some SDK shapes,
    // and most applications have no attachments.
    const appId = await seedApplication("Bare");
    const res = await authedFetch(`${BASE}/api/applications/${appId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });
});
