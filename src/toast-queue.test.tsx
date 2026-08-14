import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useToasts } from "./app-data";

// The stack is capped at three and dropped the oldest, and the oldest is
// often the one that matters. Delete an application and move three cards on
// the board inside the six seconds — each move notifies — and the Undo was
// pushed off while deleteWithUndo's timer kept running. The delete committed
// with the only way back already gone from the screen.
//
// Found by coverage: useToasts had none.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the toast stack", () => {
  test("keeps the undo when a burst of plain toasts follows it", () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.notify("Deleted Acme", () => {}));
    act(() => result.current.notify("Moved to Screening"));
    act(() => result.current.notify("Moved to Interview"));
    act(() => result.current.notify("Moved to Offer"));

    const messages = result.current.toasts.map((t) => t.message);
    expect(messages).toHaveLength(3);
    expect(
      messages,
      "the only way back from the delete was dropped by unrelated activity",
    ).toContain("Deleted Acme");
    // The informational ones give way, oldest first.
    expect(messages).toEqual([
      "Deleted Acme",
      "Moved to Interview",
      "Moved to Offer",
    ]);
  });

  test("still caps the stack", () => {
    // The cap is what stops a burst towering over the page; protecting the
    // undo must not turn into growing without limit.
    const { result } = renderHook(() => useToasts());
    for (let i = 0; i < 8; i++) {
      act(() => result.current.notify(`Moved ${i}`));
    }
    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts.map((t) => t.message)).toEqual([
      "Moved 5",
      "Moved 6",
      "Moved 7",
    ]);
  });

  test("drops the oldest when every toast carries an undo", () => {
    // Nothing better to drop, and growing would be the tower the cap exists
    // to prevent.
    const { result } = renderHook(() => useToasts());
    for (let i = 0; i < 4; i++) {
      act(() => result.current.notify(`Deleted ${i}`, () => {}));
    }
    expect(result.current.toasts.map((t) => t.message)).toEqual([
      "Deleted 1",
      "Deleted 2",
      "Deleted 3",
    ]);
  });

  test("an undo toast still leaves on its own timer", () => {
    // Protected from eviction, not from expiry: six seconds is the window
    // deleteWithUndo commits on, and the toast must not outlive it.
    const { result } = renderHook(() => useToasts());
    act(() => result.current.notify("Deleted Acme", () => {}));
    expect(result.current.toasts).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(6001));
    expect(result.current.toasts).toHaveLength(0);
  });
});
