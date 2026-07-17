import { describe, it, expect } from "vitest";
import {
  funnelReachCounts,
  funnelConversions,
  responseRate,
  medianTimeInStageDays,
  median,
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
    expect(c[0].rate).toBeCloseTo(3 / 4);
    expect(c[1].rate).toBeCloseTo(2 / 3);
    expect(c[2].rate).toBeCloseTo(1 / 2);
    expect(c[3].rate).toBe(0); // prev=1, count=0
  });
});

describe("responseRate", () => {
  it("is applied → screening-or-beyond", () => {
    const r = responseRate(HISTORY);
    expect(r.applied).toBe(3);
    expect(r.responded).toBe(2);
    expect(r.rate).toBeCloseTo(2 / 3);
  });

  it("is zero with no applications", () => {
    expect(responseRate([h(9, "interested", "2026-01-01 00:00:00")]).rate).toBe(
      0,
    );
  });
});

describe("medianTimeInStageDays", () => {
  it("medians the days spent entering each stage", () => {
    const now = new Date("2026-01-10T00:00:00Z").getTime();
    const timings = medianTimeInStageDays(HISTORY, now);
    const byStage = Object.fromEntries(timings.map((t) => [t.stage, t]));
    // applied durations: app1 Jan3→Jan6 = 3d, app2 Jan2→Jan5 = 3d,
    // app3 Jan4→now(Jan10) = 6d  → median of [3,3,6] = 3
    expect(byStage.applied.median).toBe(3);
    expect(byStage.applied.n).toBe(3);
    // screening: app1 Jan6→Jan10 = 4d, app2 Jan5→now = 5d → median 4.5
    expect(byStage.screening.median).toBeCloseTo(4.5);
  });
});
