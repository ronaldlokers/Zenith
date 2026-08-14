import { describe, it, expect } from "vitest";
import {
  funnelReachCounts,
  funnelConversions,
  responseRate,
  responseTime,
  median,
  outcomeBreakdown,
} from "../src/stats";
import type { Status, StatusHistoryRow } from "../src/types";

function h(
  application_id: number,
  to_status: Status,
  changed_at: string,
): StatusHistoryRow {
  return { application_id, from_status: null, to_status, changed_at };
}

// Four apps at increasing depth:
//   1: interested → applied → screening → interview
//   2: interested → applied → screening
//   3: interested → applied
//   4: interested only
const HISTORY: StatusHistoryRow[] = [
  h(1, "interested", "2026-01-01 00:00:00"),
  h(1, "applied", "2026-01-03 00:00:00"),
  h(1, "screening", "2026-01-06 00:00:00"),
  h(1, "interview", "2026-01-10 00:00:00"),
  h(2, "interested", "2026-01-01 00:00:00"),
  h(2, "applied", "2026-01-02 00:00:00"),
  h(2, "screening", "2026-01-05 00:00:00"),
  h(3, "interested", "2026-01-01 00:00:00"),
  h(3, "applied", "2026-01-04 00:00:00"),
  h(4, "interested", "2026-01-01 00:00:00"),
];

