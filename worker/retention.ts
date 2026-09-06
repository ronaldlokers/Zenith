// Data minimisation for the two auth tables nothing ever cleaned up.
//
// An IP address is personal data. Better Auth checks expiresAt when it reads a
// session, so an expired row is harmless as a credential — but it is not
// harmless as a record, and nothing deleted it. Over the life of an account
// the session table quietly becomes an IP and user-agent history that has
// outlived any reason to exist.
//
// rateLimit is the same shape: a row per client per window, written on every
// attempt, read only inside a window measured in seconds.
//
// Two facts here were measured against the real tables rather than assumed,
// and both change the query:
//
//   expiresAt is an ISO-8601 string with a T and a Z. Comparing it as text
//   against datetime('now') — "2020-01-01T00:00:00.000Z" < "2026-09-06
//   09:00:00" — is false, because T sorts after a space. julianday() parses
//   both forms and compares them as time.
//
//   lastRequest is an integer in milliseconds, not seconds.
const RATE_LIMIT_RETENTION_DAYS = 1;

export async function pruneAuthRows(env: Env): Promise<void> {
  // Own catch, like recordCronRun. This rides the nightly backup invocation,
  // and a retention job failing must never be the reason a backup did not
  // happen.
  try {
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM session WHERE julianday(expiresAt) < julianday('now')",
      ),
      // Generous next to a window measured in seconds: the point is to stop
      // the table growing without bound, not to shave the counter close
      // enough that a live throttle could lose its count.
      env.DB.prepare('DELETE FROM "rateLimit" WHERE lastRequest < ?').bind(
        Date.now() - RATE_LIMIT_RETENTION_DAYS * 86400000,
      ),
    ]);
  } catch (e) {
    console.error("pruning the auth tables failed", e);
  }
}
