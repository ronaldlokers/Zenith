// Pure helpers extracted from App.tsx (#285 split) — stage/date/status
// logic, comp math, urgency, and momentum. No React, no hooks.
import type {
  Application,
  Contact,
  OutreachStatus,
  Status,
} from "./types";

export const PIPELINE: Status[] = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
];

// Rails on the board (#535 shell): the eight stages in pipeline order, plus
// the manual archive at the end. Archiving is a flag rather than a status,
// but on the board it is one more rail that folds and unfolds like the rest,
// which is why there is no Archive screen any more.
export type BoardRail = Status | "archived";

// The four rails that only ever accumulate. They are outcomes, not places
// work happens, and as four separate folded slabs they held 17% of the
// board width permanently and spelled their names one letter per line each.
// Collapsed into one "Closed" rail while they are all folded (approved
// direction, this session) — Huntr, the closest comparable, ships six
// stages with a single closed column.
export const CLOSED_RAILS: BoardRail[] = [
  "rejected",
  "withdrawn",
  "ghosted",
  "archived",
];

export const BOARD_RAILS: BoardRail[] = [
  ...PIPELINE,
  "rejected",
  "withdrawn",
  "ghosted",
  "archived",
];

// What is folded before you have said otherwise — the rails nothing moves
// out of. Only the default: folding is a choice, so once a rail has been
// unfolded it stays that way until it is folded again.
export const DEFAULT_FOLDED: BoardRail[] = [
  "rejected",
  "withdrawn",
  "ghosted",
  "archived",
];

// Where the fold state is cached for painting (#535). The server copy on
// profile stays the source of truth — it is what makes the board look the
// same on your laptop and your phone — but it arrives on a request, and
// until it does the board has to draw something. Drawing the defaults meant
// a board that rearranged itself a second after it appeared, which is worse
// than a stale guess: a click in that window lands on the wrong column.
export const BOARD_FOLDED_KEY = "zenith_board_folded";

export function readFoldCache(): string[] | null {
  try {
    const raw = localStorage.getItem(BOARD_FOLDED_KEY);
    return raw === null ? null : raw.split(",").filter(Boolean);
  } catch {
    return null;
  }
}

export function writeFoldCache(folded: readonly string[]): void {
  try {
    localStorage.setItem(BOARD_FOLDED_KEY, folded.join(","));
  } catch {
    // A browser with storage disabled just pays the reshuffle.
  }
}

// Manual archiving wins over status: an archived rejection belongs on the
// archive rail, not on the rejected one, or it would appear twice.
export function railOf(a: Application): BoardRail {
  return a.archived_at ? "archived" : a.status;
}

// How strongly a feed posting matches the CV (#535 shell). The thresholds are
// the ones the feed's own fit filter already offers (any / 1+ / 2+ / 3+), so
// the band and the filter cannot disagree about what "a strong match" means.
export const MATCH_BANDS = ["strong", "look", "weak"] as const;

export type MatchBand = (typeof MATCH_BANDS)[number];

export function matchBand(count: number | null | undefined): MatchBand {
  const n = count ?? 0;
  return n >= 3 ? "strong" : n >= 1 ? "look" : "weak";
}

export const OUTREACH_STATUSES: OutreachStatus[] = [
  "not_contacted",
  "awaiting_reply",
  "replied",
  "no_response",
];

export function isDead(status: Status): boolean {
  return status === "rejected" || status === "withdrawn" || status === "ghosted";
}

