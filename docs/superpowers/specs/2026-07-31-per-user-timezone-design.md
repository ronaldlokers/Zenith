# Per-user timezone — design

**Date:** 2026-07-31
**Status:** approved
**Issue:** #518

## Goal

Give every user a stored IANA timezone, so the server agrees with the board
about what day it is — and so no push arrives before a civilised hour in the
user's own morning.

Since #516, `today()` on the client is the **local** calendar date:
`next_action_at`, `follow_up_at` and `deadline_at` are dates a user picks in
their own calendar, so a UTC "today" read tomorrow's actions as due all evening
west of UTC. The server never got that fix, because it has no per-user timezone
to work from. `worker/notifications.ts`, `worker/calendar.ts` and the
`date('now')` SQL defaults are all UTC, and SQLite's `date('now')` has no notion
of a user.

Two open issues inherit the bug if they are built first: **#62** (notify on
*upcoming* `next_action_at`) is a server-side date comparison, and **#114**
(weekly digest) already builds its week key from `toISOString()`. Doing this
first means both ship correct instead of being reworked.

## What the user sees

A **Time zone** select in Settings › General, in the existing
`.settings-fieldgrid` beside Language and Theme, showing the current time in the
selected zone underneath it.

```
┌─ Language ───────────┐ ┌─ Theme ──────────────┐
│ English            ▾ │ │ Automatic          ▾ │
└──────────────────────┘ └──────────────────────┘
┌─ Time zone ──────────┐
│ Europe/Amsterdam   ▾ │
│ 14:32 right now      │   ← muted small
└──────────────────────┘
```

The time makes the setting self-verifying: a bare zone name gives you no way to
tell whether it is right, and this is a field most people set once and never
look at again.

Beyond that, the feature is invisible: due items become due on the user's own
day boundary, and pushes stop arriving at 02:00.

## Decisions

