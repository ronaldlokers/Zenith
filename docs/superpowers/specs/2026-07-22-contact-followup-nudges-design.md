# Contact follow-up nudges — design

**Date:** 2026-07-22
**Status:** approved

## Problem

Contacts already carry a user-set `follow_up_at` date and the contacts UI already
shows a "Follow-up due" badge (`isFollowUpDue` / `isFollowUpOverdue` in
`src/network.tsx`). But unlike applications — whose due `next_action_at` produces
a `due_followup` notification-center entry **and** a push — a due contact
follow-up produces nothing. The reminder only exists if the user happens to open
the Network tab. This wires `contacts.follow_up_at` into the existing
notification generator so a due follow-up reaches the user like an application
one does.

## What already exists (reused, not rebuilt)

- `worker/notifications.ts` — `generateNotifications()` runs on the daily cron
  (`11 3 * * *`), inserting idempotent rows (`dedup_key` + `ON CONFLICT DO
  NOTHING`) and pushing each genuinely-new row via `insertAndPush`.
- `notifications` table (migration `0032`) with
  `CHECK (type IN ('due_followup','stale_posting','feed_match'))`.
- `Contact.follow_up_at` (nullable date), surfaced in the contacts UI.
- The notification center (`worker` route + `NotificationBell` component) renders
  any notification generically from `{title, body, link}`.

## Feature

Add one `insertAndPush` block to `generateNotifications`, mirroring the
application `due_followup` block but keyed off contacts:

```sql
INSERT INTO notifications (user_id, type, title, body, link, dedup_key)
SELECT contacts.user_id, 'due_contact', contacts.name,
       COALESCE(contacts.role, ''),
       '/people/' || contacts.id,
       'contact_followup:' || contacts.id || ':' || contacts.follow_up_at
FROM contacts
WHERE contacts.follow_up_at IS NOT NULL
  AND contacts.follow_up_at <= date('now')
ON CONFLICT (user_id, dedup_key) DO NOTHING
RETURNING user_id, title, body, link
```

- **`dedup_key`** embeds `follow_up_at`, so rescheduling produces a fresh nudge
  and an unchanged date nudges exactly once (no repeat spam) — same idempotency
  contract as `due_followup`.
- **`link`** → `/people/<id>` (the contacts route).
- **No `outreach_status` exclusion** — the type has no terminal state
  (`not_contacted | awaiting_reply | replied | no_response`), and `follow_up_at`
  is user-set, so a set date always warrants the nudge.

## Notification type: new `due_contact`

Add a distinct `due_contact` type (chosen over reusing `due_followup`). The
`type` column has a CHECK constraint, so a migration rebuilds the table with the
extended CHECK. Distinct type keeps the data model honest and allows a distinct
icon / per-type filtering later without a backfill.

## Files touched

1. **`migrations/0033_notification_due_contact.sql`** — rebuild `notifications`
   with `CHECK (type IN ('due_followup','stale_posting','feed_match','due_contact'))`,
   copying existing rows and recreating the index. (SQLite can't alter a CHECK
   in place.)
2. **`worker/notifications.ts`** — the new `insertAndPush` block above.
3. **`src/types.ts`** — extend `AppNotification.type` union with `'due_contact'`.
4. **i18n** — no changes. `title`/`body` are raw contact fields built in SQL,
   consistent with the application `due_followup` block (raw `applications.title`);
   the worker has no react-i18next access regardless. Nothing user-facing is added
   on the frontend (the notification center already renders generically).

## Test plan

- Worker test (new spec file or extend the notifications test): seed a contact
  with `follow_up_at` in the past → run `generateNotifications` → assert one
  `due_contact` row with the right link; run again → assert no duplicate (dedup);
  change `follow_up_at` → assert a fresh row. Seed a future `follow_up_at` →
  assert no row.
- Gates: `tsc -b`, `build`, `oxlint`, `vitest run --no-file-parallelism`, en/nl
  parity.

## Out of scope (YAGNI)

- Staleness nudges from `last_contacted_at` (explicit-date only; avoids
  algorithmic noise, fits privacy-first ethos).
- A per-type notification settings toggle (parity with `due_followup`, which has
  none).
- Any new contacts UI (the due badge already exists).
```

## Implementation order

Migration → types → worker block → tests → gates → PR. The migration and worker
block are the substance; the rest is small.