// Deliberately the *local* calendar date, not UTC: next_action_at,
// follow_up_at and deadline_at are dates the user picked in their own
// calendar, so "today" has to mean the same thing their calendar means by
// it. Building this from toISOString() (UTC) instead makes tomorrow's
// actions read as due all evening west of UTC, and today's actions read as
// not-yet-due for the first couple of hours east of UTC — do not
// "simplify" it back to that.
//
// The server side (worker/notifications.ts, worker/calendar.ts, and the
// date('now') SQL defaults) stays on UTC for now: it has no per-user
// timezone to work from. That's a separate feature (a stored timezone
// preference), so the client/server dates deliberately diverge until then.
export function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Same local-calendar basis as today(), offset by whole days. Uses local
// date arithmetic (setDate), not millisecond addition — adding
// days * 86400000 breaks across a DST transition, where a local day is 23
// or 25 hours long rather than exactly 24.
export function daysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The nth working day from today, for dates the app chooses itself.
//
// Follow-ups are contact with an employer, so a Saturday date is not a plan —
// the mail sits until Monday, and meanwhile the item shows as due on a day
// nothing can be done about it, which is exactly the pile the follow-up
// features exist to prevent. Hiring-side response data agrees on the shape:
// Monday is backlog and Friday afternoon is gone, with midweek answering
// best.
//
// Counting working days rather than taking a calendar date and pushing it off
// the weekend, which was the first version of this and was wrong: from a
// Wednesday, three days out and four days out are Saturday and Sunday, and
// both then land on the same Monday. That collapses the batch push's spread
// into one day — rebuilding the pile it exists to prevent, at the one moment
// someone is trying to clear it.
//
// Deliberately only applied where the app picks the date — snoozing by a
// number of days, and the batch push. A date typed by hand is left exactly as
// typed: someone scheduling a Saturday reminder has a reason, and quietly
// moving it would be the app overruling an explicit choice.
export function workdaysFromToday(days: number): string {
  if (days <= 0) return daysFromToday(days);
  let counted = 0;
  let offset = 0;
  // Bounded rather than while(true): a calendar bug that stops advancing
  // should fail a test, not hang the tab.
  while (counted < days && offset < days * 3 + 7) {
    offset++;
    const iso = daysFromToday(offset);
    const [y, m, d] = iso.split("-").map(Number);
    // Midday, so a DST transition at midnight cannot shift the weekday.
    const dow = new Date(y, m - 1, d, 12).getDay();
    if (dow !== 0 && dow !== 6) counted++;
  }
  return daysFromToday(offset);
}

export function isDue(a: Application): boolean {
  return !!a.next_action_at && !isDead(a.status) && a.next_action_at <= today();
}

export function isOverdue(a: Application): boolean {
  return !!a.next_action_at && !isDead(a.status) && a.next_action_at < today();
}

export function isFollowUpDue(c: Contact): boolean {
  return !!c.follow_up_at && c.follow_up_at <= today();
}

export function isFollowUpOverdue(c: Contact): boolean {
  return !!c.follow_up_at && c.follow_up_at < today();
}

export const DEADLINE_SOON_DAYS = 3;

export function deadlineDaysLeft(a: Application): number | null {
  if (!a.deadline_at) return null;
  return Math.round(
    (new Date(a.deadline_at).getTime() - new Date(today()).getTime()) /
      86400000,
  );
}

export function isDeadlineSoon(a: Application): boolean {
  const days = deadlineDaysLeft(a);
  return days !== null && !isDead(a.status) && days <= DEADLINE_SOON_DAYS;
}

export function isDeadlinePast(a: Application): boolean {
  const days = deadlineDaysLeft(a);
  return days !== null && !isDead(a.status) && days < 0;
}

// The language the interface is actually in, not the browser's. Passing
// undefined here means "whatever this browser is set to", which put two date
// systems on one screen: the Today heading formats with i18n.language and
// read "woensdag 13 augustus" while every row beside it read "Jul 30" on an
// en-US browser. Read from storage rather than importing i18n, which would
// make this module depend on React init order; the key is the one i18n's own
// detector writes.
function uiLocale(): string | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage.getItem("zenith_lang") ?? undefined;
}

export function formatDate(d: string): string {
  // Slice to the date part first: most callers pass a date-only "YYYY-MM-DD",
  // but feed posted_at is a full ISO datetime (Adzuna `created`, etc.) — and
  // "<iso>" + "T00:00:00" parses to Invalid Date. Anchoring at local midnight
  // keeps the day stable regardless of the stored time/zone.
  return new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString(uiLocale(), {
    day: "numeric",
    month: "short",
  });
}