**Detection runs once.** On load, if the stored timezone is `NULL`, the client
sends the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`. After
that the value is user-owned and only the select changes it — so a deliberate
choice survives travel, a VPN, or a work laptop in another region. Re-detecting
on every load would silently overwrite the one thing the setting exists to let
you say.

**The delivery hour is fixed at 08:00 local.** No column, no second select, no
extra locale keys. Making it configurable later is additive; shipping a setting
nobody moves is permanent surface area.

**Recording and pushing are separated.** This is the load-bearing decision. The
gate applies to *every* push, not only the day-boundary ones — but the
new-feed-match notification carries its count from the run that inserted the
listings, so holding the whole generator would mean decoupling the count from
its run. Instead:

- notification **records** are created exactly as they are today, on whatever
  cron produced them;
- a separate hourly pass sends the **push** for records whose owner has reached
  08:00 local, and stamps them.

One gate instead of one per generator, the bell stays current, the feed-match
count stays coupled to its run, and the weekly digest inherits the behaviour for
free because it flows through the same records.

**The bell is immediate; only push waits.** Opening the app at 06:00 shows
everything that is due. The phone stays quiet until 08:00.

**A 24-hour freshness window on the push pass.** Only records created in the
last 24 hours are eligible, so re-enabling push after a quiet week does not
blast a backlog.

**No push coalescing in v1.** Five due items means five pushes. Worth watching at
~50 applications per heavy user; not worth building yet.

## Architecture

### Storage

Migration `0051_user_timezone_and_push_state.sql` — named for both columns,
since it carries the push-gate state as well as the preference. It follows the
`locale` precedent (`0042_user_locale.sql`) for the preference column:

```sql
ALTER TABLE "user" ADD COLUMN timezone TEXT;
ALTER TABLE notifications ADD COLUMN pushed_at TEXT;
```

`timezone` `NULL` means unset and is treated as UTC — the same shape as `locale`
`NULL` meaning `en`. `pushed_at` `NULL` means "not yet pushed".

### `worker/tz.ts` — the only place timezone maths lives

```ts
localDate(tz: string | null, now: Date): string   // "YYYY-MM-DD"
localHour(tz: string | null, now: Date): number   // 0–23
```

Both via `Intl.DateTimeFormat("en-CA", { timeZone })`, which yields
`YYYY-MM-DD` directly and handles DST without offset arithmetic. A `null`,
empty or invalid zone falls back to UTC rather than throwing — an unparseable
stored value must never break notification generation for everyone else.

### Generation

`worker/notifications.ts`: the two due queries stop using `date('now')` and bind
a per-user local date instead. Users are grouped by timezone, each distinct
zone's local date is computed once, and the queries run scoped to each group. At
invite-only scale that is a handful of queries, not one per user.

`worker/calendar.ts`: `interactions.happened_at >= date('now')` binds the token
owner's local date — the ICS feed is per-token, so the user is known.

`worker/digest.ts`: the week key is currently one UTC date stamped across the
whole run. It becomes **per-user**, computed from each row's own timezone as the
digest is built — otherwise users either side of the date boundary share a key
that is wrong for one of them. The key is a dedup value, so getting it wrong
means a user silently misses a digest rather than seeing a visible error.

### Push pass

A new `deliverDuePushes(env)` pass selects notifications where `pushed_at IS
NULL`, the record is under 24 hours old, and the owner's `localHour` is 8 or
later; sends the push; stamps `pushed_at`.

`insertAndPush` in `worker/notifications.ts` becomes insert-only.

**No new cron trigger.** The free plan allows 5 per *account*, not per Worker,
and the account is already at 4 (Zenith's 3 plus one elsewhere). Adding a fourth
here would take the last slot. Instead the existing trigger goes hourly and the
handler branches:

```jsonc
"crons": ["17 * * * *", "11 3 * * *", "0 8 * * 1"]
//          ^ was 17 */6 * * *
```

```ts
const hour = new Date(event.scheduledTime).getUTCHours();
if (hour % 6 === 0) {
  // Feed pull stays 6-hourly — external sources, and nothing about a
  // listing needs hourly resolution. Only the push pass does, so it can
  // land near 08:00 local in any timezone.
  const [feed] = await Promise.all([refreshFeed(env), checkStalePostings(env)]);
  await generateNotifications(env, feed.inserted);
}
await deliverDuePushes(env);
```

`hour % 6 === 0` reproduces the current 00:17 / 06:17 / 12:17 / 18:17 cadence
exactly. Use `event.scheduledTime`, not `Date.now()` — a retried or delayed
invocation must branch on the time it was scheduled for, not the time it ran.

The trade is that the feed cadence is no longer visible in `wrangler.jsonc`; the
comment above is therefore mandatory, not decorative. The account stays at 4 of
5 with a slot free.

### Client

- `PUT /api/preferences/timezone`, validating by constructing an
  `Intl.DateTimeFormat` with the given zone and rejecting anything that
  throws — not by list membership against `Intl.supportedValuesOf("timeZone")`,
  which (per the edge-case table below) omits `UTC`, our own fallback, and
  would reject it.
- `api.setTimezone(tz)` in `src/api.ts`, beside `setLocale`.
- A native `<select>` in `src/settings/index.tsx`'s General section, options
  from `Intl.supportedValuesOf("timeZone")` grouped into `<optgroup>` by the
  segment before the first `/`.
- The current time as a third child of the `.settings-field` label:
  `<span className="muted small">`. `.settings-field` is already
  `flex-direction: column; gap: 0.3rem`, so this needs **no new CSS**, and
  `.muted`/`.small` are two of the three global utilities the self-containment
  rule permits. Formatted with the active i18n language and the selected zone;
  recomputed on render and on change, with **no ticking timer** — a settings
  page is not open long enough for a minute of staleness to matter, and a timer
  is a live value in a surface the screenshot rig captures.

## States and edge cases

| State | Behaviour |
| --- | --- |
| `timezone` NULL (existing users, pre-migration) | Treated as UTC — today's behaviour exactly. Client detects and stores on next load. |
| Browser lacks `Intl.supportedValuesOf` | Select falls back to the detected zone as the only option; the setting still works, the list is just not browsable. (Supported in all current browsers; Safari from 15.4.) |
| Stored zone is not in `supportedValuesOf` | All 418 returned zones contain a `/`, but `UTC` — our own fallback — is **not** among them, and legacy aliases (`Asia/Calcutta`) may not be either. The select must inject the current stored value as an option when it is missing, or opening Settings would silently reset a working zone to whatever happens to be first. |
| Stored zone invalid or no longer in the IANA database | `worker/tz.ts` falls back to UTC. Generation never throws. |
| Item becomes due at 02:00 local | Record created at the next generation run; push held until 08:00. |
| Item created at 14:00 local, due today | Already past 08:00, so the next hourly pass sends it — the hold is about not waking people, not about delaying work that is already late. |
| Push re-enabled after a week away | Only records from the last 24h are pushed. |
| User in a DST transition | `Intl.DateTimeFormat` resolves the correct local date and hour on both sides; no offset arithmetic to get wrong. |

## Testing

- **`worker/tz.ts` unit tests** — local date and hour either side of a DST
  transition, a negative-offset zone where the UTC and local dates differ, and
  the invalid/null fallback to UTC.
- **Worker tests** — the push pass holds a record before the local hour and
  releases it after; the 24-hour window excludes an older record; due queries
  select on the user's local date rather than UTC; the `hour % 6` branch runs
  the feed exactly at the four old times and never at the other twenty, driven
  by `event.scheduledTime` rather than the wall clock.
- **Client tests** — detection fires only when the stored value is `NULL`; the
  select renders grouped options and PUTs on change; the local-time hint shows
  the time for the *selected* zone, not the browser's.
- Follow the `src/format.test.ts` pattern from #515: fake timers via
  `vi.setSystemTime`, a pinned non-UTC process timezone, and a **guard test that
  fails if the pin stops applying** — without it the timezone assertions pass
  vacuously in CI, which runs in UTC.
- Screenshot captures for `settings` and `settings-account` will change, since
  General gains a field. That is expected and reviewed, not a zero-diff failure.

## Out of scope

- Making the delivery hour configurable.
- Push coalescing.
- Quiet-hours as a general user-facing concept.
- #62 and #114 themselves — this unblocks them, it does not build them.
- Any change to `today()` on the client; #516 already did that.

## Constraints a builder must not invent around

- Strict en/nl key parity for every new string; no hardcoded copy.
- The timezone list is data, not copy — zone ids stay untranslated. Only the
  field label and the hint are localized.
- Responsive parity: the select must work at 390px, where it renders as the OS
  picker.
- No new CSS in `App.css` after the control-normalization layer; this design
  needs none at all.
- No telemetry. The timezone is a preference, not an analytic.
