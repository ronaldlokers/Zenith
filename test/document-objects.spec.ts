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
  // 1200 objects, and an explicit timeout because of it. Vitest's default is
  // 5000ms and building the fixture is the slow part, not the assertion:
  // measured at 691ms sequentially on a developer machine and comfortably
  // inside the default — then it timed out twice in an hour on CI, where the
  // workers project's own setup takes 247s and everything runs under
  // contention. An intermittent red on a file the PR never touched is the
  // thing that teaches a reader to dismiss a red, so this says how long it is
  // allowed to take rather than relying on a default that happens to fit
  // locally.
  //
  // The puts go out in chunks rather than one at a time (measured 691ms ->
  // 395ms). The delete under test still receives all 1200 keys at once, which
  // is the whole point of the fixture.
  it("clears every key, not just the first batch", async () => {
    const keys = Array.from({ length: 1200 }, (_, i) => `batch/${i}`);
    for (let i = 0; i < keys.length; i += 50) {
      await Promise.all(keys.slice(i, i + 50).map((k) => env.DOCS.put(k, "x")));
    }

    await deleteDocumentObjects(env.DOCS, keys);

    const left = await env.DOCS.list({ prefix: "batch/", limit: 1000 });
    expect(
      left.objects.map((o) => o.key),
      "objects past the first batch survived the delete",
    ).toEqual([]);
  }, 60_000);

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
