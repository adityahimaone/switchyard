import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/api"
import { SettingsSection } from "../settings-parts"
import { cn } from "@/lib/utils"

/** Must match minPasswordLength in internal/kanban/auth.go. */
const MIN_PASSWORD_LENGTH = 12

export default function AccountTab() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      await api("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ current, password: next }),
      })
      setMsg({ tone: "ok", text: "Password updated. Signing you out." })
      setCurrent("")
      setNext("")
      setTimeout(() => {
        void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() =>
          window.location.reload(),
        )
      }, 1200)
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH
  const canSubmit = !busy && current.length > 0 && next.length >= MIN_PASSWORD_LENGTH

  return (
    <SettingsSection
      title="Account"
      description="Switchyard uses one shared workspace password."
    >
      <form onSubmit={changePassword} className="flex flex-col gap-4 py-4">
        <p className="max-w-[56ch] text-sm text-ink-3">
          Changing the password signs out every active session. It must be at
          least {MIN_PASSWORD_LENGTH} characters.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="pw-new">New password</Label>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={tooShort}
              className={cn(tooShort && "border-danger")}
            />
          </div>
        </div>
        {tooShort && (
          <p role="status" className="text-sm text-danger-text">
            Use at least {MIN_PASSWORD_LENGTH} characters.
          </p>
        )}
        {msg && (
          <p
            role="status"
            className={msg.tone === "ok" ? "text-sm text-success" : "text-sm text-danger-text"}
          >
            {msg.text}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant="signal" loading={busy} disabled={!canSubmit}>
            Update password
          </Button>
        </div>
      </form>
    </SettingsSection>
  )
}
