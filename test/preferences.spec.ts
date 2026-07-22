import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
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
