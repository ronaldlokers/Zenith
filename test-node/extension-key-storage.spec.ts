import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCredentials, setCredentials } from "../extension/storage.js";

// The card: chrome.storage.sync replicates the extension's API key in
// cleartext to the user's Google account and to every browser profile
// signed into it. extension/storage.js is the one place popup.js and
// options.js read/write credentials (see its header comment) — this pins
// the two facts that matter and are in tension by design:
//
//   1. Nothing in extension/ may WRITE to chrome.storage.sync anymore —
//      that write is exactly the defect.
//   2. Something in extension/ must still READ chrome.storage.sync and
//      REMOVE what it finds there — that is the one-time migration off of
//      sync storage. Without it, users who set the extension up before this
//      fix keep their key sitting in sync (still replicated) and the popup
//      would look unconfigured after the fix ships, since it would only
//      ever check `local`.
//
// Do not "simplify" this pair by deleting either assertion: the read/remove
// is the migration, the .set is the bug.
describe("extension/ never writes chrome.storage.sync", () => {
  const dir = join(import.meta.dirname, "..", "extension");
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));

  it("scanned at least one extension/*.js file", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("no chrome.storage.sync.set anywhere in extension/", () => {
    for (const file of files) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, `${file} must not write chrome.storage.sync`).not.toMatch(
        /chrome\.storage\.sync\.set/,
      );
    }
  });

  it("the sync->local migration (read + remove) still exists somewhere", () => {
    const combined = files
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    expect(combined).toMatch(/chrome\.storage\.sync\.get/);
    expect(combined).toMatch(/chrome\.storage\.sync\.remove/);
  });
});

// Direct unit coverage of the shared function, with a stubbed chrome
// global — storage.js is a plain ES module (no bundler in extension/), so
// vitest can import it as-is.
function fakeChrome(initial: {
  local?: Record<string, unknown>;
  sync?: Record<string, unknown>;
}) {
  const local: Record<string, unknown> = { ...initial.local };
  const sync: Record<string, unknown> = { ...initial.sync };
  const pick = (store: Record<string, unknown>, keys: string[]) =>
    Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]]));
  return {
    stores: { local, sync },
    chrome: {
      storage: {
        local: {
          get: async (keys: string[]) => pick(local, keys),
          set: async (obj: Record<string, unknown>) =>
            void Object.assign(local, obj),
        },
        sync: {
          get: async (keys: string[]) => pick(sync, keys),
          set: async (obj: Record<string, unknown>) =>
            void Object.assign(sync, obj),
          remove: async (keys: string[]) => {
            for (const k of keys) delete sync[k];
          },
        },
      },
    },
  };
}

describe("getCredentials / setCredentials", () => {
  it("neither storage configured is a normal unconfigured state, not an error", async () => {
    const f = fakeChrome({});
    (globalThis as { chrome?: unknown }).chrome = f.chrome;
    await expect(getCredentials()).resolves.toEqual({
      baseUrl: undefined,
      apiKey: undefined,
    });
  });

  it("reads straight from local once already migrated", async () => {
    const f = fakeChrome({
      local: { baseUrl: "https://z.example", apiKey: "local-key" },
    });
    (globalThis as { chrome?: unknown }).chrome = f.chrome;
    await expect(getCredentials()).resolves.toEqual({
      baseUrl: "https://z.example",
      apiKey: "local-key",
    });
  });

  it("migrates a sync-only key to local and clears it from sync", async () => {
    const f = fakeChrome({
      sync: { baseUrl: "https://z.example", apiKey: "legacy-key" },
    });
    (globalThis as { chrome?: unknown }).chrome = f.chrome;
    await expect(getCredentials()).resolves.toEqual({
      baseUrl: "https://z.example",
      apiKey: "legacy-key",
    });
    expect(f.stores.local).toEqual({
      baseUrl: "https://z.example",
      apiKey: "legacy-key",
    });
    expect(f.stores.sync).toEqual({});
  });

  it("setCredentials writes only to local", async () => {
    const f = fakeChrome({});
    (globalThis as { chrome?: unknown }).chrome = f.chrome;
    await setCredentials("https://z.example", "new-key");
    expect(f.stores.local).toEqual({
      baseUrl: "https://z.example",
      apiKey: "new-key",
    });
    expect(f.stores.sync).toEqual({});
  });
});
