import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { toastGlobal } from "../../api"
import { isChunkLoadError, recoverFromChunkError } from "@/lib/chunk-recovery"

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Catches render/lifecycle errors anywhere below it. Without this, an uncaught
 * error in React unmounts the whole tree and leaves #root empty — a blank page
 * that only a reload recovers from.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A lazy route whose chunk was deleted by a redeploy rejects on navigation.
    // Reload first so the app picks up the current index.html, and only fall
    // through to the error UI if that does not resolve it.
    if (isChunkLoadError(error)) {
      console.warn("[switchyard] lazy chunk failed to load, reloading", error)
      recoverFromChunkError()
      return
    }
    console.error("[switchyard] unhandled render error", error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
        <div className="w-full max-w-lg rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-6">
          <h1 className="text-base font-semibold text-[var(--color-ink)]">Terjadi kesalahan saat memuat tampilan</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-ink-3)]">
            Halaman ini gagal dirender. Data di server tidak berubah. Coba muat ulang tampilan, atau kembali ke board.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-inset)] p-3 text-xs leading-5 text-[var(--color-ink-2)]">
            {error.message || String(error)}
          </pre>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={this.reset}
              className="bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent)]/90"
            >
              Coba lagi
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.history.replaceState({}, "", "/")
                window.location.reload()
              }}
            >
              Muat ulang halaman
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                toastGlobal("Menyalin detail error ke clipboard", "success")
                void navigator.clipboard?.writeText(`${error.message}\n${error.stack ?? ""}`)
              }}
            >
              Salin detail
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