// Only http(s) links are ever rendered as href — a stored javascript:
// or data: URI (from a feed source, a scraped import, or hand-typed)
// must not be clickable.
// Keeps the year, unlike formatDate: credential provenance (when an API key
// was generated, #381) can plausibly be years old, where the pipeline dates
// this app mostly shows are within weeks.
//
// Takes a stored *timestamp*, not a date-only value, so it parses through
// parseSqlDate rather than slicing to the date part: SQLite's datetime('now')
// is UTC, and slicing would print the UTC calendar day — the same off-by-a-day
// that #516 fixed for today(). A key generated at 01:00 local is otherwise
// dated to the previous day.
export function formatDateWithYear(d: string): string {
  return new Date(parseSqlDate(d)).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}

export function ageDays(updatedAt: string): string {
  // Delegate to parseSqlDate rather than re-implementing the parse: this
  // used to do `updatedAt.replace(" ", "T") + "Z"` unconditionally, which
  // only works for SQL-form input. Fed an ISO string (already has "T" and
  // a trailing "Z"), that produced "...ZZ" -> Invalid Date -> NaN -> "NaNd".
  const then = parseSqlDate(updatedAt);
  const days = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  return `${days}d`;
}

export type Urgency = "overdue" | "today" | "stale" | "quiet" | null;
export const URGENCY_RANK: Record<Exclude<Urgency, null>, number> = {
  overdue: 0,
  today: 1,
  stale: 2,
  quiet: 3,
};
export function urgencyRank(u: Urgency): number {
  return u ? URGENCY_RANK[u] : 4;
}

export type BoardSort = "urgency" | "followup" | "fit" | "updated";

// Sort a column's cards by the chosen key (default urgency), so the top of
// every column is the work that matters (#346).
export function sortCards(
  cards: Application[],
  sort: BoardSort,
  urgencyOf: (a: Application) => Urgency,
): Application[] {
  const copy = [...cards];
  if (sort === "fit") {
    copy.sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0));
  } else if (sort === "updated") {
    copy.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  } else if (sort === "followup") {
    copy.sort((a, b) =>
      (a.next_action_at ?? "9999").localeCompare(b.next_action_at ?? "9999"),
    );
  } else {
    copy.sort((a, b) => {
      const byU = urgencyRank(urgencyOf(a)) - urgencyRank(urgencyOf(b));
      if (byU !== 0) return byU;
      const av = a.next_action_at ?? "9999";
      const bv = b.next_action_at ?? "9999";
      if (av !== bv) return av.localeCompare(bv);
      return b.updated_at.localeCompare(a.updated_at);
    });
  }
  return copy;
}

