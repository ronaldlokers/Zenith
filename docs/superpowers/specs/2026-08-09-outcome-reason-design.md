# Outcome reason on terminal transitions — design

**Date:** 2026-08-09
**Status:** approved
**Backlog:** #381 — "Outcome / reason on terminal transitions"

## Goal

Capture *why* an application ended when it moves to `rejected`, `withdrawn` or
`ghosted`, and report the distribution back on Insights. Today the pipeline
records that something died and when, but never why, so the funnel has no
feedback loop: you can see that six applications died at screening and learn
nothing from it.

## Data model

Two nullable columns on `status_history` (migration `0055`):

```sql
ALTER TABLE status_history ADD COLUMN outcome_reason TEXT;
ALTER TABLE status_history ADD COLUMN outcome_note TEXT;
```

Only rows whose `to_status` is terminal ever carry them. No backfill —
historic closures have no reason and count as "not recorded" in the
breakdown.

The reason attaches to the **transition**, not the application. An application
reopened and closed again records two distinct outcomes rather than
overwriting the first, and the reason stays bound to the stage it happened at
(`from_status` is on the same row).

### Vocabulary

Slugs are stored; labels live only in i18n, so rewording never touches data.
The set is closed and scoped per terminal status:

| `to_status` | reasons |
|---|---|
| `rejected` | `no_response`, `after_screening`, `after_interview`, `role_cancelled`, `other` |
| `withdrawn` | `took_other_offer`, `comp_too_low`, `role_changed`, `bad_signal`, `other` |
| `ghosted` | `no_reply_after_applying`, `went_quiet_mid_process`, `other` |

`outcome_note` is optional free text, allowed with any reason.

## Server

One new route: `PUT /api/applications/:id/outcome`, body `{ reason, note }`.

It updates the most recent terminal `status_history` row for that application,
scoped to `user_id`. One path serves both the capture dialog and later edits
from the detail page.

`reason` is validated against the vocabulary for that row's own `to_status`,
so `comp_too_low` cannot be pinned to a `ghosted` transition. `null` clears
both fields. A 404 if the application has no terminal transition.

**Known trade-off:** changing status twice while the dialog is open lands the
reason on the newer transition. Accepted over threading a history-row id
through the status-change response — the dialog opens immediately after the
move, so the window is a user racing themselves.

### The two `status_history` selects are not the same surface

- The stats query (`worker/index.ts:1201`) gains both columns.
- The **public share page** query (`worker/index.ts:1368`) gains neither.
  `outcome_note` is free text the user wrote, and that page is aggregate-only
  by standing rule.

`status_history` is written only by application code — migration `0010`
rebuilt the `applications` table, which dropped `0005`'s two triggers as a
side effect. `recordStatusChange` is the single server-side chokepoint.

## Client

**Capture dialog.** `setStatus` in `App.tsx` is the one chokepoint for
drag-drop, card menu and the detail `<select>`. After the status write
resolves, a terminal target opens `OutcomeDialog`: a radio list for that
status, an optional note, Skip and Save. The status is already committed
before the dialog appears, so Skip and any dialog failure are both harmless —
nothing can lose the move.

Owned component (`src/components/OutcomeDialog.tsx` + `.css` in
`@layer components`), following `QuickAddDialog`.

**Detail page.** A "Why it ended" row on a terminal application, showing the
recorded reason and note and editable in place through the same endpoint.
This is what makes Skip recoverable rather than a dead end.

**Insights.** A "Why applications end" block, computed client-side in
`format.ts` from `stats.history` — the reasons ride along on rows the tab
already fetches, so no new endpoint and no new query. Counts per reason, plus
an "n closed with no reason recorded" line so an empty-looking breakdown
explains itself.

## Testing

- Server: validation rejects a reason that doesn't belong to the row's
  `to_status`; the update targets the latest terminal row; another user's
  application 404s; `null` clears; no terminal transition 404s.
- Share page: the aggregate payload carries neither column.
- Pure function: the breakdown counts reasons and unrecorded closures.
- Component: the dialog's Skip path writes nothing.

## Out of scope

- No reason chip on the board's closed cards.
- No per-company or per-stage cross-tab of reasons.
- No editing the reason on an *older* transition after reopening — the latest
  terminal one only.
