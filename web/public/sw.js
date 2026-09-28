// Switchyard service worker.
//
// The HTML fallback must apply to navigation requests ONLY. Serving index.html
// in response to a hashed-asset request hands the browser an HTML document
// declared as JavaScript, the module fails to parse, and the app renders a
// blank page. Asset requests fall back only to an exact cache match, or fail.

const VERSION = "switchyard-v2"
const SHELL_CACHE = `${VERSION}-shell`
const ASSET_CACHE = `${VERSION}-assets`
const SHELL = ["/index.html", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  )
})

function staleResponse() {
  return new Response("", { status: 504, statusText: "Offline", headers: { "Content-Type": "text/plain" } })
}

async function cachePut(request, cacheName) {
  const cache = await caches.open(cacheName)
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  // SPA routes: serve the shell so a deep link works offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            void caches.open(SHELL_CACHE).then((cache) => cache.put("/index.html", response.clone()))
          }
          return response
        })
        .catch(async () => {
          const shell = await caches.match("/index.html", { cacheName: SHELL_CACHE })
          return shell ?? caches.match("/index.html") ?? staleResponse()
        })
    )
    return
  }

  // Content-hashed build output is immutable: cache first, then revalidate.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          cachePut(request, ASSET_CACHE).catch(() => staleResponse())
      )
    )
    return
  }

  // Everything else (icons, manifest, brand files): network first.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) void cachePut(request, ASSET_CACHE).catch(() => undefined)
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached ?? staleResponse()))
  )
})
