// Date-boundary tests for the date-relative helpers in ./format.
//
// The screenshot verification rig pins its clock to a fixed instant, so it
// never exercises a threshold comparison from more than one side. These
// tests are the only thing that catches an off-by-one, a UTC/local mix-up,
// or a wrong-direction inequality in this module.
//
// The process timezone is pinned to America/Los_Angeles (a negative UTC
// offset) for the whole file. That is deliberate: CI runs in UTC, where a
// UTC-vs-local bug in this code would produce the same answer as the correct
// local-aware behaviour, so the assertion would pass either way and prove
// nothing. A negative-offset zone is what makes that class of bug visible.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application, Contact } from "./types";
import {
  ageDays,
  DEADLINE_SOON_DAYS,
  deadlineDaysLeft,
  formatDate,
  isDeadlinePast,
  isDeadlineSoon,
  isDue,
  isFollowUpDue,
  isFollowUpOverdue,
  isOverdue,
  parseSqlDate,
  today,
} from "./format";

const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = "America/Los_Angeles";

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 1,
    company_id: null,
    contact_id: null,
    title: "Engineer",
    role_type: "engineering",
    url: null,
    source: null,
    salary_range: null,
    salary_currency: null,
    salary_min: null,
    salary_max: null,
    salary_period: null,
    signing_bonus: null,
    bonus_target_pct: null,
    equity_value: null,
    benefits_notes: null,
    referred_by_contact_id: null,
    posting_status: null,
    posting_checked_at: null,
    status: "applied",
    notes: null,
    applied_at: null,
    next_action: null,
    next_action_at: null,
    deadline_at: null,
    archived_at: null,
    fit_score: null,
    cover_letter: null,
    job_description: null,
    job_description_captured_at: null,
    tags: [],
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
    ...overrides,
  };
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 1,
    company_id: null,
    name: "Jane Doe",
    role: null,
    email: null,
    phone: null,
    linkedin: null,
    notes: null,
    last_contacted_at: null,
    follow_up_at: null,
    outreach_status: "not_contacted",
    created_at: "2026-01-01 00:00:00",
    ...overrides,
  };
}

describe("timezone pin guard", () => {
  it("fails loudly if the America/Los_Angeles pin ever stops applying", () => {
    // 2026-08-05T03:00:00Z is 2026-08-04 20:00 local in America/Los_Angeles
    // (PDT, UTC-7). Date#getDate() reads the *local* calendar day, so a
    // correctly-pinned process reports 4. If this ever reports 5, the TZ
    // pin silently stopped working and every test below that relies on it
    // to distinguish UTC from local is vacuous, not passing.
    expect(new Date("2026-08-05T03:00:00Z").getDate()).toBe(4);
  });
});

describe("today", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the UTC calendar date, not the local one (known bug, recorded not fixed)", () => {
    // At this instant it is still the evening of 2026-08-04 in the pinned
    // zone, but today() reads new Date().toISOString() — UTC — so it
    // reports 2026-08-05: tomorrow, from the user's perspective. In
    // production this means from ~17:00 local onward (UTC-7/-8), a
    // next_action_at/deadline_at the user picked in their own calendar for
    // "tomorrow" already registers as due today. That is a genuine
    // product bug; fixing it changes what the whole board/dashboard
    // consider "due" and is the product owner's call, not a side effect of
    // adding tests. This test only pins the current behaviour so a future
    // change to it is a deliberate, visible diff.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T03:00:00Z"));
    expect(today()).toBe("2026-08-05");
  });
});