export function parseSqlDate(d: string): number {
  return new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z").getTime();
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Annualized midpoint, for sorting/comparing offers on a common basis
export function annualizedComp(a: Application): number | null {
  if (a.salary_min == null && a.salary_max == null) return null;
  const mid =
    a.salary_max != null && a.salary_min != null
      ? (a.salary_min + a.salary_max) / 2
      : (a.salary_max ?? a.salary_min)!;
  return a.salary_period === "month" ? mid * 12 : mid;
}

export function formatComp(a: Application): string {
  const cur = a.salary_currency ?? "";
  const per = a.salary_period === "month" ? "/mo" : "/yr";
  if (a.salary_min != null && a.salary_max != null) {
    return `${cur} ${a.salary_min.toLocaleString()}–${a.salary_max.toLocaleString()}${per}`;
  }
  const one = a.salary_max ?? a.salary_min;
  return one != null ? `${cur} ${one.toLocaleString()}${per}` : "—";
}

// Rough total-comp estimate for offer-stage applications: base +
// signing bonus + bonus target (% of base) + a flat annualized equity
// estimate. Deliberately approximate (issue #63) — equity/bonus
// numbers are estimates, not contractual, so this is never shown as
// a bare precise figure, only prefixed with "~" and paired with a
// hover breakdown.
export function totalComp(a: Application): number | null {
  const base = annualizedComp(a);
  if (base == null) return null;
  const bonus = a.bonus_target_pct != null ? (base * a.bonus_target_pct) / 100 : 0;
  return base + (a.signing_bonus ?? 0) + bonus + (a.equity_value ?? 0);
}

// Dynamic import — jsPDF (~400kB) is only needed once someone actually
// downloads the comparison, not on every Stats page load (#222).
export async function downloadOfferComparisonPdf(
  offers: Application[],
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const { generateOfferComparisonPdf } = await import("./pdf");
  const rows = offers.map((a) => ({
    title: a.title,
    companyName: a.company_name ?? "—",
    currency: a.salary_currency ?? "",
    totalComp: totalComp(a),
    breakdown: totalCompBreakdown(a),
    benefitsNotes: a.benefits_notes,
  }));
  const doc = generateOfferComparisonPdf(rows, {
    heading: t("stats.offerComparisonHeading"),
    totalComp: t("offer.totalComp"),
    breakdown: t("stats.offerComparisonBreakdown"),
    benefits: t("offer.benefitsNotes"),
    noOffers: t("stats.offerComparisonEmpty"),
  });
  doc.save("offer-comparison.pdf");
}

// Negotiation talking-points draft (#223) — a starting point, not a
// script: pulls together the same total-comp/benchmark numbers already
// shown on the offer, plus any competing offer, into editable prose
// rather than a form of fields that would need its own storage.
export function buildNegotiationDraft(
  a: Application,
  allApplications: Application[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const lines: string[] = [t("offer.negotiationIntro", { title: a.title, company: a.company_name ?? "" })];

  const total = totalComp(a);
  if (total != null) {
    lines.push(
      t("offer.negotiationComp", {
        amount: `${a.salary_currency ?? ""} ${Math.round(total).toLocaleString()}`,
      }),
    );
  }

  const otherOffers = allApplications
    .filter((o) => o.id !== a.id && o.status === "offer" && totalComp(o) != null)
    .sort((x, y) => (totalComp(y) ?? 0) - (totalComp(x) ?? 0));
  const bestOther = otherOffers[0];
  if (bestOther && total != null && (totalComp(bestOther) ?? 0) > total) {
    lines.push(
      t("offer.negotiationCompeting", {
        company: bestOther.company_name ?? t("offer.negotiationAnotherCompany"),
      }),
    );
  }

  const sameRole = allApplications.filter(
    (o) => o.id !== a.id && o.status === "offer" && o.role_type === a.role_type && totalComp(o) != null,
  );
  const pool = sameRole.length ? sameRole : otherOffers;
  // Three, not one. This line goes into a brief someone reads out in a
  // salary conversation, and off a single other offer it was false twice
  // over: there is no median of one number, and "my other offers" was one
  // offer. Nothing is lost by the floor — negotiationCompeting above
  // already names a higher competing offer when there is exactly one, and
  // says so truthfully.
  if (total != null && pool.length >= MIN_POOL_FOR_MEDIAN) {
    const med = median(pool.map((o) => totalComp(o)!));
    if (med != null && med > 0 && total < med) {
      lines.push(
        t("offer.negotiationBelowMarket", {
          pct: Math.round(((med - total) / med) * 100),
        }),
      );
    }
  }

  lines.push(t("offer.negotiationClose"));
  return lines.join("\n\n");
}

export function totalCompBreakdown(a: Application): string {
  const base = annualizedComp(a);
  if (base == null) return "";
  const parts = [`base ~${Math.round(base).toLocaleString()}`];
  if (a.signing_bonus) parts.push(`signing ${a.signing_bonus.toLocaleString()}`);
  if (a.bonus_target_pct) {
    const bonus = Math.round((base * a.bonus_target_pct) / 100);
    parts.push(`bonus target ${a.bonus_target_pct}% (~${bonus.toLocaleString()})`);
  }
  if (a.equity_value) parts.push(`equity ~${a.equity_value.toLocaleString()}/yr`);
  return parts.join(" + ");
}

// Weekly buckets + momentum streak — shared by Stats (apps/week histogram)
// and Overview (streak + weekly goal). Buckets are [now-(8-i)*WEEK,
// ...+WEEK): i=0 is 8 weeks ago, i=7 is the current week ((8-i), not
// (7-i) — see #262).
// Forward stage advances in the last 2 weeks vs the two before — the
// "speeding up / slowing down" verdict shared by the dashboard band and
// the detailed Stats view (#346).
// Six forward moves across four weeks — roughly one a week — is the least
// that makes a fortnight-over-fortnight ratio mean anything here.
export const MOMENTUM_MIN_EVENTS = 6;

export function computePipelineMomentum(history: { from_status: string | null; to_status: string; changed_at: string }[]) {
  const now = Date.now();
  const P = 14 * 86400000;
  const fwd = (r: { from_status: string | null; to_status: string }) => {
    const to = PIPELINE.indexOf(r.to_status as Status);
    const from = r.from_status ? PIPELINE.indexOf(r.from_status as Status) : -1;
    return to >= 0 && to > from;
  };
  const recent = history.filter(
    (h) => fwd(h) && parseSqlDate(h.changed_at) >= now - P,
  ).length;
  const prior = history.filter(
    (h) =>
      fwd(h) &&
      parseSqlDate(h.changed_at) >= now - 2 * P &&
      parseSqlDate(h.changed_at) < now - P,
  ).length;
  let verdict: "up" | "down" | "flat" | "none" | "early";
  if (recent === 0 && prior === 0) verdict = "none";
  // Below this many events in the window, a ratio is noise wearing a
  // verdict's clothes. Two fortnights of one or two stage advances is what a
  // normal search looks like — and at prior = 1, a single extra move reads
  // as +100% "speeding up" while one fewer reads as a collapse. The old code
  // called prior === 0 with any recent movement "speeding up", which is the
  // most confident thing this function could say off the least evidence.
  //
  // A job hunt is mostly flat by nature and mostly read on a bad day, so the
  // default has to be silence until the signal clears the noise rather than
  // a grade computed from a delta of one.
  else if (recent + prior < MOMENTUM_MIN_EVENTS) verdict = "early";
  else if (prior === 0) verdict = "up";
  else {
    const change = (recent - prior) / prior;
    verdict = change > 0.15 ? "up" : change < -0.15 ? "down" : "flat";
  }
  return { verdict, recent, prior };
}

// Median days from the "applied" transition to "offer", per application
// that reached offer (#346, lifted from the Stats computation).
export interface TimeToOffer {
  /** Days from applying to the offer, medianed over the offers there are. */
  days: number | null;
  /** How many offers that is. One offer has a "median" of itself. */
  n: number;
}

// Returns the count as well as the figure, and the caller has to use it.
// The tile printed "~56d MEDIAN TO OFFER" off a single offer: the number
// was true and the word was not, on the largest type on the page. A median
// of one value is that value, and calling it a median claims a spread the
// data does not have.
// Smallest pool that can carry the word "median" — the same three as
// stats.ts's MIN_CONVERSION_N, kept here rather than imported because
// format.ts is the leaf both the app and the worker-side PDF pull from.
export const MIN_POOL_FOR_MEDIAN = 3;

export function medianTimeToOffer(
  history: { application_id: number; to_status: string; changed_at: string }[],
): TimeToOffer {
  const byApp = new Map<number, typeof history>();
  for (const row of history) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row);
    byApp.set(row.application_id, list);
  }
  const durations: number[] = [];
  for (const rows of byApp.values()) {
    // Sorted here rather than trusting the caller. The rows arrive ordered by
    // changed_at today, which is why find() looked correct — but this is a
    // pure function in the leaf both the app and the PDF pull from, and a
    // statistic that is right only because of an ORDER BY in another file is
    // not right, it is lucky.
    const byTime = [...rows].sort(
      (x, y) => parseSqlDate(x.changed_at) - parseSqlDate(y.changed_at),
    );
    const offer = byTime.find((r) => r.to_status === "offer");
    if (!offer) continue;
    const offerAt = parseSqlDate(offer.changed_at);
    // The *last* apply before the offer, not the first. Re-applying is a
    // supported workflow (#217) — a different role, a referral this time, a
    // reopened req — and measuring from the first attempt charges the offer
    // with a rejection and the months of silence before someone tried again.
    // On a real re-application that read 69 days where the apply that led to
    // the offer was 10 days out.
    const applied = byTime.filter(
      (r) => r.to_status === "applied" && parseSqlDate(r.changed_at) <= offerAt,
    );
    const last = applied[applied.length - 1];
    if (!last) continue;
    const d = (offerAt - parseSqlDate(last.changed_at)) / 86400000;
    if (d >= 0) durations.push(d);
  }
  return { days: median(durations), n: durations.length };
}

