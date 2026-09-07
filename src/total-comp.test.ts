import { describe, expect, test } from "vitest";
import { annualizedComp, totalComp } from "./format";
import type { Application } from "./types";

// The offer figure the board card and the detail page both show, and the one
// the offer comparison PDF sorts on — with no test on it until now. It is
// four inputs on different scales (a monthly or yearly band, a percentage of
// base, two flat amounts), which is exactly the shape that gets one term
// wrong and still looks plausible.
//
// Deliberately approximate by design (#63): equity and bonus are estimates,
// which is why it is never shown as a bare precise figure. Approximate is not
// the same as unpinned — the arithmetic still has one right answer.
const offer = (over: Partial<Application>): Application =>
  ({ salary_period: "year", ...over }) as Application;

describe("the annualized base", () => {
  test("takes the midpoint of a band", () => {
    expect(annualizedComp(offer({ salary_min: 80000, salary_max: 100000 }))).toBe(90000);
  });

  test("uses whichever end is given when only one is", () => {
    expect(annualizedComp(offer({ salary_min: 80000 }))).toBe(80000);
    expect(annualizedComp(offer({ salary_max: 100000 }))).toBe(100000);
  });

  test("annualizes a monthly figure rather than comparing it to yearly ones", () => {
    // The one that would silently rank a monthly offer twelve times too low
    // against yearly ones on the same board.
    expect(
      annualizedComp(offer({ salary_min: 5000, salary_max: 7000, salary_period: "month" })),
    ).toBe(72000);
  });

  test("is null when there is no salary at all", () => {
    expect(annualizedComp(offer({}))).toBeNull();
  });
});

describe("the total-comp estimate", () => {
  test("is the base when nothing else is set", () => {
    expect(totalComp(offer({ salary_min: 90000, salary_max: 90000 }))).toBe(90000);
  });

  test("reads bonus_target_pct as a percentage of base, not a multiplier", () => {
    // 10 means ten percent. Read as a multiplier it would add 900000.
    expect(
      totalComp(offer({ salary_min: 90000, salary_max: 90000, bonus_target_pct: 10 })),
    ).toBe(99000);
  });

  test("adds the signing bonus and equity flat", () => {
    expect(
      totalComp(
        offer({
          salary_min: 90000,
          salary_max: 90000,
          signing_bonus: 10000,
          equity_value: 25000,
        }),
      ),
    ).toBe(125000);
  });

  test("takes the bonus percentage off the annualized base, not the monthly one", () => {
    // The two conversions have to compose in the right order: 10% of 72000,
    // not 10% of 6000 annualized afterwards.
    expect(
      totalComp(
        offer({
          salary_min: 6000,
          salary_max: 6000,
          salary_period: "month",
          bonus_target_pct: 10,
        }),
      ),
    ).toBe(79200);
  });

  test("is null without a base, rather than counting the extras alone", () => {
    // An offer with a signing bonus and no salary is not a 10000 offer.
    expect(totalComp(offer({ signing_bonus: 10000, equity_value: 25000 }))).toBeNull();
  });
});
