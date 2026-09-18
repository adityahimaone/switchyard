import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { playOutcome } from "@/lib/sound"
import { api, downloadWorkspaceFileURL, listWorkspaceFiles, previewWorkspaceFile, saveWorkspaceFile, type PingPoint, type Workspace, type WorkspaceFile } from "@/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSettings } from "@/hooks/useSettings"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { FolderGit2, Plus, RefreshCw, ScrollText, Trash2, Pencil, Loader2, Monitor, Apple, Laptop, HardDrive, Radio } from "lucide-react"
import LoadingState from "@/components/LoadingState"
import { CodeGraphPanel } from "./CodeGraphPanel"

type WsStatus = "connected" | "unreachable" | "unknown" | "local"

const STATUS_STYLE: Record<WsStatus, { dot: string; text: string; label: string }> = {
  connected: { dot: "bg-emerald-400", text: "text-emerald-300", label: "connected" },
  unreachable: { dot: "bg-red-400", text: "text-red-300", label: "unreachable" },
  unknown: { dot: "bg-neutral-500", text: "text-neutral-400", label: "not pinged" },
  local: { dot: "bg-sky-400", text: "text-sky-300", label: "local" },
}

// known SSH hosts for the transport select in the form
const SSH_PRESETS: Record<string, { path: string; name: string; os: string }> = {
  "mac-tailscale": { path: "/Users/adityahimawan/Development", name: "Mac Dev", os: "mac" },
  "windows-tailscale": { path: "C:\\Users\\user", name: "Windows Dev", os: "windows" },
}

const OS_OPTIONS = [
  { value: "mac", label: "macOS" },
  { value: "windows", label: "Windows" },
  { value: "linux", label: "Linux" },
]

function platformBadge(w: Workspace): { label: string; Icon: typeof Monitor; tint: string } {
  const os = (w.os || "").toLowerCase()
  const path = (w.path || "").toLowerCase()
  const host = (w.host || "").toLowerCase()
  if (os === "windows" || host.includes("windows") || path.startsWith("c:\\") || path.includes(":\\")) {
    return { label: "windows", Icon: Laptop, tint: "border-sky-500/30 bg-sky-500/10 text-sky-300" }
  }
  if (os === "mac" || host.includes("mac") || path.startsWith("/users/aditya") || path.includes("/users/")) {
    return { label: "mac", Icon: Apple, tint: "border-neutral-700 bg-[var(--color-bg)] text-neutral-300" }
  }
  if (!host || host === "localhost" || host === "127.0.0.1" || os === "linux") {
    return { label: "vps", Icon: Monitor, tint: "border-[var(--color-line)] bg-[var(--color-inset)] text-[var(--color-ink-2)]" }
  }
  return { label: "linux", Icon: HardDrive, tint: "border-amber-500/30 bg-amber-500/10 text-amber-300" }
}

// EkgTrace: heart-rate monitor fed by REAL ping history. The trace scrolls
// left like a live monitor: latest point slides in at the right edge via
// transform transition when a new ping lands, older points shift left.
// Failing pings flatline at the baseline. A glowing accent dot rides the
// full path via CSS offset-path, 2.4s linear infinite sweep (ekg-sweep
// keyframes in index.css).
const EKG_W = 220 // fixed virtual width; scaled to container via viewBox

