import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Application } from "./types";
import { useAppData } from "./app-data";

// setStatus is threaded to every tab, and its dep array carried `applications`
// — a value it only reads to snapshot the row for a failure rollback. So the
// callback's identity changed on every data change, and any consumer keyed on
// it re-rendered whether or not anything it cared about had moved.
//
// Same shape as the visible* arrays in #702: together they are why nothing
// downstream could usefully be memoised. Fixing one and not the other leaves
// the boundary just as leaky, which is why this is worth its own change rather
// than being called a nitpick.
//
// The rollback still needs the row. It comes from a ref that mirrors the
// current array rather than from the closure, so the behaviour is unchanged
// and the identity is not — src/optimistic-status-revert.test.tsx is what
// holds the behaviour, and it passes untouched.
const SEED: Application[] = [
  { id: 1, title: "First", status: "applied", updated_at: "2026-01-01T00:00:00.000Z" } as Application,
];

vi.mock("./api", () => ({
  api: {
    list: (resource: string) =>
      Promise.resolve(resource === "applications" ? SEED.map((a) => ({ ...a })) : []),
    goals: () => Promise.resolve(null),
    roleTypes: () => Promise.resolve([]),
    stats: () => Promise.resolve({ history: [], interactions: [] }),
    getPreferences: () => Promise.resolve({ timezone: "Europe/Amsterdam" }),
    profile: () => Promise.resolve({}),
    setTimezone: () => Promise.resolve(undefined),
    setLocale: () => Promise.resolve(undefined),
  },
}));

// Hoisted, not inline. The first version of this passed three fresh lambdas on
// every render, so every dep of setStatus was new and the test failed for its
// own fixture rather than for the code. The real App passes a stable navigate
// and a t from useTranslation.
const onError = () => {};
const navigate = (() => {}) as never;
const t = ((k: string) => k) as never;

const harness = () => renderHook(() => useAppData(onError, navigate, t));

describe("the setStatus every tab receives", () => {
  test("survives a data change as the same function", async () => {
    const { result } = harness();
    await waitFor(() => expect(result.current.applications).toHaveLength(1));
    const before = result.current.setStatus;

    // The thing that used to invalidate it: the applications array moving.
    await act(async () => {
      result.current.setApplications([
        { ...SEED[0], id: 2, title: "Second" } as Application,
      ]);
    });

    expect(result.current.applications[0].id, "the fixture did not change").toBe(2);
    expect(
      result.current.setStatus,
      "setStatus is a new function whenever any application changes",
    ).toBe(before);
  });

  test("survives a plain re-render too", async () => {
    const { result, rerender } = harness();
    await waitFor(() => expect(result.current.applications).toHaveLength(1));
    const before = result.current.setStatus;
    rerender();
    expect(result.current.setStatus).toBe(before);
  });
});
