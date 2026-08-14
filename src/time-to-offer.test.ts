import { describe, expect, test } from "vitest";
import { medianTimeToOffer } from "./format";

// Time-to-offer measured from the *first* apply on an application. Re-applying
// is a supported workflow (#217) — a different role, a referral this time, a
// reopened req — and on one of those the statistic charged the offer with the
// earlier rejection and the months of silence before someone tried again: 69
// days where the apply that led to the offer was 10 days out.
//
// Found by coverage. medianTimeToOffer had none, in a file at 52%.
const h = (application_id: number, to_status: string, changed_at: string) => ({
  application_id,
  to_status,
  changed_at,
});

describe("median time to offer", () => {
  test("measures from the apply that led to the offer", () => {
    const rows = [
      h(1, "applied", "2026-01-01 09:00:00"),
      h(1, "rejected", "2026-01-05 09:00:00"),
      h(1, "applied", "2026-03-01 09:00:00"),
      h(1, "offer", "2026-03-11 09:00:00"),
    ];
    expect(medianTimeToOffer(rows)).toEqual({ days: 10, n: 1 });
  });

  test("does not depend on the order the rows arrive in", () => {
    // The rows come back ordered by changed_at today, which is why reading
    // the first match looked right. This is a pure function that the app and
    // the PDF both pull from; a statistic that holds only because of an
    // ORDER BY in another file is not right, it is lucky.
    const rows = [
      h(1, "offer", "2026-03-11 09:00:00"),
      h(1, "applied", "2026-03-01 09:00:00"),
      h(1, "rejected", "2026-01-05 09:00:00"),
      h(1, "applied", "2026-01-01 09:00:00"),
    ];
    expect(medianTimeToOffer(rows)).toEqual({ days: 10, n: 1 });
  });

  test("ignores an apply recorded after the offer", () => {
    // Backfilled or mis-entered history should drop out rather than produce a
    // negative duration that quietly pulls the median down.
    const rows = [
      h(1, "offer", "2026-01-05 09:00:00"),
      h(1, "applied", "2026-01-20 09:00:00"),
    ];
    expect(medianTimeToOffer(rows)).toEqual({ days: null, n: 0 });
  });

  test("counts one duration per application, and takes the middle", () => {
    const rows = [
      h(1, "applied", "2026-01-01 00:00:00"),
      h(1, "offer", "2026-01-03 00:00:00"),
      h(2, "applied", "2026-01-01 00:00:00"),
      h(2, "offer", "2026-01-11 00:00:00"),
      h(3, "applied", "2026-01-01 00:00:00"),
      h(3, "offer", "2026-01-21 00:00:00"),
    ];
    expect(medianTimeToOffer(rows)).toEqual({ days: 10, n: 3 });
  });

  test("says nothing when nobody reached an offer", () => {
    const rows = [
      h(1, "applied", "2026-01-01 00:00:00"),
      h(1, "screening", "2026-01-04 00:00:00"),
    ];
    expect(medianTimeToOffer(rows)).toEqual({ days: null, n: 0 });
  });
});
