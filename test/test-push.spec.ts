import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";

describe("admin test push", () => {
  it("accepts a valid notification type", async () => {
    const res = await authedFetch("http://zenith.test/api/admin/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "weekly_digest" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ sent: number }>();
    // No push subscription seeded for the test user, so nothing is delivered.
    expect(body.sent).toBe(0);
  });

  it("rejects an unknown notification type", async () => {
    const res = await authedFetch("http://zenith.test/api/admin/test-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bogus" }),
    });
    expect(res.status).toBe(400);
  });
});
