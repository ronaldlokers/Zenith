# Per-User Timezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store an IANA timezone per user so the server agrees with the board about what day it is, and hold every push until 08:00 in the user's own morning.

**Architecture:** A `timezone` column on `user` following the existing `locale` precedent, a single `worker/tz.ts` that owns all timezone maths, and a separation of *recording* a notification from *pushing* it — records are created as they are today, and a new hourly pass sends the push once the owner has reached their local morning. No new cron trigger: the existing one goes hourly and the handler branches on `event.scheduledTime` to keep the feed pull at its current 6-hourly cadence.

**Tech Stack:** Cloudflare Workers + Hono, D1 (SQLite), React 19 + Vite, vitest (three projects: `workers`, `components`, `node`), Better Auth, react-i18next.

**Spec:** `docs/superpowers/specs/2026-07-31-per-user-timezone-design.md`
**Issue:** #518

## Global Constraints

- **Never commit to `main`.** One short-lived branch: `feat/per-user-timezone`. Conventional-commit subjects, lowercase imperative.
- **`main` is protected and binds admins.** Merges need green `checks` and a branch up to date with `main`; `--admin` will not override.
- **Every task ends green on:** `npx tsc -b`, `npm run build`, `./node_modules/.bin/oxlint` (exit 0 — it prints nothing when clean; do NOT use `npm run lint`, a local hook mangles its output), `npx vitest run --no-file-parallelism`.
- **en/nl strict key parity.** Every key added to `src/locales/en.json` must exist in `src/locales/nl.json`. No hardcoded user-facing strings.
- **`worker/tz.ts` is the only place timezone maths lives.** No `Intl.DateTimeFormat` with a `timeZone` option anywhere else in `worker/`.
- **Protect the D1 API shape** (#523): use `.prepare().bind().first()/all()/run()`. No D1-only features.
- **The timezone list is data, not copy.** Zone ids stay untranslated; only the field label and the hint are localized.
- **Responsive parity** — the select must work at 390px.
- **No new CSS.** This feature needs none; `.settings-field` is already `flex-direction: column; gap: 0.3rem`.
- **The delivery hour is fixed at 08:00 local.** Not configurable. Do not add a column or a setting for it.
- Vitest project globs: `workers` = `test/**/*.spec.ts`, `components` = `src/**/*.test.{ts,tsx}`, `node` = `test-node/**/*.spec.ts`. A file outside these is collected by nothing and proves nothing.

---

# Task 1: `worker/tz.ts`

**Files:**
- Create: `worker/tz.ts`
- Test: `test/tz.spec.ts`

**Interfaces:**
- Produces: `localDate(tz: string | null | undefined, now: Date): string` returning `"YYYY-MM-DD"`, and `localHour(tz: string | null | undefined, now: Date): number` returning 0–23. Both fall back to UTC for a null, empty or unrecognised zone. Tasks 4, 5 and 6 consume these.

**Note on determinism:** both functions take the zone *and* the instant as explicit arguments, so nothing here reads ambient state. These tests therefore need **no fake timers and no pinned process timezone** — unlike `src/format.test.ts`, whose subject reads the ambient clock. Do not cargo-cult that setup into this file.

- [ ] **Step 1: Write the failing test**

Create `test/tz.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { localDate, localHour } from "../worker/tz";

// 2026-08-05T03:00:00Z is still the evening of the 4th in Los Angeles
// (UTC-7) and already the 5th in Amsterdam (UTC+2). One instant, two
// calendar dates — which is the entire reason this module exists.
const EVENING_IN_LA = new Date("2026-08-05T03:00:00Z");

describe("localDate", () => {
  it("returns the calendar date in the given zone, not UTC", () => {
    expect(localDate("America/Los_Angeles", EVENING_IN_LA)).toBe("2026-08-04");
    expect(localDate("Europe/Amsterdam", EVENING_IN_LA)).toBe("2026-08-05");
  });

  it("handles a zone far ahead of UTC", () => {
    expect(localDate("Pacific/Kiritimati", EVENING_IN_LA)).toBe("2026-08-05");
  });

  it("falls back to UTC for a null, empty or unrecognised zone", () => {
    expect(localDate(null, EVENING_IN_LA)).toBe("2026-08-05");
    expect(localDate("", EVENING_IN_LA)).toBe("2026-08-05");
    expect(localDate("Not/AZone", EVENING_IN_LA)).toBe("2026-08-05");
  });
});

describe("localHour", () => {
  it("returns the hour in the given zone", () => {
    expect(localHour("America/Los_Angeles", EVENING_IN_LA)).toBe(20);
    expect(localHour("Europe/Amsterdam", EVENING_IN_LA)).toBe(5);
  });

  // hour12:false emits "24" for midnight on some ICU builds. A 24 would
  // pass a `>= 8` gate at exactly the wrong moment, so it is normalised.
  it("reports midnight as 0, never 24", () => {
    expect(localHour("Europe/Amsterdam", new Date("2026-08-04T22:00:00Z"))).toBe(0);
    expect(localHour("UTC", new Date("2026-08-05T00:00:00Z"))).toBe(0);
  });

  // Los Angeles springs forward at 02:00 local on 2027-03-14. Offset
  // arithmetic gets this wrong; Intl does not.
  it("is correct either side of a DST transition", () => {
    expect(localHour("America/Los_Angeles", new Date("2027-03-14T09:00:00Z"))).toBe(1);
    expect(localHour("America/Los_Angeles", new Date("2027-03-14T11:00:00Z"))).toBe(4);
    expect(localDate("America/Los_Angeles", new Date("2027-03-14T11:00:00Z"))).toBe("2027-03-14");
  });

  it("falls back to UTC for an unrecognised zone", () => {
    expect(localHour("Not/AZone", EVENING_IN_LA)).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/tz.spec.ts --reporter=verbose
```

Expected: FAIL — cannot resolve `../worker/tz`.

- [ ] **Step 3: Implement it**

Create `worker/tz.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/tz.spec.ts --reporter=verbose
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add worker/tz.ts test/tz.spec.ts
git commit -m "feat: add local date and hour helpers for a per-user timezone

Both take the zone and the instant explicitly, so they read no ambient state
and an unrecognised zone falls back to UTC instead of throwing — generation
runs for every user in one pass, and one bad stored value must not stop
everyone else's notifications."
```

---

# Task 2: Migration and the preferences API

**Files:**
- Create: `migrations/0051_user_timezone_and_push_state.sql`
- Modify: `worker/index.ts` (beside the existing `PUT /api/preferences/locale`, currently around line 1261)
- Modify: `src/api.ts` (beside `setLocale`, currently around line 35)
- Test: `test/preferences.spec.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `GET /api/preferences` → `{ locale: string | null; timezone: string | null }`; `PUT /api/preferences/timezone` accepting `{ timezone: string }`, 204 on success, 400 on an unsupported zone. Client helpers `api.getPreferences()` and `api.setTimezone(tz)`. Task 3 consumes all of these. The `notifications.pushed_at` column is consumed by Task 5.

**Why a GET:** `locale` is write-only — the client drives it from localStorage and mirrors it up. Timezone needs a read, because the select must show the *stored* value and detection must know whether one exists.

- [ ] **Step 1: Write the migration**

Create `migrations/0051_user_timezone_and_push_state.sql`:

```sql
-- Per-user IANA timezone (#518). The server had no way to know what day it is
-- for a given user: SQLite's date('now') is UTC and has no notion of a user,
-- so due follow-ups fired on the UTC day boundary. NULL means "not set",
-- which the worker treats as UTC — the same shape as locale NULL meaning 'en'.
ALTER TABLE "user" ADD COLUMN timezone TEXT;

-- Recording a notification is now separate from pushing it. The record is
-- created whenever it is generated; the push waits until the owner reaches
-- 08:00 in their own timezone. NULL means "not pushed yet".
ALTER TABLE notifications ADD COLUMN pushed_at TEXT;
```

- [ ] **Step 2: Write the failing test**

Create `test/preferences.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import app from "../worker/index";
import { authedRequest } from "./helpers";

const USER = "seed-admin";

async function storedTimezone(): Promise<string | null> {
  const row = await env.DB.prepare('SELECT timezone FROM "user" WHERE id = ?')
    .bind(USER)
    .first<{ timezone: string | null }>();
  return row?.timezone ?? null;
}

describe("timezone preference", () => {
  beforeEach(async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = NULL WHERE id = ?')
      .bind(USER)
      .run();
  });

  it("reports a null timezone before one is set", async () => {
    const res = await app.fetch(await authedRequest("/api/preferences"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ timezone: null });
  });

  it("stores a valid IANA zone and reads it back", async () => {
    const put = await app.fetch(
      await authedRequest("/api/preferences/timezone", {
        method: "PUT",
        body: JSON.stringify({ timezone: "Europe/Amsterdam" }),
      }),
      env,
    );
    expect(put.status).toBe(204);
    expect(await storedTimezone()).toBe("Europe/Amsterdam");

    const get = await app.fetch(await authedRequest("/api/preferences"), env);
    expect(await get.json()).toMatchObject({ timezone: "Europe/Amsterdam" });
  });

  // A stored zone that Intl cannot parse would fall back to UTC forever and
  // silently give the user the wrong day, so it is rejected at the door.
  it("rejects a zone Intl does not recognise, leaving the stored value alone", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("Europe/Amsterdam", USER)
      .run();
    const res = await app.fetch(
      await authedRequest("/api/preferences/timezone", {
        method: "PUT",
        body: JSON.stringify({ timezone: "Not/AZone" }),
      }),
      env,
    );
    expect(res.status).toBe(400);
    expect(await storedTimezone()).toBe("Europe/Amsterdam");
  });

  it("accepts UTC, which is not in Intl.supportedValuesOf", async () => {
    const res = await app.fetch(
      await authedRequest("/api/preferences/timezone", {
        method: "PUT",
        body: JSON.stringify({ timezone: "UTC" }),
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(await storedTimezone()).toBe("UTC");
  });
});
```

Read `test/helpers.ts` first and use whatever authenticated-request helper it exports; if the export is named differently from `authedRequest`, use the real name rather than adding a new helper.

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/preferences.spec.ts --reporter=verbose
```

Expected: FAIL — no `/api/preferences` route (404), and `timezone` is not a column until the migration is applied by the suite's `apply-migrations` setup.

- [ ] **Step 4: Implement the endpoints**

In `worker/index.ts`, directly after the existing `app.put("/api/preferences/locale", …)` handler:

```ts
// Validation is by construction, not by list membership: Intl.supportedValuesOf
// omits "UTC" — which is our own fallback — and may omit legacy aliases like
// Asia/Calcutta. Anything Intl can build a formatter for is a zone we can use.
function isUsableTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

app.get("/api/preferences", async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT locale, timezone FROM "user" WHERE id = ?',
  )
    .bind(c.get("userId"))
    .first<{ locale: string | null; timezone: string | null }>();
  return c.json({ locale: row?.locale ?? null, timezone: row?.timezone ?? null });
});

// The client mirrors its detected zone here once, and the Settings select
// writes here on change. The server needs it because SQLite's date('now') is
// UTC and knows nothing about who is asking.
app.put("/api/preferences/timezone", async (c) => {
  const { timezone } = await c.req.json<{ timezone?: string }>();
  if (typeof timezone !== "string" || !isUsableTimeZone(timezone)) {
    return c.json({ error: "unsupported timezone" }, 400);
  }
  await c.env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
    .bind(timezone, c.get("userId"))
    .run();
  return c.body(null, 204);
});
```

- [ ] **Step 5: Add the client helpers**

In `src/api.ts`, directly after `setLocale`:

```ts
  getPreferences: () =>
    request<{ locale: string | null; timezone: string | null }>("/api/preferences"),
  // The server compares date-only columns against the user's own calendar
  // day; without this it can only use UTC.
  setTimezone: (timezone: string) =>
    request<void>("/api/preferences/timezone", {
      method: "PUT",
      body: JSON.stringify({ timezone }),
    }),
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/preferences.spec.ts --reporter=verbose
npx tsc -b
```

Expected: PASS, 4 tests; tsc clean.

- [ ] **Step 7: Commit**

```bash
git add migrations/0051_user_timezone_and_push_state.sql worker/index.ts src/api.ts test/preferences.spec.ts
git commit -m "feat: store a per-user timezone and expose it over the preferences API

locale is write-only because the client drives it from localStorage. Timezone
needs a read as well: the Settings select must show the stored value, and
detection must know whether one exists yet.

Validation builds a formatter rather than checking list membership, because
Intl.supportedValuesOf omits UTC — our own fallback — and legacy aliases."
```

---

# Task 3: The Settings field and one-time detection

**Files:**
- Modify: `src/settings/index.tsx` (the General section's `.settings-fieldgrid`, after the Theme field)
- Modify: `src/app-data.ts` (bootstrap, to run detection once)
- Modify: `src/locales/en.json`, `src/locales/nl.json`
- Test: `src/settings/timezone-field.test.tsx`

**Interfaces:**
- Consumes: `api.getPreferences()` and `api.setTimezone(tz)` from Task 2.
- Produces: no interface later tasks depend on.

**Constraints:** no new CSS. The hint is a third child of the existing `.settings-field` label, `<span className="muted small">` — `.muted` and `.small` are two of the three global utilities the self-containment rule permits. The zone ids are data and stay untranslated.

- [ ] **Step 1: Add the locale keys**

`src/locales/en.json`, in the `settings` object:

```json
"timezone": "Time zone",
"timezoneNow": "{{time}} right now"
```

`src/locales/nl.json`, same object:

```json
"timezone": "Tijdzone",
"timezoneNow": "{{time}} op dit moment"
```

- [ ] **Step 2: Write the failing test**

Create `src/settings/timezone-field.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TimezoneField } from "./timezone-field";

// A negative-offset zone is what makes a UTC-vs-local mistake observable; CI
// runs in UTC, where several of these assertions would pass regardless.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-05T03:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
  process.env.TZ = ORIGINAL_TZ;
});

describe("timezone pin guard", () => {
  // Without this, a silently-failing pin turns every assertion below into one
  // that passes while checking nothing.
  it("fails loudly if the America/Los_Angeles pin stops applying", () => {
    expect(new Date("2026-08-05T03:00:00Z").getDate()).toBe(4);
  });
});

describe("TimezoneField", () => {
  it("shows the stored zone as the selected value", () => {
    render(<TimezoneField value="Europe/Amsterdam" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("Europe/Amsterdam");
  });

  // The hint is what makes the setting verifiable; showing the browser's time
  // instead of the selected zone's would make it actively misleading.
  it("shows the current time in the selected zone, not the browser's", () => {
    render(<TimezoneField value="Europe/Amsterdam" onChange={() => {}} />);
    // 2026-08-05T03:00:00Z is 05:00 in Amsterdam and 20:00 in Los Angeles.
    expect(screen.getByText(/05:00/)).toBeInTheDocument();
    expect(screen.queryByText(/20:00/)).not.toBeInTheDocument();
  });

  it("reports the chosen zone", () => {
    const onChange = vi.fn();
    render(<TimezoneField value="Europe/Amsterdam" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "America/New_York" },
    });
    expect(onChange).toHaveBeenCalledWith("America/New_York");
  });

  it("groups options by region", () => {
    const { container } = render(
      <TimezoneField value="Europe/Amsterdam" onChange={() => {}} />,
    );
    const labels = [...container.querySelectorAll("optgroup")].map((g) =>
      g.getAttribute("label"),
    );
    expect(labels).toContain("Europe");
    expect(labels).toContain("America");
  });

  // UTC is not in Intl.supportedValuesOf. Without injecting it, opening
  // Settings would silently reset a working zone to whatever sorts first.
  it("keeps a stored zone that is absent from the supported list", () => {
    render(<TimezoneField value="UTC" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("UTC");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project components src/settings/timezone-field.test.tsx --reporter=verbose
```

Expected: FAIL — cannot resolve `./timezone-field`.

- [ ] **Step 4: Implement the field**

Create `src/settings/timezone-field.tsx`:

```tsx
import { useTranslation } from "react-i18next";

// Zone ids are data, not copy — they stay untranslated. Only the label and
// the hint are localized.
function supportedZones(): string[] {
  // Supported everywhere current (Safari from 15.4). Where it is missing the
  // field still works, it just is not browsable.
  const supported = Intl.supportedValuesOf?.("timeZone") ?? [];
  return supported as string[];
}

function groupByRegion(zones: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    const region = zone.includes("/") ? zone.slice(0, zone.indexOf("/")) : "Other";
    const list = groups.get(region) ?? [];
    list.push(zone);
    groups.set(region, list);
  }
  return groups;
}

export function TimezoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (timezone: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const zones = supportedZones();
  // Intl.supportedValuesOf omits UTC — our own server-side fallback — and may
  // omit legacy aliases. Without this, opening Settings would silently reset a
  // working zone to whatever sorts first.
  const all = zones.includes(value) ? zones : [value, ...zones];
  const groups = groupByRegion(all);

  // Recomputed on render and on change; deliberately not on a timer. A
  // settings page is not open long enough for a minute of staleness to matter,
  // and a ticking value sits in a surface the screenshot rig captures.
  const now = new Date().toLocaleTimeString(i18n.resolvedLanguage, {
    timeZone: value,
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <label className="settings-field">
      <span>{t("settings.timezone")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {[...groups].map(([region, list]) => (
          <optgroup key={region} label={region}>
            {list.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="muted small">{t("settings.timezoneNow", { time: now })}</span>
    </label>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project components src/settings/timezone-field.test.tsx --reporter=verbose
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Wire it into Settings › General**

In `src/settings/index.tsx`, import `TimezoneField` from `./timezone-field` and render it inside the General section's `.settings-fieldgrid`, immediately after the Theme `<label className="settings-field">` block:

```tsx
const [timezone, setTimezone] = useState<string>(
  () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
);
useEffect(() => {
  void api
    .getPreferences()
    .then((p) => {
      if (p.timezone) setTimezone(p.timezone);
    })
    .catch(() => {});
}, []);
```

```tsx
<TimezoneField
  value={timezone}
  onChange={(next) => {
    // Update the surface first, then mirror it up — same shape as the
    // Language field. The select must not wait on the request.
    setTimezone(next);
    void api.setTimezone(next).catch(() => {});
  }}
/>
```

The initial state falls back to the browser's zone so the field is never blank on first paint, before the stored value arrives.

- [ ] **Step 7: Detect once at bootstrap**

In `src/app-data.ts`, alongside the existing startup fetches, read the preferences once and — **only when `timezone` is `null`** — send the browser's zone:

```ts
// Detect only when nothing is stored. Re-detecting on every load would
// silently overwrite a deliberate choice the moment the user travels or
// connects through a VPN, which is the one thing the setting exists to allow.
void api.getPreferences().then((prefs) => {
  if (prefs.timezone) return;
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (detected) void api.setTimezone(detected).catch(() => {});
});
```

Fire-and-forget, exactly like `setLocale`: a failure here must not block the app from loading.

- [ ] **Step 8: Verify en/nl parity and the full gate**

```bash
node -e 'const en=require("./src/locales/en.json"),nl=require("./src/locales/nl.json");const f=(o,p="")=>Object.entries(o).flatMap(([k,v])=>typeof v==="object"&&v!==null?f(v,p+k+"."):[p+k]);const e=new Set(f(en)),n=new Set(f(nl));console.log("missing in nl:",[...e].filter(k=>!n.has(k)));console.log("missing in en:",[...n].filter(k=>!e.has(k)))'
npx tsc -b
./node_modules/.bin/oxlint; echo "EXIT=$?"
npx vitest run --no-file-parallelism --reporter=verbose
npm run build
```

Expected: both parity lists empty; tsc clean; oxlint exit 0; suite green.

**Note on screenshots:** the `settings` captures gain a field, so they will differ from the baseline. That is the intended change, not a zero-diff failure — review the diff rather than chasing it to zero.

- [ ] **Step 9: Commit**

```bash
git add src/settings/timezone-field.tsx src/settings/timezone-field.test.tsx \
        src/settings/index.tsx src/app-data.ts src/locales/en.json src/locales/nl.json
git commit -m "feat: add a time zone field to settings, detected once

The hint shows the current time in the selected zone, which is what makes the
setting verifiable — a bare zone name gives no way to tell whether it is right.

Detection runs only when nothing is stored. Re-detecting on every load would
overwrite a deliberate choice the moment the user travels or uses a VPN."
```

---

# Task 4: Use the timezone in generation, calendar and digest

**Files:**
- Modify: `worker/notifications.ts` (the two due queries, currently `date('now')` at roughly lines 49 and 81)
- Modify: `worker/calendar.ts` (roughly line 125, `interactions.happened_at >= date('now')`)
- Modify: `worker/digest.ts` (roughly line 50, the week key)
- Test: `test/timezone-generation.spec.ts`

**Interfaces:**
- Consumes: `localDate` from Task 1.
- Produces: nothing later tasks depend on.

**Approach:** group users by their stored timezone, compute each distinct zone's local date once, and run the due queries scoped to that group. At invite-only scale that is a handful of queries, not one per user.

- [ ] **Step 1: Write the failing test**

Create `test/timezone-generation.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateNotifications } from "../worker/notifications";

const USER = "seed-admin";

async function dueFollowupCount(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE type = 'due_followup'",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("generation uses the user's local date", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    await env.DB.prepare("DELETE FROM applications WHERE user_id = ?").bind(USER).run();
    // 2026-08-05T03:00:00Z is the evening of the 4th in Los Angeles and the
    // morning of the 5th in Amsterdam.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T03:00:00Z"));
  });

  async function seedDueOn(date: string) {
    await env.DB.prepare(
      "INSERT INTO applications (user_id, title, company, status, next_action_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind(USER, "Platform Engineer", "Acme", "applied", date)
      .run();
  }

  it("does not fire for an item due tomorrow in the user's zone", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("America/Los_Angeles", USER)
      .run();
    await seedDueOn("2026-08-05"); // still tomorrow in LA
    await generateNotifications(env, 0);
    expect(await dueFollowupCount()).toBe(0);
  });

  it("fires for the same item and instant in a zone where it is already today", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("Europe/Amsterdam", USER)
      .run();
    await seedDueOn("2026-08-05"); // already today in Amsterdam
    await generateNotifications(env, 0);
    expect(await dueFollowupCount()).toBe(1);
  });

  it("treats a null timezone as UTC, preserving today's behaviour", async () => {
    await env.DB.prepare('UPDATE "user" SET timezone = NULL WHERE id = ?')
      .bind(USER)
      .run();
    await seedDueOn("2026-08-05"); // 2026-08-05 in UTC at this instant
    await generateNotifications(env, 0);
    expect(await dueFollowupCount()).toBe(1);
  });
});
```

Check the real `applications` column list before running; if `company` or `status` are named differently, use the actual names rather than adding columns.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/timezone-generation.spec.ts --reporter=verbose
```

