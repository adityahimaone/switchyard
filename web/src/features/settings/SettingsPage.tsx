import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs"
import { Bell, XCircle, Eye, EyeOff, ArrowDown, ArrowUp, GripVertical, RotateCcw, Search, Volume2, VolumeX, RefreshCw, LayoutGrid, Activity, Download, Archive, ArchiveRestore, MousePointerClick, Mouse } from "lucide-react"
import { useSidebarPreferences } from "@/lib/sidebar-preferences"
import { useTheme, useSoundSettings, type ThemePreference } from "@/hooks/useSettings"
import { Button } from "@/components/ui/button"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, archiveBoard, type Board } from "@/api"
import { applySoundPreferences, syncSoundEngine } from "@/lib/sound"

const TABS = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "notifications", label: "Notifications" },
  { id: "boards", label: "Boards" },
  { id: "advanced", label: "Advanced" },
] as const

type TabId = (typeof TABS)[number]["id"]

const REFRESH_KEY = "kb-refresh-interval"
const COMPACT_KEY = "kb-compact-cards"
const PING_KEY = "kb-ping-interval"
const NOTIFY_BROWSER_KEY = "kb-notify-browser"
const NOTIFY_FAILURE_KEY = "kb-notify-failure"
const NOTIFY_REVIEW_KEY = "kb-notify-review"

function useLocalStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  })
  const update = (v: T) => {
    setValue(v)
    try { localStorage.setItem(key, JSON.stringify(v)) } catch {}
  }
  return [value, update] as const
}

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("general")
  const [q, setQ] = useState("")
  const sound = useSoundSettings()

  const [refreshMs, setRefresh] = useLocalStorage(REFRESH_KEY, 15000)
  const [compact, setCompact] = useLocalStorage(COMPACT_KEY, false)
  const [pingMs, setPing] = useLocalStorage(PING_KEY, 30000)
  const [notifyBrowser, setNotifyBrowser] = useLocalStorage(NOTIFY_BROWSER_KEY, false)
  const [notifyFailure, setNotifyFailure] = useLocalStorage(NOTIFY_FAILURE_KEY, true)
  const [notifyReview, setNotifyReview] = useLocalStorage(NOTIFY_REVIEW_KEY, true)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [passwordMsg, setPasswordMsg] = useState("")
  const [passwordBusy, setPasswordBusy] = useState(false)
  const { items, isVisible, move, toggle, reset } = useSidebarPreferences()
  const { theme, setTheme } = useTheme()

  // Sync cuelume engine on any sound pref change
  useEffect(() => {
    syncSoundEngine()
  }, [sound.enabled, sound.volume])

  // Re-scan attrs when per-type toggles change
  useEffect(() => {
    applySoundPreferences()
  }, [sound.hover, sound.click])

  const needle = q.trim().toLowerCase()
  const show = (...labels: string[]) => !needle || labels.some((l) => l.toLowerCase().includes(needle))

  const refreshOpts = [
    { label: "5s", value: 5000 },
    { label: "10s", value: 10000 },
    { label: "15s", value: 15000 },
    { label: "30s", value: 30000 },
    { label: "60s", value: 60000 },
  ]

  async function changePassword() {
    setPasswordBusy(true); setPasswordMsg("")
    try {
      await api("/api/auth/password", { method: "POST", body: JSON.stringify({ current: currentPassword, password: newPassword }) })
      setPasswordMsg("Password updated. Login again with new password.")
      setCurrentPassword(""); setNewPassword("")
      setTimeout(() => { fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => { window.location.reload() }) }, 1500)
    } catch (e) {
      setPasswordMsg((e as Error).message)
    } finally {
      setPasswordBusy(false)
    }
  }

  const pingOpts = [
    { label: "10s", value: 10000 },
    { label: "30s", value: 30000 },
    { label: "60s", value: 60000 },
    { label: "Off", value: 0 },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-end gap-3 border-b border-[var(--color-line)] px-6 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Studio</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-neutral-100">Settings</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">Tune interaction, appearance, navigation, and workspace runtime preferences.</p>
        </div>
        <div className="relative ml-auto w-64">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari setting…"
            className="h-8 border-[var(--color-line)] bg-[var(--color-bg)] pl-7 text-xs" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav className="flex w-48 shrink-0 flex-col gap-1 border-r border-[var(--color-line)] bg-[var(--color-surface)]/40 p-3">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              data-cuelume-hover="tick" data-cuelume-press data-cuelume-release
              className={`rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
                tab === t.id ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]" : "text-neutral-400 hover:bg-[var(--color-line)]/60 hover:text-neutral-200"
              }`}>
              {t.label}
            </button>
          ))}
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="w-full max-w-2xl">
            <TabsList className="hidden">{/* nav sidebar replaces visual tabs */}</TabsList>

            <TabsContent value="general" className="mt-0 space-y-6">
              {/* Sound effects — master + granular + volume */}
              {show("Sound Effects", "Audio", "Mute", "Click", "Hover", "Outcome") && (
                <div className="space-y-4 rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {sound.enabled ? <Volume2 className="size-4 text-[var(--color-accent)]" /> : <VolumeX className="size-4 text-neutral-500" />}
                      <div>
                        <p className="text-sm font-medium text-neutral-200">Sound Effects</p>
                        <p className="text-xs text-neutral-500">Mute all interface sounds globally</p>
                      </div>
                    </div>
                    <Switch checked={sound.enabled} onCheckedChange={sound.setEnabled} />
                  </div>
                  {sound.enabled && (
                    <div className="space-y-3">
                      {/* Volume */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-neutral-400">
                          <span>Volume</span>
                          <span>{Math.round(sound.volume * 100)}%</span>
                        </div>
                        <input type="range" min={0} max={1} step={0.05} value={sound.volume}
                          onChange={(e) => sound.setVolume(Number(e.target.value))}
                          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--color-line)] accent-[var(--color-accent)]" />
                      </div>
                      {/* Granular toggles */}
                      <div className="space-y-2 rounded-lg border border-[var(--color-line)]/40 bg-[var(--color-bg)]/40 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-neutral-500">Sound Categories</p>
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <Mouse className="size-3.5 text-neutral-500" />
                            <span className="text-xs text-neutral-300">Hover tick</span>
                          </div>
                          <Switch checked={sound.hover} onCheckedChange={sound.setHover} />
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <MousePointerClick className="size-3.5 text-neutral-500" />
                            <span className="text-xs text-neutral-300">Click / press</span>
                          </div>
                          <Switch checked={sound.click} onCheckedChange={sound.setClick} />
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <div className="flex items-center gap-2">
                            <Bell className="size-3.5 text-neutral-500" />
                            <span className="text-xs text-neutral-300">Outcome feedback</span>
                          </div>
                          <Switch checked={sound.outcome} onCheckedChange={sound.setOutcome} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {show("Auto Refresh", "Polling", "Board") && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="size-4 text-neutral-400" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Board Auto-Refresh</p>
                      <p className="text-xs text-neutral-500">Task polling interval</p>
                    </div>
                  </div>
                  <select value={refreshMs} onChange={(e) => setRefresh(Number(e.target.value))}
                    className="h-8 rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 text-xs text-neutral-200 outline-none focus:border-[var(--color-accent)]">
                    {refreshOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              {show("Password", "Security", "Login", "Auth") && (
                <div className="space-y-3 rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <p className="text-sm font-medium text-neutral-200">Password</p>
                  <p className="text-xs text-neutral-500">Session stays active for 14 days.</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                    <Input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-8 border-[var(--color-line)] bg-[var(--color-bg)] text-xs" />
                    <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-8 border-[var(--color-line)] bg-[var(--color-bg)] text-xs" />
                    <Button size="sm" disabled={passwordBusy || !currentPassword || !newPassword} onClick={changePassword} className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">Update</Button>
                  </div>
                  {passwordMsg && <p className="text-xs text-neutral-500">{passwordMsg}</p>}
                </div>
              )}

              {!show("Sound Effects", "Audio", "Mute", "Click", "Hover", "Outcome", "Auto Refresh", "Polling", "Board", "Password", "Security", "Login", "Auth") && (
                <p className="text-xs text-neutral-600">No match.</p>
              )}
            </TabsContent>

            <TabsContent value="appearance" className="mt-0 space-y-6">
              {show("Theme", "Appearance", "Light", "Dark") && (
                <div className="flex items-center justify-between rounded-lg border border-line/60 bg-surface/40 p-4">
                  <div className="flex items-center gap-3">
                    <LayoutGrid className="size-4 text-ink-3" />
                    <div>
                      <p className="text-sm font-medium text-ink-2">Theme</p>
                      <p className="text-xs text-ink-4">System mengikuti OS · dark default</p>
                    </div>
                  </div>
                  <select
                    value={theme}
                    onChange={(e) => setTheme(e.target.value as ThemePreference)}
                    className="h-8 rounded border border-line bg-inset px-2 text-xs text-ink-2 outline-none focus:border-accent"
                  >
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              )}

              {show("Compact", "Card", "Density") && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-center gap-3">
                    <LayoutGrid className="size-4 text-neutral-400" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Compact Task Cards</p>
                      <p className="text-xs text-neutral-500">Reduce padding & font size for denser board</p>
                    </div>
                  </div>
                  <Switch checked={compact} onCheckedChange={setCompact} />
                </div>
              )}

              {show("Sidebar", "Navigation", "Order", "Hide", "Show") && (
                <div className="space-y-3 rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Sidebar Navigation</p>
                      <p className="text-xs text-neutral-500">Atur urutan fitur dan sembunyikan halaman yang tidak dipakai.</p>
                    </div>
                    <button type="button" onClick={reset} title="Reset sidebar" aria-label="Reset sidebar navigation"
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--color-line)] px-2 py-1 text-[11px] text-neutral-400 hover:border-[var(--color-accent)]/60 hover:text-[var(--color-accent)]">
                      <RotateCcw className="size-3" /> Reset
                    </button>
                  </div>
                  <div className="space-y-1">
                    {items.map((item, index) => {
                      const Icon = item.icon
                      const visible = isVisible(item.id)
                      return (
                        <div key={item.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${visible ? "border-[var(--color-line)] bg-[var(--color-bg)]" : "border-[var(--color-line)]/60 bg-[var(--color-bg)]/40 opacity-65"}`}>
                          <GripVertical className="size-3.5 shrink-0 text-neutral-600" aria-hidden="true" />
                          <Icon className="size-3.5 shrink-0 text-neutral-400" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">{item.label}</span>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button type="button" onClick={() => move(item.id, -1)} disabled={index === 0} title={`Move ${item.label} up`} aria-label={`Move ${item.label} up`}
                              className="rounded p-1 text-neutral-500 hover:bg-[var(--color-line)] hover:text-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-25"><ArrowUp className="size-3.5" /></button>
                            <button type="button" onClick={() => move(item.id, 1)} disabled={index === items.length - 1} title={`Move ${item.label} down`} aria-label={`Move ${item.label} down`}
                              className="rounded p-1 text-neutral-500 hover:bg-[var(--color-line)] hover:text-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-25"><ArrowDown className="size-3.5" /></button>
                            <button type="button" onClick={() => toggle(item.id, !visible)} disabled={item.id === "board"} title={item.id === "board" ? "Task Board selalu tersedia" : visible ? `Hide ${item.label}` : `Show ${item.label}`} aria-label={item.id === "board" ? "Task Board always visible" : visible ? `Hide ${item.label}` : `Show ${item.label}`}
                              className="rounded p-1 text-neutral-500 hover:bg-[var(--color-line)] hover:text-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-40">{visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {!show("Theme", "Appearance", "Light", "Dark", "Compact", "Card", "Density", "Sidebar", "Navigation", "Order", "Hide", "Show") && (
                <p className="text-xs text-neutral-600">No match.</p>
              )}
            </TabsContent>

            <TabsContent value="notifications" className="mt-0 space-y-6">
              {show("Browser", "Notification", "Permission") && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-center gap-3">
                    <Bell className="size-4 text-neutral-400" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Browser Notifications</p>
                      <p className="text-xs text-neutral-500">Desktop notification saat task gagal atau masuk review</p>
                    </div>
                  </div>
                  <Switch checked={notifyBrowser} onCheckedChange={(v) => {
                    setNotifyBrowser(v)
                    if (v && typeof Notification !== "undefined" && Notification.permission === "default") {
                      void Notification.requestPermission()
                    }
                  }} />
                </div>
              )}
              {show("Failed", "Task", "Gagal") && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-center gap-3">
                    <XCircle className="size-4 text-neutral-400" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Notify on Failure</p>
                      <p className="text-xs text-neutral-500">Task gagal, stuck, atau lost</p>
                    </div>
                  </div>
                  <Switch checked={notifyFailure} onCheckedChange={setNotifyFailure} />
                </div>
              )}
              {show("Review", "Ready") && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-center gap-3">
                    <Eye className="size-4 text-neutral-400" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Notify on Review</p>
                      <p className="text-xs text-neutral-500">Task masuk kolom review, siap di-approve</p>
                    </div>
                  </div>
                  <Switch checked={notifyReview} onCheckedChange={setNotifyReview} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="boards" className="mt-0 space-y-6">
              <BoardArchiveManager />
            </TabsContent>

            <TabsContent value="advanced" className="mt-0 space-y-6">
              {show("Ping", "Workspace", "Heartbeat") && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-center gap-3">
                    <Activity className="size-4 text-neutral-400" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Workspace Ping Interval</p>
                      <p className="text-xs text-neutral-500">Auto-ping frequency for workspace health</p>
                    </div>
                  </div>
                  <select value={pingMs} onChange={(e) => setPing(Number(e.target.value))}
                    className="h-8 rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-2 text-xs text-neutral-200 outline-none focus:border-[var(--color-accent)]">
                    {pingOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              {show("Export", "Backup", "Data") && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
                  <div className="flex items-center gap-3">
                    <Download className="size-4 text-neutral-400" />
                    <div>
                      <p className="text-sm font-medium text-neutral-200">Export Settings</p>
                      <p className="text-xs text-neutral-500">Download all preferences as JSON</p>
                    </div>
                  </div>
                  <button onClick={() => {
                    const blob = new Blob([JSON.stringify({ soundOn: sound.enabled, volume: sound.volume, refreshMs, compact, pingMs }, null, 2)], { type: "application/json" })
                    const a = document.createElement("a")
                    a.href = URL.createObjectURL(blob)
                    a.download = "kanban-settings.json"
                    a.click()
                    URL.revokeObjectURL(a.href)
                  }}
                    data-cuelume-press data-cuelume-release
                    className="rounded border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-xs text-neutral-300 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]">
                    Export
                  </button>
                </div>
              )}

              {!show("Ping", "Workspace", "Heartbeat", "Export", "Backup", "Data") && (
                <p className="text-xs text-neutral-600">No match.</p>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  )
}

function BoardArchiveManager() {
  const qc = useQueryClient()
  const { data: boards = [] } = useQuery<Board[]>({ queryKey: ["boards"], queryFn: () => api<Board[]>("/api/boards") })
  const archived = boards.filter((b) => b.archived)
  const active = boards.filter((b) => !b.archived)

  function toggle(slug: string, next: boolean) {
    void archiveBoard(slug, next).then(() => qc.invalidateQueries({ queryKey: ["boards"] }))
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
      <div className="flex items-center gap-3">
        <Archive className="size-4 text-neutral-400" />
        <div>
          <p className="text-sm font-medium text-neutral-200">Board Archive</p>
          <p className="text-xs text-neutral-500">Archive or restore boards. Archived boards hidden dari board selector.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {active.map((b) => (
          <div key={b.slug} className="flex items-center justify-between rounded border border-[var(--color-line)]/40 bg-[var(--color-bg)] px-3 py-2">
            <span className="text-xs text-neutral-200">{b.icon ? `${b.icon} ` : ""}{b.name}</span>
            <Button size="sm" variant="outline" onClick={() => toggle(b.slug, true)} className="gap-1 border-[var(--color-line)] text-neutral-400 hover:text-red-400">
              <Archive className="size-3" /> Archive
            </Button>
          </div>
        ))}
        {archived.length > 0 && (
          <>
            <p className="pt-2 text-[10px] uppercase tracking-wider text-neutral-600">Archived</p>
            {archived.map((b) => (
              <div key={b.slug} className="flex items-center justify-between rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                <span className="text-xs text-neutral-400">{b.icon ? `${b.icon} ` : ""}{b.name}</span>
                <Button size="sm" variant="outline" onClick={() => toggle(b.slug, false)} className="gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                  <ArchiveRestore className="size-3" /> Restore
                </Button>
              </div>
            ))}
          </>
        )}
        {boards.length === 0 && <p className="text-xs text-neutral-600">No boards.</p>}
      </div>
    </div>
  )
}
