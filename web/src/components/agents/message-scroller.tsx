import { useEffect, useRef, type ReactNode } from "react"
import { ArrowDown } from "lucide-react"

export function MessageScroller({
  children,
  busy = false,
  followOutput = true,
  followThreshold = 56,
  onFollowChange,
  showJump,
  onJump,
}: {
  children: ReactNode
  busy?: boolean
  followOutput?: boolean
  followThreshold?: number
  onFollowChange?: (following: boolean) => void
  showJump?: boolean
  onJump?: () => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)

  function updateFollowing(element: HTMLDivElement) {
    const following = element.scrollHeight - element.scrollTop - element.clientHeight <= followThreshold
    if (following !== followingRef.current) {
      followingRef.current = following
      onFollowChange?.(following)
    }
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !followOutput) return
    const resize = new ResizeObserver(() => {
      if (followingRef.current) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" })
    })
    resize.observe(viewport.firstElementChild ?? viewport)
    return () => resize.disconnect()
  }, [followOutput])

  return <div className="relative min-h-0 flex-1">
    <div ref={viewportRef} onScroll={(event) => updateFollowing(event.currentTarget)} aria-label="Conversation" aria-busy={busy} className="h-full overflow-y-auto p-4 sm:p-6">
      {children}
    </div>
    {showJump && <button type="button" onClick={onJump} className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] px-3 text-xs text-[var(--color-ink-2)] shadow-lg transition-colors hover:bg-[var(--color-inset)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"><ArrowDown className="size-3.5" /> Jump to latest</button>}
  </div>
}
