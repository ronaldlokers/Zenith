import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { deliverDueNotifications } from "../worker/notifications";

// The push leg did one UPDATE round-trip per notification, inside a cron that
// already knows the whole id set. The email leg two lines below groups by user
// first, and refreshFeed and checkStalePostings both use env.DB.batch for
// exactly this shape.
//
// The other half is failure isolation, and it is the reason this is worth more
// than the round-trips. The old code awaited Promise.all over promises that
// both sent and wrote — so one push that threw rejected the whole thing, and
// deliverDueNotifications gave up before reaching the email leg. A single bad
// subscription could silence every email that run.
const USER = "seed-admin";

async function seedNotification(type: string): Promise<number> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key, created_at)
     VALUES (?, ?, ?, 'body', '/board/1', ?, datetime('now'))`,
  )
    .bind(USER, type, `${type} title`, `batch:${type}:${Math.random()}`)
    .run();
  return meta.last_row_id as number;
}

const pushedAt = async (id: number) =>
  (
    await env.DB.prepare("SELECT pushed_at FROM notifications WHERE id = ?")
      .bind(id)
      .first<{ pushed_at: string | null }>()
  )?.pushed_at ?? null;

describe("marking notifications as pushed", () => {
  it("stamps every one that went out", async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    const ids = [
      await seedNotification("due_followup"),
      await seedNotification("stale_posting"),
      await seedNotification("feed_match"),
    ];

    await deliverDueNotifications(env);

    for (const id of ids) {
      expect(await pushedAt(id), `notification ${id} was never marked pushed`).toBeTruthy();
    }
  });

  it("writes them in one batch, not one round-trip each", async () => {
    // Counted rather than asserted on the source: what matters is the number
    // of statements the cron issues, and a source grep would pass on a batch
    // that still ran inside the loop.
    await env.DB.prepare("DELETE FROM notifications").run();
    for (let i = 0; i < 5; i++) await seedNotification("due_followup");

    const calls: string[] = [];
    const spy = {
      ...env,
      DB: {
        ...env.DB,
        prepare: (sql: string) => {
          calls.push(sql);
          return env.DB.prepare(sql);
        },
        batch: (stmts: D1PreparedStatement[]) => {
          calls.push(`BATCH(${stmts.length})`);
          return env.DB.batch(stmts);
        },
      },
    } as unknown as Env;

    await deliverDueNotifications(spy);

    const updates = calls.filter((c) => /UPDATE notifications SET pushed_at/.test(c));
    const batches = calls.filter((c) => c.startsWith("BATCH("));
    expect(
      updates.length,
      "one prepared UPDATE per notification — the N+1 this was meant to remove",
    ).toBeLessThanOrEqual(1);
    expect(batches, "nothing was batched").not.toEqual([]);
  });

  it("does nothing at all when there is nothing due", async () => {
    // D1 rejects batch([]) with "No SQL statements detected", which is how the
    // same guard came to exist in worker/posting-check.ts.
    await env.DB.prepare("DELETE FROM notifications").run();
    await expect(deliverDueNotifications(env)).resolves.toBeUndefined();
  });
});
