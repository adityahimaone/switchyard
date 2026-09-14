import { useState } from "react"
import { KeyRound, LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "../api"
import { FloatingPaths } from "./floating-paths"

export default function AuthPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError("")
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) })
      onAuthenticated()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-[var(--color-bg)] lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-[var(--color-line)] bg-[var(--color-surface)]/40 p-10 lg:flex lg:flex-col">
        <FloatingPaths position={1} />
        <div className="relative z-10 flex items-center gap-3">
          <img src="/brand/mascot-switchyard.png" alt="Switchyard" className="h-12 w-auto object-contain" />
          <span className="text-xs font-semibold uppercase tracking-[.22em] text-[var(--color-accent)]">Switchyard</span>
        </div>
        <div className="relative z-10 mt-auto max-w-md">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-ink-3)]">Private workspace</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[var(--color-ink-1)]">Your agents. Your board. Your control plane.</h1>
          <p className="mt-4 text-sm leading-6 text-[var(--color-ink-3)]">Secure access keeps task dispatch, profiles, logs, and workspace controls private.</p>
        </div>
      </section>
      <section className="relative flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
            <img src="/brand/mascot-switchyard.png" alt="Switchyard" className="h-12 w-auto object-contain" />
            <span className="text-xs font-semibold uppercase tracking-[.22em] text-[var(--color-accent)]">Switchyard</span>
          </div>
          <div className="flex size-11 items-center justify-center rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"><KeyRound className="size-5" /></div>
          <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Protected app</p><h2 className="mt-2 text-2xl font-semibold text-[var(--color-ink-1)]">Welcome back</h2><p className="mt-2 text-sm text-[var(--color-ink-3)]">Enter workspace password to continue.</p></div>
          <form onSubmit={submit} className="space-y-4">
            <div className="relative"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-3)]" /><Input autoFocus type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="h-11 border-[var(--color-line)] bg-[var(--color-surface)] pl-10" /></div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <Button type="submit" disabled={busy || !password} className="h-11 w-full bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">{busy ? "Checking…" : "Unlock workspace"}</Button>
          </form>
          <p className="text-center text-[11px] text-[var(--color-ink-3)]">Session stays active for 14 days on this device.</p>
        </div>
      </section>
    </main>
  )
}
