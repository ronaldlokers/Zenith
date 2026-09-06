import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Application } from "./types";
import { useAppData } from "./app-data";

// Dragging two cards in quick succession could silently undo the second move.
//
// setStatus closed over `prev = applications` from the render it was created
// in and, on failure, restored that whole array. Two drags inside one render
// share the same closure, so both optimistic updates land (they use the
// functional form) but the first request's catch replaces the array with the
// snapshot taken before either — discarding the second card's already-saved
// change, with no error shown for it. The card stays where it started and the
// server disagrees until the next reload.
//
// The revert has to touch the row it is about and nothing else.
const SEED: Application[] = [
  {
    id: 1,
    title: "First",
    status: "applied",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as Application,
  {
    id: 2,
    title: "Second",
    status: "applied",
    updated_at: "2026-01-01T00:00:00.000Z",
  } as Application,
];

// id 1 always fails, id 2 always succeeds.
const setStatusCalls: number[] = [];
vi.mock("./api", () => ({
  api: {
    list: () => Promise.resolve(SEED.map((a) => ({ ...a }))),
    goals: () => Promise.resolve(null),
    roleTypes: () => Promise.resolve([]),
    stats: () => Promise.resolve({ history: [], interactions: [] }),
    getPreferences: () => Promise.resolve({ timezone: "Europe/Amsterdam" }),
    profile: () => Promise.resolve({}),
    setTimezone: () => Promise.resolve(undefined),
    setLocale: () => Promise.resolve(undefined),
    setStatus: (id: number) => {
      setStatusCalls.push(id);
      return id === 1
        ? Promise.reject(new Error("the network dropped it"))
        : Promise.resolve(undefined);
    },
  },
}));

const harness = () =>
  renderHook(() =>
    useAppData(
      () => {},
      (() => {}) as never,
      ((k: string) => k) as never,
    ),
  );

afterEach(() => {
  setStatusCalls.length = 0;
});

describe("two status moves in the same render", () => {
  test("a failed move does not take a successful one down with it", async () => {
    const { result } = harness();
    await waitFor(() => expect(result.current.applications).toHaveLength(2));

    // Both calls read the same `applications` closure — this is the case, not
    // an artefact of the test. A user does it by dragging two cards faster
    // than React re-renders.
    await act(async () => {
      result.current.setStatus(1, "screening");
      result.current.setStatus(2, "interview");
    });

    await waitFor(() => expect(setStatusCalls).toEqual([1, 2]));

    const byId = (id: number) =>
      result.current.applications.find((a) => a.id === id);
    expect(byId(1)?.status, "the failed move should have rolled back").toBe(
      "applied",
    );
    expect(
      byId(2)?.status,
      "the second card's saved move was wiped by the first card's failure",
    ).toBe("interview");
  });

  test("still rolls the failed row back on its own", async () => {
    const { result } = harness();
    await waitFor(() => expect(result.current.applications).toHaveLength(2));

    await act(async () => {
      result.current.setStatus(1, "offer");
    });
    await waitFor(() =>
      expect(result.current.applications.find((a) => a.id === 1)?.status).toBe(
        "applied",
      ),
    );
    // And leaves the row it was never about untouched.
    expect(result.current.applications.find((a) => a.id === 2)?.status).toBe(
      "applied",
    );
  });
});