describe("date-relative logic (pinned clock)", () => {
  // 2026-06-15T12:00:00Z is 2026-06-15 05:00 local (PDT) — same calendar
  // day in both UTC and the pinned zone, so these boundary assertions test
  // the due/overdue comparison logic itself, not the UTC/local split
  // (that split is covered separately by the today()/formatDate tests).
  const NOW = "2026-06-15T12:00:00Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isDue / isOverdue", () => {
    it("today: due, not overdue", () => {
      const a = makeApplication({ next_action_at: "2026-06-15" });
      expect(isDue(a)).toBe(true);
      expect(isOverdue(a)).toBe(false);
    });

    it("yesterday: due and overdue", () => {
      const a = makeApplication({ next_action_at: "2026-06-14" });
      expect(isDue(a)).toBe(true);
      expect(isOverdue(a)).toBe(true);
    });

    it("tomorrow: neither due nor overdue", () => {
      const a = makeApplication({ next_action_at: "2026-06-16" });
      expect(isDue(a)).toBe(false);
      expect(isOverdue(a)).toBe(false);
    });

    it("null next_action_at: neither due nor overdue", () => {
      const a = makeApplication({ next_action_at: null });
      expect(isDue(a)).toBe(false);
      expect(isOverdue(a)).toBe(false);
    });

    it("dead status suppresses due/overdue even with a past date", () => {
      const a = makeApplication({
        next_action_at: "2026-06-01",
        status: "rejected",
      });
      expect(isDue(a)).toBe(false);
      expect(isOverdue(a)).toBe(false);
    });
  });

  describe("isFollowUpDue / isFollowUpOverdue", () => {
    // Contact has no status field at all — these deliberately do not
    // consider dead-ness, unlike isDue/isOverdue above.
    it("today: due, not overdue", () => {
      const c = makeContact({ follow_up_at: "2026-06-15" });
      expect(isFollowUpDue(c)).toBe(true);
      expect(isFollowUpOverdue(c)).toBe(false);
    });

    it("yesterday: due and overdue", () => {
      const c = makeContact({ follow_up_at: "2026-06-14" });
      expect(isFollowUpDue(c)).toBe(true);
      expect(isFollowUpOverdue(c)).toBe(true);
    });

    it("tomorrow: neither due nor overdue", () => {
      const c = makeContact({ follow_up_at: "2026-06-16" });
      expect(isFollowUpDue(c)).toBe(false);
      expect(isFollowUpOverdue(c)).toBe(false);
    });

    it("null follow_up_at: neither due nor overdue", () => {
      const c = makeContact({ follow_up_at: null });
      expect(isFollowUpDue(c)).toBe(false);
      expect(isFollowUpOverdue(c)).toBe(false);
    });
  });

  describe("deadlineDaysLeft", () => {
    it("today is 0", () => {
      expect(deadlineDaysLeft(makeApplication({ deadline_at: "2026-06-15" }))).toBe(0);
    });

    it("tomorrow is 1", () => {
      expect(deadlineDaysLeft(makeApplication({ deadline_at: "2026-06-16" }))).toBe(1);
    });

    it("yesterday is -1", () => {
      expect(deadlineDaysLeft(makeApplication({ deadline_at: "2026-06-14" }))).toBe(-1);
    });

    it("null deadline_at is null", () => {
      expect(deadlineDaysLeft(makeApplication({ deadline_at: null }))).toBeNull();
    });

    it("stays an exact whole number across the US spring-forward DST transition", () => {
      // 2027-03-14 is the second Sunday of March 2027 — the US DST
      // transition. This window (2027-03-07 -> 2027-03-21) spans it, so a
      // naive local wall-clock day-diff would land on a non-integer number
      // of 24h periods; Math.round exists to defend against exactly that.
      // Expect the whole number 14, not something that only rounds to it.
      vi.setSystemTime(new Date("2027-03-07T12:00:00Z"));
      const a = makeApplication({ deadline_at: "2027-03-21" });
      expect(deadlineDaysLeft(a)).toBe(14);
    });
  });

  describe("isDeadlineSoon", () => {
    it(`exactly ${DEADLINE_SOON_DAYS} days out is soon`, () => {
      expect(isDeadlineSoon(makeApplication({ deadline_at: "2026-06-18" }))).toBe(true);
    });

    it(`exactly ${DEADLINE_SOON_DAYS + 1} days out is not soon`, () => {
      expect(isDeadlineSoon(makeApplication({ deadline_at: "2026-06-19" }))).toBe(false);
    });

    it("an already-past deadline still counts as soon (days <= 3, intentionally)", () => {
      const a = makeApplication({ deadline_at: "2026-06-01" });
      expect(isDeadlineSoon(a)).toBe(true);
    });

    it("dead status suppresses soon even within the window", () => {
      const a = makeApplication({ deadline_at: "2026-06-16", status: "withdrawn" });
      expect(isDeadlineSoon(a)).toBe(false);
    });
  });

  describe("isDeadlinePast", () => {
    it("yesterday (days = -1) is past", () => {
      expect(isDeadlinePast(makeApplication({ deadline_at: "2026-06-14" }))).toBe(true);
    });

    it("today (days = 0) is not past", () => {
      expect(isDeadlinePast(makeApplication({ deadline_at: "2026-06-15" }))).toBe(false);
    });
  });

  describe("ageDays", () => {
    it('"0d" for right now (SQL form)', () => {
      expect(ageDays("2026-06-15 12:00:00")).toBe("0d");
    });

    it('"1d" for exactly 24h ago (SQL form)', () => {
      expect(ageDays("2026-06-14 12:00:00")).toBe("1d");
    });

    it("floors: 23h ago is still \"0d\" (SQL form)", () => {
      expect(ageDays("2026-06-14 13:00:00")).toBe("0d");
    });

    it('clamps a future timestamp to "0d" (SQL form)', () => {
      expect(ageDays("2026-06-16 12:00:00")).toBe("0d");
    });

    it("handles the ISO form the same as the equivalent SQL form", () => {
      // Regression for the bug this task exists to fix: ageDays used to
      // unconditionally do `updatedAt.replace(" ", "T") + "Z"`, which is
      // only correct for SQL-form input. Fed an ISO string (already has a
      // "T" and trailing "Z"), that produced "...ZZ" -> Invalid Date ->
      // NaN -> the string "NaNd". updated_at is currently always written
      // in SQL form (datetime('now')), so this was latent, not yet
      // user-visible.
      expect(ageDays("2026-06-14T12:00:00Z")).toBe("1d");
    });
  });

  describe("parseSqlDate", () => {
    it("SQL form and ISO form of the same instant parse equal", () => {
      expect(parseSqlDate("2026-06-14 12:00:00")).toBe(
        parseSqlDate("2026-06-14T12:00:00Z"),
      );
    });
  });
});

describe("formatDate", () => {
  // Pure function of its input — no fake clock needed, only the TZ pin
  // above. Asserting the day *number* (not a computed locale string) is
  // the point: comparing against a string built the same way the
  // implementation builds it would pass even if both were wrong.
  function dayOf(rendered: string): number {
    const match = rendered.match(/\d+/);
    if (!match) throw new Error(`no day number in "${rendered}"`);
    return Number(match[0]);
  }

  it("date-only input anchors at local midnight, so it renders the same day (not the day before)", () => {
    // formatDate appends a bare "T00:00:00" (no offset) on purpose, so the
    // literal parses as *local* midnight. In a negative-offset zone, a
    // naive UTC parse of "2026-08-05" would render as August 4th locally
    // (17:00 the previous day) — the exact bug the anchoring comment in
    // format.ts is defending against.
    expect(dayOf(formatDate("2026-08-05"))).toBe(5);
  });

  it("accepts a full ISO datetime (feed posted_at) by slicing to its date component", () => {
    expect(dayOf(formatDate("2026-08-04T23:30:00Z"))).toBe(4);
  });
});
