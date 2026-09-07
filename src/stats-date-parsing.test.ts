import { describe, expect, test } from "vitest";
import { responseTime } from "./stats";
import type { StatusHistoryRow } from "./types";

// stats.ts used to carry its own copy of the SQL-date parser (sqlMs), which
// had already silently diverged from format.ts's parseSqlDate once: the ISO
// branch — a value that already carries a T and a Z must not get "Z"
// appended again — was the fix format.ts picked up and the copy missed. This
// pins responseTime, a public function that turns parsed dates directly into
// a day count, against both wire formats status_history actually carries:
// SQLite's "YYYY-MM-DD HH:MM:SS" and the ISO strings a `new Date(...)`
// serializes to.
const row = (
  application_id: number,
  from_status: string | null,
  to_status: string,
  changed_at: string,
): StatusHistoryRow => ({ application_id, from_status, to_status, changed_at }) as StatusHistoryRow;

// Three applications are needed for a non-null median (MIN_CONVERSION_N).
// Each applies then gets a reply exactly 2 days later, so the median is
// pinned to a value that only comes out right if both timestamps in every
// pair were actually parsed.
describe("responseTime date parsing", () => {
  test("handles SQLite-style timestamps", () => {
    const history = [1, 2, 3].flatMap((id) => [
      row(id, null, "applied", "2026-09-01 00:00:00"),
      row(id, "applied", "screening", "2026-09-03 00:00:00"),
    ]);
    const result = responseTime(history, Date.parse("2026-09-10T00:00:00Z"));
    expect(result.n, "all three replies should count as answered").toBe(3);
    expect(result.median, "each pair is exactly 2 days apart").toBe(2);
  });

  test("handles ISO timestamps", () => {
    const history = [1, 2, 3].flatMap((id) => [
      row(id, null, "applied", "2026-09-01T00:00:00.000Z"),
      row(id, "applied", "screening", "2026-09-03T00:00:00.000Z"),
    ]);
    const result = responseTime(history, Date.parse("2026-09-10T00:00:00Z"));
    expect(result.n, "all three replies should count as answered").toBe(3);
    expect(result.median, "each pair is exactly 2 days apart").toBe(2);
  });
});