Expected: FAIL — the first test fires a notification, because generation still compares against the UTC date.

- [ ] **Step 3: Replace `date('now')` in the due queries**

In `worker/notifications.ts`, import `localDate` from `./tz`, then before the two due queries build the per-zone grouping:

```ts
// SQLite's date('now') is UTC and knows nothing about who is asking. Group by
// stored zone so each distinct timezone's local date is computed once, then
// scope the due queries to that group.
const { results: zoneRows } = await env.DB.prepare(
  'SELECT DISTINCT timezone FROM "user"',
).all<{ timezone: string | null }>();
const now = new Date();
```

Then loop the existing statements once per distinct zone. Read the two current statements in full before editing — only two things change in each.

**Change 1**, the comparison:

```sql
--        AND applications.next_action_at <= date('now')
          AND applications.next_action_at <= ?
```

**Change 2**, a restriction to the users in that zone group. `NULL` needs `IS` rather than `=`, so the two cases take different clauses:

```sql
-- for a non-null zone:
          AND applications.user_id IN (SELECT id FROM "user" WHERE timezone = ?)
-- for the NULL group:
          AND applications.user_id IN (SELECT id FROM "user" WHERE timezone IS NULL)
```

So the loop is:

```ts
for (const { timezone } of zoneRows) {
  const day = localDate(timezone, now);       // localDate(null, …) is the UTC date
  const scope = timezone === null
    ? 'IS NULL'
    : '= ?';
  const binds = timezone === null ? [day] : [day, timezone];
  // …run the due-follow-up statement, then the due-contact one, with the
  // comparison and scope clauses above spliced in and `binds` bound in order.
}
```

