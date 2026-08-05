const CACHE_NAME = "wps-v183";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/styles.css?v=182",
  "/app.js?v=182",
  "/data.js?v=182",
  "/config.js?v=182",
  "/logo.svg",
  "/favicon.svg",
  "/og-image.svg"
];

// Install Event - Cache Core Assets
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean Old Caches Immediately
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First Strategy for JS/CSS to Guarantee Fresh Code
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith("http")) return;

  if (e.request.url.includes(".js") || e.request.url.includes(".css") || e.request.url.includes("book")) {
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
