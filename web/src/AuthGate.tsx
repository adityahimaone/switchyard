import { useEffect, useState } from "react"
import App from "./App"
import AuthPage from "./components/auth-page"
import LoadingState from "./components/LoadingState"

export default function AuthGate() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/auth/status", { credentials: "include" })
      .then((r) => r.json().catch(() => ({ authenticated: false })))
      .then((j: { authenticated?: boolean }) => setAuthenticated(Boolean(j.authenticated)))
      .catch(() => setAuthenticated(false))
  }, [])

  if (authenticated === null) {
    return (
      <div className="flex min-h-screen bg-[var(--color-bg)]">
        <LoadingState label="Memeriksa sesi" description="Menyiapkan akses ke workspace." />
      </div>
    )
  }
  return authenticated ? <App /> : <AuthPage onAuthenticated={() => setAuthenticated(true)} />
}
