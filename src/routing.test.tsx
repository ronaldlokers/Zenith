import { describe, expect, it } from "vitest";
import { canonicalPath, parsePath } from "./routing";

describe("parsePath", () => {
  it("maps canonical paths to their tab", () => {
    expect(parsePath("/board")).toEqual({ tab: "board", id: null });
    expect(parsePath("/insights")).toEqual({ tab: "insights", id: null });
    expect(parsePath("/people")).toEqual({ tab: "contacts", id: null });
  });

  it("reads a deep-linked record id", () => {
    expect(parsePath("/board/42")).toEqual({ tab: "board", id: 42 });
  });

  it("still resolves legacy paths so old links land somewhere sane", () => {
    expect(parsePath("/jobs/42")).toEqual({ tab: "board", id: 42 });
    expect(parsePath("/stats")).toEqual({ tab: "insights", id: null });
    expect(parsePath("/activity")).toEqual({ tab: "overview", id: null });
  });

  it("falls back to the home tab for anything unrecognised", () => {
    expect(parsePath("/nope")).toEqual({ tab: "overview", id: null });
  });
});

describe("canonicalPath", () => {
  it("rewrites legacy paths, carrying the id where the target takes one", () => {
    expect(canonicalPath("/jobs")).toBe("/board");
    expect(canonicalPath("/jobs/42")).toBe("/board/42");
    expect(canonicalPath("/stats")).toBe("/insights");
    expect(canonicalPath("/calendar")).toBe("/insights");
    expect(canonicalPath("/activity")).toBe("/");
  });

  it("returns null for paths that are already canonical", () => {
    expect(canonicalPath("/board")).toBeNull();
    expect(canonicalPath("/board/42")).toBeNull();
    expect(canonicalPath("/")).toBeNull();
  });
});