export function computeWeeklyMomentum(
  apps: { applied_at: string | null; created_at: string }[],
  history: { changed_at: string }[],
) {
  const WEEK = 7 * 86400000;
  const now = Date.now();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = now - (8 - i) * WEEK;
    const count = apps.filter((a) => {
      const t = parseSqlDate(a.applied_at ?? a.created_at);
      return t >= start && t < start + WEEK;
    }).length;
    const label = new Date(start).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
    return { label, count, start };
  });
  // Momentum streak (#145) — consecutive weeks (ending this week) with
  // any job-search activity: a new application or a logged status change.
  const activityWeeks = weeks.map((w) => {
    const hasHistory = history.some((h) => {
      const t = parseSqlDate(h.changed_at);
      return t >= w.start && t < w.start + WEEK;
    });
    return w.count > 0 || hasHistory;
  });
  let streak = 0;
  for (let i = activityWeeks.length - 1; i >= 0; i--) {
    if (activityWeeks[i]) streak++;
    else break;
  }
  const streakBroken = streak === 0 && activityWeeks.slice(0, -1).some(Boolean);
  return { weeks, streak, streakBroken };
}

// goalStreak removed with the Today quota card (#492) — its only caller was
// the weekly-goal block, and a streak beside a zero week congratulated the
// worst week of a search. The goal itself still lives in Settings.

