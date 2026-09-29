// Switchyard service worker.
//
// The HTML fallback must apply to navigation requests ONLY. Serving index.html
// in response to a hashed-asset request hands the browser an HTML document
// declared as JavaScript, the module fails to parse, and the app renders a
// blank page. Asset requests fall back only to an exact cache match, or fail.

const VERSION = "switchyard-v3"
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
      // Content-hashed assets are dead the moment a build replaces them, and a
      // poisoned entry (an HTML body cached under a .js URL) can never be
      // evicted by revalidation. Drop the whole asset cache on every activation
      // so the tab re-fetches chunks from the new build.
      .then(() => caches.delete(ASSET_CACHE))
      .then(() => self.clients.claim())
  )
})

function staleResponse() {
  return new Response("", { status: 504, statusText: "Offline", headers: { "Content-Type": "text/plain" } })
}

// A build-asset request answered with the SPA shell arrives as a 200 carrying
// text/html. Caching that under a .js URL permanently breaks the chunk, so only
// cache responses whose content type actually matches the request.
function isStorableFor(request, response) {
  if (!response || !response.ok) return false
  const type = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase()
  const wanted = request.destination === "script" || /\.m?js(\?|$)/.test(request.url)
  if (wanted) {
    return type === "text/javascript" || type === "application/javascript" || type === "text/ecmascript"
  }
  if (request.destination === "style" || /\.css(\?|$)/.test(request.url)) {
    return type === "text/css"
  }
  return true
}

async function cachePut(request, cacheName) {
  const cache = await caches.open(cacheName)
  const response = await fetch(request)
  if (isStorableFor(request, response)) await cache.put(request, response.clone())
  return response
}

async function handleAsset(request) {
  // Network first, cache only as a fallback. A redeploy deletes old hashed
  // chunks, so trusting a cache hit blindly strands the tab on deleted files;
  // one extra request per chunk is the cheaper trade.
  try {
    const response = await fetch(request)
    if (isStorableFor(request, response)) {
      const cache = await caches.open(ASSET_CACHE)
      await cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    return cached ?? staleResponse()
  }
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

  // Content-hashed build output: network first so a redeploy is picked up,
  // cache only as an offline fallback.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(handleAsset(request))
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

// A page that hit a dead chunk asks for a purge, then reloads. This is the only
// way to clear entries written by the previous service worker, since those were
// cached under the old cache names and are already poisoned.
self.addEventListener("message", (event) => {
  if (event.data !== "purge-assets") return
  event.waitUntil(
    caches
      .delete(ASSET_CACHE)
      .then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((client) => client.postMessage("assets-purged")))
      .catch(() => undefined)
  )
})

