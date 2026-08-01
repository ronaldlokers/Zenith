# Email Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver follow-up reminders and the weekly digest by email, in addition to web push and the in-app bell, behind a provider interface that survives a provider disappearing.

**Architecture:** A narrow `EmailProvider` port in `worker/email/` with `providers/resend.ts` as the only implementation; message construction kept independent of the provider so a swap touches one file. Sending happens from the existing 08:00-local delivery gate, not from the generators — the digest cron fires at 08:00 UTC, which is 01:00 in Los Angeles. Two per-email preference toggles, with `RESEND_API_KEY` as the master switch above them.

**Tech Stack:** Cloudflare Workers + Hono, D1 (SQLite), React 19 + Vite, vitest (`workers` / `components` / `node` projects), Resend HTTP API.

**Spec:** `docs/superpowers/specs/2026-08-01-email-delivery-design.md`
**Issues:** #62 (the email half), #114 (weekly digest email)

## Global Constraints

- **Never commit to `main`.** One branch: `feat/email-delivery`. Conventional-commit subjects, lowercase imperative.
- **`main` is protected and binds admins** (#43): PRs only, green `checks`, branch up to date. `--admin` will not override.
- **Every task ends green on:** `npx tsc -b`, `npm run build`, `./node_modules/.bin/oxlint` (exit 0 — it prints NOTHING when clean, so the exit code is the signal; never `npm run lint`, a local hook mangles its output), `npx vitest run --no-file-parallelism`.
- **en/nl strict key parity** for anything added to `src/locales/*.json`. Worker-side copy lives in the worker instead, following `worker/digest.ts`'s `STRINGS` map, because `tsconfig.worker.json` excludes `src`.
- **Protect the D1 API shape** (#523): `.prepare().bind().first()/all()/run()` only.
- **`worker/tz.ts` stays the only place calling `Intl.DateTimeFormat` with a `timeZone`**, apart from `isUsableTimeZone` in `worker/index.ts`.
- **No telemetry.** Open and click tracking must be explicitly disabled in every provider request.
- `noUnusedLocals` is on — an unused symbol is a compile error.
- Vitest globs: `workers` = `test/**/*.spec.ts`, `components` = `src/**/*.test.{ts,tsx}`, `node` = `test-node/**/*.spec.ts`. A file outside these is collected by nothing.
- **Outbound HTTP is stubbed with `vi.stubGlobal("fetch", …)`** — the established pattern in `test/ai-credentials.spec.ts` and `test/feed-providers.spec.ts`, which works because *the test and the worker share the isolate*. Capture `globalThis.fetch` first and pass non-matching URLs through, so `authedFetch`/`SELF` still works; `vi.unstubAllGlobals()` in `afterEach`.
- **`vi.mock` does NOT cross the vitest-pool-workers module boundary** — that is a different mechanism, and the worker gets its own module instances. Spy on `env.DB` (passed by reference) for database calls. Cost time on #518 and again on #531.
- **`vi.useFakeTimers()` does not reach SQLite's `date('now')`/`datetime('now')`** inside workerd — only the JS-realm `Date` is faked. Seed any `created_at` that matters explicitly rather than letting the column default.

---

# Task 1: The email port and the Resend provider

**Files:**
- Create: `worker/email/types.ts`, `worker/email/index.ts`, `worker/email/providers/resend.ts`
- Modify: `worker/env.d.ts`
- Test: `test/email-provider.spec.ts`

**Interfaces:**
- Produces: `EmailMessage { to, subject, html, text }`; `EmailProvider { readonly name: string; send(msg: EmailMessage): Promise<void> }`; `resolveProvider(env: Env): EmailProvider | null`; `sendEmail(env: Env, msg: EmailMessage): Promise<boolean>` returning whether it sent. Tasks 4 and 6 consume `sendEmail`.

**Why the interface is this narrow:** to/subject/html/text is what Resend, Postmark, SES, Brevo and plain SMTP all support identically. Tags, configuration sets, message streams and scheduling are where providers diverge — admitting any of them is how the seam stops being portable. Do not add fields "for later".

- [ ] **Step 1: Write the failing test**

Create `test/email-provider.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveProvider, sendEmail } from "../worker/email";

const MSG = {
  to: "someone@example.com",
  subject: "Test",
  html: "<p>Test</p>",
  text: "Test",
};

const realFetch = globalThis.fetch;

// Stub the global fetch the worker uses — test and worker share the isolate,
// which is why this reaches worker code where vi.mock would not. Everything
// not aimed at Resend passes through untouched.
function stubResend(status: number, onBody?: (body: unknown) => void) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.resend.com/")) {
      onBody?.(JSON.parse(String(init?.body ?? "{}")));
      return Promise.resolve(
        new Response(JSON.stringify(status === 200 ? { id: "abc" } : { message: "nope" }), {
          status,
        }),
      );
    }
    return realFetch(input, init);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveProvider", () => {
  it("returns null when no API key is configured, so email is simply off", () => {
    expect(resolveProvider({ ...env, RESEND_API_KEY: undefined })).toBeNull();
  });

  it("returns the resend provider when a key is present", () => {
    expect(resolveProvider({ ...env, RESEND_API_KEY: "re_test" })?.name).toBe("resend");
  });
});

describe("sendEmail", () => {
  it("does not send, and does not throw, when no key is configured", async () => {
    let called = false;
    stubResend(200, () => {
      called = true;
    });
    await expect(sendEmail({ ...env, RESEND_API_KEY: undefined }, MSG)).resolves.toBe(false);
    expect(called).toBe(false);
  });

  it("posts the message to resend", async () => {
    let seen: Record<string, unknown> = {};
    stubResend(200, (b) => {
      seen = b as Record<string, unknown>;
    });

    await expect(sendEmail({ ...env, RESEND_API_KEY: "re_test" }, MSG)).resolves.toBe(true);

    expect(seen.to).toEqual(["someone@example.com"]);
    expect(seen.subject).toBe("Test");
    expect(seen.html).toBe("<p>Test</p>");
    expect(seen.text).toBe("Test");
    // No telemetry, ever. Nothing here may opt into open or click tracking.
    expect(Object.keys(seen)).not.toContain("tags");
  });

  it("reports failure rather than throwing when the provider rejects", async () => {
    stubResend(401);
    await expect(sendEmail({ ...env, RESEND_API_KEY: "re_bad" }, MSG)).resolves.toBe(false);
  });
});
```

Read `test/helpers.ts` and one existing spec first for the house import style. If `fetchMock` needs different setup in this repo's pool-workers version, follow what the repo already does rather than this sketch — but keep every assertion.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/email-provider.spec.ts --reporter=verbose
```

Expected: FAIL — cannot resolve `../worker/email`.

- [ ] **Step 3: Write the types**

`worker/email/types.ts`:

```ts
// The lowest common denominator of every transactional email provider:
// Resend, Postmark, SES, Brevo and plain SMTP all support exactly this.
// Everything past it — tags, configuration sets, message streams, scheduling
// — is where providers diverge, so none of it belongs here. Adding a field
// "for later" is how this seam stops being portable.
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  /** Throws on failure; callers decide whether that is fatal. */
  send(msg: EmailMessage): Promise<void>;
}
```

- [ ] **Step 4: Write the Resend provider**

`worker/email/providers/resend.ts`:

```ts
import type { EmailMessage, EmailProvider } from "../types.js";

const ENDPOINT = "https://api.resend.com/emails";

export function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    name: "resend",
    async send(msg: EmailMessage): Promise<void> {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
      });
      if (!res.ok) {
        // Surface the provider's own words: the admin test-send shows this,
        // and "domain not verified" vs "bad key" are different problems.
        throw new Error(`resend ${res.status}: ${await res.text()}`);
      }
    },
  };
}
```

Note there is deliberately no `tags` field and no tracking option — Resend does not track unless asked, and nothing here asks.

- [ ] **Step 5: Write the resolver**

`worker/email/index.ts`:

```ts
import { resendProvider } from "./providers/resend.js";
import type { EmailMessage, EmailProvider } from "./types.js";

