import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { hasUnsavedChanges, useUnsavedChanges } from "./hooks";

// The detail form asks before discarding on Escape, so the app already holds
// that losing twenty typed fields is worth a question. Measured on the other
// ways out: a reload, a closed tab, the Back button and a switch to another
// destination all took them without a word.
afterEach(() => {
  vi.restoreAllMocks();
});

const listeners = () => {
  const add = vi.spyOn(window, "addEventListener");
  const remove = vi.spyOn(window, "removeEventListener");
  const count = (spy: typeof add) =>
    spy.mock.calls.filter(([type]) => type === "beforeunload").length;
  return { added: () => count(add), removed: () => count(remove) };
};

describe("unsaved changes", () => {
  test("arms the browser warning while there is something to lose", () => {
    const spy = listeners();
    const { unmount } = renderHook(() => useUnsavedChanges(true));
    expect(spy.added()).toBe(1);
    expect(hasUnsavedChanges()).toBe(true);

    unmount();
    expect(spy.removed()).toBe(1);
    expect(hasUnsavedChanges()).toBe(false);
  });

  test("leaves no listener behind on a form with no edits in it", () => {
    // Not tidiness. Firefox refuses the back/forward cache to any page
    // carrying a beforeunload listener, so an always-on one would slow every
    // back navigation in the app to pay for a warning almost never needed.
    const spy = listeners();
    renderHook(() => useUnsavedChanges(false));
    expect(spy.added()).toBe(0);
    expect(hasUnsavedChanges()).toBe(false);
  });

  test("a second form closing does not disarm the first", () => {
    const outer = renderHook(() => useUnsavedChanges(true));
    const inner = renderHook(() => useUnsavedChanges(true));

    inner.unmount();
    expect(
      hasUnsavedChanges(),
      "the first form still holds edits, so leaving must still be guarded",
    ).toBe(true);

    outer.unmount();
    expect(hasUnsavedChanges()).toBe(false);
  });

  test("follows a form that becomes clean again", () => {
    // Editing a field back to what it was is not a change, and a warning that
    // fires on a form nobody altered is the kind that gets clicked through.
    const { rerender } = renderHook(
      ({ dirty }) => useUnsavedChanges(dirty),
      { initialProps: { dirty: true } },
    );
    expect(hasUnsavedChanges()).toBe(true);
    rerender({ dirty: false });
    expect(hasUnsavedChanges()).toBe(false);
  });
});
