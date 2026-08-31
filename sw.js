/* Runnin service worker: HTML altid netværk-først (aldrig forældet side efter deploy),
   versionerede assets stale-while-revalidate, tiles/APIs udenom. */
const CACHE = "runnin-v3";
const TILE_CACHE = "runnin-tiles-v1";
const MAKS_TILES = 3000; // ~50-80 MB loft - ældste smides ud

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/manifest.webmanifest"])));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // kort-fliser: cache-først (set én gang = øjeblikkelig for evigt); netværk fylder på i baggrunden
  if (url.hostname === "tiles.openfreemap.org") {
    e.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        const res = await fetch(e.request);
        if (res.ok) {
          cache.put(e.request, res.clone());
          cache.keys().then(keys => { if (keys.length > MAKS_TILES) keys.slice(0, keys.length - MAKS_TILES).forEach(k => cache.delete(k)); });
        }
        return res;
      })
    );
    return;
  }
  if (url.origin !== location.origin) return; // øvrige eksterne (fonts/APIs) går udenom
  // HTML/navigationer: netværk først - en deploy må ALDRIG give en forældet side m. blandede filversioner
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).then(res => {
        caches.open(CACHE).then(c => c.put(e.request, res.clone())).catch(() => {});
        return res.clone();
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request);
      const net = fetch(e.request).then(res => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
