const CACHE_NAME = "kostentracker-v9-20260905-2200";
const INDEX_URL = "./index.html";
const APP_SHELL = [
  INDEX_URL,
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // HTML/Navigations immer zuerst frisch aus dem Netz holen.
  // Nur wenn das Netz wirklich nicht erreichbar ist, die Offline-Kopie verwenden.
  if (event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(event.request, { cache: "no-store" });
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(INDEX_URL, fresh.clone());
        }
        return fresh;
      } catch (_) {
        return (await caches.match(INDEX_URL)) || Response.error();
      }
    })());
    return;
  }

  // Statische Dateien: Cache sofort nutzen, im Hintergrund aktualisieren.
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const networkPromise = fetch(event.request, { cache: "no-cache" })
      .then(async response => {
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(networkPromise);
      return cached;
    }

    return (await networkPromise) || Response.error();
  })());
});
