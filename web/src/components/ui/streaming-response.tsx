import * as React from "react"
import { Check, Copy, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Status = "streaming" | "complete" | "error"

export function StreamingResponse({
  children,
  status = "streaming",
  copyText,
  onRetry,
  className,
  contentClassName,
  footer,
  progressHistory,
}: {
  children: React.ReactNode
  status?: Status
  copyText?: string
  onCopy?: () => void | Promise<void>
  onRetry?: () => void
  sources?: unknown[]
  className?: string
  contentClassName?: string
  footer?: React.ReactNode
  progressHistory?: React.ReactNode
}) {
  const [copied, setCopied] = React.useState(false)

  async function handleCopy() {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  const isStreaming = status === "streaming"

  return (
    <div className={cn("streaming-response", className)} data-status={status} aria-busy={isStreaming} aria-live={isStreaming ? "polite" : undefined}>
      <div className={cn("streaming-response__content", contentClassName)}>{children}</div>
      {progressHistory && <div className="streaming-response__history">{progressHistory}</div>}
      {(copyText || onRetry || footer) && <div className="streaming-response__actions">
        {copyText && <Button variant="ghost" size="icon-xs" className="text-[10px]" onClick={handleCopy} aria-label="Copy response" title={copied ? "Copied" : "Copy response"}>
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </Button>}
        {onRetry && <Button variant="ghost" size="icon-xs" onClick={onRetry} aria-label="Retry" title="Retry"><RotateCcw className="size-3" /></Button>}
        {footer}
        {isStreaming && <span className="ml-auto text-[11px] text-[var(--color-ink-3)] thinking-shimmer">Streaming...</span>}
      </div>}
    </div>
  )
}
