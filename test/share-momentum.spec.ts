import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// The share page is the one Zenith surface a stranger sees, and it was giving
// its most confident verdict off its least evidence. src/format.ts grew a
// floor for exactly that — below MOMENTUM_MIN_EVENTS forward moves the answer
// is "too early to tell", because at prior = 0 a single stage advance reads as
// unbounded acceleration — but the /shared/:token handler had reimplemented
// the same recent-vs-prior ratio inline and never carried the floor across.
// One forward move in a fortnight told an outside reader "Speeding up".
//
// The fix is not a second copy of the floor. The worker now calls the same
// computePipelineMomentum the app does, so the two cannot disagree again;
// the last test here is what stops a third copy appearing.
const BASE = "http://zenith.test";
const TOKEN = "share-momentum-spec-token";

async function seedShared() {
  await authedFetch(`${BASE}/api/profile/share-token`, { method: "POST" });
  await env.DB.prepare("UPDATE profile SET share_token = ? WHERE user_id = ?")
    .bind(TOKEN, "seed-admin")
    .run();
}

// Applications carry an insert trigger that writes their own status_history
// row, so the fixture clears the table and writes exactly the moves each case
// is about. Otherwise the seeded application's own "interested" row counts.
async function setMoves(moves: { from: string | null; to: string; daysAgo: number }[]) {
  const app = await authedFetch(`${BASE}/api/applications`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Momentum fixture", status: "interested" }),
  });
  const { id } = await app.json<{ id: number }>();
  await env.DB.prepare("DELETE FROM status_history").run();
  for (const m of moves) {
    await env.DB.prepare(
      `INSERT INTO status_history (application_id, user_id, from_status, to_status, changed_at)
       VALUES (?, 'seed-admin', ?, ?, datetime('now', ?))`,
    )
      .bind(id, m.from, m.to, `-${m.daysAgo} days`)
      .run();
  }
}

async function momentum(): Promise<string> {
  const res = await SELF.fetch(`${BASE}/shared/${TOKEN}`);
  expect(res.status, "the share page did not render").toBe(200);
  const html = await res.text();
  const m = html.match(/momentum-value">([^<]*)</);
  expect(m, "the page carries no momentum verdict at all").toBeTruthy();
  return m![1];
}

describe("the share page's momentum verdict", () => {
  it("says too early rather than speeding up on a single forward move", async () => {
    await seedShared();
    await setMoves([{ from: "interested", to: "applied", daysAgo: 1 }]);
    expect(
      await momentum(),
      "one stage advance is being published to strangers as acceleration",
    ).toBe("Too early to tell");
  });

  it("still says nothing at all when nothing has moved", async () => {
    await seedShared();
    await setMoves([]);
    expect(await momentum()).toBe("No recent activity");
  });

  it("grades the trend once there is enough movement to grade", async () => {
    // Six combined moves clears the floor; five recent against one prior is
    // a real acceleration rather than a division by almost nothing.
    await seedShared();
    await setMoves([
      { from: "interested", to: "applied", daysAgo: 20 },
      { from: "interested", to: "applied", daysAgo: 1 },
      { from: "applied", to: "screening", daysAgo: 2 },
      { from: "screening", to: "interview", daysAgo: 3 },
      { from: "interested", to: "applied", daysAgo: 4 },
      { from: "applied", to: "screening", daysAgo: 5 },
    ]);
    expect(await momentum()).toBe("Speeding up");
  });

  it("speaks the reader's language", async () => {
    await seedShared();
    await setMoves([{ from: "interested", to: "applied", daysAgo: 1 }]);
    const res = await SELF.fetch(`${BASE}/shared/${TOKEN}`, {
      headers: { "Accept-Language": "nl" },
    });
    expect(await res.text()).toContain("Nog te vroeg");
  });
});
