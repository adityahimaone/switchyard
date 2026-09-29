import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { armChunkRecovery, isChunkLoadError, recoverFromChunkError } from "./chunk-recovery"

const swSrc = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8")

describe("isChunkLoadError", () => {
  it("matches the dynamic import failures Vite raises for a deleted chunk", () => {
    expect(isChunkLoadError(new Error("Failed to fetch dynamically imported module: https://x/assets/WorkspacesPage-CxeKwLT6.js"))).toBe(true)
    expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true)
    expect(isChunkLoadError(new Error("Importing a module script failed."))).toBe(true)
  })

  it("ignores unrelated render errors so the boundary still shows the error UI", () => {
    expect(isChunkLoadError(new Error("x is not defined"))).toBe(false)
    expect(isChunkLoadError(new Error("NetworkError when attempting to fetch resource"))).toBe(false)
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
  })
})

describe("recoverFromChunkError", () => {
  const reload = vi.fn()
  let store: Record<string, string>

  beforeEach(() => {
    reload.mockClear()
    store = {}
    // No DOM environment is installed for this project, so stand in the two
    // globals the module touches.
    vi.stubGlobal("window", { location: { reload } })
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { store = {} },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("reloads once and then refuses to loop on repeated failures", () => {
    recoverFromChunkError()
    recoverFromChunkError()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("re-arms after a successful load so a later deploy can be picked up", () => {
    recoverFromChunkError()
    armChunkRecovery()
    recoverFromChunkError()

    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe("service worker", () => {
  it("refuses to cache an HTML body under a .js URL", () => {
    // The shell is served as 200 text/html; caching that under a chunk URL is
    // what made a single redeploy permanently break the route.
    expect(swSrc).toMatch(/isStorableFor/)
    expect(swSrc).not.toMatch(/if \(response\.ok\) await cache\.put/)
  })

  it("purges the asset cache on activate and on request", () => {
    expect(swSrc).toMatch(/caches\.delete\(ASSET_CACHE\)/)
    expect(swSrc).toMatch(/purge-assets/)
  })

  it("fetches assets network-first so a redeploy is picked up", () => {
    const handler = swSrc.slice(swSrc.indexOf('url.pathname.startsWith("/assets/")'))
    expect(handler).toMatch(/handleAsset\(request\)/)
  })
})
