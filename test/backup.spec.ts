import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { authedFetch } from "./helpers";
import { runScheduledBackup } from "../worker/backup";

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

  it("keeps the older backups when the new one did not verify", async () => {
    // The ordering, not the check. Verification runs before the retention
    // prune, so a failed backup leaves the previous ones alone. Move the
    // check below the prune and a bad write would delete the oldest good
    // backup on its way out — quietly spending recoverability to store
    // something that was never readable. Nothing else pins that order.
    for (let i = 0; i < 20; i++) {
      await env.DOCS.put(`backups/keep-${i}.json`, "{}");
    }
    const before = (await env.DOCS.list({ prefix: "backups/" })).objects.length;

    const truncatingDocs = {
      put: (key: string, value: string, options?: R2PutOptions) =>
        env.DOCS.put(key, value.slice(0, -10), options),
      head: (key: string) => env.DOCS.head(key),
      list: (options?: R2ListOptions) => env.DOCS.list(options),
      delete: (keys: string | string[]) => env.DOCS.delete(keys),
    } as unknown as typeof env.DOCS;

    await expect(
      runScheduledBackup({ ...env, DOCS: truncatingDocs }),
    ).rejects.toThrow(/backup write verification failed/);

    const after = (await env.DOCS.list({ prefix: "backups/" })).objects.length;
    expect(before).toBeGreaterThan(14);
    expect(after, "a failed backup pruned the backups it could not replace").toBe(before);
  });
});

describe("what the backup key promises", () => {
  // BACKUP_RETENTION_DAYS is named in days and the prune counts objects.
  // Those agree only because the key is the calendar date alone: a same-day
  // rerun overwrites rather than taking a second slot, and lexicographic
  // order over YYYY-MM-DD is chronological, so sorting keys sorts by age.
  //
  // A key carrying a time would break both at once, quietly — the window
  // would start counting runs instead of days and nothing else would notice.
  it("is the calendar date, so sorting keys sorts by age", async () => {
    // R2 is shared across this file and the retention test above seeds
    // backups/fake-N.json. Those sort after a date key (digits before
    // letters), so the prune deletes today's real backup to keep the
    // fixtures — clear the prefix first rather than assert around it.
    for (const o of (await env.DOCS.list({ prefix: "backups/" })).objects) {
      await env.DOCS.delete(o.key);
    }
    await runScheduledBackup(env);
    const today = new Date().toISOString().slice(0, 10);
    expect(today, "the date this test builds is not the shape being pinned").toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
    expect(
      await env.DOCS.head(`backups/${today}.json`),
      "no object under the plain calendar-date key — the key carries something else now",
    ).not.toBeNull();
  });

  it("does not spend a retention slot on a rerun of the same day", async () => {
    // The retry case. Two runs on one day must leave one object, or a
    // Cloudflare cron retry would silently eat a day of the window.
    await runScheduledBackup(env);
    const before = (await env.DOCS.list({ prefix: "backups/" })).objects.length;
    await runScheduledBackup(env);
    const after = (await env.DOCS.list({ prefix: "backups/" })).objects.length;
    expect(after, "a second run the same day added an object").toBe(before);
  });
});

describe("what a backup run leaves behind to read", () => {
  // buildFullExport reads every row of every exported table and D1 meters
  // rows read per day, so the size grows with other people's data rather
  // than with anything an operator does. cron_runs answers "did it run";
  // nothing answered "how big", which is the number that says when this
  // stops being cheap.
  it("logs the row total it dumped", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await authedFetch(`${BASE}/api/companies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Row Count Co" }),
    });

    await runScheduledBackup(env);

    const line = log.mock.calls.map((c) => String(c[0])).find((m) => m.startsWith("backup "));
    expect(line, "the backup run logged nothing about its size").toBeTruthy();
    const rows = Number(/(\d+) rows/.exec(line!)?.[1]);
    // Not just "a number": the company written above has to be in it, so a
    // count that silently reports 0 — an empty dump, a reduce over the wrong
    // shape — fails rather than looking like a healthy small database.
    expect(rows, "the row total does not count the rows that were dumped").toBeGreaterThan(0);
    log.mockRestore();
  });
});