`SELECT DISTINCT timezone` returns `NULL` as its own row, so users who have never set a zone are covered by the same loop and keep exactly today's UTC behaviour.

Keep everything else about those statements identical — the `dedup_key` construction, the `status NOT IN (…)` filter, and the `ON CONFLICT … DO NOTHING`. The contacts statement takes the same two changes against `contacts.follow_up_at` and `contacts.user_id`.

- [ ] **Step 4: Update the calendar feed**

In `worker/calendar.ts`, `interactions.happened_at >= date('now')` becomes a bound parameter carrying `localDate(user.timezone, new Date())`. The ICS feed is per-token, so the owning user — and therefore the zone — is already known at that point; select `timezone` alongside whatever user columns that query already reads.

- [ ] **Step 5: Update the digest week key**

In `worker/digest.ts`, the week key is currently one UTC date stamped across the whole run. Move it inside the per-user loop and compute `localDate(row.timezone, now)` per user, selecting `u.timezone` alongside `u.locale` in the existing query. Users either side of the date boundary would otherwise share a key that is wrong for one of them — and because the key is a dedup value, the failure is silent: a user simply never receives that week's digest.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/timezone-generation.spec.ts --reporter=verbose
npx vitest run --no-file-parallelism --project workers --reporter=verbose
```

Expected: the new file PASSes, 3 tests; the existing `notifications`, `calendar` and `digest` specs stay green. If one of them breaks, check whether it encoded the old UTC assumption — if so fix the test to the local basis and say so; do not weaken an assertion to get green.

- [ ] **Step 7: Commit**

```bash
git add worker/notifications.ts worker/calendar.ts worker/digest.ts test/timezone-generation.spec.ts
git commit -m "feat: compare due dates against each user's local calendar day

