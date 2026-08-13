import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

// public/sw.js is served verbatim — it is not part of the TypeScript build,
// nothing imports it, and until now nothing tested it. It is also the piece
// of this app with the longest reach: it survives the tab, decides what is
// served offline, and owns storage for the origin.
//
// Rather than assert on its source text, this runs it in a node:vm context
// with stubbed globals and drives the handlers it registers, so the test
// exercises the same code the browser does. node:vm rather than
// new Function: the intent here is "run this script against a fake
// environment", which is precisely what a vm context is for, and it keeps
// the worker's globals out of this process rather than merely shadowing
// them.
const SRC = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

interface FakeCache {
  entries: Map<string, unknown>;
  keys(): Promise<string[]>;
  match(req: unknown): Promise<unknown>;
  put(req: unknown, res: unknown): Promise<void>;
  delete(req: unknown): Promise<boolean>;
  add(req: unknown): Promise<void>;
}

function loadWorker() {
  const caches = new Map<string, FakeCache>();
  const openCache = (name: string): FakeCache => {
    const existing = caches.get(name);
    if (existing) return existing;
    const entries = new Map<string, unknown>();
    // Keyed by url, not by the request object the worker passes in. A real
    // Cache matches on the request's url, and keying on identity here made
    // every assertion compare against an object instead of a string.
    const keyOf = (req: unknown): string =>
      typeof req === "string" ? req : String((req as { url?: string })?.url);
    const cache: FakeCache = {
      entries,
      keys: async () => [...entries.keys()],
      match: async (req) => entries.get(keyOf(req)),
      put: async (req, res) => {
        // Delete first so a re-put moves the key to the back, which is what
        // a real Cache does and what makes insertion order meaningful.
        entries.delete(keyOf(req));
        entries.set(keyOf(req), res);
      },
      delete: async (req) => entries.delete(keyOf(req)),
      add: async (req) => {
        entries.set(keyOf(req), { ok: true });
      },
    };
    caches.set(name, cache);
    return cache;
  };

  const handlers = new Map<string, (e: unknown) => void>();
  const self = {
    location: { origin: "https://zenith.test" },
    addEventListener: (type: string, fn: (e: unknown) => void) =>
      handlers.set(type, fn),
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: async () => [] },
    registration: { showNotification: () => Promise.resolve() },
  };

  // Flipped by the offline tests. A dropped connection is a rejected
  // fetch(), not an error response — the two take different branches.
  const net = { online: true };
  const sandbox = {
    self,
    caches: {
      open: async (name: string) => openCache(name),
      keys: async () => [...caches.keys()],
      delete: async (name: string) => caches.delete(name),
    },
    fetch: async () => {
      if (!net.online) throw new TypeError("Failed to fetch");
      return { ok: true, clone: () => ({ ok: true }), body: "fresh" };
    },
    URL,
  };

  runInContext(SRC, createContext(sandbox));

  return { handlers, caches, openCache, net };
}

/** Drives the fetch handler for one asset request and awaits its response. */
async function requestAsset(
  handlers: Map<string, (e: unknown) => void>,
  url: string,
) {
  const fetchHandler = handlers.get("fetch");
  expect(fetchHandler, "the worker registered no fetch handler").toBeTruthy();
  let responded: Promise<unknown> | undefined;
  fetchHandler!({
    request: { url, method: "GET", mode: "no-cors" },
    respondWith: (p: Promise<unknown>) => {
      responded = p;
    },
  });
  await responded;
}

/** Drives one navigation request and returns what the worker responded. */
async function navigate(
  handlers: Map<string, (e: unknown) => void>,
  url: string,
) {
  const fetchHandler = handlers.get("fetch");
  let responded: Promise<unknown> | undefined;
  fetchHandler!({
    request: { url, method: "GET", mode: "navigate" },
    respondWith: (p: Promise<unknown>) => {
      responded = p;
    },
  });
  return responded;
}

describe("service worker", () => {
  it("bounds the asset cache instead of growing forever", async () => {
    // Each entry is individually correct to keep — the filenames are
    // content-hashed, so a cached one can never be stale. In aggregate it is
    // not: one build is 25 files and 1.6MB, every deploy mints a fresh set,
    // and nothing ever removed the previous one. Storage pressure is not a
    // per-cache concern either — when the browser evicts, it evicts the
    // origin, taking the offline shell with it.
    const { handlers, openCache } = loadWorker();
    for (let i = 0; i < 200; i++) {
      await requestAsset(handlers, `https://zenith.test/assets/chunk-${i}.js`);
    }
    const cache = openCache("zenith-assets-v1");
    const keys = await cache.keys();
    expect(keys.length).toBeLessThanOrEqual(80);
    // And it keeps the newest, not the oldest: the assets a live build
    // refers to are the ones most recently requested.
    expect(keys.at(-1)).toContain("chunk-199");
    expect(keys.some((k) => k.includes("chunk-0.js"))).toBe(false);
  });

  it("leaves a cache under the limit alone", async () => {
    const { handlers, openCache } = loadWorker();
    for (let i = 0; i < 25; i++) {
      await requestAsset(handlers, `https://zenith.test/assets/chunk-${i}.js`);
    }
    expect((await openCache("zenith-assets-v1").keys()).length).toBe(25);
  });

  it("never caches an API response", async () => {
    // Job data must always be live. This is the rule the whole worker is
    // built around and the one with the worst failure if it slips.
    const { handlers, caches } = loadWorker();
    await requestAsset(handlers, "https://zenith.test/api/applications");
    for (const cache of caches.values()) {
      for (const key of await cache.keys()) {
        expect(key).not.toContain("/api/");
      }
    }
  });

  it("ignores another origin entirely", async () => {
    const { handlers, caches } = loadWorker();
    await requestAsset(handlers, "https://elsewhere.example/assets/x.js");
    for (const cache of caches.values()) {
      for (const key of await cache.keys()) {
        expect(key).not.toContain("elsewhere.example");
      }
    }
  });

  it("serves the cached shell when the connection is gone", async () => {
    // The tunnel. Without this the browser shows its own offline page and
    // the app is simply absent — which is the whole reason a shell is
    // cached at install.
    const { handlers, net, openCache } = loadWorker();
    // A successful navigation first, which is what populates the shell.
    await navigate(handlers, "https://zenith.test/board");
    expect(await openCache("zenith-shell-v1").keys()).toContain("/");

    net.online = false;
    const res = await navigate(handlers, "https://zenith.test/insights");
    expect(res, "offline navigation fell through to the network").toBeTruthy();
  });

  it("caches the shell under one key, not one per route", async () => {
    // Every navigation writes to "/" deliberately: the SPA serves the same
    // document for every route, so keying by url would store N copies of
    // one file and still miss any route not visited before going offline.
    const { handlers, openCache } = loadWorker();
    for (const path of ["/", "/board", "/insights", "/settings"]) {
      await navigate(handlers, `https://zenith.test${path}`);
    }
    expect(await openCache("zenith-shell-v1").keys()).toEqual(["/"]);
  });

  it("has nothing to serve if it goes offline before any navigation", async () => {
    // Honest about the limit: install caches "/" via cache.add, so a worker
    // that never installed and never navigated has no shell. This asserts
    // the failure is a rejection rather than a hang — the page gets an
    // error it can act on instead of a spinner that never resolves.
    const { handlers, net } = loadWorker();
    net.online = false;
    await expect(
      navigate(handlers, "https://zenith.test/board"),
    ).rejects.toThrow();
  });
});
