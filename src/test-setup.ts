import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.ts does not set `test.globals: true`, so @testing-library/react's
// own auto-cleanup (which only registers when it finds a global `afterEach`)
// never fires. Without this, DOM from one test leaks into the next within the
// same file.
afterEach(() => {
  cleanup();
});

// jsdom provides a window but no localStorage here: Node 26 exposes its own
// `localStorage` global gated behind --localstorage-file, and that shadows
// jsdom's implementation, leaving the name defined-but-undefined. Any app
// code that reads localStorage — keyShortcutsEnabled(), the onboarding
// dismissal, saved views — therefore throws in a component test rather than
// being exercised.
//
// A plain in-memory store, reset between tests by the cleanup above, is
// enough: nothing here needs persistence across files, only presence.
if (typeof localStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}