export type { EmailMessage, EmailProvider } from "./types.js";

const DEFAULT_FROM = "Zenith <zenith@zenith.lokilabs.nl>";

/**
 * One branch, not a registry — there is one provider. The seam exists because
 * providers in this space disappear (MailChannels terminated the free Workers
 * API this app would have used, on about sixty days' notice), not because a
 * second one is planned.
 */
export function resolveProvider(env: Env): EmailProvider | null {
  if (!env.RESEND_API_KEY) return null;
  return resendProvider(env.RESEND_API_KEY, env.EMAIL_FROM ?? DEFAULT_FROM);
}

/**
 * Best-effort send. Returns whether it sent, and never throws: the delivery
 * pass runs for every user in one loop, and one bad address must not stop the
 * rest. The admin test-send calls the provider directly instead, because it
 * needs the error.
 */
export async function sendEmail(env: Env, msg: EmailMessage): Promise<boolean> {
  const provider = resolveProvider(env);
  if (!provider) return false;
  try {
    await provider.send(msg);
    return true;
  } catch (err) {
    console.error("email send failed", err);
    return false;
  }
}
```

- [ ] **Step 6: Declare the secrets**

In `worker/env.d.ts`, alongside the existing optional secrets:

```ts
  // Resend API key (#62). Email is skipped gracefully when unset — it is the
  // master switch above the per-user preference toggles.
  RESEND_API_KEY?: string;
  // Overrides the default From address; must be on a domain verified in the
  // provider or every send is rejected.
  EMAIL_FROM?: string;
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/email-provider.spec.ts --reporter=verbose
npx tsc -b
```

Expected: PASS, 5 tests; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add worker/email test/email-provider.spec.ts worker/env.d.ts
git commit -m "feat: add an email port with a resend provider

The interface is held to what Resend, Postmark, SES, Brevo and SMTP all support
identically, because everything past that is where they diverge. The seam is
justified by evidence rather than speculation: MailChannels terminated the free
Workers API this app would have used, on about sixty days' notice.

sendEmail never throws — the delivery pass runs for every user in one loop and
one bad address must not stop the rest."
```

