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
    {/* role="log" gives this a role so aria-label is permitted, and makes the
        transcript a live region. aria-live is off while idle so a long
        transcript does not re-announce on every re-render; it opens up during a
        run, which is when new content actually matters. */}
    <div
      ref={viewportRef}
      onScroll={(event) => updateFollowing(event.currentTarget)}
      role="log"
      aria-label="Conversation"
      aria-live={busy ? "polite" : "off"}
      aria-busy={busy}
      className="h-full overflow-y-auto p-4 sm:p-6"
    >
      {children}
    </div>
    {showJump && <button type="button" onClick={onJump} className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-raised px-3 text-xs text-ink-2 shadow-float transition-colors hover:bg-well focus-visible:ring-[3px] focus-visible:ring-focus/40"><ArrowDown className="size-3.5" /> Jump to latest</button>}
  </div>
}
