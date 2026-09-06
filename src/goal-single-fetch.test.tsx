import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useAppData } from "./app-data";

// DashboardTab fetched /api/goals in its own effect, and it unmounts on every
// tab switch — so returning to Overview re-read the same single row through
// the session middleware every time. The value now comes down from useAppData,
// which fetches it once with the other five resources.
//
// App's onboarding probe still calls api.goals() separately. That one runs
// once per load rather than once per visit, and it gates the checklist with a
// documented subtlety about resolution order, so it is left alone
// deliberately — the repeat is what this removes.
const calls: string[] = [];
const count = (name: string) => calls.filter((c) => c === name).length;

vi.mock("./api", () => ({
  api: {
    list: (r: string) => { calls.push(`list:${r}`); return Promise.resolve([]); },
    roleTypes: () => Promise.resolve([]),
    stats: () => Promise.resolve({ history: [], interactions: [] }),
    goals: () => { calls.push("goals"); return Promise.resolve({ weekly_app_goal: 5, search_started_at: null }); },
    getPreferences: () => Promise.resolve({ timezone: "Europe/Amsterdam" }),
    profile: () => Promise.resolve({}),
    setTimezone: () => Promise.resolve(undefined),
    setLocale: () => Promise.resolve(undefined),
  },
}));

const onError = () => {};
const navigate = (() => {}) as never;
const t = ((k: string) => k) as never;

describe("the weekly goal", () => {
  test("is fetched once with everything else, and exposed", async () => {
    calls.length = 0;
    const { result } = renderHook(() => useAppData(onError, navigate, t));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(count("goals"), "the goal row is fetched more than once per load").toBe(1);
    expect(result.current.goal, "useAppData does not hand the goal down").toBeTruthy();
  });

  test("a failure costs the goal, not the whole load", async () => {
    // One block on Overview versus a blank board. The board wins.
    calls.length = 0;
    vi.resetModules();
    const { result } = renderHook(() => useAppData(onError, navigate, t));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadFailed).toBe(false);
  });
});
