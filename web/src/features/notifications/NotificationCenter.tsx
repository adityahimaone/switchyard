import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bell, Check } from "lucide-react"
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/api"
import { Button } from "@/components/ui/button"

export default function NotificationCenter() {
  const qc = useQueryClient()
  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => listNotifications(), refetchInterval: 15000 })
  const unread = (notifications.data ?? []).filter((item) => item.unread)
  async function markAll() { await markAllNotificationsRead(); await qc.invalidateQueries({ queryKey: ["notifications"] }) }
  async function markOne(id: string) { await markNotificationRead(id); await qc.invalidateQueries({ queryKey: ["notifications"] }) }
  return <div className="relative group">
    <Button size="icon-sm" variant="ghost" title="Notifications"><Bell className="size-4" />{unread.length > 0 && <span className="absolute right-0 top-0 min-w-3.5 rounded-full bg-[var(--color-accent)] px-1 text-center text-[9px] text-black">{unread.length > 99 ? "99+" : unread.length}</span>}</Button>
    <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-80 origin-top-right scale-95 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-2 opacity-0 shadow-xl transition group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100">
      <div className="flex items-center justify-between px-2 py-1"><span className="text-xs font-semibold">Notifications</span>{unread.length > 0 && <button onClick={() => void markAll()} className="text-[10px] text-[var(--color-accent)]">Mark all read</button>}</div>
      <div className="mt-1 max-h-72 overflow-y-auto">{(notifications.data ?? []).slice(0, 20).map((item) => <button key={item.id} onClick={() => void markOne(item.id)} className="flex w-full items-start gap-2 rounded p-2 text-left hover:bg-[var(--color-bg)]"><span className={`mt-1 size-1.5 shrink-0 rounded-full ${item.unread ? "bg-[var(--color-accent)]" : "bg-neutral-600"}`} /><span className="min-w-0 flex-1"><span className="block text-xs text-neutral-200">{item.kind.replaceAll("_", " ")}</span><span className="mt-0.5 block truncate text-[10px] text-neutral-500">{String(item.data.error ?? item.data.title ?? item.data.task_id ?? "Event received")}</span></span>{!item.unread && <Check className="mt-0.5 size-3 text-emerald-400" />}</button>)}{notifications.data?.length === 0 && <p className="p-3 text-xs text-neutral-500">No notifications</p>}</div>
    </div>
  </div>
}
