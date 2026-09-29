// Self-heal for lazy-loaded route chunks that fail to load.
//
// A redeploy deletes the content-hashed chunk a mounted tab already holds, so a
// route transition throws "Failed to fetch dynamically imported module" and the
// page white-screens. Reloading fetches the current index.html, which points at
// the new hashes, so the app recovers without the user clearing site data.

const RELOAD_FLAG = "kb:chunk-reload"

// Vite reports a dead chunk as a failed dynamic import. Network blips raise the
// same error, so recovery is capped and only a single reload is attempted.
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const message = error.message
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Importing a module script failed")
  )
}

export function recoverFromChunkError(): void {
  if (typeof window === "undefined") return
  if (sessionStorage.getItem(RELOAD_FLAG)) return
  sessionStorage.setItem(RELOAD_FLAG, "1")
  window.location.reload()
}

// The flag must clear once a new build has actually loaded, otherwise every
// later chunk failure in the session reloads nothing.
export function armChunkRecovery(): () => void {
  if (typeof window === "undefined") return () => undefined
  sessionStorage.removeItem(RELOAD_FLAG)
  return () => undefined
}
