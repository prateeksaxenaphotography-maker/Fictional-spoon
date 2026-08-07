const CACHE_NAME = "wps-v236";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/styles.css?v=236",
  "/app.js?v=236",
  "/data.js?v=236",
  "/config.js?v=236"
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
