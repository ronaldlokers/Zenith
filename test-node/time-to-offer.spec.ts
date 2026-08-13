import { describe, expect, it } from "vitest";
import { medianTimeToOffer } from "../src/format";

// The tile printed "~56d MEDIAN TO OFFER" off a single offer. The number was
// true; the word was not. A median of one value is that value, and calling it
// a median claims a spread the data does not have — on the largest type on
// the page, which is the figure someone repeats to a friend.
//
// The fix is that the function returns the count as well, so the caller
// cannot state the figure without knowing what it rests on. These pin the
// count, which is the part a future caller could quietly drop.
const h = (application_id: number, to_status: string, changed_at: string) => ({
  application_id,
  to_status,
  changed_at,
});

describe("medianTimeToOffer", () => {
  it("reports how many offers the figure rests on", () => {
    const r = medianTimeToOffer([
      h(1, "applied", "2026-01-01 00:00:00"),
      h(1, "offer", "2026-01-11 00:00:00"),
    ]);
    expect(r.days).toBe(10);
    expect(r.n, "one offer has to be visible as one offer").toBe(1);
  });

  it("medians across offers once there are several", () => {
    const r = medianTimeToOffer([
      h(1, "applied", "2026-01-01 00:00:00"),
      h(1, "offer", "2026-01-05 00:00:00"),
      h(2, "applied", "2026-01-01 00:00:00"),
      h(2, "offer", "2026-01-11 00:00:00"),
      h(3, "applied", "2026-01-01 00:00:00"),
      h(3, "offer", "2026-01-21 00:00:00"),
    ]);
    expect(r.days).toBe(10);
    expect(r.n).toBe(3);
  });

  it("says nothing, and says it is nothing, with no offers", () => {
    const r = medianTimeToOffer([h(1, "applied", "2026-01-01 00:00:00")]);
    expect(r).toEqual({ days: null, n: 0 });
  });

  it("ignores an offer with no application date before it", () => {
    // Imported or hand-entered rows can start mid-pipeline. Counting one as
    // a zero-day offer would drag the figure toward zero, which is the
    // direction that flatters the search.
    const r = medianTimeToOffer([h(1, "offer", "2026-01-11 00:00:00")]);
    expect(r).toEqual({ days: null, n: 0 });
  });
});
