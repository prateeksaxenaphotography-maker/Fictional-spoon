// ONE version for the whole site. It must match the ?v= on every <script> and
// <link> in the HTML — CI (.github/scripts/validate-data.mjs) fails the build
// if they drift.
//
// They had drifted badly: the HTML sat on ?v=253 from 2026-07-03 while this
// file was bumped to 262. Nothing here was ever requested by a page, so the
// precache below was dead weight, and — worse — every page kept asking for the
// same ?v=253 URL while app.js changed underneath it. GitHub Pages serves
// these with `max-age=14400`, so browsers held a four-hour-old copy of the app
// and kept re-serving it because the address never changed. Working from a
// stale app.js is how a whole feature got silently overwritten on 2026-08-08.
//
// Bump ASSET_VERSION on every release that touches app.js, styles.css,
// data.js or config.js.
const ASSET_VERSION = "263";
const CACHE_NAME = `wps-v${ASSET_VERSION}`;
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  `/styles.css?v=${ASSET_VERSION}`,
  `/app.js?v=${ASSET_VERSION}`,
  `/data.js?v=${ASSET_VERSION}`,
  `/config.js?v=${ASSET_VERSION}`
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
