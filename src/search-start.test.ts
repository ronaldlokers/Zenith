import { describe, expect, test } from "vitest";
import { searchStart, searchWeekNumber } from "./format";

// Settings printed "Search started: NOT SET" while Today and Insights both
// asserted "Week 29 of your search" on the same account. The number was
// derived from the earliest application — a good default — and shown with
// exactly the certainty of a date the user had actually set.
//
// Two screens disagreeing about whether the app knows something is how a
// derived figure stops being believed, so the fallback now reports which it
// is and the copy differs. This pins the distinction rather than the wording.
const app = (d: string) => ({ applied_at: d, created_at: d });

describe("where the search-week count starts from", () => {
  test("uses the configured date and says nothing was guessed", () => {
    const s = searchStart("2026-01-01", [app("2025-06-01")]);
    expect(s.date).toBe("2026-01-01");
    // Even though an earlier application exists: the user's own answer wins.
    expect(s.inferred).toBe(false);
  });

  test("falls back to the earliest application, and admits it", () => {
    const s = searchStart(null, [app("2026-03-04"), app("2026-01-02"), app("2026-02-03")]);
    expect(s.date).toBe("2026-01-02");
    expect(s.inferred).toBe(true);
  });

  test("reads created_at when an application was never sent", () => {
    // A saved-but-not-applied row still marks when the search was under way.
    const s = searchStart(null, [{ applied_at: null, created_at: "2026-01-05" }]);
    expect(s.date).toBe("2026-01-05");
    expect(s.inferred).toBe(true);
  });

  test("is not inferred when there is nothing to infer from", () => {
    // The empty account. `inferred` must not claim a guess was made, or the
    // copy would promise a first application that does not exist.
    const s = searchStart(null, []);
    expect(s.date).toBeNull();
    expect(s.inferred).toBe(false);
  });

  test("still produces the same week number either way", () => {
    // The fix is about what the label claims, not about moving the count.
    const now = Date.parse("2026-01-29T00:00:00Z");
    expect(searchWeekNumber(searchStart("2026-01-01", []).date, now)).toBe(5);
    expect(searchWeekNumber(searchStart(null, [app("2026-01-01")]).date, now)).toBe(5);
  });
});
