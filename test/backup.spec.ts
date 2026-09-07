import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authedFetch } from "./helpers";
import { runScheduledBackup } from "../worker/index";

const BASE = "http://zenith.test";

describe("runScheduledBackup", () => {
  it("writes a full JSON dump to R2 under backups/", async () => {
    await authedFetch(`${BASE}/api/companies`, {
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

  it("throws when the stored object doesn't match what was sent", async () => {
    // A stand-in for a silent truncation (a pathological row breaking
    // JSON.stringify partway, or a partial R2 write): put() "succeeds" but
    // writes fewer bytes than were sent. Only put() is overridden — head,
    // list and delete delegate to the real bucket, so the rest of
    // runScheduledBackup's behaviour (pruning) is untouched.
    const truncatingDocs = {
      put: (key: string, value: string, options?: R2PutOptions) =>
        env.DOCS.put(key, value.slice(0, -10), options),
      head: (key: string) => env.DOCS.head(key),
      list: (options?: R2ListOptions) => env.DOCS.list(options),
      delete: (keys: string | string[]) => env.DOCS.delete(keys),
    } as unknown as typeof env.DOCS;

    const badEnv = { ...env, DOCS: truncatingDocs };

    await expect(runScheduledBackup(badEnv)).rejects.toThrow(
      /backup write verification failed/,
    );
  });
});
