import { useRef, useState } from "react"
import type { Profile, Workspace } from "../../api"
import { api } from "../../api"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sparkles, Loader2 } from "lucide-react"

function isRemoteWorkspace(w: Workspace): boolean {
  if (w.host && w.host !== "localhost" && w.host !== "127.0.0.1") return true
  if (/^[A-Za-z]:[\\/]/.test(w.path)) return true
  if (w.path.startsWith("/Users/")) return true
  return false
}

function isSshWorkspace(w: Workspace): boolean {
  return !!w.host && w.host !== "localhost" && w.host !== "127.0.0.1"
}

function isLive(w: Workspace): boolean {
  return w.status === "connected" || w.status === "local"
}

function defaultWorkspacePath(workspaces: Workspace[]): string {
  if (workspaces.length === 0) return ""
  const local = workspaces.find((w) => !isRemoteWorkspace(w))
  return local?.path ?? workspaces[0].path
}

export default function TaskDialog({
  workspaces,
  profiles,
  onClose,
  onCreate,
}: {
  workspaces: Workspace[]
  profiles: Profile[]
  onClose: () => void
  onCreate: (p: Record<string, unknown>) => Promise<unknown>
}) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [command, setCommand] = useState("")
  const [ws, setWs] = useState(() => defaultWorkspacePath(workspaces))
  const [assignee, setAssignee] = useState(profiles[0]?.name ?? "default")
  const [executor, setExecutor] = useState<"auto" | "hermes" | "codex" | "commandcode" | "shell">("auto")
  const [priority, setPriority] = useState("0")
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMode, setAiMode] = useState<"fast" | "deep" | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const improveCache = useRef(new Map<string, string>())

  async function improveBody(mode: "fast" | "deep") {
    if (!body.trim()) return
    const cacheKey = `${title.trim()}::${body.trim()}::${mode}`
    const cached = improveCache.current.get(cacheKey)
    if (cached) {
      setBody(cached)
      return
    }
    if (aiBusy) return
    setAiBusy(true); setAiMode(mode); setErr(null)
    const requestBody = body.trim()
    const requestTitle = title.trim()
    try {
      if (mode === "deep") {
        // Show deterministic structure while model works. User sees useful output now.
        const fast = await api<{ improved: string }>("/api/ai/improve-prompt", {
          method: "POST",
          body: JSON.stringify({ title: requestTitle, body: requestBody, mode: "fast" }),
        })
        setBody(fast.improved)
      }
      const res = await api<{ improved: string }>("/api/ai/improve-prompt", {
        method: "POST",
        body: JSON.stringify({ title: requestTitle, body: requestBody, mode }),
      })
      improveCache.current.set(cacheKey, res.improved)
      setBody(res.improved)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setAiBusy(false); setAiMode(null)
    }
  }

  async function submit() {
    if (!title.trim()) { setErr("Title required"); return }
    if (executor === "shell" && !command.trim()) { setErr("Command required for shell executor"); return }
    setBusy(true); setErr(null)
    try {
      await onCreate({
        title: title.trim(),
        body: body.trim(),
        ...(executor === "shell" ? { command: command.trim() } : {}),
        workspace_path: ws,
        assignee,
        executor,
        priority: Number(priority),
        status: "todo",
      })
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  const selCls = "w-full border-[var(--color-line)] bg-[var(--color-bg)] text-sm data-[size=default]:h-9"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass-panel-raised w-full max-w-lg rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">New Task</h2>
        <Label className="mt-3 block text-xs text-neutral-400">Title</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Judul task"
          className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)]" />
        <div className="mt-3 flex items-center justify-between">
          <Label className="text-xs text-neutral-400">Body</Label>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm"
              disabled={aiBusy || !body.trim()}
              onClick={() => improveBody("fast")}
              className="h-6 gap-1 border-[var(--color-accent)]/40 px-2 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
              title="Improve instan pakai template (tanpa AI call)"
            >
              <Sparkles className="size-3" />
              Fast
            </Button>
            <Button
              variant="outline" size="sm"
              disabled={aiBusy || !body.trim()}
              onClick={() => improveBody("deep")}
              className="h-6 gap-1 border-[var(--color-line)] px-2 text-[11px] text-neutral-300 hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)]"
              title="Improve pakai AI model (lebih lambat, hasil lebih kontekstual)"
            >
              {aiMode === "deep" ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
              {aiMode === "deep" ? "Improving…" : "Deep"}
            </Button>
          </div>
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Deskripsi (opsional) — klik AI improve biar prompt-nya dirapikan"
          className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)] text-sm" />
        {executor === "shell" && <>
          <Label className="mt-3 block text-xs text-neutral-400">Shell Command</Label>
          <Textarea value={command} onChange={(e) => setCommand(e.target.value)} rows={4}
            placeholder="Command yang dieksekusi langsung di remote workspace"
            className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)] font-mono text-xs" />
          <p className="mt-1 text-[11px] text-neutral-500">Body jadi deskripsi. Command jadi satu-satunya input yang dijalankan.</p>
        </>}
        <Label className="mt-3 block text-xs text-neutral-400">Agent Profile</Label>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className={`mt-1 ${selCls}`}>
            <SelectValue placeholder="profile" />
          </SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
            {profiles.map((p) => (
              <SelectItem key={p.name} value={p.name} disabled={!p.valid} className="text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <Avatar className="size-4 shrink-0">
                    {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.name} />}
                    <AvatarFallback className="bg-[var(--color-inset)] text-[7px] text-[var(--color-accent)]">{p.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 truncate">{p.name}{p.model ? ` — ${p.model}` : ""}{p.active ? " (active)" : ""}{!p.valid ? " (broken config)" : ""}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Label className="mt-3 block text-xs text-neutral-400">Execution</Label>
        <Select value={executor} onValueChange={(v) => setExecutor(v as typeof executor)}>
          <SelectTrigger className={`mt-1 ${selCls}`}><SelectValue /></SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
            <SelectItem value="auto" className="text-sm">Auto (workspace policy)</SelectItem>
            <SelectItem value="hermes" className="text-sm">Hermes</SelectItem>
            <SelectItem value="codex" className="text-sm">Codex</SelectItem>
            <SelectItem value="commandcode" className="text-sm">Command Code</SelectItem>
            <SelectItem value="shell" className="text-sm">Shell command</SelectItem>
          </SelectContent>
        </Select>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <Label className="block text-xs text-neutral-400">Workspace</Label>
            <Select value={ws || "__scratch"} onValueChange={(v) => setWs(v === "__scratch" ? "" : v)}>
              <SelectTrigger className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                <SelectValue placeholder="workspace" />
              </SelectTrigger>
              <SelectContent className="max-w-[22rem] border-[var(--color-line)] bg-[var(--color-surface)]">
                {workspaces.map((w) => {
                  const ssh = isSshWorkspace(w)
                  const live = isLive(w)
                  const os = (w.os || "").toLowerCase()
                  const osLabel = os === "mac" ? "mac" : os === "windows" ? "win" : os === "linux" ? "linux" : ""
                  return (
                    <SelectItem key={w.id} value={w.path} className="text-sm" title={`${w.name} — ${w.path}${w.host ? ` (${w.host})` : ""}${w.status ? ` · ${w.status}` : ""}`}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        {live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" title={w.status === "local" ? "local" : `connected ${w.ping_ms != null ? Math.round(w.ping_ms) + "ms" : ""}`} />}
                        <span className="min-w-0 flex-1 truncate">{w.name}</span>
                        {ssh && <Badge variant="outline" className="shrink-0 border-violet-500/30 bg-violet-500/10 px-1 py-0 text-[9px] leading-none text-violet-300">ssh</Badge>}
                        {osLabel && <Badge variant="outline" className="shrink-0 border-[var(--color-line)] bg-[var(--color-bg)] px-1 py-0 text-[9px] leading-none text-neutral-400">{osLabel}</Badge>}
                      </span>
                    </SelectItem>
                  )
                })}
                <SelectItem value="__scratch" className="text-sm">(no workspace — scratch)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="block text-xs text-neutral-400">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className={`mt-1 ${selCls}`}>
                <SelectValue placeholder="priority" />
              </SelectTrigger>
              <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
                <SelectItem value="0" className="text-sm">0 — normal</SelectItem>
                <SelectItem value="1" className="text-sm">1</SelectItem>
                <SelectItem value="2" className="text-sm">2 — high</SelectItem>
                <SelectItem value="3" className="text-sm">3 — urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy} className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
            {busy ? "…" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  )
}
