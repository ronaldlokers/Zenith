import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useDocumentTitle } from "./hooks";

// Measured across every route: nine views, one title. "Zenith" for the board,
// for Today, for Insights, for Settings and for a single application — so the
// browser history, the bookmark list and a tab strip could not tell them
// apart, and a screen reader landing on a new view was told nothing about
// which one it is (WCAG 2.4.2).
afterEach(() => {
  document.title = "";
});

describe("document title", () => {
  test("names the view before the app", () => {
    // A tab strip and a history menu both truncate from the right, so the
    // half that distinguishes one view from another has to come first.
    renderHook(() => useDocumentTitle("Insights"));
    expect(document.title).toBe("Insights · Zenith");
  });

  test("falls back to the app's own name", () => {
    // A route with nothing to add should read as the app rather than as a
    // separator with a gap in front of it.
    renderHook(() => useDocumentTitle(null));
    expect(document.title).toBe("Zenith");
  });

  test("follows a route change rather than only the first render", () => {
    // The whole failure this fixes is a title that is right once and then
    // stays put while the view underneath it changes.
    const { rerender } = renderHook(({ page }) => useDocumentTitle(page), {
      initialProps: { page: "Pipeline" as string | null },
    });
    expect(document.title).toBe("Pipeline · Zenith");
    rerender({ page: "Senior Platform Engineer" });
    expect(document.title).toBe("Senior Platform Engineer · Zenith");
  });
});