---

# Task 2: Schema and preferences API

**Files:**
- Create: `migrations/0053_email_delivery.sql`
- Modify: `worker/index.ts` (beside `PUT /api/preferences/timezone`), `src/api.ts`
- Test: `test/preferences.spec.ts` (append a describe block — the file exists)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `notifications.emailed_at`; `user.email_reminders` and `user.email_digest` (INTEGER, `NOT NULL DEFAULT 1`); `GET /api/preferences` gains `emailReminders` and `emailDigest` booleans; `PUT /api/preferences/email` accepting `{ emailReminders?: boolean; emailDigest?: boolean }`; `api.setEmailPreferences(...)`. Tasks 4 and 5 consume these.

- [ ] **Step 1: Write the migration**

`migrations/0053_email_delivery.sql`:

```sql
-- Email delivery (#62, #114). Plain ADD COLUMNs — no table rebuild is needed
-- here, unlike 0052's CHECK widening.

-- Email tracks its own delivery rather than reusing pushed_at. One stamp for
-- both channels would mean a provider failure after a successful push leaves
-- the row stamped and the whole morning's batched email silently lost — a
-- failed push loses one notification, a failed batch loses all of them.
ALTER TABLE notifications ADD COLUMN emailed_at TEXT;

-- Which emails the user wants. Default 1 (on) is safe because RESEND_API_KEY
-- is the master switch above these: with no key nothing sends whatever they
-- say, so defaulting on cannot surprise anyone who has not set email up.
ALTER TABLE "user" ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "user" ADD COLUMN email_digest INTEGER NOT NULL DEFAULT 1;
```

- [ ] **Step 2: Write the failing test**

Append to `test/preferences.spec.ts`:

```ts
describe("email preferences", () => {
  beforeEach(async () => {
    await env.DB.prepare(
      'UPDATE "user" SET email_reminders = 1, email_digest = 1 WHERE id = ?',
    )
      .bind(USER)
      .run();
  });

  it("reports both as on by default", async () => {
    const res = await authedFetch(`${BASE}/api/preferences`);
    expect(await res.json()).toMatchObject({ emailReminders: true, emailDigest: true });
  });

  it("persists a single toggle without disturbing the other", async () => {
    const res = await authedFetch(`${BASE}/api/preferences/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailReminders: false }),
    });
    expect(res.status).toBe(204);

    const after = await authedFetch(`${BASE}/api/preferences`);
    expect(await after.json()).toMatchObject({ emailReminders: false, emailDigest: true });
  });

  it("rejects a non-boolean rather than coercing it", async () => {
    const res = await authedFetch(`${BASE}/api/preferences/email`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailDigest: "yes" }),
    });
    expect(res.status).toBe(400);
  });
});
```

Use the file's existing `USER`, `BASE` and `authedFetch` — do not reintroduce them.

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/preferences.spec.ts --reporter=verbose
```

