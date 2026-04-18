// Service Worker – Meal Planner PWA
const CACHE_NAME = "meal-planner-v2";
const PRECACHE = [
    "/static/css/style.css",
    "/static/js/app.js",
    "/static/js/i18n.js",
    "/static/icons/icon-192x192.png",
    "/static/icons/icon-512x512.png",
];

// Install: pre-cache essential assets
self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
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

// Fetch: network-first for API & pages, cache-first for static assets
self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url);

    // Skip non-GET requests
    if (e.request.method !== "GET") return;

    // API calls and HTML pages: always go to network
    if (url.pathname.startsWith("/api/") || e.request.mode === "navigate") {
        return;
    }

    // Static assets: cache-first
    if (url.pathname.startsWith("/static/")) {
        e.respondWith(
            caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
                return res;
            }))
        );
    }
});
