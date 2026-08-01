// The only place per-user timezone maths lives. Both functions take the zone
// and the instant explicitly, so nothing here reads ambient state — that is
// what makes them testable without fake timers or a pinned process timezone.
//
// A null, empty or unrecognised zone falls back to UTC rather than throwing.
// Notification generation runs for every user in one pass, and one bad stored
// value must not stop everyone else's notifications.

function safeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** The calendar date in `tz` at `now`, as "YYYY-MM-DD". */
export function localDate(tz: string | null | undefined, now: Date): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape the date-only
  // columns (next_action_at, follow_up_at, deadline_at) store.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeZone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The calendar date in `tz` `days` after `now`, as "YYYY-MM-DD".
 *
 * Resolves the local date first, then does the arithmetic in pure calendar
 * space. Adding `days * 86400000` to the instant instead would be wrong across
 * a DST transition, where a local day is 23 or 25 hours — and "tomorrow" has to
 * mean the next date on the user's calendar, not 24 hours later.
 */
export function localDatePlus(
  tz: string | null | undefined,
  now: Date,
  days: number,
): string {
  const [y, m, d] = localDate(tz, now).split("-").map(Number);
  // Date.UTC handles month and year rollover; anchoring in UTC keeps this
  // arithmetic free of any zone, which is correct once the date is resolved.
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The hour (0–23) in `tz` at `now`. */
export function localHour(tz: string | null | undefined, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeZone(tz),
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  // Some ICU builds render midnight as "24" under hour12:false — a 24 would
  // pass a `>= 8` delivery-hour gate at exactly the wrong moment
  // (deliverDueNotifications in notifications.ts), so it's normalised here.
  // Workerd's ICU doesn't reproduce the "24" case (test/tz.spec.ts's "reports
  // midnight as 0" can't demonstrate this guard is load-bearing on this
  // runtime), but other Node/ICU builds do — kept defensively, don't delete
  // it on the strength of the test suite alone.
  return Number(hour) % 24;
}
