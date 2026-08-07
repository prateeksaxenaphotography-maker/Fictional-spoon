const CACHE_NAME = "wps-v242";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/styles.css?v=242",
  "/app.js?v=242",
  "/data.js?v=242",
  "/config.js?v=242"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith("http")) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
