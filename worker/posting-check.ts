import { guardedFetch } from "./url-guard.js";
// Stale/expired posting detection (issue #65) — advisory only. Never
// changes an application's status; only sets posting_status so the UI
// can show a soft "posting may be gone" badge and let a human decide.
// False positives are expected (login walls, anti-bot pages, redirects
// to a live posting under a new URL), so detection stays conservative:
// a hard HTTP error, or a redirect that collapses to a bare top-level
// page (the shape of a "bounced to the generic listings page" result).

// Per account, not per deployment. This was one global BATCH_SIZE with no
// user_id predicate — the fifteen least-recently-checked applications across
// everyone — which is a constant tuned when there was one account and becomes
// a division the moment there are two. At the stated ~50 applications per
// heavy user and a run every six hours, three users already meant a posting
// was re-checked about every three days, so the "posting may be gone" badge
// was reporting a state that could be days old.
//
// The old ordering was worse than an even split, too: all-NULL
// posting_checked_at values tie, so whoever inserted first took the whole
// batch. A user who added fifty applications at once could starve everyone
// else indefinitely.
export const PER_USER_BATCH = 15;

// And a ceiling, because the work is now unbounded in the number of accounts
// and each candidate is a network probe. Workers cap subrequests per
// invocation, so a deployment large enough to pass this would otherwise start
// failing the whole run rather than doing less of it.
//
// It binds at roughly thirteen active accounts. Past that the round-robin
// ordering below is what matters: rows are taken rank-first, so everyone's
// oldest posting is checked before anyone's second-oldest, and the shortfall
// is shared instead of landing entirely on whoever sorts last.
export const GLOBAL_CEILING = 200;
const FETCH_TIMEOUT_MS = 8000;

// Each attempt gets its own controller + timeout (#285) — a HEAD and its
// GET fallback previously shared one signal, so a HEAD timeout left the
// controller already aborted and the GET fallback failed instantly.
function fetchWithTimeout(
  url: string,
  method: string,
): Promise<{ res: Response; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // guardedFetch applies the SSRF policy (#346) — application URLs are
  // user-supplied and this cron re-fetches them unattended.
  return guardedFetch(url, {
    method,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
}

export function looksStale(
  httpStatus: number,
  requestedUrl: string,
  finalUrl: string,
): boolean {
  if (httpStatus >= 400) {
    return true;
  }
  if (finalUrl !== requestedUrl) {
    try {
      const reqPath = new URL(requestedUrl).pathname;
      const finalPath = new URL(finalUrl).pathname;
      const finalSegments = finalPath.split("/").filter(Boolean);
      if (finalSegments.length <= 1 && finalPath.length < reqPath.length * 0.4) {
        return true;
      }
    } catch {
      // malformed URL — not enough signal either way
    }
  }
  return false;
}

export async function checkStalePostings(env: Env): Promise<{ checked: number; flagged: number }> {
  const { results } = await env.DB.prepare(
    `WITH ranked AS (
       SELECT id, url, user_id,
              ROW_NUMBER() OVER (
                PARTITION BY user_id
                ORDER BY posting_checked_at IS NOT NULL, posting_checked_at ASC, id
              ) AS rn
         FROM applications
        WHERE url IS NOT NULL
          AND status NOT IN ('rejected', 'withdrawn', 'ghosted')
     )
     SELECT id, url FROM ranked
      WHERE rn <= ?
      ORDER BY rn, user_id
      LIMIT ?`,
  )
    .bind(PER_USER_BATCH, GLOBAL_CEILING)
    .all<{ id: number; url: string }>();

  // Check every candidate concurrently (#346) — each is an independent
  // network probe; a sequential loop of up-to-15 × 8s timeouts could run
  // for minutes.
  const checks = await Promise.all(
    results.map(async (app) => {
      let postingStatus: string | null = null;
      try {
        const { res, finalUrl } = await fetchWithTimeout(app.url, "HEAD").catch(
          () => fetchWithTimeout(app.url, "GET"),
        );
        postingStatus = looksStale(res.status, app.url, finalUrl)
          ? "maybe_stale"
          : "ok";
      } catch {
        // network error, timeout, blocked, etc. — inconclusive, not stale
        postingStatus = null;
      }
      return { id: app.id, postingStatus };
    }),
  );
  const flagged = checks.filter((c) => c.postingStatus === "maybe_stale").length;
  // One batched write instead of one round-trip per candidate. Guarded because
  // D1 rejects an empty batch with "No SQL statements detected", and the
  // candidate set is legitimately empty whenever no non-terminal application
  // carries a url — a fresh account, a demo reset, or anyone who only ever
  // types a company name (#526).
  if (checks.length > 0) {
    await env.DB.batch(
      checks.map((c) =>
        env.DB.prepare(
          `UPDATE applications SET posting_status = ?, posting_checked_at = datetime('now') WHERE id = ?`,
        ).bind(c.postingStatus, c.id),
      ),
    );
  }
  return { checked: results.length, flagged };
}
