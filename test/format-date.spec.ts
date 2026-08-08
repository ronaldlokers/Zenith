import { describe, expect, it } from "vitest";
import { formatDateWithYear } from "../src/format";

const LONG: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

describe("formatDateWithYear", () => {
  it("reads a stored SQL timestamp as UTC, not as a local date part", () => {
    // datetime('now') writes "YYYY-MM-DD HH:MM:SS" in UTC. Slicing to the date
    // part would print the UTC calendar day, so a key generated just after
    // local midnight east of Greenwich would be dated to the day before (#516).
    const stored = "2026-08-08 23:00:00";
    expect(formatDateWithYear(stored)).toBe(
      new Date("2026-08-08T23:00:00Z").toLocaleDateString(undefined, LONG),
    );
  });

  it("accepts an ISO string too, for the optimistic client-side value", () => {
    const iso = "2026-08-08T23:00:00.000Z";
    expect(formatDateWithYear(iso)).toBe(
      new Date(iso).toLocaleDateString(undefined, LONG),
    );
  });

  it("keeps the year, unlike formatDate", () => {
    expect(formatDateWithYear("2024-01-15 10:00:00")).toMatch(/2024/);
  });
});
