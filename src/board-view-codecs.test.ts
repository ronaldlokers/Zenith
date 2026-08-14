import { describe, expect, test } from "vitest";
import { boolParam, stringParam } from "./board-view";

// board-view.ts states two rules it says every app doing this learns the hard
// way, and both live in the codecs rather than in the hooks: defaults never
// appear in the URL, and anything the URL says has to be survivable because
// the URL is user-editable. Neither was covered — the file sat at 38%.
describe("a string parameter", () => {
  const filter = stringParam("all");
  const sort = stringParam("urgency", ["urgency", "followup", "fit", "updated"]);

  test("keeps the default out of the URL", () => {
    // "A board with nothing set has a bare /board." Printing the default makes
    // every URL look configured and turns "is this the default?" into a string
    // comparison instead of a presence check.
    expect(filter.print("all")).toBeNull();
    expect(sort.print("urgency")).toBeNull();
  });

  test("writes anything that is not the default", () => {
    expect(filter.print("12")).toBe("12");
    expect(sort.print("fit")).toBe("fit");
  });

  test("round-trips every value it will actually be given", () => {
    for (const value of ["12", "a-slug", "urgency", "fit"]) {
      expect(stringParam("all").parse(stringParam("all").print(value))).toBe(value);
    }
    // Including the default, which round-trips through absence.
    expect(filter.parse(filter.print("all"))).toBe("all");
  });

  test("falls back rather than trusting a hand-edited URL", () => {
    // "An unknown sort key would otherwise sort by nothing and a deleted tag
    // id would empty the board with no way to see why."
    expect(sort.parse("nonsense")).toBe("urgency");
    expect(sort.parse(null)).toBe("urgency");
    expect(sort.parse("")).toBe("urgency");
  });

  test("accepts an unconstrained value when there is no allow-list", () => {
    // Tag and company filters carry ids the codec cannot know ahead of time.
    expect(filter.parse("4213")).toBe("4213");
  });
});

describe("a boolean parameter", () => {
  test("is present only when true", () => {
    expect(boolParam.print(true)).toBe("1");
    expect(boolParam.print(false)).toBeNull();
  });

  test("treats anything but 1 as off", () => {
    // The pinned filter reads as off for a stale or hand-typed value rather
    // than showing a board nobody asked for.
    for (const raw of [null, "", "0", "true", "yes"]) {
      expect(boolParam.parse(raw)).toBe(false);
    }
    expect(boolParam.parse("1")).toBe(true);
  });

  test("round-trips both ways", () => {
    expect(boolParam.parse(boolParam.print(true))).toBe(true);
    expect(boolParam.parse(boolParam.print(false))).toBe(false);
  });
});

// Known and deliberately not fixed here: the "all" sentinel shares a namespace
// with the values it filters on. slugify("All") is "all", so a role type
// labelled All selects the sentinel and silently shows everything. The
// sentinel is persisted in saved views too, so changing it needs a data
// migration — disproportionate for a collision that needs someone to name a
// role type exactly that. Recorded here so it is found on purpose rather than
// by someone who named one.
