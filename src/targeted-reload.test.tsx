import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useAppData } from "./app-data";

// reload() refetches all five top-level resources, and onChanged={reload} was
// wired to every tab. So saving a company name cost the same eight-or-so D1
// statements as a cold start — including /api/stats, which is three of them.
//
// D1 bills row reads, so this is the amplification worth removing before there
// is more than one user. The board's drag already proved the narrower path
// works: it updates locally and calls refreshStats() alone.
//
// What makes it safe for the two network tabs, rather than merely faster:
// /api/stats reads applications' status columns, status_history and
// interactions, and a company or contact edit changes none of them. Role types
// have no mutation call site anywhere in src. Applications *are* refetched,
// because the list joins company and contact names and an edit does change
// what the board shows.
const calls: string[] = [];
const record = <T,>(name: string, value: T) => {
  calls.push(name);
  return Promise.resolve(value);
};

vi.mock("./api", () => ({
  api: {
    list: (resource: string) => record(resource, []),
    goals: () => Promise.resolve(null),
    roleTypes: () => record("roleTypes", []),
    stats: () => record("stats", { history: [], interactions: [] }),
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

async function loaded() {
  const { result } = harness();
  await waitFor(() => expect(result.current.loading).toBe(false));
  calls.length = 0;
  return result;
}

describe("refreshing after a company or contact edit", () => {
  test("does not refetch the stats a company edit cannot change", async () => {
    const result = await loaded();
    await result.current.reloadNetwork();
    expect(
      calls,
      "the network refresh still pays for /api/stats and the role types",
    ).not.toContain("stats");
    expect(calls).not.toContain("roleTypes");
  });

  test("still refetches the lists an edit does change", async () => {
    // Applications included on purpose: the list carries the joined company
    // and contact names, so renaming a company changes what the board reads.
    const result = await loaded();
    await result.current.reloadNetwork();
    expect(calls.sort()).toEqual(["applications", "companies", "contacts"]);
  });

  test("leaves the full reload alone for everything else", async () => {
    // A status change, a new application from the feed, a role-type edit —
    // those still need all five, and reload() is what they call.
    const result = await loaded();
    await result.current.reload();
    expect(calls.sort()).toEqual([
      "applications",
      "companies",
      "contacts",
      "roleTypes",
      "stats",
    ]);
  });
});