SQLite's date('now') is UTC and knows nothing about who is asking, so a
follow-up due tomorrow in the user's own calendar read as due all evening west
of UTC. Users are grouped by stored zone so each distinct timezone's date is
computed once.

The digest week key moves inside the per-user loop for the same reason: users
either side of the date boundary would share a key that is wrong for one of
them, and a wrong dedup key means a silently missed digest."
```

---

# Task 5: Separate recording from pushing

**Files:**
- Modify: `worker/notifications.ts` (`insertAndPush`, currently around line 30)
- Test: `test/push-gate.spec.ts`

**Interfaces:**
- Consumes: `localHour` from Task 1; `notifications.pushed_at` from Task 2.
- Produces: `deliverDuePushes(env: Env): Promise<void>`, consumed by Task 6.

**The rule:** send a push when the record is unpushed, under 24 hours old, and the owner's local hour is 8 or later. One gate for every notification type, rather than one per generator.

- [ ] **Step 1: Write the failing test**

Create `test/push-gate.spec.ts`:

```ts
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deliverDuePushes } from "../worker/notifications";

const USER = "seed-admin";

async function seedNotification(createdAt: string): Promise<number> {
  const { meta } = await env.DB.prepare(
    `INSERT INTO notifications (user_id, type, title, body, link, dedup_key, created_at)
     VALUES (?, 'due_followup', 'Platform Engineer', 'Follow up', '/board/1', ?, ?)`,
  )
    .bind(USER, `test:${createdAt}:${Math.random()}`, createdAt)
    .run();
  return meta.last_row_id as number;
}

