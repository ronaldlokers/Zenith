import { guardedFetch } from "./url-guard.js";
// Stale/expired posting detection (issue #65) — advisory only. Never
// changes an application's status; only sets posting_status so the UI
// can show a soft "posting may be gone" badge and let a human decide.
// False positives are expected (login walls, anti-bot pages, redirects
// to a live posting under a new URL), so detection stays conservative:
// a hard HTTP error, or a redirect that collapses to a bare top-level
// page (the shape of a "bounced to the generic listings page" result).

const BATCH_SIZE = 15;
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
    `SELECT id, url FROM applications
     WHERE url IS NOT NULL
       AND status NOT IN ('rejected', 'withdrawn', 'ghosted')
     ORDER BY posting_checked_at IS NOT NULL, posting_checked_at ASC
     LIMIT ?`,
  )
    .bind(BATCH_SIZE)
    .all<{ id: number; url: string }>();

  let flagged = 0;
  for (const app of results) {
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
    if (postingStatus === "maybe_stale") flagged++;
    await env.DB.prepare(
      `UPDATE applications SET posting_status = ?, posting_checked_at = datetime('now') WHERE id = ?`,
    )
      .bind(postingStatus, app.id)
      .run();
  }
  return { checked: results.length, flagged };
}
