import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useAppData } from "./app-data";

// A failed load left every screen drawing conclusions from an empty list. The
// board said "Nothing tracked yet" and offered to load sample data, to an
// account with fifteen applications in it — and the only way back was a
// browser refresh, because the banner dismisses rather than retries.
//
// The flag this covers is what lets App put a retry screen up instead. Its
// one subtlety is the reason it is not simply `error`: reload() also runs
// after mutations, and a refresh that fails on top of a view that already has
// data must leave that view alone.
let fail = true;

const reject = () => Promise.reject(new Error("nope"));

vi.mock("./api", () => ({
  api: {
    list: () => (fail ? reject() : Promise.resolve([])),
    roleTypes: () => (fail ? reject() : Promise.resolve([])),
    stats: () =>
      fail ? reject() : Promise.resolve({ history: [], interactions: [] }),
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

beforeEach(() => {
  fail = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a load that did not happen", () => {
  test("is distinguishable from an account with nothing in it", async () => {
    const { result } = harness();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadFailed).toBe(true);
    expect(result.current.applications).toEqual([]);
  });

  test("clears once the data arrives", async () => {
    const { result } = harness();
    await waitFor(() => expect(result.current.loadFailed).toBe(true));

    fail = false;
    await result.current.reload();
    await waitFor(() => expect(result.current.loadFailed).toBe(false));
  });

  test("a later refresh that fails does not take the screen down", async () => {
    // The failure mode this guards against is worse than the one it reports:
    // replacing a working board with a retry screen because a background
    // refresh happened to fail.
    fail = false;
    const { result } = harness();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadFailed).toBe(false);

    fail = true;
    await result.current.reload();
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(
      result.current.loadFailed,
      "the view already has data, so it stays up and the banner reports it",
    ).toBe(false);
  });
});
