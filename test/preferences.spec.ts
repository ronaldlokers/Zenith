import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

describe("user locale preference", () => {
  it("persists a valid locale to the user row", async () => {
    const res = await authedFetch("http://zenith.test/api/preferences/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "nl" }),
    });
    expect(res.status).toBe(204);
    const row = await env.DB.prepare('SELECT locale FROM "user" WHERE id = ?')
      .bind("seed-admin")
      .first<{ locale: string }>();
    expect(row?.locale).toBe("nl");
  });

  it("rejects an unsupported locale", async () => {
    const res = await authedFetch("http://zenith.test/api/preferences/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "fr" }),
    });
    expect(res.status).toBe(400);
  });
});

const BASE = "http://zenith.test";
const USER = "seed-admin";

async function storedTimezone(): Promise<string | null> {
  const row = await env.DB.prepare('SELECT timezone FROM "user" WHERE id = ?')
    .bind(USER)
    .first<{ timezone: string | null }>();
  return row?.timezone ?? null;
}

describe("timezone preference", () => {
  beforeEach(async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = NULL WHERE id = ?')
      .bind(USER)
      .run();
  });

  it("reports a null timezone before one is set", async () => {
    const res = await authedFetch(`${BASE}/api/preferences`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ timezone: null });
  });

  it("stores a valid IANA zone and reads it back", async () => {
    const put = await authedFetch(`${BASE}/api/preferences/timezone`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: "Europe/Amsterdam" }),
    });
    expect(put.status).toBe(204);
    expect(await storedTimezone()).toBe("Europe/Amsterdam");

    const get = await authedFetch(`${BASE}/api/preferences`);
    expect(await get.json()).toMatchObject({ timezone: "Europe/Amsterdam" });
  });

  // A stored zone that Intl cannot parse would fall back to UTC forever and
  // silently give the user the wrong day, so it is rejected at the door.
  it("rejects a zone Intl does not recognise, leaving the stored value alone", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("Europe/Amsterdam", USER)
      .run();
    const res = await authedFetch(`${BASE}/api/preferences/timezone`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: "Not/AZone" }),
    });
    expect(res.status).toBe(400);
    expect(await storedTimezone()).toBe("Europe/Amsterdam");
  });

  it("accepts UTC, which is not in Intl.supportedValuesOf", async () => {
    const res = await authedFetch(`${BASE}/api/preferences/timezone`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: "UTC" }),
    });
    expect(res.status).toBe(204);
    expect(await storedTimezone()).toBe("UTC");
  });
});

describe("email preferences", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      'UPDATE "user" SET email_reminders = 1, email_digest = 1 WHERE id = ?',
    )
      .bind(USER)
      .run();
  });

  it("reports both as on by default", async () => {
    const res = await authedFetch(`${BASE}/api/preferences`);
    expect(await res.json()).toMatchObject({ emailReminders: true, emailDigest: true });
  });

  it("persists a single toggle without disturbing the other", async () => {
    const res = await authedFetch(`${BASE}/api/preferences/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailReminders: false }),
    });
    expect(res.status).toBe(204);

    const after = await authedFetch(`${BASE}/api/preferences`);
    expect(await after.json()).toMatchObject({ emailReminders: false, emailDigest: true });
  });

  it("rejects a non-boolean rather than coercing it", async () => {
    const res = await authedFetch(`${BASE}/api/preferences/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailDigest: "yes" }),
    });
    expect(res.status).toBe(400);
  });
});
