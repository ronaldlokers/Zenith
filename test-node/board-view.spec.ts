import { describe, expect, it } from "vitest";
import { boolParam, stringParam } from "../src/board-view";

// The board's view lives in the URL, which makes the URL an input the user
// can type — and one that outlives the code that wrote it. Both halves of
// each codec are worth pinning: parse has to survive nonsense, and print has
// to leave defaults off so an untouched board keeps a bare /board.
describe("board view params", () => {
  describe("stringParam", () => {
    const sort = stringParam("urgency", ["urgency", "followup", "fit", "updated"]);

    it("falls back when the parameter is absent", () => {
      expect(sort.parse(null)).toBe("urgency");
    });

    it("falls back rather than honouring a value it does not know", () => {
      // A hand-edited or stale URL is a normal input here. Passing "banana"
      // through would sort the board by nothing, with no way to see why.
      expect(sort.parse("banana")).toBe("urgency");
      expect(sort.parse("")).toBe("urgency");
    });

    it("keeps a value it does know", () => {
      expect(sort.parse("fit")).toBe("fit");
    });

    it("takes any value when there is no allow-list", () => {
      // Company and tag filters are ids from the user's own data; there is
      // no fixed set to check against, and an id that no longer exists
      // simply matches nothing.
      const company = stringParam("all");
      expect(company.parse("42")).toBe("42");
      expect(company.parse(null)).toBe("all");
    });

    it("leaves the default off the URL and writes everything else", () => {
      expect(sort.print("urgency")).toBeNull();
      expect(sort.print("fit")).toBe("fit");
    });

    it("round-trips every value it accepts", () => {
      for (const value of ["urgency", "followup", "fit", "updated"]) {
        expect(sort.parse(sort.print(value))).toBe(value);
      }
    });
  });

  describe("boolParam", () => {
    it("is on only for exactly 1", () => {
      expect(boolParam.parse("1")).toBe(true);
      // Not "true", not "0", not "yes" — one spelling, so there is one
      // canonical URL for the pinned board rather than four.
      for (const raw of ["0", "true", "yes", "", null]) {
        expect(boolParam.parse(raw)).toBe(false);
      }
    });

    it("writes nothing when off", () => {
      expect(boolParam.print(false)).toBeNull();
      expect(boolParam.print(true)).toBe("1");
    });
  });
});
