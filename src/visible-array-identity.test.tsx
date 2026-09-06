import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useAppData } from "./app-data";

// visibleApps, activeApps, visibleCompanies and visibleContacts were bare
// .filter() calls in the hook body, so each was a new array on every render.
//
// That is not merely a wasted filter over fifty rows. App.tsx does
// useMemo(() => visibleApps.filter(...), [visibleApps]) — a memo keyed on a
// value that is never the same twice, so it recomputes unconditionally. The
// memo reads as an optimisation and is a lie, and every consumer downstream
// inherits it: nothing keyed on these arrays can ever skip work.
//
// The toast queue lives in the same component, so a toast appearing and
// expiring three seconds later re-renders the whole tree twice, and board.tsx
// redoes its applications-by-history aggregation both times.
//
// Identity is the thing to assert. A test on the contents would pass either
// way — the arrays were always correct, just never the same object.
const SEED = [
  { id: 1, title: "First", status: "applied", archived_at: null },
  { id: 2, title: "Second", status: "applied", archived_at: "2026-01-01" },
];

vi.mock("./api", () => ({
  api: {
    list: (resource: string) =>
      Promise.resolve(resource === "applications" ? SEED.map((a) => ({ ...a })) : []),
    roleTypes: () => Promise.resolve([]),
    stats: () => Promise.resolve({ history: [], interactions: [] }),
    getPreferences: () => Promise.resolve({ timezone: "Europe/Amsterdam" }),
    profile: () => Promise.resolve({}),
    setTimezone: () => Promise.resolve(undefined),
    setLocale: () => Promise.resolve(undefined),
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

describe("the derived lists the whole app is keyed on", () => {
  test("survive a re-render as the same arrays", async () => {
    const { result, rerender } = harness();
    await waitFor(() => expect(result.current.applications).toHaveLength(2));

    const before = {
      visibleApps: result.current.visibleApps,
      activeApps: result.current.activeApps,
      visibleCompanies: result.current.visibleCompanies,
      visibleContacts: result.current.visibleContacts,
    };

    rerender();

    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(
        result.current[key],
        `${key} is a new array on every render, so any useMemo keyed on it recomputes`,
      ).toBe(before[key]);
    }
  });

  test("still say the right thing", async () => {
    // The filters have to keep working; a stable array that is wrong would be
    // a much worse trade than the one being fixed.
    const { result } = harness();
    await waitFor(() => expect(result.current.applications).toHaveLength(2));
    expect(result.current.visibleApps).toHaveLength(2);
    expect(
      result.current.activeApps.map((a) => a.id),
      "the archived application is still in the active list",
    ).toEqual([1]);
  });

  test("change identity when what they derive from changes", async () => {
    // The other half: a memo that never invalidates is as broken as one that
    // never hits. A new applications array must produce a new visibleApps.
    const { result } = harness();
    await waitFor(() => expect(result.current.applications).toHaveLength(2));
    const before = result.current.visibleApps;

    await act(async () => {
      result.current.setApplications([{ ...SEED[0], id: 3 } as never]);
    });

    expect(result.current.visibleApps).not.toBe(before);
    expect(result.current.visibleApps.map((a) => a.id)).toEqual([3]);
  });
});
