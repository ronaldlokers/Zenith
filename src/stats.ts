// Stats v2 metrics (#275) — pure, dependency-free functions over the
// /api/stats payload (applications + status_history), so they're unit
// testable without a DOM or DB. Terminal states (rejected/withdrawn/
// ghosted) are excluded: these measure forward progress through the funnel.
import type { Status, StatusHistoryRow } from "./types";

export const FUNNEL_STAGES: Status[] = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
];

function sqlMs(d: string): number {
  return new Date(d.replace(" ", "T") + "Z").getTime();
}

// Furthest funnel stage index each application ever reached.
function reachedIndexByApp(history: StatusHistoryRow[]): Map<number, number> {
  const reached = new Map<number, number>();
  for (const row of history) {
    const idx = FUNNEL_STAGES.indexOf(row.to_status);
    if (idx < 0) continue;
    const prev = reached.get(row.application_id) ?? -1;
    if (idx > prev) reached.set(row.application_id, idx);
  }
  return reached;
}

// How many applications ever reached each funnel stage (index i = reached
// stage i or further).
export function funnelReachCounts(history: StatusHistoryRow[]): number[] {
  const reached = [...reachedIndexByApp(history).values()];
  return FUNNEL_STAGES.map((_, i) => reached.filter((r) => r >= i).length);
}

export interface Conversion {
  from: Status;
  to: Status;
  prev: number;
  count: number;
  // null when there is not enough behind it to be a rate at all: no
  // applications reached the previous stage, or so few that the arithmetic
  // is noise. A zero denominator used to yield 0, so an account with nothing
  // in it reported "0% from interested" on a search that had not started,
  // and a single application that reached offer reported 100% at every step
  // — the same code overstating failure at n=0 and success at n=1, both
  // drawn at full confidence.
  rate: number | null;
}

// Below this many applications at the previous stage, a percentage says more
// than the data can support. Three is the smallest number where a rate is not
// just "all of them" or "none of them".
export const MIN_CONVERSION_N = 3;

// Stage-to-stage conversion: of the apps that reached stage N, the
// fraction that went on to reach stage N+1.
export function funnelConversions(history: StatusHistoryRow[]): Conversion[] {
  const counts = funnelReachCounts(history);
  const out: Conversion[] = [];
  for (let i = 1; i < FUNNEL_STAGES.length; i++) {
    const prev = counts[i - 1];
    const count = counts[i];
    out.push({
      from: FUNNEL_STAGES[i - 1],
      to: FUNNEL_STAGES[i],
      prev,
      count,
      rate: prev >= MIN_CONVERSION_N ? count / prev : null,
    });
  }
  return out;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface StageTiming {
  stage: Status;
  median: number;
  n: number;
}

// Median days spent in each funnel stage — the transition into a stage to
// the next transition (or `nowMs` for the current stage). Median over mean
// so a single very slow employer doesn't skew the number.
export function medianTimeInStageDays(
  history: StatusHistoryRow[],
  nowMs: number,
): StageTiming[] {
  const byApp = new Map<number, StatusHistoryRow[]>();
  for (const row of history) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row);
    byApp.set(row.application_id, list);
  }
  const perStage = new Map<Status, number[]>();
  for (const rows of byApp.values()) {
    for (let i = 0; i < rows.length; i++) {
      const stage = rows[i].to_status;
      if (!FUNNEL_STAGES.includes(stage)) continue;
      const start = sqlMs(rows[i].changed_at);
      const end = i + 1 < rows.length ? sqlMs(rows[i + 1].changed_at) : nowMs;
      const days = (end - start) / 86400000;
      if (days < 0) continue;
      const list = perStage.get(stage) ?? [];
      list.push(days);
      perStage.set(stage, list);
    }
  }
  const out: StageTiming[] = [];
  for (const stage of FUNNEL_STAGES) {
    const xs = perStage.get(stage);
    if (!xs || xs.length === 0) continue;
    out.push({ stage, median: median(xs)!, n: xs.length });
  }
  return out;
}

export interface ResponseRate {
  applied: number;
  responded: number;
  /** Null below MIN_CONVERSION_N applications — see funnelConversions. */
  rate: number | null;
}

// Of applications that reached "applied", the fraction that advanced to
// "screening" or beyond — i.e. got a real response rather than silence.
//
// Same floor as funnelConversions, and for the same reason: this card sits
// beside that one, and it read "50%" off two applications while the funnel
// beside it declined to answer off the same evidence. One of the two was
// wrong, and it was this one.
export function responseRate(history: StatusHistoryRow[]): ResponseRate {
  const reached = [...reachedIndexByApp(history).values()];
  const appliedIdx = FUNNEL_STAGES.indexOf("applied");
  const screeningIdx = FUNNEL_STAGES.indexOf("screening");
  const applied = reached.filter((r) => r >= appliedIdx).length;
  const responded = reached.filter((r) => r >= screeningIdx).length;
  return {
    applied,
    responded,
    rate: applied >= MIN_CONVERSION_N ? responded / applied : null,
  };
}

