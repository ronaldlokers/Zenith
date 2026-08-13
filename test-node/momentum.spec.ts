import { describe, it, expect } from "vitest";
import { computePipelineMomentum, MOMENTUM_MIN_EVENTS } from "../src/format";

// A job hunt is mostly flat, and this page is mostly read on a bad day. The
// verdict used to be computed from any two fortnights at all: at prior = 1 a
// single extra move read as "+100% speeding up" and one fewer as a collapse,
// and prior = 0 with any movement produced the most confident thing the
// function can say off the least evidence.
const day = 86400000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString().slice(0, 19).replace("T", " ");
const move = (daysAgo: number) => ({ from_status: "applied", to_status: "screening", changed_at: at(daysAgo) });

describe("pipeline momentum", () => {
  it("says nothing at all when there is no movement", () => {
    expect(computePipelineMomentum([]).verdict).toBe("none");
  });

  it("declines to grade a search with too little movement to grade", () => {
    // Two moves across four weeks: a ratio here is noise wearing a verdict.
    const history = [move(2), move(20)];
    expect(computePipelineMomentum(history).verdict).toBe("early");
  });

  it("does not call one extra move a slump or a surge", () => {
    // prior = 1, recent = 2 is +100% by arithmetic and meaningless in fact.
    expect(computePipelineMomentum([move(3), move(4), move(20)]).verdict).toBe("early");
  });

  it("grades once there is enough behind it", () => {
    const recent = [move(1), move(2), move(3), move(4), move(5)];
    const prior = [move(18), move(19), move(20)];
    const out = computePipelineMomentum([...recent, ...prior]);
    expect(recent.length + prior.length).toBeGreaterThanOrEqual(MOMENTUM_MIN_EVENTS);
    expect(out.verdict).toBe("up");
  });

  it("can still say a real slowdown is a slowdown", () => {
    const out = computePipelineMomentum([
      move(1), move(2),
      move(16), move(17), move(18), move(19), move(20), move(21),
    ]);
    expect(out.verdict).toBe("down");
  });
});
