import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useScrollLock } from "./hooks";

// Measured on the CV at 1440 and 390: with the quick-add dialog open, a
// wheel gesture scrolled the page behind it from 0 to 800px. On a phone that
// is worse than disorienting — a dialog that reaches its own end passes the
// gesture to the page underneath, so you lose your place while trying to
// read the thing in front of you.
//
// The two things worth testing are the two that are easy to get wrong and
// expensive when wrong: the count, and the scrollbar compensation.
afterEach(() => {
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

describe("scroll lock", () => {
  test("holds the page while it is active and lets go afterwards", () => {
    const { unmount } = renderHook(() => useScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  test("does nothing when it is not active", () => {
    renderHook(() => useScrollLock(false));
    expect(document.body.style.overflow).toBe("");
  });

  test("a second lock does not release the first", () => {
    // A confirm opened from inside a dialog is a second lock. Releasing on
    // the first close would unlock the page while a modal is still up —
    // which looks like the fix working right until two dialogs overlap.
    const outer = renderHook(() => useScrollLock(true));
    const inner = renderHook(() => useScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");

    inner.unmount();
    expect(
      document.body.style.overflow,
      "the outer dialog is still open, so the page must stay held",
    ).toBe("hidden");

    outer.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  test("gives back whatever padding it found", () => {
    // Setting overflow:hidden removes a classic scrollbar and the content
    // widens by its width, so the lock compensates — and then has to put
    // back what was there rather than assuming it was nothing.
    document.body.style.paddingRight = "7px";
    const { unmount } = renderHook(() => useScrollLock(true));
    unmount();
    expect(document.body.style.paddingRight).toBe("7px");
  });
});
