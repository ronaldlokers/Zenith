# Email delivery — design

**Date:** 2026-08-01
**Status:** approved
**Issues:** #62 (the email half) and #114 (weekly digest email)

## Goal

Deliver follow-up reminders and the weekly digest by email, **in addition to**
web push and the in-app bell — never replacing either.

Email is the half of #62 that never shipped, and the blocker for #114. There is
currently no outbound email capability in the codebase at all; the only email
code is `logInboundEmail`, which is inbound Cloudflare Email Routing.

## Decisions already taken

- **Provider: Resend.** Cloudflare's own `send_email` binding is allowlist-only
  ("Recipient not in allowed_destination_addresses"), so it cannot mail
  arbitrary users. MailChannels — the historical Workers answer, and what #62
  assumed — terminated its free Workers API in June 2024 and its free service
  in August 2024.
- **One API token for the whole app**, held as the `RESEND_API_KEY` worker
  secret. Not a per-user BYO key: in practice this is a single-user app, and a
  self-hoster supplies their own. This removes a DB column, encryption at rest,
  and a settings surface.
- **Additive.** Push and the bell are untouched — email never replaces either.
- **The user chooses which emails to receive**, per email rather than per
  notification type: reminders and the digest toggle independently.
- **Emailed:** the four follow-up types (`due_followup`, `due_contact`,
  `upcoming_followup`, `upcoming_contact`) and `weekly_digest`. NOT
  `feed_match` or `stale_posting` — they are browsing prompts, not deadlines,
  and `feed_match` is the highest-volume type.
- **Reminders batch into one email per gate run**; the digest gets its own.

## Provider abstraction

Providers in this space disappear — MailChannels did exactly that, on about
sixty days' notice, to the API this app would have used. The seam is therefore
justified by evidence, not speculation.

```
worker/email/
  index.ts          — resolveProvider(env), sendEmail(env, msg)
  types.ts          — EmailMessage, EmailProvider
  messages.ts       — builds subject/html/text, locale-aware
  providers/
    resend.ts       — the only implementation today
```

```ts
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<void>;
}
```

**Deliberately the lowest common denominator.** To, subject, HTML and text are
what Resend, Postmark, SES, Brevo and plain SMTP all support identically.
Everything beyond that is where providers diverge — Resend's tags, SES's
configuration sets, Postmark's message streams, scheduling — so none of it is in
the interface. Admitting any one would be how it stops being portable.

No retries, no queue, no templating engine. `send()` and nothing else.

The split that actually makes a swap cheap is **`messages.ts` being independent
of the provider**: content generation does not know who sends it, and the
provider does not know what it is sending. Swapping touches four files, not
one: the new file under `providers/` itself, `resolveProvider` and
`DEFAULT_FROM` in `worker/email/index.ts`, the `RESEND_API_KEY` binding in
`worker/env.d.ts`, and the admin route's 503 string in `worker/index.ts`,
which names the secret in prose. Still cheap — the copy and locale handling in
`messages.ts` are untouched — just not one file.

Provider resolution is one branch returning the Resend provider or `null`.
`null` means email is off — the existing degrade-quietly behaviour, not a new
concept. No registry for one entry.

**Known limitation:** whether this interface is right will only be provable
with a second implementation. Keeping to the common denominator is the best
available hedge, but a provider needing something structural — a batch-send API,
say, where Resend takes one message per call — would force a revision.

## Where email is sent from

**Not from the generators.** `generateNotifications` runs on the hourly cron and
`generateWeeklyDigest` at `0 8 * * 1` — 08:00 **UTC**, which is 01:00 in Los
Angeles. Sending inline from either reintroduces exactly what #518 fixed for
push.

Email goes from **the same gate as push**. `deliverDuePushes` already selects
notifications whose owner has reached 08:00 local; it groups its selection by
user and sends one batched reminder email plus, separately, the digest.

The function is renamed `deliverDueNotifications`, since "pushes" would no
longer be true.

## Schema

```sql
ALTER TABLE notifications ADD COLUMN emailed_at TEXT;
ALTER TABLE "user" ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "user" ADD COLUMN email_digest INTEGER NOT NULL DEFAULT 1;
```

Plain adds — no table rebuild, unlike the CHECK widening in #531.

The two preference columns default to **1 (on)**, so an existing account starts
receiving both once a key is configured. That is safe because the API key is
itself the master switch: with no `RESEND_API_KEY` nothing sends regardless of
what the columns say, so defaulting on cannot surprise anyone who has not
deliberately set one up.