function EkgTrace({ points, live, ok, height = 64 }: { points: PingPoint[] | undefined; live: boolean; ok: boolean; height?: number }) {
  const pts = (points ?? []).slice(-30)
  const last = pts[pts.length - 1]
  // green monitor line; red monitor (border/bg/flatline) once pings exist but fail
  const offline = !ok && pts.length > 0
  const line = offline ? "var(--color-danger)" : "var(--color-success)"
  const dot = "var(--color-danger)"
  const BASE = height - 6, TOP = 6
  const [w, setW] = useState(EKG_W)
  const boxRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || EKG_W))
    ro.observe(el)
    setW(el.clientWidth || EKG_W)
    return () => ro.disconnect()
  }, [])

  // pad so the window is always 30 slots wide: old slots enter from the left
  const padded = pts.length < 30 ? [...Array<null>(30 - pts.length).fill(null), ...pts] : pts
  const good = pts.filter((p) => p.ok && p.ms != null).map((p) => p.ms!)
  const min = good.length ? Math.min(...good) : 0
  const max = good.length ? Math.max(...good) : 0
  const MID = (BASE + TOP) / 2
  const yOf = (p: PingPoint | null) => {
    // no good data at all -> dead-flat center line (never touching edges)
    if (!good.length) return MID
    if (!p) return MID // empty slot -> center
    if (!p.ok || p.ms == null) return MID // fail -> flatline center, not bottom
    if (max - min < 1) return MID // flat data -> center
    // clamp inside with a little head/foot margin so the line never clips
    const y = BASE - ((p.ms - min) / (max - min)) * (BASE - TOP)
    return Math.min(BASE - 2, Math.max(TOP + 2, y))
  }
  // drift left smoothly over the 30s window but clamp so the trace never
  // runs past the right edge (line cut off) — last point stays at x <= w.
  const slot = w / 29
  const [frac, setFrac] = useState(0)
  const lastAt = last?.at ?? 0
  useEffect(() => {
    setFrac(0)
    const iv = setInterval(() => {
      if (!lastAt) return
      const f = Math.min(1, (Date.now() / 1000 - lastAt) / 30)
      setFrac(f)
    }, 1000)
    return () => clearInterval(iv)
  }, [lastAt])

  const xOf = (i: number) => Math.min(w, i * slot + (1 - frac) * slot)
  // flat line when there's nothing interesting to draw (empty/quiet/failed)
  const allFlat = !good.length || (max - min < 1 && pts.every((p) => !p.ok))
  const d = allFlat
    ? `M0 ${MID.toFixed(1)} H${w.toFixed(1)}`
    : padded
        .map((p, i) => `${i ? "L" : "M"}${xOf(i).toFixed(1)} ${yOf(p).toFixed(1)}`)
        .join(" ")

  return (
    <div
      ref={boxRef}
      className={`ekg-monitor relative overflow-hidden rounded-md border bg-[var(--color-bg)] ${
        offline
          ? "ekg-monitor-offline border-[var(--color-danger)]/25 bg-[color-mix(in_srgb,var(--color-danger)_6%,var(--color-bg))] shadow-[inset_0_0_12px_var(--color-danger-tint)]"
          : "border-[var(--color-success)]/20" + (live ? " shadow-[inset_0_0_12px_var(--color-success-tint)]" : "")
      }`}
      style={{ height }}
      title={last
        ? `${last.ok ? "ok" : "fail"} ${last.ms != null ? Math.round(last.ms) + "ms" : ""} · ${good.length ? `${Math.round(min)}–${Math.round(max)}ms` : ""}`
        : "no pings yet"}
    >
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <path d={d} fill="none" stroke={line} strokeOpacity="0.82" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {live && (
        <span
          className="absolute left-0 top-0 size-[7px] rounded-full"
          style={{
            offsetPath: `path("${d}")`,
            offsetRotate: "0deg",
            background: dot,
            boxShadow: `0 0 6px 2px ${dot}99, 0 0 12px 4px ${dot}44`,
            animation: "ekg-sweep 2.4s linear infinite",
          }}
        />
      )}
      {!live && (
        <span className={`absolute inset-0 flex items-center justify-center text-[10px] ${pts.length ? "text-[var(--color-danger)]/80" : "text-neutral-600"}`}>
          {pts.length ? "offline" : "no pings yet"}
        </span>
      )}
    </div>
  )
}

