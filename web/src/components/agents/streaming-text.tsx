import { useState, type ReactNode } from "react"
import { Check, Copy, RotateCcw, ChevronDown } from "lucide-react"

export type StreamingSource = { name: string; domain: string; href: string; image?: string }

export function StreamingText({
  children,
  copyText,
  status = "complete",
  sources = [],
  onRetry,
  footer,
}: {
  children: ReactNode
  copyText?: string
  status?: "streaming" | "complete" | "error"
  sources?: StreamingSource[]
  onRetry?: () => void
  footer?: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const isStreaming = status === "streaming"

  async function copy() {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return <div className="streaming-text" data-status={status} aria-busy={isStreaming}>
    <div className="text-[14px] leading-[1.65] text-[var(--color-ink-2)]">{children}</div>
    <div className="mt-2 flex min-h-7 items-center gap-0.5 text-[var(--color-ink-3)]">
      {copyText && <button type="button" onClick={() => void copy()} aria-label="Copy response" title={copied ? "Copied" : "Copy response"} className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-inset)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]">{copied ? <Check className="size-3.5 text-[var(--color-success)]" /> : <Copy className="size-3.5" />}</button>}
      {onRetry && <button type="button" onClick={onRetry} aria-label="Retry response" title="Retry response" className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-[var(--color-inset)] hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"><RotateCcw className="size-3.5" /></button>}
      {footer}
      {sources.length > 0 && <button type="button" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((value) => !value)} className="ml-1.5 inline-flex min-h-7 items-center gap-1.5 rounded-md px-1.5 text-xs transition-colors hover:bg-[var(--color-inset)] hover:text-[var(--color-ink)]"><span className="flex -space-x-1">{sources.slice(0, 3).map((source) => <span key={source.domain} className="flex size-4 items-center justify-center rounded-full bg-[var(--color-accent-tint)] text-[9px] text-[var(--color-accent)]">{source.name.slice(0, 1)}</span>)}</span>{sources.length} sources<ChevronDown className={`size-3 transition-transform ${sourcesOpen ? "rotate-180" : ""}`} /></button>}
      {isStreaming && <span className="ml-auto thinking-shimmer text-[11px]">Streaming</span>}
    </div>
    {sources.length > 0 && sourcesOpen && <div className="mt-1.5 flex flex-col rounded-[10px] bg-[var(--color-inset)] p-1 shadow-[0_0_0_1px_var(--color-line)]">{sources.map((source) => <a key={source.domain} href={source.href} target="_blank" rel="noreferrer" className="flex min-h-8 items-center gap-2 rounded-md px-1.5 text-xs text-[var(--color-ink-2)] hover:bg-[var(--color-surface)]"><span>{source.name}</span><span className="ml-auto font-mono text-[10px] text-[var(--color-ink-3)]">{source.domain}</span></a>)}</div>}
  </div>
}