describe("median", () => {
  it("handles odd, even, and empty", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("funnelReachCounts", () => {
  it("counts apps reaching each stage or further", () => {
    // interested, applied, screening, interview, offer
    expect(funnelReachCounts(HISTORY)).toEqual([4, 3, 2, 1, 0]);
  });
});

describe("funnelConversions", () => {
  it("computes stage-to-stage rates", () => {
    const c = funnelConversions(HISTORY);
    expect(c.map((x) => [x.from, x.to])).toEqual([
      ["interested", "applied"],
      ["applied", "screening"],
      ["screening", "interview"],
      ["interview", "offer"],
    ]);
    // Rates only where enough applications reached the previous stage to
    // make one mean anything: 4 and 3 qualify, 2 and 1 do not.
    expect(c[0].rate).toBeCloseTo(3 / 4);
    expect(c[1].rate).toBeCloseTo(2 / 3);
    expect(c[2].rate, "prev=2 is too few for a percentage").toBeNull();
    expect(c[3].rate, "prev=1 is too few for a percentage").toBeNull();
    // The counts behind them are still true and still reported.
    expect(c.map((x) => [x.prev, x.count])).toEqual([
      [4, 3],
      [3, 2],
      [2, 1],
      [1, 0],
    ]);
  });

  it("says nothing rather than 0% or 100% at the extremes", () => {
    // Both were live defects on the Insights page: an account with nothing
    // in it reported "0% from interested" on a search that had not started,
    // and one application that reached offer reported 100% at every step.
    // The same code overstating failure at n=0 and success at n=1.
    expect(funnelConversions([]).every((c) => c.rate === null)).toBe(true);
    const one: StatusHistoryRow[] = [
      h(1, "interested", "2026-01-01 00:00:00"),
      h(1, "applied", "2026-01-02 00:00:00"),
      h(1, "screening", "2026-01-03 00:00:00"),
      h(1, "interview", "2026-01-04 00:00:00"),
      h(1, "offer", "2026-01-05 00:00:00"),
    ];
    expect(funnelConversions(one).every((c) => c.rate === null)).toBe(true);
  });
});

describe("responseRate", () => {
  it("is applied → screening-or-beyond", () => {
    const r = responseRate(HISTORY);
    expect(r.applied).toBe(3);
    expect(r.responded).toBe(2);
    expect(r.rate).toBeCloseTo(2 / 3);
  });

  it("declines to answer below the threshold", () => {
    // It read "50%" off two applications while the funnel card beside it,
    // on the same evidence, declined to state a conversion at all.
    expect(responseRate([h(9, "interested", "2026-01-01 00:00:00")]).rate)
      .toBeNull();
  });
});


describe("outcomeBreakdown", () => {
  function closed(
    application_id: number,
    to_status: Status,
    changed_at: string,
    outcome_reason: string | null,
  ): StatusHistoryRow {
    return { application_id, from_status: "applied", to_status, changed_at, outcome_reason };
  }

  it("counts each closed application once, by reason", () => {
    const b = outcomeBreakdown([
      closed(1, "rejected", "2026-02-01 00:00:00", "no_response"),
      closed(2, "rejected", "2026-02-02 00:00:00", "no_response"),
      closed(3, "withdrawn", "2026-02-03 00:00:00", "comp_too_low"),
    ]);
    expect(b.total).toBe(3);
    expect(b.unrecorded).toBe(0);
    expect(b.counts).toEqual([
      { reason: "no_response", count: 2 },
      { reason: "comp_too_low", count: 1 },
    ]);
  });

  it("reports closures with no reason separately", () => {
    const b = outcomeBreakdown([
      closed(1, "rejected", "2026-02-01 00:00:00", "no_response"),
      closed(2, "ghosted", "2026-02-02 00:00:00", null),
    ]);
    expect(b.total).toBe(2);
    expect(b.unrecorded).toBe(1);
    expect(b.counts).toEqual([{ reason: "no_response", count: 1 }]);
  });

  it("ignores an application that was reopened after closing", () => {
    // Its ending is real history, but it is not a closed application today
    // and nothing in the UI can fill its reason in — counting it would
    // inflate "no reason recorded" with rows nobody can act on.
    const b = outcomeBreakdown([
      closed(1, "rejected", "2026-02-01 00:00:00", null),
      h(1, "interested", "2026-02-05 00:00:00"),
      h(1, "interview", "2026-02-09 00:00:00"),
    ]);
    expect(b.total).toBe(0);
    expect(b.unrecorded).toBe(0);
  });

  it("uses the latest closure when an application closed twice", () => {
    const b = outcomeBreakdown([
      closed(1, "rejected", "2026-02-01 00:00:00", "after_screening"),
      h(1, "interested", "2026-02-05 00:00:00"),
      closed(1, "rejected", "2026-02-09 00:00:00", "after_interview"),
    ]);
    expect(b.total).toBe(1);
    expect(b.counts).toEqual([{ reason: "after_interview", count: 1 }]);
  });

  it("is empty when nothing has closed", () => {
    const b = outcomeBreakdown(HISTORY);
    expect(b.total).toBe(0);
    expect(b.counts).toEqual([]);
  });
});

describe("responseTime", () => {
  const NOW = Date.parse("2026-02-01T00:00:00Z");
  const day = (n: number) =>
    new Date(Date.parse("2026-01-01T00:00:00Z") + n * 86400000)
      .toISOString()
      .replace("T", " ")
      .slice(0, 19);

  it("medians only the applications that got an answer", () => {
    // Three answered at 2, 4 and 12 days; one still waiting since day 1.
    // The waiter must not pull the median down — it is not a measurement of
    // how long an answer took, it is a measurement still in progress.
    const history = [
      h(1, "applied", day(0)),
      h(1, "screening", day(2)),
      h(2, "applied", day(0)),
      h(2, "rejected", day(4)),
      h(3, "applied", day(0)),
      h(3, "screening", day(12)),
      h(4, "applied", day(1)),
    ];
    const r = responseTime(history, NOW);
    expect(r.n).toBe(3);
    expect(r.median).toBe(4);
    expect(r.waiting).toBe(1);
    // Applied on day 1, "now" is 2026-02-01 — 30 days out and counting.
    expect(r.longestWait).toBe(30);
  });

  it("counts a rejection as an answer", () => {
    // This measures silence, not outcome. A "no" told you where you stand;
    // treating it as no reply would make a fast-rejecting employer look
    // like one that never wrote back.
    const history = [
      h(1, "applied", day(0)),
      h(1, "rejected", day(3)),
      h(2, "applied", day(0)),
      h(2, "rejected", day(3)),
      h(3, "applied", day(0)),
      h(3, "rejected", day(3)),
    ];
    const r = responseTime(history, NOW);
    expect(r.n).toBe(3);
    expect(r.median).toBe(3);
    expect(r.waiting).toBe(0);
  });

  it("declines to answer below the threshold", () => {
    // Same floor as every other rate on this page. Two answers is an
    // anecdote, and the card that states one is the card people plan from.
    const history = [
      h(1, "applied", day(0)),
      h(1, "screening", day(2)),
      h(2, "applied", day(0)),
      h(2, "screening", day(8)),
    ];
    const r = responseTime(history, NOW);
    expect(r.n).toBe(2);
    expect(r.median).toBeNull();
  });

  it("reports waiting applications even with no answers at all", () => {
    // The first weeks of a search look exactly like this, and "nothing to
    // say" is the wrong answer: how long you have been waiting is the only
    // information there is, and it is real.
    const r = responseTime([h(1, "applied", day(0)), h(2, "applied", day(5))], NOW);
    expect(r.median).toBeNull();
    expect(r.waiting).toBe(2);
    expect(r.longestWait).toBe(31);
  });

  it("ignores applications that never reached applied", () => {
    const r = responseTime([h(1, "interested", day(0))], NOW);
    expect(r).toEqual({
      median: null,
      n: 0,
      waiting: 0,
      longestWait: null,
      beyondAnyReply: null,
    });
  });
});

// sqlMs is a deliberate copy of format.ts's parseSqlDate — this module is
// dependency-free on purpose — and it was not a faithful one. The ISO branch
// is the fix format.ts's own comment records: a value that already carries a
// T and a Z became "...ZZ", an Invalid Date and then a NaN duration. Nothing
// feeds these functions ISO today; a copy that has silently diverged from the
// thing it copies is the point.
describe("timestamps in either shape", () => {
  const row = (application_id: number, to_status: string, changed_at: string) =>
    ({ application_id, to_status, changed_at }) as StatusHistoryRow;

  /** Three answered applications — the floor a median is reported above. */
  const three = (fmt: (day: number) => string) => [
    row(1, "applied", fmt(1)), row(1, "screening", fmt(5)),
    row(2, "applied", fmt(1)), row(2, "screening", fmt(5)),
    row(3, "applied", fmt(1)), row(3, "rejected", fmt(5)),
  ];

  it("reads an ISO timestamp as well as SQL's", () => {
    const sql = responseTime(
      three((d) => `2026-08-0${d} 09:00:00`),
      Date.UTC(2026, 7, 14),
    );
    const iso = responseTime(
      three((d) => `2026-08-0${d}T09:00:00.000Z`),
      Date.UTC(2026, 7, 14),
    );
    expect(sql.median).toBe(4);
    expect(
      iso.median,
      "the ISO form produced NaN durations before the copy was fixed",
    ).toBe(4);
  });

  it("reads a date with no time on it", () => {
    // demo.ts seeds status_history with date('now', ?), which has no time
    // component at all.
    const out = responseTime(
      three((d) => `2026-08-0${d}`),
      Date.UTC(2026, 7, 14),
    );
    expect(out.median).toBe(4);
  });
});

// Turning "still waiting" into something that can be acted on. The research
// on job-search stress is consistent that uncertainty is the part that does
// the damage — not knowing is harder to carry than a no — and a bare count of
// open applications says nothing about whether an answer is still coming.
//
// Measured against this account's own replies rather than a published figure:
// past the slowest reply that ever arrived, answers have stopped coming here.
describe("applications waiting longer than any reply ever took", () => {
  const applied = (id: number, day: string) => ({
    application_id: id,
    to_status: "applied",
    from_status: null,
    changed_at: `2026-01-${day} 09:00:00`,
  });
  const replied = (id: number, day: string) => ({
    application_id: id,
    to_status: "screening",
    from_status: "applied",
    changed_at: `2026-01-${day} 09:00:00`,
  });
  const NOW = Date.parse("2026-01-31T09:00:00Z");

  it("counts the ones past the slowest reply, and no others", () => {
    const history = [
      // Three answers: 2, 4 and 6 days. The slowest reply is 6.
      applied(1, "01"), replied(1, "03"),
      applied(2, "01"), replied(2, "05"),
      applied(3, "01"), replied(3, "07"),
      // Waiting 5 days — inside the range replies have arrived in.
      applied(4, "26"),
      // Waiting 20 and 30 days — past it.
      applied(5, "11"),
      applied(6, "01"),
    ];
    const r = responseTime(history, NOW);
    expect(r.n).toBe(3);
    expect(r.waiting).toBe(3);
    expect(
      r.beyondAnyReply,
      "a wait still inside the range replies arrive in was counted as past it",
    ).toBe(2);
  });

  it("says nothing until there are enough replies to say it", () => {
    // One reply is not a distribution: calling a 10-day wait unusual on the
    // strength of a single 2-day answer is a claim the data cannot carry.
    const history = [
      applied(1, "01"), replied(1, "03"),
      applied(2, "01"),
    ];
    expect(responseTime(history, NOW).beyondAnyReply).toBeNull();
  });

  it("counts none when everything open is still inside the range", () => {
    const history = [
      applied(1, "01"), replied(1, "11"),
      applied(2, "01"), replied(2, "12"),
      applied(3, "01"), replied(3, "13"),
      applied(4, "29"),
    ];
    const r = responseTime(history, NOW);
    expect(r.waiting).toBe(1);
    expect(r.beyondAnyReply).toBe(0);
  });
});
