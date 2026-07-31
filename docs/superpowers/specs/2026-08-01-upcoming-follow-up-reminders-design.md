# Upcoming follow-up reminders — design

**Date:** 2026-08-01
**Status:** approved
**Issue:** #62 (first half — the notification change; the email transport is separate)

## Goal

Tell the user about a follow-up **the day before it is due**, not only on the day.

Today `due_followup` and `due_contact` fire on `next_action_at <= today` and
`follow_up_at <= today`, so the first anyone hears of a follow-up is the morning
it is already due. #62's complaint is that nothing pushes a reminder ahead of
time.

## Scope

This is the half of #62 that needs no new infrastructure. The other half —
delivery by **email** via a transactional provider — is untouched here, and
remains the blocker for #114. There is currently no outbound email capability
in the codebase at all.

## Behaviour

Two new notification types, `upcoming_followup` and `upcoming_contact`, created
when the date is **tomorrow** in the user's own calendar. The day-of
notifications are unchanged, so a Friday follow-up produces:

```
Thu 08:00  ▸ Follow-up tomorrow   DevOps Engineer · Lumen Robotics
Fri 08:00  ▸ Follow-up due        DevOps Engineer · Lumen Robotics
```

The 08:00-local delivery comes for free: the generation run creates the record,
and `deliverDuePushes` holds the push until the recipient's morning (#518). The
in-app bell shows it immediately, as it does for every other type.

Lead time is fixed at one day and is deliberately not configurable, following
#518's precedent of choosing a sensible value rather than shipping a preference
nobody moves.

## Implementation

### The queries

Both due queries already loop over distinct timezones. The upcoming queries are
the same shape with the comparison changed from `<= today` to `= tomorrow` —
one extra `localDate` call against a date one day ahead.

`worker/tz.ts` already owns all timezone maths and must keep owning it. The
day-ahead value is derived there, not by adding 86400000 ms at the call site:
a local day is 23 or 25 hours across a DST transition.

Two things this must not disturb, both of which cost a review cycle on #518:

- **The `NULL` timezone group needs `IS NULL`, not `= ?`.** A bound `null`
  matches nothing in SQL, which would silently drop every user who has never
  set a zone — the largest group.
- **Existing `dedup_key` values stay byte-identical.** Changing one re-notifies
  every user for every already-seen item.

### The dedup key

New prefixes: `upcoming:<id>:<date>` and `upcoming_contact:<id>:<date>`.

**Not** the existing `followup:` / `contact:` shapes. Reusing them would let the
day-before notification claim the key, and the day-of notification would then be
swallowed by `ON CONFLICT (user_id, dedup_key) DO NOTHING` — the user would be
told "tomorrow" and then hear nothing on the day itself. This is the single
easiest way to get this feature wrong, and it fails silently.

Embedding the date preserves the existing semantics: rescheduling produces a
fresh nudge, leaving the date alone nudges once.

### Migration

SQLite cannot alter a `CHECK` in place, so widening the type constraint means
rebuilding `notifications` — the established pattern from `0041` and `0043`.

**It must carry `pushed_at`.** Those earlier rebuilds predate that column
(#518 added it in `0051`), so copying one of them verbatim would drop it — and
every historical notification would become eligible for re-push inside the
24-hour window, which is precisely the deploy-day storm `0051`'s backfill exists
to prevent. The table has ten columns: `id`, `user_id`, `type`, `title`, `body`,
`link`, `dedup_key`, `read_at`, `created_at`, `pushed_at`.

### Type lists and copy

`AppNotificationType` is declared twice — `worker/index.ts` and `src/types.ts` —
and kept in sync by hand, because the worker cannot import across the tsconfig
boundary. Both need the two new members, plus a `TEST_PUSH_SAMPLES` entry each
so the admin test-push covers them.

en/nl copy for the bell. Strict key parity.

## Testing

Reuse the fixed instant from the #518 suite: at `2026-08-05T03:00:00Z` it is the
4th in Los Angeles and the 5th in Amsterdam, so a single clock exercises the
zone handling in both directions.

- fires for a follow-up dated tomorrow in the user's zone
- does **not** fire for today (that is the day-of notification's job) or for the
  day after tomorrow
- does not fire for a dead status (`rejected`, `withdrawn`, `ghosted`)
- the `NULL`-timezone group still works, and matches UTC behaviour
- **the day-before notification does not suppress the day-of one** — the
  regression the dedup prefix exists to prevent, and the only failure here that
  would be invisible in production

Note `vi.useFakeTimers()` does not reach SQLite's `date('now')` inside workerd;
only the JS-realm `Date` is faked. Since these comparisons are JS-computed and
bound, the fake clock controls them — but any test row whose `created_at` matters
must set it explicitly rather than let the column default.

## Out of scope

- Email delivery, and therefore #114.
- Making the lead time configurable.
- Any change to the day-of notifications, the 08:00 gate, or push coalescing.
