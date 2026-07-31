import { describe, expect, it } from "vitest";
import { localDate, localHour } from "../worker/tz";

// 2026-08-05T03:00:00Z is still the evening of the 4th in Los Angeles
// (UTC-7) and already the 5th in Amsterdam (UTC+2). One instant, two
// calendar dates — which is the entire reason this module exists.
const EVENING_IN_LA = new Date("2026-08-05T03:00:00Z");

describe("localDate", () => {
  it("returns the calendar date in the given zone, not UTC", () => {
    expect(localDate("America/Los_Angeles", EVENING_IN_LA)).toBe("2026-08-04");
    expect(localDate("Europe/Amsterdam", EVENING_IN_LA)).toBe("2026-08-05");
  });

  it("handles a zone far ahead of UTC", () => {
    expect(localDate("Pacific/Kiritimati", EVENING_IN_LA)).toBe("2026-08-05");
  });

  it("falls back to UTC for a null, empty or unrecognised zone", () => {
    expect(localDate(null, EVENING_IN_LA)).toBe("2026-08-05");
    expect(localDate("", EVENING_IN_LA)).toBe("2026-08-05");
    expect(localDate("Not/AZone", EVENING_IN_LA)).toBe("2026-08-05");
  });
});

describe("localHour", () => {
  it("returns the hour in the given zone", () => {
    expect(localHour("America/Los_Angeles", EVENING_IN_LA)).toBe(20);
    expect(localHour("Europe/Amsterdam", EVENING_IN_LA)).toBe(5);
  });

  // The `% 24` guard in localHour normalises the "24" some ICU builds emit
  // for midnight under hour12:false — see the comment on that guard in
  // worker/tz.ts for why it stays even though this runtime never exercises
  // the "24" branch (this suite can't demonstrate the guard is *needed*
  // here, only that midnight comes out 0).
  it("reports midnight as 0", () => {
    expect(localHour("Europe/Amsterdam", new Date("2026-08-04T22:00:00Z"))).toBe(0);
    expect(localHour("UTC", new Date("2026-08-05T00:00:00Z"))).toBe(0);
  });

  // Los Angeles springs forward at 02:00 local on 2027-03-14. Offset
  // arithmetic gets this wrong; Intl does not.
  it("is correct either side of a DST transition", () => {
    expect(localHour("America/Los_Angeles", new Date("2027-03-14T09:00:00Z"))).toBe(1);
    expect(localHour("America/Los_Angeles", new Date("2027-03-14T11:00:00Z"))).toBe(4);
    expect(localDate("America/Los_Angeles", new Date("2027-03-14T11:00:00Z"))).toBe("2027-03-14");
  });

  it("falls back to UTC for an unrecognised zone", () => {
    expect(localHour("Not/AZone", EVENING_IN_LA)).toBe(3);
  });
});
