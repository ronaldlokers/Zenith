import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runScheduledBackup } from "../worker/index";

const BASE = "http://jobseekr.test";

describe("runScheduledBackup", () => {
  it("writes a full JSON dump to R2 under backups/", async () => {
    await SELF.fetch(`${BASE}/api/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Backup Test Co" }),
    });

    await runScheduledBackup(env);

    const listed = await env.DOCS.list({ prefix: "backups/" });
    expect(listed.objects.length).toBeGreaterThan(0);

    const key = listed.objects[0].key;
    const obj = await env.DOCS.get(key);
    const dump = JSON.parse(await obj!.text());
    expect(dump.companies.some((c: { name: string }) => c.name === "Backup Test Co")).toBe(
      true,
    );
  });

  it("prunes backups beyond the retention window", async () => {
    for (let i = 0; i < 20; i++) {
      await env.DOCS.put(`backups/fake-${i}.json`, "{}");
    }

    await runScheduledBackup(env);

    const listed = await env.DOCS.list({ prefix: "backups/" });
    expect(listed.objects.length).toBeLessThanOrEqual(14);
  });
});
