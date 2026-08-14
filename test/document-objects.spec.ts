import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { deleteDocumentObjects } from "../worker/documents";

// The R2 half of deleting documents. Losing it leaves an object whose key was
// only recorded in the row that just went — unreachable and uncountable from
// then on, which is the failure that made #600 and #601 worth fixing.
//
// The batching was untested above a single batch: every existing test deletes
// a handful of files, so the loop runs once and any mutation to its stride is
// invisible. Measured — raising the stride so it only ever runs once left the
// whole suite green.
describe("removing stored files by key", () => {
  it("clears every key, not just the first batch", async () => {
    const keys: string[] = [];
    for (let i = 0; i < 1200; i++) {
      const key = `batch/${i}`;
      await env.DOCS.put(key, "x");
      keys.push(key);
    }

    await deleteDocumentObjects(env.DOCS, keys);

    const left = await env.DOCS.list({ prefix: "batch/", limit: 1000 });
    expect(
      left.objects.map((o) => o.key),
      "objects past the first batch survived the delete",
    ).toEqual([]);
  });

  it("does nothing, rather than something, for an empty list", async () => {
    await env.DOCS.put("keep/me", "x");
    await deleteDocumentObjects(env.DOCS, []);
    expect(await env.DOCS.get("keep/me")).not.toBeNull();
  });

  // Not covered, deliberately: that a single call never exceeds R2's limit of
  // 1000 keys. Measured — miniflare accepts a 5000-key delete without error
  // and removes them all, so a test written for it passes against the bug.
  // Real R2 rejects the call, and the whole delete fails with it. The stride
  // is load-bearing in production and unverifiable here; naming that is worth
  // more than a test that proves the double's behaviour rather than R2's.
});
