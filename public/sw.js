/*
 * App-shell service worker.
 * - /api/* is never touched: job data must always be live.
 * - Hashed build assets are cached on first hit and the cache is bounded.
 * - Navigations are network-first with the cached shell as offline
 *   fallback.
 * - push/notificationclick (#214): shows the push payload as a system
 *   notification and focuses/opens the app on click.
 */
const SHELL_CACHE = "zenith-shell-v1";
const ASSET_CACHE = "zenith-assets-v1";

// These names are constants, so the cleanup in `activate` — which deletes
// every cache that is not one of them — has never actually deleted
// anything. It is there for a rename that has not happened.
//
// That leaves the asset cache growing without limit. Each entry is
// individually correct to keep forever: the filenames are content-hashed, so
// a cached one can never be stale. In aggregate it is not. One build is 25
// files and 1.6MB, every deploy mints a fresh set, and nothing has ever
// removed the previous one — so a long-lived install accumulates every asset
// version it has ever seen. Storage pressure is not a per-cache concern
// either: when the browser evicts, it evicts the origin, taking the offline
// shell with it.
//
// 80 entries is roughly three builds' worth. Enough that a tab still holding
// references to the previous build keeps working, and bounded enough that
// the total stays in single-digit megabytes.
const ASSET_CACHE_LIMIT = 80;

// Oldest-first. cache.keys() resolves in insertion order, so this is FIFO
// rather than true LRU — a re-requested asset does not move to the back.
// For content-hashed files that difference is small: the set in play is
// whatever the current build references, and it is added together.
async function trimAssetCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= ASSET_CACHE_LIMIT) return;
  await Promise.all(
    keys.slice(0, keys.length - ASSET_CACHE_LIMIT).map((k) => cache.delete(k)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add("/"))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) {
          await cache.put(event.request, res.clone());
          // After the put, not before: the entry that just arrived is the
          // one worth keeping, and trimming first would leave the cache one
          // over the limit until the next request.
          await trimAssetCache(cache);
        }
        return res;
      }),
    );
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        try {
          const res = await fetch(event.request);
          if (res.ok) cache.put("/", res.clone());
          return res;
        } catch {
          const hit = await cache.match("/");
          if (hit) return hit;
          throw new Error("offline and no cached shell");
        }
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Zenith", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // malformed/empty payload — fall back to the generic title above
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    }),
  );
});

// A notification's url arrives from the push payload. That payload is this
// app's own and Web Push is encrypted end to end, so this is not a known
// exploit — but it is server-supplied input reaching openWindow() and
// react-router, and `new URL("https://elsewhere/", origin)` resolves to
// elsewhere, not to a path under origin. The realistic route to trouble is a
// misconfiguration rather than an attacker: a notification built with a full
// origin in it — a preview deployment's, say — would silently take people
// off this instance when they tapped it.
//
// Same-origin or nothing. A path that does not resolve under this origin is
// replaced by the root rather than dropped: the tap should still open the
// app, which is what the person meant by it.
function safePath(raw) {
  try {
    const resolved = new URL(raw ?? "/", self.location.origin);
    if (resolved.origin !== self.location.origin) return "/";
    return resolved.pathname + resolved.search;
  } catch {
    return "/";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data?.url);
  // Absolute for openWindow; the relative path is what the SPA routes on.
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clients.find(
        (c) => new URL(c.url).origin === self.location.origin,
      );
      if (existing) {
        // Focus the running app and let it route in place — WindowClient
        // .navigate() is unreliable on iOS, so drive react-router via a
        // postMessage the app listens for instead.
        await existing.focus();
        existing.postMessage({ type: "notification-navigate", url: path });
        return;
      }
      // Cold start: open the deep link directly.
      await self.clients.openWindow(target);
    })(),
  );
});