SQLite has no boolean type and this schema has none — `INTEGER` 0/1 matches
every other flag in the database.

**Why not reuse `pushed_at`:** one stamp for both channels means a Resend
failure after a successful push leaves the row stamped and the whole morning's
batch silently lost. That asymmetry is new — a failed push loses one
notification, a failed batch email loses all of them — so email tracks its own
delivery and retries on the next hourly run independently.

## Content

`messages.ts` builds both messages, HTML plus a plain-text alternative, minimal
and inline-styled. Email clients are not browsers; this is not the place for the
Night ground.

Copy lives in the worker beside `digest.ts`'s `STRINGS` map, keyed by the user's
persisted `locale`, because `tsconfig.worker.json` excludes `src` and the worker
already emits notification prose. en/nl parity is kept by holding both keys in
the same map.

The digest reuses the localised title and body `generateWeeklyDigest` already
builds, rather than growing a second copy path.

Recipient is `user.email`, already on the row the queries read.

## Preferences

Two toggles in `src/settings/notifications.tsx`, the section that already holds
the push enable/disable — so all notification choices sit in one place rather
than email arriving somewhere new.

- **Follow-up reminders** → `user.email_reminders`
- **Weekly digest** → `user.email_digest`

Per *email*, not per notification type: the four reminder types already batch
into one message, so offering four switches would imply a granularity the
delivery does not have.

`GET /api/preferences` returns both alongside `locale` and `timezone`;
`PUT /api/preferences/email` persists them. The gate reads them when deciding
what to send, so turning one off stops the send without touching push, the bell,
or the notification records themselves.

The API key stays the master switch above all of this: no key, no email,
whatever the toggles say.

Labels are UI strings, so they live in `src/locales/{en,nl}.json` under strict
key parity — unlike the message bodies, which the worker owns.

## Admin test-send

A **Send test email** control in the admin section that already holds Send test
push (`src/settings/admin.tsx`), backed by `POST /api/admin/test-email` behind
the existing admin-role middleware. It takes `{ type: "reminders" | "digest" }`,
builds that message from the same `messages.ts` the real path uses, and sends it
to the calling admin's own address with a `[test]` subject prefix — mirroring
how `test-push` prefixes its title.

**It deliberately ignores the preference toggles.** Turning reminders off must
not make the test button lie about whether email works; the two answer different
questions.

**And it surfaces errors rather than swallowing them.** This is the one place
that must, because everywhere else does the opposite: the delivery path is
best-effort by design, so a missing key, an unverified domain or a rejected API
call all fail silently there. Without this button the only signal that email is
misconfigured would be a Monday that passes without a digest. So the endpoint
returns the provider's actual failure — `RESEND_API_KEY` unset, domain not
verified, 401, whatever it is — and the UI shows it.

That matters most for the DNS prerequisite below: domain verification is the
step most likely to be half-done, and its failure mode is otherwise invisible.

## Testing

`fetchMock` from `cloudflare:test`. **`vi.mock` will not work** — it does not
cross the vitest-pool-workers module boundary, which cost time on #518 and
again on #531.

- nothing is sent when `RESEND_API_KEY` is absent, and the pass still succeeds
- one email per user, not per notification
- the digest arrives as its own message
- `feed_match` and `stale_posting` produce no email
- nothing sends before the recipient's 08:00 local
- a failed send leaves `emailed_at` NULL so the next run retries, while
  `pushed_at` stays set
- `email_reminders = 0` suppresses the reminder email but not the digest, and
  not push or the bell
- `email_digest = 0` suppresses the digest email only
- both off sends nothing, and the pass still succeeds
- the admin test-send ignores both toggles and still sends
- the admin test-send reports a provider failure instead of returning success

## Prerequisite

`zenith.lokilabs.nl` must be verified in Resend with SPF and DKIM records,
alongside the Email Routing MX already on that zone. Until then an unverified
account can only send to the account owner's own address. This is a DNS step,
done once, before any of the code is useful.

Open and click tracking must be confirmed **disabled in the Resend
dashboard**. Resend has no per-request tracking field — tracking is a
domain-level setting, not something a request body can express — so the code
cannot disable it; this is a one-time dashboard step, same class as the
SPF/DKIM verification above: invisible in code, with a silent failure mode. A
tracking pixel in a product whose first principle is "no telemetry, ever"
would be a contradiction shipped by accident.

## Out of scope

- Emailing `feed_match` or `stale_posting`.
- Retry/backoff beyond "try again on the next hourly run".
- A second provider implementation.
