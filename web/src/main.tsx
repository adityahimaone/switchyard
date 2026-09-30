import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { bind } from "cuelume"
import AppErrorBoundary from "@/components/app/app-error-boundary"
import AuthGate from "./AuthGate"
import "./index.css"
import { applyDensity, applyMotion, applyTheme, readDensity, readMotion, readTheme } from "./hooks/useSettings"
import { armChunkRecovery } from "./lib/chunk-recovery"
import { syncSoundEngine, watchSoundPreferences } from "./lib/sound"

bind()
applyTheme(readTheme())
applyDensity(readDensity())
applyMotion(readMotion())
syncSoundEngine()
watchSoundPreferences()
if ("serviceWorker" in navigator && window.location.protocol === "https:") {
  window.addEventListener("load", () => {
    armChunkRecovery()
    void navigator.serviceWorker.register("/sw.js")
    // Clear asset entries left by the previous service worker, which cached an
    // HTML body under deleted chunk URLs. Without this those chunks stay broken
    // until the user manually clears site data.
    navigator.serviceWorker.controller?.postMessage("purge-assets")
  })
}

const qc = new QueryClient({
  defaultOptions: { queries: { refetchInterval: 15_000, retry: 1 } },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={qc}>
        <AuthGate />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
