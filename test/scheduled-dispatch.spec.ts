import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { shouldRunFeedPull } from "../worker/index";

// The feed cadence moved out of wrangler.jsonc and into this branch, so it is
// the only place the 6-hourly schedule is still expressed. These four hours
// reproduce the old "17 */6 * * *" exactly.
describe("shouldRunFeedPull", () => {
  it("runs at the four hours the old 6-hourly cron fired", () => {
    for (const hour of [0, 6, 12, 18]) {
      expect(shouldRunFeedPull(new Date(Date.UTC(2026, 7, 5, hour, 17)))).toBe(true);
    }
  });

  it("does not run at the other twenty", () => {
    const others = [...Array(24).keys()].filter((h) => ![0, 6, 12, 18].includes(h));
    for (const hour of others) {
      expect(shouldRunFeedPull(new Date(Date.UTC(2026, 7, 5, hour, 17)))).toBe(false);
    }
  });
});

type ScheduledArgs = Parameters<NonNullable<typeof worker.scheduled>>;

function fakeController(scheduledTime: number): ScheduledArgs[0] {
  return { scheduledTime, cron: "17 * * * *", noRetry: () => {} } as ScheduledArgs[0];
}

// These exercise scheduled() itself, not the pure predicate above — a
// version of the handler that read Date.now() instead of event.scheduledTime
// would still pass every shouldRunFeedPull test while getting this wrong in
// production (a retried/delayed invocation would skip or double the feed
// pull). Pinning the wall clock away from the scheduled time is what forces
// the handler to prove it reads the right one.
//
// This does NOT mock refreshFeed/checkStalePostings/generateNotifications/
// deliverDueNotifications and assert one was called — that was tried first, and
// doesn't work here: worker/index.ts is the wrangler `main` entry, and
// @cloudflare/vitest-pool-workers loads the entry's own module graph as a
// separate, pre-bundled "worker under test" that vi.mock cannot reach.
// (Confirmed empirically: mocking a module that the entry imports directly
// has no effect on the entry's own calls to it, even though the very same
// mock IS visible to a binding this test file imports for itself — two
// different module instances of the same file.) Instead, this asserts on
// the dispatch shape: the feed branch and the push branch are each their own
// ctx.waitUntil (see the comment at the split in worker/index.ts), so
// "did the feed branch run" is exactly "was waitUntil called once (push
// only) or twice (feed + push)". The background promises are left to run
// for real — on a fresh test DB that's a no-op for refreshFeed (no feed
// sources configured) and a caught-and-logged error for checkStalePostings
// (it batches zero UPDATE statements when there are no applications, which
// D1 rejects — a pre-existing gap, not something this task introduced or is
// asserting on). Neither promise's outcome is asserted on, so it doesn't
// matter to the test.
describe("scheduled handler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the feed pull when scheduledTime lands on a firing hour, even off a non-firing wall clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 7, 5, 3, 0)); // wall clock: 3 % 6 !== 0

    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) } as ScheduledArgs[2];

    await worker.scheduled(fakeController(Date.UTC(2026, 7, 5, 0, 17)), env, ctx);

    // stale-posting check + feed pull + delivery. Three, not two: the stale
    // check was moved out of the feed pull's Promise.all, where a throw in it
    // rejected the block and generateNotifications never ran — and the feed
    // notification is keyed one per user per day, so that run's batch got no
    // notification at all rather than a late one.
    //
    // The count is the assertion because the behaviour cannot be reached from
    // here. An end-to-end version was written and thrown away: it seeded an
    // application so a due-follow-up notification would be observable, and
    // seeding one removes the very condition that makes checkStalePostings
    // throw (it batches zero UPDATEs only when there are no applications). It
    // passed against the old coupling, which is the definition of proving
    // nothing. Mocking is not available either, for the reason in the comment
    // above. So: one waitUntil per independent task, counted.
    expect(promises).toHaveLength(3);
    await Promise.allSettled(promises);
  });

  it("skips the feed pull when scheduledTime lands on a non-firing hour, even off a firing wall clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 7, 5, 0, 17)); // wall clock: firing hour

    const promises: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => promises.push(p) } as ScheduledArgs[2];

    await worker.scheduled(fakeController(Date.UTC(2026, 7, 5, 3, 0)), env, ctx);

    expect(promises).toHaveLength(1); // delivery branch only
    await Promise.allSettled(promises);
  });
});