function StatusChip({ ws }: { ws: Workspace }) {
  const s = STATUS_STYLE[(ws.status as WsStatus) ?? "unknown"] ?? STATUS_STYLE.unknown
  const live = ws.status === "connected" || ws.status === "local"
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[11px] ${s.text}`}
      style={{ background: "rgba(0,0,0,0.2)" }}>
      <span className={`size-2 rounded-full ${s.dot} ${live ? "animate-pulse" : ""}`} />
      {s.label}
      {ws.ping_ms != null && <span className="text-neutral-500">{Math.round(ws.ping_ms)}ms</span>}
    </span>
  )
}

function WorkspaceForm({
  initial,
  onClose,
  onSave,
}: {
  initial?: Workspace | null
  onClose: () => void
  onSave: (ws: Workspace) => Promise<unknown>
}) {
  const initialTransport = initial ? (initial.host ? "ssh" : "local") : "local"
  const [transport, setTransport] = useState(initialTransport)
  const [id, setId] = useState(initial?.id ?? "")
  const [name, setName] = useState(initial?.name ?? "")
  const [path, setPath] = useState(initial?.path ?? "")
  const [host, setHost] = useState(initial?.host ?? "")
  const [os, setOs] = useState(initial?.os ?? "")
  const [kind, setKind] = useState(initial?.kind ?? "dir")
  const [note, setNote] = useState(initial?.note ?? "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const editing = !!initial

  function pickTransport(v: string) {
    setTransport(v)
    if (v === "local") {
      setHost("")
      if (!editing) setOs("linux")
    } else if (!editing) {
      // prefill first preset host + its default path + OS
      const first = Object.entries(SSH_PRESETS)[0]
      setHost(first[0])
      setOs(first[1].os)
      if (!path.trim()) setPath(first[1].path)
    }
  }

  function pickHost(v: string) {
    setHost(v)
    const preset = SSH_PRESETS[v]
    if (preset) {
      setOs(preset.os)
      if (!editing && !path.trim()) setPath(preset.path)
    }
  }

  async function submit() {
    if (!id.trim()) { setErr("ID required"); return }
    if (!path.trim()) { setErr("Path required"); return }
    if (transport === "ssh" && !host.trim()) { setErr("SSH host required"); return }
    setBusy(true); setErr(null)
    try {
      await onSave({ id: id.trim().toLowerCase(), name: name.trim() || id.trim(), path: path.trim(), host: transport === "ssh" ? host.trim() : "", os, kind, note: note.trim() } as Workspace)
      onClose()
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  const inpCls = "border-[var(--color-line)] bg-[var(--color-bg)]"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">{editing ? `Edit workspace ${initial?.id}` : "New workspace"}</h2>
        {!editing && (
          <>
            <Label className="mt-3 block text-xs text-neutral-400">ID</Label>
            <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="mac-dev" className={`mt-1 ${inpCls}`} />
          </>
        )}
        <Label className="mt-3 block text-xs text-neutral-400">Transport</Label>
        <Select value={transport} onValueChange={pickTransport}>
          <SelectTrigger className={`mt-1 w-full text-sm data-[size=default]:h-9 ${inpCls}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
            <SelectItem value="local" className="text-sm">Local (VPS ini)</SelectItem>
            <SelectItem value="ssh" className="text-sm">SSH (remote host)</SelectItem>
          </SelectContent>
        </Select>
        {transport === "ssh" && (
          <>
            <Label className="mt-3 block text-xs text-neutral-400">SSH host</Label>
            <Select value={host} onValueChange={pickHost}>
              <SelectTrigger className={`mt-1 w-full text-sm data-[size=default]:h-9 ${inpCls}`}>
                <SelectValue placeholder="pilih host" />
              </SelectTrigger>
              <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
                {Object.keys(SSH_PRESETS).map((h) => (
                  <SelectItem key={h} value={h} className="text-sm">{h}</SelectItem>
                ))}
                {host && !SSH_PRESETS[host] && <SelectItem value={host} className="text-sm">{host}</SelectItem>}
              </SelectContent>
            </Select>
          </>
        )}
        <Label className="mt-3 block text-xs text-neutral-400">Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mac Dev" className={`mt-1 ${inpCls}`} />
        <Label className="mt-3 block text-xs text-neutral-400">OS</Label>
        <Select value={os || "__auto"} onValueChange={(v) => setOs(v === "__auto" ? "" : v)}>
          <SelectTrigger className={`mt-1 w-full text-sm data-[size=default]:h-9 ${inpCls}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
            {OS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
            ))}
            <SelectItem value="__auto" className="text-sm text-neutral-400">Auto-detect (dari host/path)</SelectItem>
          </SelectContent>
        </Select>
        <Label className="mt-3 block text-xs text-neutral-400">Path (di host)</Label>
        <Input value={path} onChange={(e) => setPath(e.target.value)}
          placeholder={transport === "ssh" ? SSH_PRESETS[host]?.path ?? "/Users/... atau C:\\..." : "/home/adityahimaone/apps"}
          className={`mt-1 ${inpCls}`} />
        <Label className="mt-3 block text-xs text-neutral-400">Prequest / constraints</Label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Tech stack, requirements, limitasi agent di workspace ini… (mis. 'Next.js 15 + Tailwind, no new deps, pnpm only')"
          className={`mt-1 min-h-0 resize-y text-sm ${inpCls}`}
        />
        <Label className="mt-3 block text-xs text-neutral-400">Kind</Label>
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className={`mt-1 w-full text-sm data-[size=default]:h-9 ${inpCls}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
            <SelectItem value="dir" className="text-sm">dir</SelectItem>
            <SelectItem value="git" className="text-sm">git</SelectItem>
            <SelectItem value="scratch" className="text-sm">scratch</SelectItem>
          </SelectContent>
        </Select>
        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={submit} className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
            {busy ? "…" : editing ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function LogsDialog({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const logs = useQuery({
    queryKey: ["ws-logs", ws.id],
    queryFn: () => api<string[]>(`/api/workspaces/${ws.id}/logs`),
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[70vh] w-full max-w-2xl flex-col rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Logs — {ws.name}</h2>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>✕</Button>
        </div>
        <Separator className="my-2" />
        <pre className="flex-1 overflow-auto whitespace-pre-wrap break-all rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-3 font-mono text-[11px] leading-relaxed text-neutral-300">
          {logs.isLoading ? "Loading…" : logs.data?.length ? logs.data.join("\n") : "No activity matched this workspace."}
        </pre>
      </div>
    </div>
  )
}


function FileBrowser({ ws }: { ws: Workspace }) {
  const [path, setPath] = useState(".")
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)
  const [draft, setDraft] = useState("")
  const files = useQuery({ queryKey: ["workspace-files", ws.id, path], queryFn: () => listWorkspaceFiles(ws.id, path) })
  const preview = useQuery({ queryKey: ["workspace-preview", ws.id, selected?.path], queryFn: () => previewWorkspaceFile(ws.id, selected!.path), enabled: !!selected && !selected.is_dir })
  useEffect(() => { if (preview.data?.body != null) setDraft(preview.data.body) }, [preview.data?.body])
  const save = useMutation({ mutationFn: () => saveWorkspaceFile(ws.id, selected!.path, draft), onSuccess: () => preview.refetch() })
  function open(file: WorkspaceFile) { if (file.is_dir) setPath(file.path); else { setSelected(file); setDraft("") } }
  return <div className="mt-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] p-2.5">
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] uppercase tracking-wider text-neutral-500">Files · {path}</span>{selected && <a className="text-[10px] text-[var(--color-accent)]" href={downloadWorkspaceFileURL(ws.id, selected.path)}>Download</a>}</div>
    <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,180px)_1fr]">
      <div className="max-h-40 space-y-0.5 overflow-auto">{path !== "." && <button className="block w-full truncate px-1 text-left text-[11px] text-neutral-500 hover:text-white" onClick={() => setPath(path.split("/").slice(0, -1).join("/") || ".")}>..</button>}{(files.data?.files ?? []).map((file) => <button key={file.path} className={`block w-full truncate rounded px-1 text-left text-[11px] ${selected?.path === file.path ? "bg-[var(--color-inset)] text-white" : "text-neutral-400 hover:bg-[var(--color-inset)]"}`} onClick={() => open(file)}>{file.is_dir ? "▸ " : "· "}{file.name}</button>)}{files.isError && <p className="text-[10px] text-red-300">{(files.error as Error).message}</p>}</div>
      <div className="min-w-0">{preview.data?.is_binary ? <p className="text-xs text-neutral-500">Binary file. Preview unavailable.</p> : selected ? <><Textarea value={preview.data?.body ?? draft} onChange={(e) => setDraft(e.target.value)} className="min-h-32 font-mono text-[11px]" placeholder="Loading preview…" /><div className="mt-1 flex justify-end"><Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !preview.data}>{save.isPending ? "Saving…" : "Save"}</Button></div></> : <p className="text-xs text-neutral-600">Select file to preview.</p>}</div>
    </div>
  </div>
}

