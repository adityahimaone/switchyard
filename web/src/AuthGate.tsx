import { useEffect, useState } from "react"
import App from "./App"
import AuthPage from "@/components/auth/auth-page"
import LoadingState from "@/components/feedback/loading-state"
import { ForcePasswordChange } from "@/components/auth/force-password-change"

type AuthState = {
  authenticated: boolean
  /** Server-side flag: the seeded password was generated, not chosen. */
  mustChange: boolean
}

export default function AuthGate() {
  const [state, setState] = useState<AuthState | null>(null)

  useEffect(() => {
    fetch("/api/auth/status", { credentials: "include" })
      .then((r) => r.json().catch(() => ({ authenticated: false })))
      .then((j: { authenticated?: boolean; must_change?: boolean }) =>
        setState({ authenticated: Boolean(j.authenticated), mustChange: Boolean(j.must_change) }),
      )
      .catch(() => setState({ authenticated: false, mustChange: false }))
  }, [])

  if (state === null) {
    return (
      <div className="flex min-h-screen bg-[var(--color-bg)]">
        <LoadingState label="Memeriksa sesi" description="Menyiapkan akses ke workspace." />
      </div>
    )
  }

  if (!state.authenticated) {
    return <AuthPage onAuthenticated={() => setState({ authenticated: true, mustChange: false })} />
  }

  // A generated first-run password is usable but not the operator's own, so
  // the app is withheld until they choose one. This is the only way the
  // seeded credential is guaranteed to be rotated.
  if (state.mustChange) {
    return <ForcePasswordChange onChanged={() => window.location.reload()} />
  }

  return <App />
}
