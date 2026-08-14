import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./api";
import i18n from "./i18n";

// A read and a write fail differently to the person reading the message, and
// both used the write wording. Measured in the browser: a board that could not
// load announced "that change wasn't saved" over a screen where nothing had
// been changed.
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Drives one request against a fetch that never reaches the network. */
async function messageFor(run: () => Promise<unknown>): Promise<string> {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
  );
  try {
    await run();
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("the request resolved, so there is no message to check");
}

describe("what a failed request says", () => {
  test("a read does not claim a change was lost", async () => {
    const message = await messageFor(() => api.list("applications"));
    expect(message).toBe(i18n.t("errors.unreachableRead"));
    expect(message).not.toMatch(/saved/i);
  });

  test("a write still speaks about the change", async () => {
    // The wording that was already right, and the reason this is a split
    // rather than a rewrite: "that change wasn't saved" is the useful thing
    // to say when a change is exactly what was lost.
    const message = await messageFor(() =>
      api.updateFollowUp(1, { next_action_at: null }),
    );
    expect(message).toBe(i18n.t("errors.unreachable"));
    expect(message).toMatch(/saved/i);
  });

  test("offline is said plainly, and still tells a read from a write", async () => {
    // navigator.onLine is only trusted when it says false — a browser can
    // report "online" while attached to a network that reaches nothing.
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    const read = await messageFor(() => api.list("applications"));
    expect(read).toBe(i18n.t("errors.offlineRead"));

    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    const write = await messageFor(() =>
      api.updateFollowUp(1, { next_action_at: null }),
    );
    expect(write).toBe(i18n.t("errors.offline"));
    expect(read).not.toBe(write);
  });
});