export default function WorkspacesPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<{ open: boolean; edit: Workspace | null }>({ open: false, edit: null })
  const [logsFor, setLogsFor] = useState<Workspace | null>(null)
  const [pinging, setPinging] = useState<string | null>(null)
  const [codeGraphOpen, setCodeGraphOpen] = useState<Record<string, boolean>>({})
  const { pingMs } = useSettings()
  const [autoPing, setAutoPing] = useState(true)
  const pingingRef = useRef(false)

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<Workspace[]>("/api/workspaces"),
    refetchInterval: 60_000,
  })

  // background auto-ping: probe all workspaces every 30s without user trigger,
  // then merge statuses into the query cache
  useEffect(() => {
    if (!autoPing) return
    let stop = false
    const tick = async () => {
      if (stop || pingingRef.current || document.hidden) return
      pingingRef.current = true
      try {
        const updated = await api<Workspace[]>("/api/workspaces/ping", { method: "POST" })
        if (!stop) qc.setQueryData<Workspace[]>(["workspaces"], updated)
      } catch { /* keep stale */ }
      pingingRef.current = false
    }
    tick()
    const iv = setInterval(tick, pingMs > 0 ? pingMs : 60_000)
    return () => { stop = true; clearInterval(iv); pingingRef.current = false }
  }, [autoPing, pingMs, qc])

  const pingHistories = useQuery({
    queryKey: ["ws-ping-history"],
    queryFn: async () => {
      const ids = (workspaces.data ?? []).map((w) => w.id)
      const entries = await Promise.all(
        ids.map(async (id) => [id, await api<PingPoint[]>(`/api/workspaces/${id}/history`)] as const),
      )
      return Object.fromEntries(entries) as Record<string, PingPoint[]>
    },
    enabled: (workspaces.data?.length ?? 0) > 0,
    refetchInterval: 5_000,
  })

  const save = useMutation({
    mutationFn: (ws: Workspace) =>
      form.edit
        ? api(`/api/workspaces/${form.edit.id}`, { method: "PUT", body: JSON.stringify(ws) })
        : api("/api/workspaces", { method: "POST", body: JSON.stringify(ws) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  })
  const del = useMutation({
    mutationFn: (id: string) => api(`/api/workspaces/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  })

  async function pingOne(ws: Workspace) {
    setPinging(ws.id)
    try {
      const updated = await api<Workspace>(`/api/workspaces/${ws.id}/ping`)
      qc.setQueryData<Workspace[]>(["workspaces"], (old) =>
        old ? old.map((w) => (w.id === ws.id ? { ...w, ...updated } : w)) : old)
      qc.invalidateQueries({ queryKey: ["ws-ping-history"] })
      playOutcome(updated.status === "connected" ? "success" : "error")
    } catch { playOutcome("error") }
    setPinging(null)
  }

  async function pingAll() {
    setPinging("__all__")
    try {
      const updated = await api<Workspace[]>("/api/workspaces/ping", { method: "POST" })
      qc.setQueryData<Workspace[]>(["workspaces"], updated)
      qc.invalidateQueries({ queryKey: ["ws-ping-history"] })
      playOutcome(updated.every((w) => w.status === "connected" || w.status === "local") ? "success" : "error")
    } catch { playOutcome("error") }
    setPinging(null)
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Execution</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Workspaces</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">
            Sumber: <code className="text-neutral-400">~/.hermes/workspaces.yaml</code> — status ping live tiap kali lu buka halaman.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-neutral-400">
            {workspaces.data?.length ?? 0}
          </span>
          <div className="flex gap-2">
          <Button
            variant={autoPing ? "default" : "outline"} size="sm"
            onClick={() => setAutoPing((v) => !v)}
            className={autoPing ? "bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90" : ""}
            title="Auto ping semua workspace tiap 30 detik"
          >
            <Radio className={`size-3.5 ${autoPing ? "animate-pulse" : ""}`} /> Auto 30s
          </Button>
          <Button variant="outline" size="sm" onClick={pingAll} disabled={pinging != null}>
            <RefreshCw className={`size-3.5 ${pinging === "__all__" ? "animate-spin" : ""}`} /> Ping all
          </Button>
          <Button size="sm" onClick={() => setForm({ open: true, edit: null })} className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
            <Plus className="size-3.5" /> New workspace
          </Button>
          </div>
        </div>
      </div>

      {workspaces.isLoading ? (
        <LoadingState label="Memuat workspaces" />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(workspaces.data ?? []).map((ws) => {
            const plat = platformBadge(ws)
            const isSsh = !!ws.host && ws.host !== "localhost" && ws.host !== "127.0.0.1"
            const live = ws.status === "connected" || ws.status === "local"
            return (
            <Card key={ws.id} className="decorative-card border-[var(--color-line)] bg-[var(--color-surface)]">
              <CardContent className="p-3.5">
                <div className="flex items-start gap-2">
                  <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-inset)]">
                    <FolderGit2 className="size-4 text-[var(--color-accent)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="truncate text-sm font-semibold">{ws.name}</h3>
                      <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-neutral-500">{ws.id}</span>
                      {isSsh && (
                        <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-300">
                          ssh
                        </Badge>
                      )}
                      <Badge variant="outline" className={`gap-1 text-[10px] ${plat.tint}`}>
                        <plat.Icon className="size-3" /> {plat.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-400" title={ws.path}>{ws.path}</p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      host: <span className="font-mono">{ws.host || "localhost"}</span> · kind: {ws.kind}
                    </p>
                    {ws.note && (
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words rounded border border-[var(--color-line)]/60 bg-[var(--color-bg)] px-2 py-1 text-[10px] leading-relaxed text-neutral-400" title={ws.note}>
                        {ws.note}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <StatusChip ws={ws} />
                  {ws.status_message && (
                    <span className="max-w-48 truncate text-[10px] text-neutral-500" title={ws.status_message}>
                      {ws.status_message}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <EkgTrace points={pingHistories.data?.[ws.id]} live={live} ok={live} height={72} />
                </div>

                <CodeGraphPanel ws={ws} open={!!codeGraphOpen[ws.id]} onToggle={() => setCodeGraphOpen((old) => ({ ...old, [ws.id]: !old[ws.id] }))} />

                <FileBrowser ws={ws} />

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => pingOne(ws)} disabled={pinging != null}>
                    {pinging === ws.id ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Ping
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setLogsFor(ws)}>
                    <ScrollText className="size-3.5" /> Logs
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setForm({ open: true, edit: ws })}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="ml-auto border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    onClick={() => { if (confirm(`Delete workspace "${ws.name}"?`)) del.mutate(ws.id) }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                {del.isError && <p className="mt-2 text-xs text-red-400">{(del.error as Error).message}</p>}
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}

      {form.open && (
        <WorkspaceForm
          initial={form.edit}
          onClose={() => setForm({ open: false, edit: null })}
          onSave={save.mutateAsync}
        />
      )}
      {logsFor && <LogsDialog ws={logsFor} onClose={() => setLogsFor(null)} />}
    </div>
  )
}
