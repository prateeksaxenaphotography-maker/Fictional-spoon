const CACHE_NAME = "wps-v250";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/styles.css?v=250",
  "/app.js?v=250",
  "/data.js?v=250",
  "/config.js?v=250"
];

// Precache the app shell. The previous worker declared this list but never
// actually cached it (install only called skipWaiting), so the offline
// fallback below always came up empty.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Drop only caches from older versions — the previous worker deleted every
// cache including its own current one, forcing a full refetch storm on each
// activation.
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first, cache fallback. Successful same-origin GETs are copied into
// the cache as they're fetched (photos, subpage HTML, …) so revisited pages
// keep working offline. API calls are never cached — a stale "success"
// response for an email send or analytics write would be a lie.
self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET" || !request.url.startsWith("http")) return;

  const url = new URL(request.url);
  const cacheable = url.origin === self.location.origin && !url.pathname.startsWith("/api/");

  e.respondWith(
    fetch(request)
      .then((res) => {
        if (cacheable && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(request).then((hit) =>
          // Offline navigation to an uncached route still gets the SPA shell.
          hit || (request.mode === "navigate" ? caches.match("/") : undefined)
        )
      )
  );
});
