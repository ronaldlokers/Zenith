// Operator visibility for the scheduled tasks, in its own module because both
// the scheduled handler and the feed pull record into it — and feed.ts is
// imported by index.ts, so putting it there would be a cycle.
//
// console.error was the whole failure signal before this, and Workers Logs has
// no alerting: the way to learn that the weekly digest had been throwing for a
// month was to go looking for it.
//
// Successes are recorded too. A task that throws leaves an error row; a task
// that silently stops firing leaves nothing, and only the successes can show
// the second kind.
const CRON_RUN_RETENTION_DAYS = 30;

export async function recordCronRun(
  env: Env,
  label: string,
  err: unknown,
): Promise<void> {
  // Never let the bookkeeping become the outage. This runs inside the catch
  // that already handled the real failure, so throwing here would replace a
  // recorded error with an unrecorded one.
  try {
    const message =
      err == null
        ? null
        : (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await env.DB.prepare(
      "INSERT INTO cron_runs (label, ok, error) VALUES (?, ?, ?)",
    )
      .bind(label, err == null ? 1 : 0, message)
      .run();
    await env.DB.prepare(
      `DELETE FROM cron_runs WHERE ran_at < datetime('now', ?)`,
    )
      .bind(`-${CRON_RUN_RETENTION_DAYS} days`)
      .run();
  } catch (e) {
    console.error("recording the cron run failed", e);
  }
}
