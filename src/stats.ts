// Stats v2 metrics (#275) — pure, dependency-free functions over the
// /api/stats payload (applications + status_history), so they're unit
// testable without a DOM or DB. Terminal states (rejected/withdrawn/
// ghosted) are excluded: these measure forward progress through the funnel.
import type { StatsApplication, Status, StatusHistoryRow } from "./types";

export const FUNNEL_STAGES: Status[] = [
  "interested",
  "applied",
  "screening",
  "interview",
  "offer",
];

// Deliberately a copy of format.ts's parseSqlDate rather than an import: this
// module states it is dependency-free so it can be unit-tested without a DOM
// or a DB, and that is worth more than saving four lines. It was not a
// faithful copy — the ISO branch is the fix format.ts's own comment records
// (a value that already has a T and a Z became "...ZZ", an Invalid Date and a
// NaN), and it had not been carried across. Nothing feeds this ISO today; a
// copy that has silently diverged from the thing it copies is the point.
function sqlMs(d: string): number {
  return new Date(d.includes("T") ? d : d.replace(" ", "T") + "Z").getTime();
}

// Furthest funnel stage index each application ever reached.
//
// A terminal transition is not a funnel stage, but it is still evidence the
// application entered the pipeline — so it floors the application at 0 rather
// than dropping it. Without that, an application whose only history row is
// (NULL, 'ghosted') contributed nothing to counts[0], the "ever entered"
// figure the funnel card headlines with, and the base every rate below it is
// measured against was short.
//
// That is not a demo-data curiosity: the insert trigger writes exactly one row
// when an application is created already dead, and logging a past application
// that went nowhere is an ordinary thing to do.
//
// Floored at 0 and no further on purpose. The row says it entered; nothing
// says how far it got, so nothing here claims it did.
function reachedIndexByApp(history: StatusHistoryRow[]): Map<number, number> {
  const reached = new Map<number, number>();
  for (const row of history) {
    const idx = FUNNEL_STAGES.indexOf(row.to_status);
    const prev = reached.get(row.application_id) ?? -1;
    if (Math.max(idx, 0) > prev) reached.set(row.application_id, Math.max(idx, 0));
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

// medianTimeInStageDays used to live here. It mixed right-censored durations
// with completed ones — an application still sitting in a stage contributed
// "it has been 6 days so far" alongside another's "it took 6 days" — which
// biases the median downward in proportion to how much is still open. The
// comment on responseTime below already said so, and said it was safe because
// the function was on no screen.
//
// That is a reason to remove it, not to keep it. It was exported and tested,
// which is what makes dead code dangerous rather than merely untidy: the next
// person wanting time-in-stage finds a working, tested implementation and
// ships the bias. responseTime is the shape to copy instead — the median over
// the ones that finished, and the count still open reported beside it, rather
// than one number that quietly folds them together.

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
  /**
   * How many of those waiting have been waiting longer than any reply that
   * ever arrived. Null until there are enough answers to say it.
   *
   * The point is to turn open-ended waiting into something that can be acted
   * on. Uncertainty is the part of a job search that does the damage —
   * research on job-search stress is consistent that not knowing is harder to
   * carry than a no — and "still waiting" says nothing about whether an
   * answer is still coming.
   *
   * Deliberately measured against this account's own replies rather than a
   * published figure. The industry numbers exist (a first response typically
   * lands in about a week, and past three weeks a reply is unlikely), but
   * they describe a market, not a person's field or seniority, and this page
   * already prefers the reader's own median for the same reason. Beyond the
   * slowest reply anyone has actually sent you is a statement that is true by
   * construction, and it is a floor rather than a verdict: it says answers
   * have stopped arriving by this point, not that the answer is no.
   */
  beyondAnyReply: number | null;
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
  const slowestReply = answered.length ? Math.max(...answered) : null;
  return {
    median: answered.length >= MIN_CONVERSION_N ? median(answered) : null,
    n: answered.length,
    waiting: waits.length,
    longestWait: waits.length ? Math.max(...waits) : null,
    // Same floor as the median: below it the slowest reply is one sample and
    // says nothing about where replies stop.
    beyondAnyReply:
      answered.length >= MIN_CONVERSION_N && slowestReply != null
        ? waits.filter((d) => d > slowestReply).length
        : null,
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
// The last row per application. Don't lean on the caller's ordering:
// same-timestamp rows are ordered by id server-side, but these functions are
// used on any history array.
function latestByApp(history: StatusHistoryRow[]): Map<number, StatusHistoryRow> {
  const latest = new Map<number, StatusHistoryRow>();
  for (const row of history) {
    const prev = latest.get(row.application_id);
    if (!prev || sqlMs(row.changed_at) >= sqlMs(prev.changed_at)) {
      latest.set(row.application_id, row);
    }
  }
  return latest;
}

export interface GhostRate {
  /** Applications that reached a terminal state at all. */
  closed: number;
  /** Of those, how many ended in "ghosted". */
  ghosted: number;
  /** Null below MIN_CONVERSION_N closed — same floor as everything else. */
  rate: number | null;
}

// Ghost rate. README and PRODUCT.md have both named it as a shipped Insights
// metric since the stats work landed, and nothing computed it: "ghosted"
// existed as a status, a one-tap action and a bucket of outcome labels, never
// as a fraction. A reader had to eyeball the outcome bars and do the division.
//
// Of the applications that ENDED, how many ended in silence. Applications
// still open are not in the denominator, for the reason responseTime spells
// out at length: an application nobody has answered yet is not a ghost, it is
// an unfinished measurement, and folding the two together is how a metric
// ends up wrong in a specific direction.
//
// Counts the "ghosted" status only, not rejections whose reason happens to be
// no_response. Those are different rows because the user said they were —
// they chose the terminal status — and reclassifying them here would make the
// number disagree with the outcome breakdown drawn beside it.
export function ghostRate(history: StatusHistoryRow[]): GhostRate {
  let closed = 0;
  let ghosted = 0;
  for (const row of latestByApp(history).values()) {
    if (FUNNEL_STAGES.includes(row.to_status)) continue;
    closed++;
    if (row.to_status === "ghosted") ghosted++;
  }
  return {
    closed,
    ghosted,
    rate: closed >= MIN_CONVERSION_N ? ghosted / closed : null,
  };
}

export function outcomeBreakdown(history: StatusHistoryRow[]): OutcomeBreakdown {
  const latest = latestByApp(history);

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

// Where an application came from. Three channels rather than the raw `source`
// string: the feed writes `feed:adzuna` / `feed:greenhouse` / `feed:ashby`,
// the browser extension writes `extension`, and anything typed by hand is
// null. At ~50 applications per search, splitting the feed three ways puts
// every board under the floor a rate needs — the channel is the question a
// person actually asks ("is the feed earning the six-hourly cron?"), and the
// per-board split is noise at this scale.
export type OriginChannel = "feed" | "extension" | "manual";

export function originChannel(source: string | null): OriginChannel {
  if (!source) return "manual";
  if (source.startsWith("feed:")) return "feed";
  if (source === "extension") return "extension";
  // A source this function does not know is manual rather than a fourth
  // bucket: an unrecognised string is far more likely to be something typed
  // or imported than a channel nobody added here.
  return "manual";
}

export interface OriginStats {
  channel: OriginChannel;
  /** Applications that came in through this channel, whatever stage. */
  total: number;
  /** Of those, how many ever reached "applied". */
  applied: number;
  /** Of those, how many ever reached "screening" or beyond. */
  responded: number;
  /** Null below MIN_CONVERSION_N applied — same floor as everything else. */
  rate: number | null;
  /** Of those, how many ever reached "offer". */
  offers: number;
}

// Response rate per origin channel — the product claims sourcing and pipeline
// are one loop, and this is the half that closes it. `source` has been written
// on every application by all three creation paths since the feed shipped, and
// carried in the /api/stats payload the whole time, and nothing has ever read
// it: a user could not answer whether the feed was worth having.
//
// Deliberately the same shape and the same floor as responseRate rather than a
// new kind of number. A per-channel rate off two applications is exactly the
// overconfidence MIN_CONVERSION_N exists to refuse, and splitting by channel
// makes small denominators the normal case rather than the edge one — so the
// floor matters more here than anywhere it is already applied, not less.
//
// Channels with nothing in them are omitted. A row reading "Extension — 0
// applications" on an account that never installed it is noise, and an empty
// list is the honest answer for an account that has only ever typed things in.
export function originBreakdown(
  applications: StatsApplication[],
  history: StatusHistoryRow[],
): OriginStats[] {
  const reached = reachedIndexByApp(history);
  const appliedIdx = FUNNEL_STAGES.indexOf("applied");
  const screeningIdx = FUNNEL_STAGES.indexOf("screening");
  const offerIdx = FUNNEL_STAGES.indexOf("offer");

  const order: OriginChannel[] = ["feed", "extension", "manual"];
  const byChannel = new Map<OriginChannel, OriginStats>();
  for (const channel of order) {
    byChannel.set(channel, {
      channel,
      total: 0,
      applied: 0,
      responded: 0,
      rate: null,
      offers: 0,
    });
  }

  for (const app of applications) {
    const row = byChannel.get(originChannel(app.source))!;
    row.total++;
    // -1 for an application with no history at all, which is what an
    // extension-created one has until it first moves. It counts toward the
    // channel's total and toward none of its stage counts, which is the
    // truthful reading: it exists, and it has not been sent anywhere.
    const r = reached.get(app.id) ?? -1;
    if (r >= appliedIdx) row.applied++;
    if (r >= screeningIdx) row.responded++;
    if (r >= offerIdx) row.offers++;
  }

  return order
    .map((channel) => byChannel.get(channel)!)
    .filter((row) => row.total > 0)
    .map((row) => ({
      ...row,
      rate: row.applied >= MIN_CONVERSION_N ? row.responded / row.applied : null,
    }));
}
