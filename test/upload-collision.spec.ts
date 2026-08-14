import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// The R2 key was `app-<id>/<Date.now()>-<filename>`, and the object is written
// before the row that names it is claimed. Two uploads of the same filename to
// the same application in the same millisecond therefore built the same key.
//
// Measured before the fix, from two concurrent uploads of "cv.pdf":
//
//   statuses=201,409  rows=1  objects=1  contents=BBBBB
//
// One upload reported success and one reported "already exists", so the person
// keeps the file they were told was stored. But both puts ran, the second
// overwrote the first, and only the first's row survived — so the surviving
// document served the other file's bytes from then on. For a tool that holds a
// differently tailored CV per application, that is the wrong file going out
// with no sign anything went wrong.
const BASE = "http://zenith.test";

async function seedApplication(): Promise<number> {
  const res = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Platform Engineer", role_type: "other" }),
  });
  return ((await res.json()) as { id: number }).id;
}

const send = (appId: number, filename: string, body: string) =>
  authedFetch(
    `${BASE}/api/applications/${appId}/documents?filename=${filename}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(body.length),
      },
      body,
    },
  );

describe("two uploads racing for one key", () => {
  it("gives every upload a key of its own", async () => {
    // Twenty at once rather than two: the collision needs two uploads to land
    // in the same millisecond, which a pair does only sometimes — the first
    // version of this test passed against the timestamped key it was written
    // to catch. Twenty concurrent uploads make a shared millisecond a
    // certainty rather than a coin flip.
    const appId = await seedApplication();
    const bodies = Array.from({ length: 20 }, (_, i) => `body-${i}`);
    const sent = await Promise.all(
      bodies.map((b) => send(appId, "cv.pdf", b)),
    );
    expect(sent.every((r) => r.status === 201)).toBe(true);

    const { results } = await env.DB.prepare(
      "SELECT id, key FROM documents ORDER BY id",
    ).all<{ id: number; key: string }>();
    expect(results).toHaveLength(bodies.length);
    expect(new Set(results.map((r) => r.key)).size).toBe(bodies.length);

    // The assertion that catches the original bug rather than its symptom:
    // what each row actually serves. A collision left one row pointing at
    // another upload's bytes, which no count of rows or objects reveals.
    const served: string[] = [];
    for (const row of results) {
      const res = await authedFetch(`${BASE}/api/documents/${row.id}/download`);
      expect(res.status).toBe(200);
      served.push(await res.text());
    }
    expect(new Set(served)).toEqual(new Set(bodies));
  });

  it("stores the bytes that were sent, one upload at a time", async () => {
    const appId = await seedApplication();
    const res = await send(appId, "cv.pdf", "ONLY-ONE");
    const doc = (await res.json()) as { id: number };
    const back = await authedFetch(`${BASE}/api/documents/${doc.id}/download`);
    expect(await back.text()).toBe("ONLY-ONE");
  });

  // Not covered: the handler also deletes the object if the INSERT throws,
  // for the case where the application is removed between the check above it
  // and the write. There is no test because there is no way to force it here
  // — deleting the application first makes the handler answer 404 before it
  // writes anything, so a test written that way passes whether the cleanup
  // exists or not. It did, until the cleanup was removed and the test stayed
  // green. Left in the handler as a guard, and named here as untested rather
  // than covered by something that proves nothing.
});
