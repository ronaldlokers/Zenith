import { describe, it, expect } from "vitest";
import { goalStreak, searchWeekNumber } from "../src/format";

describe("goalStreak", () => {
  it("counts consecutive met weeks from the most recent", () => {
    // weeks oldest→newest; target 5
    expect(goalStreak([2, 6, 5, 7], 5)).toBe(3);
    expect(goalStreak([6, 2, 6, 7], 5)).toBe(2);
    expect(goalStreak([6, 6, 6, 3], 5)).toBe(0); // most recent missed
  });
  it("is zero with no goal", () => {
    expect(goalStreak([9, 9, 9], 0)).toBe(0);
  });
  it("handles an empty history", () => {
    expect(goalStreak([], 5)).toBe(0);
  });
});

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