Expected: FAIL — no `emailReminders` in the GET response, and no `/api/preferences/email` route.

- [ ] **Step 4: Extend the GET and add the PUT**

In `worker/index.ts`, replace the existing `GET /api/preferences` body so it also selects and returns the two flags as booleans, and add beside it:

```ts
// Which emails the user wants. Per email, not per notification type: the four
// reminder types batch into one message, so four switches would imply a
// granularity the delivery does not have.
app.put("/api/preferences/email", async (c) => {
  const body = await c.req.json<{ emailReminders?: unknown; emailDigest?: unknown }>();
  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [key, column] of [
    ["emailReminders", "email_reminders"],
    ["emailDigest", "email_digest"],
  ] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      return c.json({ error: `${key} must be a boolean` }, 400);
    }
    sets.push(`${column} = ?`);
    binds.push(value ? 1 : 0);
  }
  if (sets.length === 0) return c.json({ error: "nothing to update" }, 400);
  await c.env.DB.prepare(`UPDATE "user" SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...binds, c.get("userId"))
    .run();
  return c.body(null, 204);
});
```

The GET must convert `INTEGER` to `boolean` (`=== 1`) so the client never sees 0/1.

- [ ] **Step 5: Add the client helper**

In `src/api.ts`, after `setTimezone`:

```ts
  setEmailPreferences: (prefs: { emailReminders?: boolean; emailDigest?: boolean }) =>
    request<void>("/api/preferences/email", {
      method: "PUT",
      body: JSON.stringify(prefs),
    }),
```

Extend `getPreferences`'s return type with `emailReminders: boolean; emailDigest: boolean`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/preferences.spec.ts --reporter=verbose
npx tsc -b
```

Expected: PASS; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add migrations/0053_email_delivery.sql worker/index.ts src/api.ts test/preferences.spec.ts
git commit -m "feat: add email delivery state and per-email preferences

emailed_at is separate from pushed_at because a failed push loses one
notification while a failed batch email loses the whole morning, so email has
to retry independently.

The toggles default on, which is safe because RESEND_API_KEY is the master
switch above them."
```

---

# Task 3: Message construction

**Files:**
- Create: `worker/email/messages.ts`
- Test: `test/email-messages.spec.ts`

**Interfaces:**
- Consumes: `EmailMessage` from Task 1.
- Produces: `buildReminderEmail(to, locale, items): EmailMessage` where `items` is `Array<{ kind: "due" | "upcoming"; title: string; body: string | null }>`; `buildDigestEmail(to, locale, title, body): EmailMessage`. Task 4 and Task 6 both consume these.

**Why this file is separate from the provider:** content generation must not know who sends it, and the provider must not know what it is sending. That split is what makes a provider swap touch one file instead of the copy and the locale handling too.

- [ ] **Step 1: Write the failing test**

Create `test/email-messages.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDigestEmail, buildReminderEmail } from "../worker/email/messages";

const TO = "someone@example.com";

describe("buildReminderEmail", () => {
  const items = [
    { kind: "due" as const, title: "DevOps Engineer", body: "Lumen Robotics" },
    { kind: "due" as const, title: "Front-end Engineer", body: "Solace Systems" },
    { kind: "upcoming" as const, title: "Ada Lovelace", body: "Recruiter" },
  ];

  it("counts only what needs action today in the subject", () => {
    const msg = buildReminderEmail(TO, "en", items);
    expect(msg.subject).toContain("2");
    expect(msg.to).toBe(TO);
  });

  it("separates today from tomorrow in both html and text", () => {
    const msg = buildReminderEmail(TO, "en", items);
    for (const part of [msg.html, msg.text]) {
      expect(part).toContain("DevOps Engineer");
      expect(part).toContain("Ada Lovelace");
    }
    // The two groups must be distinguishable, or a heads-up reads as due now.
    expect(msg.text.indexOf("DevOps Engineer")).toBeLessThan(
      msg.text.indexOf("Ada Lovelace"),
    );
  });

  it("localizes to nl", () => {
    const en = buildReminderEmail(TO, "en", items);
    const nl = buildReminderEmail(TO, "nl", items);
    expect(nl.subject).not.toBe(en.subject);
  });

  it("falls back to en for an unknown locale", () => {
    const en = buildReminderEmail(TO, "en", items);
    expect(buildReminderEmail(TO, "de", items).subject).toBe(en.subject);
  });

  // An email whose text part is empty lands in spam far more often, and some
  // clients render nothing at all.
  it("always produces a non-empty text alternative", () => {
    expect(buildReminderEmail(TO, "en", items).text.trim().length).toBeGreaterThan(0);
  });

  it("escapes html in user-supplied titles", () => {
    const msg = buildReminderEmail(TO, "en", [
      { kind: "due", title: "<script>alert(1)</script>", body: null },
    ]);
    expect(msg.html).not.toContain("<script>");
  });
});

