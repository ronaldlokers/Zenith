// Cloudflare Workers cap outbound "simultaneous connections waiting for
// response headers" at exactly six per invocation, on every plan:
// https://developers.cloudflare.com/workers/platform/limits/#simultaneous-open-connections
// A seventh fetch doesn't error, it just queues — but a fetch that carries
// its own abort timeout (feed.ts's FEED_TIMEOUT_MS, posting-check.ts's
// FETCH_TIMEOUT_MS) starts that timer the instant it's issued, before it has
// a connection slot. Fire off more of them at once than this and the queued
// ones burn their timeout waiting for a turn rather than waiting for an
// answer, so they fail even though nothing was actually slow. Matching our
// own concurrency to the platform's is what keeps that timer meaning what it
// says, and it holds regardless of plan — this is not the 50/10,000
// subrequests-per-invocation total, which is a separate, plan-dependent axis
// this module does nothing about.
export const PLATFORM_CONNECTION_LIMIT = 6;

// Runs `jobs` with at most `limit` in flight at once. Each job is a thunk
// (not a promise) so nothing starts until this picks it up — a plain array
// of promises would already have fired every request by the time this saw
// them. A worker per slot pulls the next index off a shared cursor rather
// than fixed-size batches, so a fast job doesn't sit idle waiting out a slow
// one that happened to land in the same batch.
export async function runBounded<T>(
  jobs: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  async function worker() {
    for (let i = next++; i < jobs.length; i = next++) {
      results[i] = await jobs[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}
