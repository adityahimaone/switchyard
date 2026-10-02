import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Check } from "lucide-react"
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/api"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export default function NotificationCenter() {
  const qc = useQueryClient()
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications(), refetchInterval: 15000 })
  const all = notifications.data ?? []
  const unread = all.filter((item) => item.unread)

  async function markAll() {
    await markAllNotificationsRead()
    await qc.invalidateQueries({ queryKey: ["notifications"] })
  }
  async function markOne(id: string) {
    await markNotificationRead(id)
    await qc.invalidateQueries({ queryKey: ["notifications"] })
  }

  const badge = unread.length > 0 && (
    <span
      className="pointer-events-none absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-semibold leading-4 text-[var(--color-accent-foreground)] tabular-nums"
    >
      {unread.length > 99 ? "99+" : unread.length}
    </span>
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="relative"
          aria-label={unread.length > 0 ? `Notifications, ${unread.length} unread` : "Notifications"}
        >
          <Bell className="size-4" />
          {badge}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold text-ink">Notifications</span>
          {unread.length > 0 && (
            <button
              type="button"
              onClick={() => void markAll()}
              className="rounded text-[11px] text-[var(--color-accent)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              Mark all read
            </button>
          )}
        </div>
        {/* Viewport-relative cap, not a flat `max-h-72`.

            This was the actual clipping cause, and it is not an ancestor
            problem: the popover portals to `document.body` and no `overflow` on
            the app shell can reach it. The panel has a fixed 288px list plus a
            header and footer, giving it a ~324px floor that Radix's collision
            detection cannot shrink. Below that the content runs past the
            bottom of the viewport — and because `html, body, #root` are
            `height: 100%` with `overflow: visible`, the page has nothing to
            scroll, so the overflow is simply unreachable. Measured: at
            1280x340 38px is cut off with 3 of 32 rows unreachable; at 1024x300
            78px is cut off and `scrollTop = 9999` does not recover it.

            `min(18rem, 100dvh - 6rem)` keeps the original 288px on any normal
            window and only yields on short ones, so the panel stays fully on
            screen and its own list scrolls. */}
        <div className="max-h-[min(18rem,calc(100dvh-6rem))] overflow-y-auto border-t border-[var(--color-line)]">
          {all.length === 0 && <p className="p-3 text-xs text-ink-3">No notifications</p>}
          {all.slice(0, 20).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void markOne(item.id)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left outline-none hover:bg-[var(--color-bg)] focus-visible:bg-[var(--color-accent-tint)]"
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.unread ? "bg-[var(--color-accent)]" : "bg-ink-4"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-ink">{item.kind.replaceAll("_", " ")}</span>
                <span className="mt-0.5 block truncate text-[10px] text-ink-3">
                  {String(item.data.error ?? item.data.title ?? item.data.task_id ?? "Event received")}
                </span>
              </span>
              {!item.unread && <Check className="mt-0.5 size-3 shrink-0 text-success-text" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