export interface ResponseTime {
  /** Median days from applying to the first reply, over replies received. */
  median: number | null;
  /** How many applications that median is computed from. */
  n: number;
  /** Applications still sitting in "applied" with no answer yet. */
  waiting: number;
  /** Days the longest of those has been waiting, for scale. */
  longestWait: number | null;
}

// How long employers actually take to answer — the metric a job seeker can
// act on, because it is what makes silence readable: three days is nothing
// when the median is eleven, and telling when the median is four.
//
// The median is taken over applications that *got* an answer, and the ones
// still waiting are reported separately rather than folded in. This is the
// whole point. Right-censored durations — "it has been 6 days and counting"
// — are not the same measurement as "it took 6 days", and averaging them
// together is a standard way to get a number that is wrong in a specific
// direction: every unanswered application drags the median down, so the
// more employers ignore you, the faster the app claims they reply. A fresh
// batch of ten applications sent yesterday would report a median response
// of one day.
//
// medianTimeInStageDays does exactly that mixing. It is not on any screen,
// which is the only reason this has not been visible.
//
// Proper survival analysis would give a censored estimate rather than
// dropping the open ones, and at fifty applications with no covariates it
// would not say anything this does not: the pair of numbers — how long the
// answers took, how many are still out — is the honest reading.
export function responseTime(
  history: StatusHistoryRow[],
  nowMs: number,
): ResponseTime {
  const byApp = new Map<number, StatusHistoryRow[]>();
  for (const row of history) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row);
    byApp.set(row.application_id, list);
  }
  const answered: number[] = [];
  const waits: number[] = [];
  for (const rows of byApp.values()) {
    const sorted = [...rows].sort(
      (a, b) => sqlMs(a.changed_at) - sqlMs(b.changed_at),
    );
    const i = sorted.findIndex((r) => r.to_status === "applied");
    if (i === -1) continue;
    const appliedAt = sqlMs(sorted[i].changed_at);
    // The first move after applying, whatever it is. A rejection is an
    // answer: it is the silence this measures, not the outcome.
    const next = sorted[i + 1];
    const days = ((next ? sqlMs(next.changed_at) : nowMs) - appliedAt) / 86400000;
    if (days < 0) continue;
    if (next) answered.push(days);
    else waits.push(days);
  }
  return {
    median: answered.length >= MIN_CONVERSION_N ? median(answered) : null,
    n: answered.length,
    waiting: waits.length,
    longestWait: waits.length ? Math.max(...waits) : null,
  };
}

export interface OutcomeBreakdown {
  counts: { reason: string; count: number }[];
  unrecorded: number;
  total: number;
}

// Why the currently-closed applications ended (#381).
//
// Counts each application once, off its *latest* transition — not every
// terminal transition in history. An application that was rejected, revived
// and is now interviewing has an ending in its past, but it isn't a closed
// application today and nothing in the UI can fill in its reason, so
// counting it would inflate "no reason recorded" with rows nobody can act
// on. The latest row is also exactly the row the outcome endpoint writes to,
// which keeps the breakdown and the edit path pointed at the same data.
export function outcomeBreakdown(history: StatusHistoryRow[]): OutcomeBreakdown {
  const latest = new Map<number, StatusHistoryRow>();
  for (const row of history) {
    const prev = latest.get(row.application_id);
    // Don't lean on the caller's ordering: same-timestamp rows are ordered
    // by id server-side, but this function is used on any history array.
    if (!prev || sqlMs(row.changed_at) >= sqlMs(prev.changed_at)) {
      latest.set(row.application_id, row);
    }
  }

  const tally = new Map<string, number>();
  let unrecorded = 0;
  let total = 0;
  for (const row of latest.values()) {
    if (FUNNEL_STAGES.includes(row.to_status)) continue;
    total++;
    const reason = row.outcome_reason;
    if (!reason) {
      unrecorded++;
      continue;
    }
    tally.set(reason, (tally.get(reason) ?? 0) + 1);
  }

  const counts = [...tally.entries()]
    .map(([reason, count]) => ({ reason, count }))
    // Ties break on the slug so the bar order is stable between renders
    // rather than following Map insertion.
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return { counts, unrecorded, total };
}
