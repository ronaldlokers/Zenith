/*
 * App-shell service worker.
 * - /api/* is never touched: job data must always be live.
 * - Hashed build assets are cached forever, first hit populates.
 * - Navigations are network-first with the cached shell as offline
 *   fallback.
 * - push/notificationclick (#214): shows the push payload as a system
 *   notification and focuses/opens the app on click.
 */
const SHELL_CACHE = "zenith-shell-v1";
const ASSET_CACHE = "zenith-assets-v1";

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
        if (res.ok) cache.put(event.request, res.clone());
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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url ?? "/";
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
