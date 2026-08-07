const CACHE_NAME = "wps-v231";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/styles.css?v=231",
  "/app.js?v=231",
  "/data.js?v=231",
  "/config.js?v=231"
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
