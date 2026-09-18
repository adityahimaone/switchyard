const CACHE = "switchyard-shell-v1"
const SHELL = ["/", "/index.html", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return
  event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html"))))
})
