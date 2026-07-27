import { describe, it, expect } from "vitest";
import { searchWeekNumber } from "../src/format";

// The goalStreak suite went with the function (#492): the streak only ever
// fed the Today quota card, where it congratulated a zero week. The weekly
// goal itself still lives in Settings; nothing computes a streak from it.

describe("searchWeekNumber", () => {
  const now = Date.parse("2026-02-15T12:00:00");
  it("counts 1-based weeks since the start", () => {
    expect(searchWeekNumber("2026-02-15", now)).toBe(1); // same day → week 1
    expect(searchWeekNumber("2026-02-08", now)).toBe(2); // 7 days → week 2
    expect(searchWeekNumber("2026-01-04", now)).toBe(7); // 42 days → week 7
  });
  it("returns null without a start date", () => {
    expect(searchWeekNumber(null, now)).toBeNull();
    expect(searchWeekNumber(undefined, now)).toBeNull();
  });
});
