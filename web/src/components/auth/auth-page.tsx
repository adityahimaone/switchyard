import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "../../api"
import { LogoMark, LogoWordmark } from "@/components/app/brand"
import { cn } from "@/lib/utils"

const LAMPS = ["triage", "todo", "ready", "running", "blocked", "review", "done"] as const

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
    <div className="smoke-wash dot-grid relative flex min-h-dvh items-center justify-center overflow-hidden bg-canvas p-6">
      <form
        className="flex w-full max-w-[360px] flex-col gap-6"
        onSubmit={submit}
      >
        <div className="flex flex-col items-start gap-4">
          <LogoMark className="size-14 rounded-[14px]" />
          <div className="flex items-center gap-2">
            <LogoWordmark />
          </div>
          {/* Seven track lines, one per status. Draws in once; static under
              reduced motion. This is the one memorable moment on the page. */}
          <div className="flex gap-1" aria-hidden>
            {LAMPS.map((s, i) => (
              <span
                key={s}
                className="board-enter track-line w-7"
                style={{
                  ["--lamp" as string]: `var(--c-st-${s})`,
                  ["--i" as string]: i,
                  background: `var(--c-st-${s})`,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <h1 className="text-xl leading-none font-semibold text-ink">Sign in to Switchyard</h1>
          <p className="mt-2 text-sm text-ink-3">Enter the workspace password to continue.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-invalid={!!error}
            aria-describedby={error ? "password-error" : undefined}
            className={cn(error && "border-danger")}
          />
          {error && (
            <p id="password-error" className="text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" loading={busy} disabled={!password} className="w-full">
          Sign in
        </Button>

        <p className="text-xs text-ink-3">
          The session stays active for 14 days on this device.
        </p>
      </form>
    </div>
  )
}