// 1-based "week N of your search" from a start date (#473). `now` is injected
// so it's unit-testable. Returns null when no start date is known.
export function searchWeekNumber(
  startDate: string | null | undefined,
  now: number,
): number | null {
  if (!startDate) return null;
  const start = parseSqlDate(startDate);
  if (!start || Number.isNaN(start)) return null;
  return Math.max(1, Math.floor((now - start) / (7 * 86400000)) + 1);
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatMonthYear(month: number | null, year: number | null): string {
  if (!year) return "";
  return month ? `${MONTH_NAMES[month - 1]} ${year}` : `${year}`;
}

export const KEY_SHORTCUTS_KEY = "zenith_key_shortcuts";

// Keyboard-shortcut opt-out (#—): persisted pref read by App and the board.
export function keyShortcutsEnabled(): boolean {
  return localStorage.getItem(KEY_SHORTCUTS_KEY) !== "off";
}

export const CV_LANG_KEY = "zenith_cv_lang";

export function getCvLanguage(fallback: string): string {
  return localStorage.getItem(CV_LANG_KEY) || fallback;
}

// Which stage's follow-up is worth doing first. Ordered from least to most
// urgent so a higher index sorts higher: an offer waiting on a reply outranks
// a screening, which outranks a speculative "interested". Ranking Today by
// date alone buried a five-star offer at row four, styled like a chore.
export const STAGE_URGENCY: readonly Status[] = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
];

// Today's meaning of "gone quiet": an early-stage application with nothing
// scheduled that has not moved in three weeks — the set that can be closed
// out in one tap.
//
// This is NOT yet the board's meaning, and an earlier comment here claimed it
// was. The board still derives its own (board.tsx:850): a company-relative
// rule, 1.5x that company's own median gap between status changes with a
// five-day floor, measured from a computed lastActivity rather than
// updated_at. So the board can badge a card GONE QUIET while this block does
// not list it — which is exactly what it does on the demo data today.
//
// Unifying them is a product decision, not a refactor: the company-relative
// rule is the better signal but is not a superset, so adopting it changes
// which applications Today offers to close out.
export function isGoneQuiet(a: Application, now = Date.now()): boolean {
  if (a.status !== "interested" && a.status !== "applied") return false;
  if (a.next_action_at) return false;
  const days = Math.floor((now - parseSqlDate(a.updated_at)) / 86400000);
  return days >= 21;
}
