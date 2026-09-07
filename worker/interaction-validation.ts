import { parseSqlDate } from "../src/momentum.js";

// The three shapes that actually reach this field: SQLite's date('now')
// (YYYY-MM-DD), datetime('now') (YYYY-MM-DD HH:MM:SS), and an ISO-8601
// string with T/Z from the browser. Anything else 400s rather than landing
// in the column and NaN-ing out of parseSqlDate() later — which drops the
// row from every momentum/response-time window with no error anywhere.
const HAPPENED_AT_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?: \d{2}:\d{2}:\d{2}|T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)?$/;

// Absent and null are always fine — that's the coalesce(?, date('now'))
// fallback's job, not this function's. Only a present, non-null value that
// doesn't parse to a real calendar date is an error. The regex alone isn't
// enough: new Date("2026-02-31") doesn't throw, it rolls over to March 3, so
// day-of-month is checked against the actual length of that month too.
export function happenedAtError(body: Record<string, unknown>): string | null {
  const raw = body.happened_at;
  if (raw === undefined || raw === null) return null;
  const match = typeof raw === "string" ? HAPPENED_AT_RE.exec(raw) : null;
  if (!match || !Number.isFinite(parseSqlDate(raw as string))) {
    return "happened_at must be a valid date";
  }
  const [, y, mo, d] = match;
  const daysInMonth = new Date(Date.UTC(Number(y), Number(mo), 0)).getUTCDate();
  if (Number(d) > daysInMonth) return "happened_at must be a valid date";
  return null;
}
