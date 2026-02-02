// Service Worker
// Estrategia para que los cambios se apliquen sin tener que borrar caché manualmente.
// - HTML (navegación): network-first
// - JS/CSS: stale-while-revalidate
// - Imágenes: cache-first

const CACHE = "tennis-tracker-web-v2.53-premium-refresh";
const CORE = [
  "./",
  "./index.html",
  "./style.css?v=2530",
  "./app.js?v=2530",
  "./assets/court_top_view.png",
  "./assets/board_court.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHTMLRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html");
}

function isAssetSWROrCacheFirst(request) {
  const dest = request.destination;
  if (dest === "script" || dest === "style") return "swr";
  if (dest === "image" || dest === "font") return "cache-first";
  return "cache-first";
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(request);
    return cached || caches.match("./index.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  // Devuelve caché si existe; si no, espera a la red.
  return cached || (await fetchPromise) || (await caches.match(request));
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    const cache = await caches.open(CACHE);
    cache.put(request, res.clone());
    return res;
  } catch (e) {
    // fallback razonable
    if (isHTMLRequest(request)) return caches.match("./index.html");
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo manejamos http(s)
  if (!req.url.startsWith(self.location.origin)) return;

  if (isHTMLRequest(req)) {
    event.respondWith(networkFirst(req));
    return;
  }

  const strategy = isAssetSWROrCacheFirst(req);
  if (strategy === "swr") {
    event.respondWith(staleWhileRevalidate(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
