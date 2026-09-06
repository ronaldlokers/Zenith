import { describe, expect, test } from "vitest";
import { FUNNEL_STAGES, funnelReachCounts } from "./stats";
import type { StatusHistoryRow } from "./types";

// The funnel card headlines with counts[0] — "how many ever entered the
// pipeline". An application whose history holds only a terminal transition
// contributed nothing to it, not even that first figure, so the base the whole
// funnel is measured against was short.
//
// Not a demo-data curiosity. It is what happens whenever an application is
// created already dead: the insert trigger writes one row, (NULL → 'ghosted'),
// and logging a past application that went nowhere is an ordinary thing to do.
// The demo seeder just happened to do it too, which is how it surfaced.
//
// Counting it at index 0 and no further is the conservative reading. The row
// says it entered; nothing says how far it got, so nothing claims it did.
const row = (
  application_id: number,
  from_status: string | null,
  to_status: string,
): StatusHistoryRow =>
  ({ application_id, from_status, to_status, changed_at: "2026-01-01 00:00:00" }) as StatusHistoryRow;

describe("the funnel's base count", () => {
  test("includes an application that only ever has a terminal transition", () => {
    const counts = funnelReachCounts([row(1, null, "ghosted")]);
    expect(
      counts[0],
      "an application created already dead never entered the pipeline at all",
    ).toBe(1);
  });

  test("does not claim it got any further than that", () => {
    const counts = funnelReachCounts([row(1, null, "ghosted")]);
    expect(counts.slice(1), "the funnel invented progress the history never records").toEqual(
      FUNNEL_STAGES.slice(1).map(() => 0),
    );
  });

  test("still counts a full trail at every stage it passed", () => {
    const counts = funnelReachCounts([
      row(2, null, "interested"),
      row(2, "interested", "applied"),
      row(2, "applied", "screening"),
    ]);
    expect(counts).toEqual([1, 1, 1, 0, 0]);
  });

  test("counts a terminal application once, not once per row", () => {
    // rejected after a real trail: it entered once and reached screening.
    const counts = funnelReachCounts([
      row(3, null, "interested"),
      row(3, "interested", "applied"),
      row(3, "applied", "screening"),
      row(3, "screening", "rejected"),
    ]);
    expect(counts).toEqual([1, 1, 1, 0, 0]);
  });

  test("keeps an empty history empty", () => {
    expect(funnelReachCounts([])).toEqual([0, 0, 0, 0, 0]);
  });
});
