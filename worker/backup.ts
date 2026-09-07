import { buildFullExport } from "./export.js";
import { BACKUP_RETENTION_DAYS } from "../src/backup-policy.js";


// Scheduled full backup to R2 (#116) — the CSV/JSON export was manual-only,
// so a stale database has no recovery path if D1 has an issue. Keeps the
// last 14 daily backups, pruning older ones on each run.
//
// The prune counts objects while the constant is named in days, and those
// agree only because the key is the calendar date and nothing else. A rerun
// on the same day overwrites its own object rather than consuming a slot, so
// a retry cannot shorten the window; and lexicographic order over YYYY-MM-DD
// is chronological, so sorting keys is sorting by age. Put a time into that
// key and both properties go at once. test/backup.spec.ts pins the shape.
//
// A skipped day therefore lengthens the window rather than shortening it —
// the 14 kept objects span more than 14 days. What that costs is knowing the
// real coverage, and cron_runs answers it: every run records its outcome and
// GET /api/admin/cron-runs reports the last of each, so "backup last
// succeeded eleven days ago" is a question the operator can already ask.
const BACKUP_PREFIX = "backups/";
const BACKUP_RETENTION = BACKUP_RETENTION_DAYS;

export async function runScheduledBackup(env: Env): Promise<void> {
  const dump = await buildFullExport(env);
  const body = JSON.stringify(dump);
  const key = `${BACKUP_PREFIX}${new Date().toISOString().slice(0, 10)}.json`;
  // buildFullExport reads every row of every exported table, and D1's free
  // tier meters rows read per day. At two users it is nowhere near the cap;
  // the point is that nothing would say when it stopped being so, because
  // the size grows with other people's data rather than with anything an
  // operator does.
  //
  // Logged rather than recorded: cron_runs already answers "did it run", and
  // adding a column to answer "how big" would be a migration for a number
  // nobody reads until they are already investigating. Workers Logs has no
  // alerting — which is the whole reason cron_runs exists — so this is a
  // line to grep once something looks wrong, not a monitor.
  const rows = Object.values(dump).reduce<number>(
    (n, v) => n + (Array.isArray(v) ? v.length : 0),
    0,
  );
  console.log(`backup ${key}: ${rows} rows, ${body.length} bytes`);
  await env.DOCS.put(key, body, {
    httpMetadata: { contentType: "application/json" },
  });

  // put() is awaited and a throw from it is already caught by the scheduled
  // handler, but a truncated write (a pathological row breaking
  // JSON.stringify partway, or a partial R2 write) resolves normally and
  // looks identical to a good backup. Read back only the object's size — not
  // its body, these dumps are whole-database exports — and compare it
  // against the byte length of what was sent. Byte length, not
  // body.length: that's UTF-16 code units, and any non-ASCII row would make
  // a good backup look wrong.
  const expectedBytes = new TextEncoder().encode(body).length;
  const stored = await env.DOCS.head(key);
  if (!stored || stored.size !== expectedBytes) {
    throw new Error(
      `backup write verification failed for ${key}: expected ${expectedBytes} bytes, found ${
        stored ? `${stored.size} bytes` : "no object"
      }`,
    );
  }

  const listed = await env.DOCS.list({ prefix: BACKUP_PREFIX });
  const keys = listed.objects.map((o) => o.key).sort();
  const toDelete = keys.slice(0, Math.max(0, keys.length - BACKUP_RETENTION));
  await Promise.all(toDelete.map((k) => env.DOCS.delete(k)));
}