describe("buildDigestEmail", () => {
  it("carries the already-localized title and body it is given", () => {
    const msg = buildDigestEmail(TO, "en", "Your week on Zenith", "4 added · 2 advanced");
    expect(msg.subject).toBe("Your week on Zenith");
    expect(msg.text).toContain("4 added");
    expect(msg.html).toContain("4 added");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/email-messages.spec.ts --reporter=verbose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

Create `worker/email/messages.ts`. Follow `worker/digest.ts`'s `STRINGS` pattern exactly — a small `en`/`nl` map with both keys held in sync in one place, and a `fill()` for `{{var}}` interpolation — because `tsconfig.worker.json` excludes `src` and the worker already owns notification prose.

Requirements the tests pin:
- an `escapeHtml` helper applied to every interpolated title and body, since those are user-supplied
- HTML and plain text built from the same data, never one derived by stripping the other
- the subject counts only `kind: "due"` items
- unknown locales fall back to `en`
- inline styles only, kept minimal — email clients are not browsers

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/email-messages.spec.ts --reporter=verbose
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add worker/email/messages.ts test/email-messages.spec.ts
git commit -m "feat: build the reminder and digest email bodies

Kept independent of the provider so a swap touches one file under providers/
rather than the copy and locale handling too. Titles are user-supplied, so
they are escaped."
```

---

# Task 4: Send from the delivery gate

**Files:**
- Modify: `worker/notifications.ts` (`deliverDuePushes`, around line 165), `worker/index.ts` (the import and the `scheduled` call site)
- Test: `test/email-delivery.spec.ts`

**Interfaces:**
- Consumes: `sendEmail` (Task 1), `emailed_at` and the two preference columns (Task 2), `buildReminderEmail` / `buildDigestEmail` (Task 3).
- Produces: `deliverDueNotifications(env)`, renamed from `deliverDuePushes`. Task 6 does not depend on it.

**Why here and not in the generators:** `generateWeeklyDigest` runs at `0 8 * * 1` — 08:00 **UTC**, which is 01:00 in Los Angeles. Sending inline would reintroduce exactly the problem #518 fixed for push. The gate already knows who has reached 08:00 local.

- [ ] **Step 1: Write the failing test**

Create `test/email-delivery.spec.ts`. Model the setup on `test/push-gate.spec.ts`, which already seeds notifications with an explicit `created_at` and pins the clock. Cover:

- with `RESEND_API_KEY` unset, the pass completes and sends nothing
- three reminder notifications for one user produce **one** email, not three
- `weekly_digest` arrives as its own separate message
- `feed_match` and `stale_posting` produce no email at all
- nothing is sent before the recipient's 08:00 local
- `email_reminders = 0` suppresses the reminder email while the digest still sends
- `email_digest = 0` suppresses the digest only
- a provider failure leaves `emailed_at` NULL while `pushed_at` is still set, so the next run retries the email and does not re-push

**Seed `created_at` explicitly on every row** — `vi.useFakeTimers()` does not reach SQLite's `datetime('now')`, so a defaulted column gets the real wall clock and the 24-hour window assertions become meaningless.

Stub outbound HTTP with `vi.stubGlobal("fetch", …)` per the house pattern; `vi.mock` will not reach the worker's module instance.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/email-delivery.spec.ts --reporter=verbose
```

Expected: FAIL — `deliverDueNotifications` is not exported.

- [ ] **Step 3: Rename and extend the gate**

Rename `deliverDuePushes` to `deliverDueNotifications` and update its import and call site in `worker/index.ts` — "pushes" stops being true once it also emails.

The existing selection already joins `user`; extend it to also select `u.email`, `u.locale`, `u.email_reminders`, `u.email_digest` and `n.type`, and to consider a row still outstanding when **either** channel is unsent:

```sql
WHERE (n.pushed_at IS NULL OR n.emailed_at IS NULL)
  AND n.created_at >= ?
```

Then, for rows past the local delivery hour:

1. push each row whose `pushed_at` is NULL, exactly as now, and stamp `pushed_at`
2. group rows whose `emailed_at` is NULL by user, and per user:
   - if `email_reminders` and there are reminder-type rows, send **one** `buildReminderEmail`
   - if `email_digest` and there is a `weekly_digest` row, send `buildDigestEmail` separately
   - stamp `emailed_at` only on the rows an email actually covered, and only when `sendEmail` returned true
3. rows whose type is not emailable (`feed_match`, `stale_posting`) get `emailed_at` stamped as handled, so they do not stay outstanding forever

Point 3 matters: without it those rows are re-selected on every run for 24 hours.

Keep the two `ctx.waitUntil` calls and their separate `.catch`es in `worker/index.ts` unchanged — they exist so a failure in one pass cannot take down the other.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/email-delivery.spec.ts --reporter=verbose
npx vitest run --no-file-parallelism --project workers --reporter=verbose
```

Expected: the new file PASSes; `test/push-gate.spec.ts` and `test/scheduled-dispatch.spec.ts` stay green. If either breaks on the rename, update the reference — that is the rename, not a regression. Say so in your report.

- [ ] **Step 5: Commit**

```bash
git add worker/notifications.ts worker/index.ts test/email-delivery.spec.ts
git commit -m "feat: send reminder and digest emails from the delivery gate

Not from the generators: the digest cron fires at 08:00 UTC, which is 01:00 in
Los Angeles, so sending inline would reintroduce exactly what #518 fixed for
push. The gate already knows who has reached their own 08:00.

Renamed from deliverDuePushes, which stopped being true."
```

---

# Task 5: The preference toggles in Settings

**Files:**
- Modify: `src/settings/notifications.tsx`, `src/locales/en.json`, `src/locales/nl.json`
- Test: `src/settings/email-preferences.test.tsx`

**Interfaces:**
- Consumes: `api.getPreferences()` and `api.setEmailPreferences()` from Task 2.

- [ ] **Step 1: Add the locale keys**

Under `account` in both files, keeping strict parity:

| key | en | nl |
| --- | --- | --- |
| `emailSection` | Email | E-mail |
| `emailHint` | Sent in addition to push and the in-app bell, never instead of them. | Wordt naast push en de meldingen in de app verstuurd, nooit in plaats daarvan. |
| `emailReminders` | Follow-up reminders | Herinneringen voor opvolging |
| `emailDigest` | Weekly digest | Wekelijks overzicht |

- [ ] **Step 2: Write the failing test**

Create `src/settings/email-preferences.test.tsx` asserting: both checkboxes render from the fetched preferences; toggling one calls `api.setEmailPreferences` with just that key; the UI updates optimistically without waiting for the request. Follow `src/settings/timezone-field.test.tsx` for the house pattern, including `import "../i18n"` — without it `t()` renders raw keys and assertions fail for an unrelated reason.

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project components src/settings/email-preferences.test.tsx --reporter=verbose
```

- [ ] **Step 4: Implement it**

Add the two toggles to `src/settings/notifications.tsx`, below the existing push controls, so every notification choice lives in one place. Follow the surrounding component's shape: update local state first, then fire the API call, never block the control on the request.

- [ ] **Step 5: Verify parity and the gate**

```bash
node -e 'const en=require("./src/locales/en.json"),nl=require("./src/locales/nl.json");const f=(o,p="")=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v!==null?f(v,p+k+"."):[p+k]);const e=new Set(f(en)),n=new Set(f(nl));console.log("missing in nl:",[...e].filter(k=>!n.has(k)),"missing in en:",[...n].filter(k=>!e.has(k)))'
npx vitest run --no-file-parallelism --reporter=verbose
npx tsc -b
```

Expected: both lists empty; suite green.

**Note:** the `settings` screenshot captures will change, since the notifications section gains controls. That is intended, not a regression — the controller reviews the diff.

- [ ] **Step 6: Commit**

```bash
git add src/settings/notifications.tsx src/settings/email-preferences.test.tsx src/locales/en.json src/locales/nl.json
git commit -m "feat: let the user choose which emails to receive

Per email rather than per notification type: the four reminder types batch into
one message, so four switches would imply a granularity the delivery does not
have. Placed beside the push controls so every notification choice is in one
place."
```

---

# Task 6: Admin test-send

**Files:**
- Modify: `worker/index.ts` (beside `POST /api/admin/test-push`), `src/settings/admin.tsx`, `src/locales/en.json`, `src/locales/nl.json`, `src/api.ts`
- Test: `test/admin-test-email.spec.ts`

**Interfaces:**
- Consumes: `resolveProvider` (Task 1), `buildReminderEmail` / `buildDigestEmail` (Task 3).

**Why it behaves differently from everything else:** the delivery path is best-effort and swallows failures by design, so a missing key, an unverified domain or a rejected call are all invisible. Without this the only signal that email is misconfigured is a Monday that passes without a digest. This endpoint is therefore the one place that must surface the provider's actual error — and it must ignore the preference toggles, because turning reminders off should not make it lie about whether email works.

- [ ] **Step 1: Write the failing test**

Create `test/admin-test-email.spec.ts` covering:

- `{ type: "reminders" }` sends one email to the calling admin's own address with a `[test]` subject prefix
- `{ type: "digest" }` sends the digest sample
- an unknown type is a 400
- **with no `RESEND_API_KEY`, the response is an error naming that** — not a silent success
- **a provider 401 comes back in the response body**, not swallowed
- it sends even when `email_reminders = 0` and `email_digest = 0`

Stub with `vi.stubGlobal("fetch", …)`, and use `authedFetch` from `test/helpers.ts`.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/admin-test-email.spec.ts --reporter=verbose
```

- [ ] **Step 3: Implement the endpoint**

Beside `POST /api/admin/test-push` in `worker/index.ts`. It calls `resolveProvider(env)` and `provider.send(...)` **directly** rather than `sendEmail`, because `sendEmail` swallows the error and this endpoint's whole purpose is to report it. Return `{ error: … }` with a 4xx/5xx on failure, `{ sent: true, provider: provider.name }` on success.

Recipient is the calling admin's own email, read from the `user` row.

- [ ] **Step 4: Add the UI and copy**

A **Send test email** button in `src/settings/admin.tsx`, beside Send test push, with a type selector matching that control's shape. New en/nl keys under `account`: `testEmailSend`, `testEmailHint`, `testEmailSent`, `testEmailFailed`. Show the returned error text when it fails — that is the feature.

- [ ] **Step 5: Run the full gate**

```bash
npx vitest run --no-file-parallelism --reporter=verbose
npx tsc -b
./node_modules/.bin/oxlint; echo "EXIT=$?"
npm run build
npx storybook build
```

- [ ] **Step 6: Commit and stop**

```bash
git add worker/index.ts src/settings/admin.tsx src/api.ts src/locales/en.json src/locales/nl.json test/admin-test-email.spec.ts
git commit -m "feat: add an admin test-send for email

The delivery path swallows failures by design, so a missing key or an
unverified domain is otherwise invisible until a Monday passes without a
digest. This is the one place that surfaces the provider's real error, and it
ignores the preference toggles so turning reminders off cannot make it lie
about whether email works."
```

Do not open the PR — the controller does that after a whole-branch review.

---

## Done when

- `npx tsc -b`, `npm run build`, `./node_modules/.bin/oxlint`, `npx vitest run --no-file-parallelism` and `npx storybook build` are green.
- en/nl parity holds for every added key.
- `grep -rn "Intl.DateTimeFormat" worker/` still returns only `worker/tz.ts` and `isUsableTimeZone`.
- With no `RESEND_API_KEY`, every pass runs and nothing is sent — the app behaves exactly as it does today.
- The `settings` screenshot diff is confined to the notifications and admin sections, and has been reviewed rather than driven to zero.
