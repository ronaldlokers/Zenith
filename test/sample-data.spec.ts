import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

// Kept in its own spec file: loading/clearing sample data wipes the
// seed-admin's whole account, which would clobber the migration-seeded
// defaults (role types, feed sources) that api.spec's tests rely on.
// Storage is isolated per test file, so this destruction stays contained.
const BASE = "http://zenith.test";

type Status = { loaded: boolean; hasData: boolean };
const getStatus = async () =>
  (await (await authedFetch(`${BASE}/api/account/sample-data`)).json()) as Status;

describe("sample data", () => {
  // 20s, not the default 5. This one seeds an entire example account —
  // companies, contacts, applications, history, a CV, feed config — and then
  // clears it, which is a few hundred writes against a cold D1. It takes
  // ~240ms locally and has timed out in CI under parallel load.
  //
  // The timeout matters more than it looks. When it fires, vitest moves on
  // but the in-flight clear does not stop: it lands during the next test and
  // wipes the row that test had just created, so the failure shows up as the
  // *neighbour* asserting 409 and getting 200. That is what happened on #573,
  // and it cost a re-run to work out that nothing was actually broken.
  const SEEDS_A_WHOLE_ACCOUNT = 20_000;

  it("loads the example dataset then clears it", async () => {
    expect(await getStatus()).toEqual({ loaded: false, hasData: false });

    const load = await authedFetch(`${BASE}/api/account/sample-data`, {
      method: "POST",
    });
    expect(load.status).toBe(200);
    expect(await getStatus()).toEqual({ loaded: true, hasData: true });

    const del = await authedFetch(`${BASE}/api/account/sample-data`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);
    expect(await getStatus()).toEqual({ loaded: false, hasData: false });
  }, SEEDS_A_WHOLE_ACCOUNT);

  it("refuses to load over an account that already has data", async () => {
    const created = await authedFetch(`${BASE}/api/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Platform Engineer",
        role_type: "platform-engineer",
      }),
    });
    expect(created.status).toBe(201);
    const res = await authedFetch(`${BASE}/api/account/sample-data`, {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });

  it("refuses to load when only a CV exists (no applications) — no data loss", async () => {
    // A user who filled their CV but has zero applications must not lose it.
    const wx = await authedFetch(`${BASE}/api/work-experience`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: "Initech", title: "Engineer" }),
    });
    expect(wx.status).toBe(201);
    const res = await authedFetch(`${BASE}/api/account/sample-data`, {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });

  it("preserves the API key when removing sample data", async () => {
    await authedFetch(`${BASE}/api/account/sample-data`, { method: "POST" });
    const gen = (await (
      await authedFetch(`${BASE}/api/profile/api-key`, { method: "POST" })
    ).json()) as { api_key: string };
    expect(gen.api_key).toBeTruthy();

    await authedFetch(`${BASE}/api/account/sample-data`, { method: "DELETE" });
    // The key itself is unreadable after generation (#381), so the surviving
    // hint stands in for it — and the key still authenticating proves the
    // digest came through the wipe intact.
    const profile = (await (
      await authedFetch(`${BASE}/api/profile`)
    ).json()) as { api_key_hint: string | null };
    expect(profile.api_key_hint).toBe(gen.api_key.slice(-4));
    const res = await SELF.fetch(`${BASE}/api/v1/applications`, {
      headers: { Authorization: `Bearer ${gen.api_key}` },
    });
    expect(res.status).toBe(200);
  });
});
