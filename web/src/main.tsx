import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { bind } from "cuelume"
import AuthGate from "./AuthGate"
import "./index.css"
import { applyTheme, readTheme } from "./hooks/useSettings"
import { syncSoundEngine, watchSoundPreferences } from "./lib/sound"

bind()
applyTheme(readTheme())
syncSoundEngine()
watchSoundPreferences()

const qc = new QueryClient({
  defaultOptions: { queries: { refetchInterval: 15_000, retry: 1 } },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthGate />
    </QueryClientProvider>
  </StrictMode>,
)
