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

/** The hour (0–23) in `tz` at `now`. */
export function localHour(tz: string | null | undefined, now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeZone(tz),
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "0";
  // Some ICU builds render midnight as "24" under hour12:false.
  return Number(hour) % 24;
}
