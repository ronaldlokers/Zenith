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

export const OUTREACH_STATUSES: OutreachStatus[] = [
  "not_contacted",
  "awaiting_reply",
  "replied",
  "no_response",
];

export function isDead(status: Status): boolean {
  return status === "rejected" || status === "withdrawn" || status === "ghosted";
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
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

export function formatDate(d: string): string {
  // Slice to the date part first: most callers pass a date-only "YYYY-MM-DD",
  // but feed posted_at is a full ISO datetime (Adzuna `created`, etc.) — and
  // "<iso>" + "T00:00:00" parses to Invalid Date. Anchoring at local midnight
  // keeps the day stable regardless of the stored time/zone.
  return new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

// Only http(s) links are ever rendered as href — a stored javascript:
// or data: URI (from a feed source, a scraped import, or hand-typed)
// must not be clickable.
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
  const then = new Date(updatedAt.replace(" ", "T") + "Z").getTime();
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
  if (total != null && pool.length) {
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
  let verdict: "up" | "down" | "flat" | "none";
  if (recent === 0 && prior === 0) verdict = "none";
  else if (prior === 0) verdict = "up";
  else {
    const change = (recent - prior) / prior;
    verdict = change > 0.15 ? "up" : change < -0.15 ? "down" : "flat";
  }
  return { verdict, recent, prior };
}

// Median days from the "applied" transition to "offer", per application
// that reached offer (#346, lifted from the Stats computation).
export function medianTimeToOffer(history: { application_id: number; to_status: string; changed_at: string }[]): number | null {
  const byApp = new Map<number, typeof history>();
  for (const row of history) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row);
    byApp.set(row.application_id, list);
  }
  const durations: number[] = [];
  for (const rows of byApp.values()) {
    const a = rows.find((r) => r.to_status === "applied");
    const o = rows.find((r) => r.to_status === "offer");
    if (a && o) {
      const d = (parseSqlDate(o.changed_at) - parseSqlDate(a.changed_at)) / 86400000;
      if (d >= 0) durations.push(d);
    }
  }
  return median(durations);
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

// Consecutive weeks (most recent first) whose application count met the goal
// (#473). Pure. Pass the COMPLETED weekly counts (exclude the in-progress
// current week — the caller shows that as live progress). Zero target = no
// goal set = no streak.
export function goalStreak(weeklyCounts: number[], target: number): number {
  if (target <= 0) return 0;
  let streak = 0;
  for (let i = weeklyCounts.length - 1; i >= 0; i--) {
    if (weeklyCounts[i] >= target) streak++;
    else break;
  }
  return streak;
}

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
