import { describe, expect, test } from "vitest";
import { openPrepCount } from "./format";
import type { Application } from "./types";

// Two features answer "what do I do before this interview" and did not talk to
// each other. Next Up ranks purely off next_action/next_action_at, which the
// user types by hand; interview_prep_items is real, tracked state the app
// already has. So an interview two days out with four unchecked prep items and
// nothing typed left Today blank — on the screen whose whole job is "know the
// next action within seconds".
//
// This decides when the checklist is the answer. It is deliberately narrow:
// a typed next_action is the user's own words and always wins, and prep items
// on an application that is not at interview are notes for later, not a thing
// to do now.
const app = (over: Partial<Application>): Application =>
  ({ id: 1, status: "interview", next_action: null, next_action_at: null, ...over }) as Application;

describe("when the prep checklist is the next action", () => {
  test("counts open items on an interview with nothing typed", () => {
    expect(openPrepCount(app({ open_prep_items: 4 }))).toBe(4);
  });

  test("stands aside for what the user typed", () => {
    // Their words beat a generated sentence, even when both are true.
    expect(openPrepCount(app({ open_prep_items: 4, next_action: "Call Dana" }))).toBe(0);
    expect(
      openPrepCount(app({ open_prep_items: 4, next_action_at: "2026-09-09" })),
    ).toBe(0);
  });

  test("says nothing when the checklist is finished", () => {
    expect(openPrepCount(app({ open_prep_items: 0 }))).toBe(0);
    expect(openPrepCount(app({}))).toBe(0);
  });

  test("only speaks at the stage the prep is for", () => {
    // Prep items on an applied or screening row are notes for later. Treating
    // them as due would put a task on the screen for something that has not
    // been scheduled yet.
    for (const status of ["interested", "applied", "screening", "offer"] as const) {
      expect(openPrepCount(app({ status, open_prep_items: 3 })), status).toBe(0);
    }
  });

  test("stays quiet on a dead application", () => {
    for (const status of ["rejected", "withdrawn", "ghosted"] as const) {
      expect(openPrepCount(app({ status, open_prep_items: 3 })), status).toBe(0);
    }
  });
});
