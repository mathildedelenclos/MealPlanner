// Service Worker – Meal Planner PWA
const CACHE_NAME = "meal-planner-v4";
const PRECACHE = [
    "/",
    "/calendar",
    "/static/css/style.css",
    "/static/js/app.js",
    "/static/js/i18n.js",
    "/static/icons/icon-192x192.png",
    "/static/icons/icon-512x512.png",
];

// Install: pre-cache essential assets (incl. /calendar HTML for offline navigation)
self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            // addAll fails the whole install if any URL 404s; use individual puts so
            // a transient failure (e.g. /calendar requires login) doesn't block install.
            Promise.all(PRECACHE.map((url) =>
                fetch(url).then((res) => res.ok && cache.put(url, res.clone())).catch(() => {})
            ))
        )
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first for navigations + static assets, falling back to cache.
self.addEventListener("fetch", (e) => {
    if (e.request.method !== "GET") return;
    const url = new URL(e.request.url);

    // API calls: never cache, never intercept
    if (url.pathname.startsWith("/api/")) return;

    // HTML navigations: network-first, fall back to cached /calendar so the
    // app shell still loads when offline.
    if (e.request.mode === "navigate") {
        e.respondWith(
            fetch(e.request).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                return res;
            }).catch(() =>
                caches.match(e.request).then((cached) => cached || caches.match("/calendar"))
            )
        );
        return;
    }

    // Static assets: network-first, fall back to cache for offline support
    if (url.pathname.startsWith("/static/")) {
        e.respondWith(
            fetch(e.request).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                return res;
            }).catch(() => caches.match(e.request))
        );
    }
});
