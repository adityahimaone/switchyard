import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/api"
import { LogoMark, LogoWordmark } from "@/components/app/brand"
import { cn } from "@/lib/utils"

/**
 * Must match minPasswordLength in internal/kanban/auth.go. Duplicated rather
 * than fetched because the value is a compile-time constant on the server and
 * this screen must render before any API call succeeds.
 */
const MIN_PASSWORD_LENGTH = 12

/**
 * Shown after logging in with the password generated on first run. The server
 * sets must_change until the operator picks their own password, so this screen
 * cannot be skipped: the app is withheld, not merely nudged.
 *
 * The generated password is never displayed again, so the current password is
 * whatever the operator saved from the startup log.
 */
export function ForcePasswordChange({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && next !== confirm
  const canSubmit =
    !busy && current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && next === confirm

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (next !== confirm) {
      setError("The two passwords do not match.")
      return
    }
    setBusy(true)
    try {
      // ChangePassword revokes every session, including this one, so the
      // response is the last authenticated request this tab makes.
      await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ current, password: next }),
      })
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <form
        className="glass-card flex w-full max-w-[420px] flex-col gap-6 bg-surface/90 p-8"
        onSubmit={submit}
      >
        <div className="flex flex-col items-start gap-4">
          <LogoMark className="size-14 rounded-[14px]" />
          <LogoWordmark />
        </div>

        <div>
          <h1 className="text-xl leading-none font-semibold text-ink">Choose your password</h1>
          <p className="mt-2 text-sm text-ink-3">
            This server generated a temporary password on first run and printed it to the
            startup log once. Set your own password to finish signing in.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forced-current">Temporary password</Label>
            <Input
              id="forced-current"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forced-new">New password</Label>
            <Input
              id="forced-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={tooShort}
              className={cn(tooShort && "border-danger")}
            />
            {tooShort && (
              <p className="text-sm text-danger-text">
                Use at least {MIN_PASSWORD_LENGTH} characters.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="forced-confirm">Confirm new password</Label>
            <Input
              id="forced-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
              className={cn(mismatch && "border-danger")}
            />
            {mismatch && <p className="text-sm text-danger-text">The two passwords do not match.</p>}
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" variant="signal" loading={busy} disabled={!canSubmit}>
          Set password and continue
        </Button>

        <p className="text-xs text-ink-3">
          Changing the password signs out every active session on this server.
        </p>
      </form>
    </main>
  )
}