async function pushedAt(id: number): Promise<string | null> {
  const row = await env.DB.prepare("SELECT pushed_at FROM notifications WHERE id = ?")
    .bind(id)
    .first<{ pushed_at: string | null }>();
  return row?.pushed_at ?? null;
}

describe("push gate", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM notifications").run();
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("Europe/Amsterdam", USER)
      .run();
    vi.useFakeTimers();
  });

  it("holds a record before 08:00 local", async () => {
    // 04:00Z is 06:00 in Amsterdam — before the delivery hour.
    vi.setSystemTime(new Date("2026-08-05T04:00:00Z"));
    const id = await seedNotification("2026-08-05 03:30:00");
    await deliverDuePushes(env);
    expect(await pushedAt(id)).toBeNull();
  });

  it("releases it once 08:00 local has passed", async () => {
    // 07:00Z is 09:00 in Amsterdam.
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const id = await seedNotification("2026-08-05 03:30:00");
    await deliverDuePushes(env);
    expect(await pushedAt(id)).not.toBeNull();
  });

  it("stamps a record only once", async () => {
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const id = await seedNotification("2026-08-05 03:30:00");
    await deliverDuePushes(env);
    const first = await pushedAt(id);
    vi.setSystemTime(new Date("2026-08-05T08:00:00Z"));
    await deliverDuePushes(env);
    expect(await pushedAt(id)).toBe(first);
  });

  // Re-enabling push after a quiet week must not blast a backlog.
  it("ignores a record older than 24 hours", async () => {
    vi.setSystemTime(new Date("2026-08-05T07:00:00Z"));
    const id = await seedNotification("2026-08-03 09:00:00");
    await deliverDuePushes(env);
    expect(await pushedAt(id)).toBeNull();
  });

  it("uses the owner's zone, not UTC", async () => {
    // 15:00Z is 08:00 in Los Angeles but already 17:00 in Amsterdam.
    await env.DB.prepare('UPDATE "user" SET timezone = ? WHERE id = ?')
      .bind("America/Los_Angeles", USER)
      .run();
    vi.setSystemTime(new Date("2026-08-05T13:00:00Z")); // 06:00 in LA
    const id = await seedNotification("2026-08-05 12:30:00");
    await deliverDuePushes(env);
    expect(await pushedAt(id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/push-gate.spec.ts --reporter=verbose
```

Expected: FAIL — `deliverDuePushes` is not exported.

- [ ] **Step 3: Make `insertAndPush` insert-only**

**Note:** Task 4 restructured the callers of this helper into a per-zone loop, so read the current shape before editing rather than assuming the pre-Task-4 one.

In `worker/notifications.ts`, rename `insertAndPush` to `insertNotifications` and delete the `sendPushToUser` fan-out — it becomes a plain `.run()`:

```ts
// Insert only. The push is no longer sent here: deliverDuePushes below owns
// delivery, so that one gate covers every notification type and nothing
// buzzes a phone before 08:00 in the recipient's own morning.
async function insertNotifications(
  env: Env,
  sql: string,
  bind: unknown[],
): Promise<void> {
  await env.DB.prepare(sql).bind(...bind).run();
}
```

Update every call site in the file. Drop the `RETURNING user_id, title, body, link` clause from those statements — nothing reads the rows now, and `deliverDuePushes` selects from the table instead. If any caller still needs the returned rows for another reason, keep `RETURNING` there and say so in the commit.

- [ ] **Step 4: Add the push pass**

In the same file:

```ts
// Recording and pushing are separate. A record appears in the bell as soon as
// it is generated; the push waits until the owner has reached 08:00 in their
// own timezone, so nothing buzzes a phone at 02:00. One gate for every type,
// rather than one per generator — which also keeps the feed-match count
// coupled to the run that produced it.
const DELIVERY_HOUR = 8;
const MAX_AGE_HOURS = 24;

export async function deliverDuePushes(env: Env): Promise<void> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_AGE_HOURS * 3600_000)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);

  const { results } = await env.DB.prepare(
    `SELECT n.id, n.user_id, n.title, n.body, n.link, u.timezone
       FROM notifications n
       JOIN "user" u ON u.id = n.user_id
      WHERE n.pushed_at IS NULL
        AND n.created_at >= ?
      ORDER BY n.id`,
  )
    .bind(cutoff)
    .all<{
      id: number;
      user_id: string;
      title: string;
      body: string | null;
      link: string | null;
      timezone: string | null;
    }>();

  const due = results.filter((n) => localHour(n.timezone, now) >= DELIVERY_HOUR);
  await Promise.all(
    due.map(async (n) => {
      await sendPushToUser(env, n.user_id, {
        title: n.title,
        body: n.body ?? undefined,
        url: n.link ?? "/",
      });
      await env.DB.prepare("UPDATE notifications SET pushed_at = datetime('now') WHERE id = ?")
        .bind(n.id)
        .run();
    }),
  );
}
```

Import `localHour` from `./tz` at the top of the file.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/push-gate.spec.ts --reporter=verbose
npx vitest run --no-file-parallelism --project workers --reporter=verbose
```

Expected: the new file PASSes, 5 tests. `test/notifications.spec.ts` may assert push behaviour that has now moved; if so, update it to assert the record is created and let `push-gate.spec.ts` own the delivery assertions. Say so in the commit if you change it.

- [ ] **Step 6: Commit**

```bash
git add worker/notifications.ts test/push-gate.spec.ts
git commit -m "feat: hold pushes until 08:00 in the recipient's own timezone

Recording and pushing are now separate. The record appears in the bell as soon
as it is generated; only the push waits, so opening the app at 06:00 still
shows everything due while the phone stays quiet until eight.

One gate for every notification type rather than one per generator, which
keeps the feed-match count coupled to the run that produced it. A 24-hour
window stops a backlog blasting out when push is re-enabled after a break."
```

---

# Task 6: Hourly cron and the handler branch

**Files:**
- Modify: `wrangler.jsonc` (the `triggers.crons` array, around line 44)
- Modify: `worker/index.ts` (the `scheduled` handler, around line 1759)
- Test: `test/scheduled-dispatch.spec.ts`

**Interfaces:**
- Consumes: `deliverDuePushes` from Task 5.
- Produces: nothing.

**Why no new trigger:** the Workers free plan allows 5 cron triggers **per account**, not per Worker, and the account is already at 4 (Zenith's 3 plus one elsewhere). A fourth here would take the last slot.

- [ ] **Step 1: Write the failing test**

Create `test/scheduled-dispatch.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldRunFeedPull } from "../worker/index";

// The feed cadence moved out of wrangler.jsonc and into this branch, so it is
// the only place the 6-hourly schedule is still expressed. These four hours
// reproduce the old "17 */6 * * *" exactly.
describe("shouldRunFeedPull", () => {
  it("runs at the four hours the old 6-hourly cron fired", () => {
    for (const hour of [0, 6, 12, 18]) {
      expect(shouldRunFeedPull(new Date(Date.UTC(2026, 7, 5, hour, 17)))).toBe(true);
    }
  });

  it("does not run at the other twenty", () => {
    const others = [...Array(24).keys()].filter((h) => ![0, 6, 12, 18].includes(h));
    for (const hour of others) {
      expect(shouldRunFeedPull(new Date(Date.UTC(2026, 7, 5, hour, 17)))).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run --no-file-parallelism --project workers test/scheduled-dispatch.spec.ts --reporter=verbose
```

Expected: FAIL — `shouldRunFeedPull` is not exported.

- [ ] **Step 3: Change the cron**

In `wrangler.jsonc`, the `crons` array becomes:

```jsonc
// Hourly: deliver pushes whose recipient has reached 08:00 local (#518). The
// feed pull still runs every 6 hours — see shouldRunFeedPull in worker/index.ts,
// which is now the only place that cadence is expressed.
// Daily at 03:11: full data backup to R2 (see #116)
// Mondays at 08:00: weekly digest
"crons": ["17 * * * *", "11 3 * * *", "0 8 * * 1"]
```

- [ ] **Step 4: Branch in the handler**

In `worker/index.ts`, export the predicate and use it in `scheduled`:

```ts
// The feed pull stays 6-hourly: the sources are external and nothing about a
// listing needs hourly resolution. Only the push pass does, so it can land
// near 08:00 local in any timezone. Reproduces the old "17 */6 * * *".
export function shouldRunFeedPull(scheduledAt: Date): boolean {
  return scheduledAt.getUTCHours() % 6 === 0;
}
```

and in the default branch of `scheduled`:

```ts
    ctx.waitUntil(
      (async () => {
        // event.scheduledTime, not Date.now(): a retried or delayed invocation
        // must branch on the time it was scheduled for, or it would skip or
        // double the feed pull.
        if (shouldRunFeedPull(new Date(event.scheduledTime))) {
          const [feedResult] = await Promise.all([
            refreshFeed(env),
            checkStalePostings(env),
          ]);
          await generateNotifications(env, feedResult.inserted);
        }
        await deliverDuePushes(env);
      })(),
    );
```

Import `deliverDuePushes` from `./notifications`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run --no-file-parallelism --project workers test/scheduled-dispatch.spec.ts --reporter=verbose
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Run the whole gate**

```bash
npx tsc -b
./node_modules/.bin/oxlint; echo "EXIT=$?"
npx vitest run --no-file-parallelism --reporter=verbose
npm run build
npx storybook build
```

Expected: all green.

- [ ] **Step 7: Commit and open the PR**

```bash
git add wrangler.jsonc worker/index.ts test/scheduled-dispatch.spec.ts
git commit -m "feat: run the scheduler hourly and branch the feed pull

The push pass needs hourly resolution to land near 08:00 local in any
timezone. A fourth cron trigger would have taken the account's last slot — the
free plan allows five per account, not per Worker, and one is used elsewhere —
so the existing trigger goes hourly and the handler branches instead.

The branch reads event.scheduledTime rather than the wall clock: a retried or
delayed invocation must decide from the time it was scheduled for, or it would
skip or double the feed pull. The cadence is no longer visible in
wrangler.jsonc, so the comment carrying it is load-bearing."
gh pr create --fill
gh pr checks --watch
```

---

## Done when

- `npx tsc -b`, `npm run build`, `./node_modules/.bin/oxlint`, `npx vitest run --no-file-parallelism` and `npx storybook build` are all green.
- en/nl key parity holds for `settings.timezone` and `settings.timezoneNow`.
- `grep -rn "date('now')" worker/` returns nothing in the due-follow-up, due-contact or calendar queries.
- `grep -rn "Intl.DateTimeFormat" worker/` returns hits only in `worker/tz.ts` and the `isUsableTimeZone` validator in `worker/index.ts`.
- A user with `timezone` NULL sees exactly today's behaviour.
- The `settings` screenshot captures differ from the baseline by the new field only, and that diff has been reviewed rather than driven to zero.
