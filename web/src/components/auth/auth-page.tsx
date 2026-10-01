import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "../../api"
import { LogoMark, LogoWordmark } from "@/components/app/brand"
import MicroSlats from "@/components/visuals/micro-slats"
import { cn } from "@/lib/utils"

const LAMPS = ["triage", "todo", "ready", "running", "blocked", "review", "done"] as const

/**
 * The slat colours are read from the live CSS custom properties rather than
 * hardcoded.
 *
 * MicroSlats parses its colours to RGB on a canvas, so it cannot take a
 * `var(--c-accent)` directly. Reading the resolved value means the background
 * follows the Signal Blue palette in both themes and tracks the theme switch,
 * instead of carrying its own fixed purple that would fight the rest of the app.
 */
function useTokenColor(token: string, fallback: string) {
  const [value, setValue] = useState(fallback)

  useEffect(() => {
    const read = () => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
      if (raw) setValue(raw)
    }
    read()

    // The `.dark` class is toggled by `applyTheme`, and the tokens live on
    // `:root` / `.dark` rather than as inline styles, so a MutationObserver on
    // the class list is what catches the switch. There is no custom event for it.
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [token])

  return value
}

export default function AuthPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const accent = useTokenColor("--c-accent", "#2f57c4")
  const ink = useTokenColor("--c-ink", "#0f172a")
  const canvas = useTokenColor("--c-canvas", "#f2f4fd")

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

  // Kept in a memo so the WebGL effect is not torn down and rebuilt on every
  // render: the component remounts its whole renderer when these change.
  const slats = useMemo(
    () => ({
      color: accent,
      glintColor: ink,
      backgroundColor: canvas,
    }),
    [accent, ink, canvas],
  )

  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas">
      {/* The sea, as the ground rather than a decoration. `absolute inset-0`
          rather than a fixed height so it fills whatever the viewport is, and it
          is `aria-hidden` inside the component — the canvas carries no text. */}
      <div className="absolute inset-0">
        <MicroSlats
          preset="signal"
          {...slats}
          slatWidth={10}
          slatHeight={25}
          gap={3}
          roundness={0.75}
          interactive={false}
          swirl={0}
          trail={1.4}
          lean={0}
          intro
          scale={0.85}
          speed={1.2}
          direction={180}
          chop={0.6}
          stretch={0.85}
          glint={0.25}
          contrast={1.2}
          perspective={0}
          fog={0}
          introDuration={2.3}
        />
      </div>

      {/* A wash over the slats. The signal preset is an even equalizer wall, so
          it reads as a texture at full strength but would compete with the
          form's own surfaces. This keeps the slats visible at the edges and
          pushes them back behind the card. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-canvas/55 backdrop-blur-[2px]"
      />

      <main className="relative flex min-h-dvh items-center justify-center p-6">
        <form
          className="glass-card flex w-full max-w-[380px] flex-col gap-6 bg-surface/90 p-8"
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
      </main>
    </div>
  )
}