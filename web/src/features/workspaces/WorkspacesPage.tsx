import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { playOutcome } from "@/lib/sound"
import { api, downloadWorkspaceFileURL, listWorkspaceFiles, previewWorkspaceFile, saveWorkspaceFile, type PingPoint, type Workspace, type WorkspaceFile } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSettings } from "@/hooks/useSettings"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EntryCard } from "@/components/app/entry-card"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { DetailSheet } from "@/components/app/detail-sheet"
import { EmptyState } from "@/components/app/empty-state"
import { FilterBar, FilterChip } from "@/components/app/filter-bar"
import { PageHeader, SectionHeader } from "@/components/app/page-header"
import { cn } from "@/lib/utils"
import {
  Apple, ChevronRight, Download, FileCode2, Folder, FolderGit2, FolderOpen, HardDrive,
  Laptop, Loader2, Monitor, MoreHorizontal, Pencil, Plus, Radio, RefreshCw, ScrollText, Trash2,
} from "lucide-react"
import LoadingState from "@/components/feedback/loading-state"
import { CodeGraphPanel } from "./CodeGraphPanel"

type WsStatus = "connected" | "unreachable" | "unknown" | "local"

/**
 * Status is a lamp plus a label. The lamp shape carries the meaning: filled for
 * reachable, hollow for not-yet-pinged, so state survives colour blindness.
 */
const STATUS_STYLE: Record<WsStatus, { tone: string; label: string; filled: boolean }> = {
  connected: { tone: "text-success", label: "Connected", filled: true },
  // Local is a real state (this machine) but not a health signal, so it stays ink.
  local: { tone: "text-ink", label: "Local", filled: true },
  unreachable: { tone: "text-danger-text", label: "Unreachable", filled: true },
  unknown: { tone: "text-ink-3", label: "Not pinged", filled: false },
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

// Platform group order. "vps" is the local/loopback bucket platformBadge
// returns, so it needs its own group: the Go inferOS() calls the same hosts
// "linux", and filtering on ws.os directly would disagree with the badge.
const PLATFORM_ORDER = ["mac", "windows", "linux", "vps"] as const
type PlatformKey = (typeof PLATFORM_ORDER)[number] | "other"

const PLATFORM_META: Record<PlatformKey, { label: string; Icon: typeof Monitor }> = {
  mac: { label: "macOS", Icon: Apple },
  windows: { label: "Windows", Icon: Laptop },
  linux: { label: "Linux", Icon: HardDrive },
  vps: { label: "This VPS", Icon: Monitor },
  other: { label: "Other", Icon: HardDrive },
}

function platformBadge(w: Workspace): { label: string; Icon: typeof Monitor; tint: string } {
  const os = (w.os || "").toLowerCase()
  const path = (w.path || "").toLowerCase()
  const host = (w.host || "").toLowerCase()
  if (os === "windows" || host.includes("windows") || path.startsWith("c:\\") || path.includes(":\\")) {
    return { label: "windows", Icon: Laptop, tint: "border-sky-500/30 bg-sky-500/10 text-sky-300" }
  }
  if (os === "mac" || host.includes("mac") || path.startsWith("/users/aditya") || path.includes("/users/")) {
    return { label: "mac", Icon: Apple, tint: "border-[var(--color-line)] bg-[var(--color-bg)] text-ink-2" }
  }
  if (!host || host === "localhost" || host === "127.0.0.1" || os === "linux") {
    return { label: "vps", Icon: Monitor, tint: "border-[var(--color-line)] bg-[var(--color-inset)] text-[var(--color-ink-2)]" }
  }
  return { label: "linux", Icon: HardDrive, tint: "border-amber-500/30 bg-amber-500/10 text-amber-300" }
}

function platformKey(w: Workspace): PlatformKey {
  const label = platformBadge(w).label
  return (PLATFORM_ORDER as readonly string[]).includes(label) ? (label as PlatformKey) : "other"
}

// groupWorkspacesByPlatform buckets workspaces by the same label platformBadge
// renders, so the group header and the card badge can never disagree. Groups
// with no members are dropped, and PLATFORM_ORDER fixes the display order.
export function groupWorkspacesByPlatform(workspaces: Workspace[]): [PlatformKey, Workspace[]][] {
  const buckets = new Map<PlatformKey, Workspace[]>()
  for (const ws of workspaces) {
    const key = platformKey(ws)
    buckets.set(key, [...(buckets.get(key) ?? []), ws])
  }
  return PLATFORM_ORDER.filter((k) => (buckets.get(k)?.length ?? 0) > 0).map(
    (k) => [k, buckets.get(k) ?? []] as [PlatformKey, Workspace[]],
  )
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
  // A live workspace traces in ink; a failed one traces flat in danger. Green
  // is reserved for the confirmed `done` status, not for "the chart drew".
  const offline = !ok && pts.length > 0
  const line = offline ? "var(--c-danger)" : "var(--c-ink-3)"
  const dot = "var(--c-danger)"
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
      className={cn(
        "relative overflow-hidden rounded-control border bg-well",
        offline
          ? "border-danger/30 bg-danger-tint"
          : "border-line",
      )}
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
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center text-2xs",
            pts.length ? "text-danger-text" : "text-ink-3",
          )}
        >
          {pts.length ? "Unreachable" : "No pings yet"}
        </span>
      )}
    </div>
  )
}

function StatusChip({ ws }: { ws: Workspace }) {
  const s = STATUS_STYLE[(ws.status as WsStatus) ?? "unknown"] ?? STATUS_STYLE.unknown
  const live = ws.status === "connected" || ws.status === "local"
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", s.tone)}>
      <span
        aria-hidden
        className={cn(
          "relative inline-block size-2 shrink-0 rounded-full",
          s.filled ? "bg-current" : "border border-current",
        )}
      >
        {live && <span className="absolute inset-0 animate-lamp rounded-full bg-current" />}
      </span>
      {s.label}
      {ws.ping_ms != null && (
        <span className="text-ink-3 tabular">{Math.round(ws.ping_ms)}ms</span>
      )}
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

  return (
    <DetailSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={editing ? `Edit ${initial?.id}` : "New workspace"}
      description="A host that owns source code, and the directory agents work in."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => { e.preventDefault(); void submit() }}
      >
        {!editing && (
          <Field label="ID" htmlFor="ws-id">
            <Input
              id="ws-id" value={id} onChange={(e) => setId(e.target.value)}
              placeholder="mac-dev" autoFocus
            />
          </Field>
        )}
        <Field label="Transport" htmlFor="ws-transport">
          <Select value={transport} onValueChange={pickTransport}>
            <SelectTrigger id="ws-transport" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local (this machine)</SelectItem>
              <SelectItem value="ssh">SSH (remote host)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {transport === "ssh" && (
          <Field label="SSH host" htmlFor="ws-host">
            <Select value={host} onValueChange={pickHost}>
              <SelectTrigger id="ws-host" className="w-full">
                <SelectValue placeholder="Choose a host" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(SSH_PRESETS).map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
                {host && !SSH_PRESETS[host] && <SelectItem value={host}>{host}</SelectItem>}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Name" htmlFor="ws-name">
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mac Dev" />
        </Field>
        <Field label="Path" htmlFor="ws-path">
          <Input
            id="ws-path" value={path} onChange={(e) => setPath(e.target.value)}
            placeholder="/Users/you/dev/project" className="font-mono text-xs"
          />
        </Field>
        <Field label="OS" htmlFor="ws-os">
          <Select value={os} onValueChange={setOs}>
            <SelectTrigger id="ws-os" className="w-full">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {OS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Kind" htmlFor="ws-kind">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger id="ws-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dir">Directory</SelectItem>
              <SelectItem value="repo">Repository</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Note" htmlFor="ws-note">
          <Textarea
            id="ws-note" value={note} onChange={(e) => setNote(e.target.value)}
            rows={3} placeholder="Optional"
          />
        </Field>
        {err && <p className="text-sm text-danger-text" role="alert">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="signal" loading={busy}>
            {editing ? "Save changes" : "Add workspace"}
          </Button>
        </div>
      </form>
    </DetailSheet>
  )
}

function Field({
  label, htmlFor, children,
}: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function LogsDialog({ ws, onClose }: { ws: Workspace; onClose: () => void }) {
  const logs = useQuery({
    queryKey: ["ws-logs", ws.id],
    queryFn: () => api<string[]>(`/api/workspaces/${ws.id}/logs`),
  })
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Logs</DialogTitle>
          <DialogDescription className="font-mono text-2xs">{ws.name}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <pre className="max-h-[60vh] overflow-auto rounded-control border border-line bg-well p-3 font-mono text-2xs leading-relaxed whitespace-pre-wrap break-all text-ink-2">
            {logs.isLoading
              ? "Loading…"
              : logs.data?.length
                ? logs.data.join("\n")
                : "No activity for this workspace yet."}
          </pre>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}


function FileBrowser({ ws }: { ws: Workspace }) {
  const [openDialog, setOpenDialog] = useState(false)
  const [path, setPath] = useState(".")
  const [selected, setSelected] = useState<WorkspaceFile | null>(null)
  const [draft, setDraft] = useState("")
  const files = useQuery({ queryKey: ["workspace-files", ws.id, path], queryFn: () => listWorkspaceFiles(ws.id, path), enabled: openDialog })
  const preview = useQuery({ queryKey: ["workspace-preview", ws.id, selected?.path], queryFn: () => previewWorkspaceFile(ws.id, selected!.path), enabled: !!selected && !selected.is_dir })
  useEffect(() => { if (preview.data?.body != null) setDraft(preview.data.body) }, [preview.data?.body])
  useEffect(() => {
    if (!openDialog) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenDialog(false) }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openDialog])
  const save = useMutation({ mutationFn: () => saveWorkspaceFile(ws.id, selected!.path, draft), onSuccess: () => preview.refetch() })
  function open(file: WorkspaceFile) {
    if (file.is_dir) { setPath(file.path); setSelected(null) }
    else { setSelected(file); setDraft("") }
  }
  function parentPath() { return path.split(/[\\/]/).slice(0, -1).join("/") || "." }
  const entries = files.data?.files ?? []

  return (
    <>
      {/* Trigger row */}
      <div className="mt-2 flex items-center gap-2 rounded-control border border-line bg-surface p-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-well">
          <Folder className="size-3.5 text-ink-3" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">Files</p>
          <p className="truncate text-xs text-ink-3">Browse, preview, edit and download</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setOpenDialog(true)}>
          <FolderOpen className="size-3.5" /> Open
        </Button>
      </div>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-h-[min(860px,calc(100dvh-2.5rem))] max-w-5xl">
          <DialogHeader>
            <DialogTitle>{ws.name}</DialogTitle>
            <DialogDescription className="font-mono text-2xs">{ws.path}</DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">
            <div className="grid max-h-[min(720px,calc(100dvh-12rem))] grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,250px)_minmax(0,1fr)] md:overflow-hidden">
              <div className="min-h-0 border-b border-line bg-well p-3 md:overflow-y-auto md:border-r md:border-b-0" aria-label="File tree">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-2xs text-ink-3">{path}</span>
                  {files.isFetching && <Loader2 className="size-3 shrink-0 animate-spin text-ink-3" />}
                </div>
                <div className="space-y-0.5" role="tree" aria-label={`Files in ${ws.name}`}>
                  {path !== "." && (
                    <button
                      type="button"
                      role="treeitem"
                      onClick={() => setPath(parentPath())}
                      className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-left text-xs text-ink-3 outline-none hover:bg-raised hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/40"
                    >
                      <ChevronRight className="size-3 -rotate-180" aria-hidden />
                      <span>Parent folder</span>
                    </button>
                  )}
                  {entries.map((file) => (
                    <button
                      type="button"
                      role="treeitem"
                      key={file.path}
                      aria-selected={selected?.path === file.path}
                      onClick={() => open(file)}
                      className={cn(
                        "flex h-8 w-full min-w-0 items-center gap-2 rounded-control px-2 text-left text-xs outline-none",
                        "transition-colors focus-visible:ring-[3px] focus-visible:ring-focus/40",
                        selected?.path === file.path
                          ? "bg-accent-tint text-accent-text"
                          : "text-ink-3 hover:bg-raised hover:text-ink",
                      )}
                    >
                      {file.is_dir ? (
                        <Folder className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                      ) : (
                        <FileCode2 className="size-3.5 shrink-0 text-ink-4" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
                      {file.is_dir && <ChevronRight className="size-3 shrink-0 text-ink-4" aria-hidden />}
                    </button>
                  ))}
                  {files.isLoading && <p className="px-2 py-3 text-xs text-ink-3">Loading files…</p>}
                  {!files.isLoading && !entries.length && !files.isError && (
                    <p className="px-2 py-3 text-xs text-ink-3">This folder is empty.</p>
                  )}
                  {files.isError && (
                    <p className="break-words px-2 py-3 text-xs text-danger-text">
                      {(files.error as Error).message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-col p-3">
                <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-line pb-3">
                  <FileCode2 className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-mono text-2xs text-ink">
                    {selected?.path ?? "No file selected"}
                  </span>
                  {selected && !selected.is_dir && (
                    <a
                      href={downloadWorkspaceFileURL(ws.id, selected.path)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 text-xs text-accent hover:bg-accent-tint"
                    >
                      <Download className="size-3.5" aria-hidden /> Download
                    </a>
                  )}
                </div>
                <div className="min-h-0 flex-1 pt-3">
                  {preview.data?.is_binary ? (
                    <div className="flex h-full min-h-40 items-center justify-center rounded-control border border-dashed border-line text-xs text-ink-3">
                      Binary file, preview unavailable
                    </div>
                  ) : selected ? (
                    <div className="flex h-full min-h-64 flex-col gap-2">
                      <Textarea
                        value={preview.data?.body ?? draft}
                        onChange={(e) => setDraft(e.target.value)}
                        className="min-h-0 flex-1 resize-none font-mono text-2xs leading-relaxed"
                        placeholder="Loading preview…"
                      />
                      <div className="flex shrink-0 justify-end">
                        <Button
                          size="sm"
                          onClick={() => save.mutate()}
                          loading={save.isPending}
                          disabled={save.isPending || !preview.data}
                        >
                          Save changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-40 items-center justify-center rounded-control border border-dashed border-line text-xs text-ink-3">
                      Select a file to preview it.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function WorkspacesPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<{ open: boolean; edit: Workspace | null }>({ open: false, edit: null })
  const [logsFor, setLogsFor] = useState<Workspace | null>(null)
  const [pinging, setPinging] = useState<string | null>(null)
  const [codeGraphOpen, setCodeGraphOpen] = useState<Record<string, boolean>>({})
  const [platform, setPlatform] = useState<PlatformKey | "all">("all")
  const [q, setQ] = useState("")
  const [pendingDelete, setPendingDelete] = useState<Workspace | null>(null)
  const { pingMs } = useSettings()
  const [autoPing, setAutoPing] = useState(true)
  const pingingRef = useRef(false)

  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api<Workspace[]>("/api/workspaces"),
    refetchInterval: 60_000,
  })

  // Group by the platform the card badge already shows, so the section header
  // and the badge on each card can never disagree. "all" keeps every group.
  const allGroups = useMemo(() => groupWorkspacesByPlatform(workspaces.data ?? []), [workspaces.data])
  const platformGroups = useMemo(
    () => (platform === "all" ? allGroups : allGroups.filter(([key]) => key === platform)),
    [allGroups, platform],
  )
  const platformCounts = useMemo(() => {
    const counts = new Map<PlatformKey, number>()
    for (const [key, list] of allGroups) counts.set(key, list.length)
    return counts
  }, [allGroups])
  // Search narrows within the platform filter, so the two compose rather than
  // fighting. Grouping still runs on the full list so headers keep their counts.
  const needle = q.trim().toLowerCase()
  const shownGroups = useMemo(
    () =>
      platformGroups
        .map(([key, list]): [PlatformKey, Workspace[]] => [
          key,
          needle === ""
            ? list
            : list.filter(
                (w) =>
                  w.name.toLowerCase().includes(needle) ||
                  w.path.toLowerCase().includes(needle) ||
                  (w.host ?? "").toLowerCase().includes(needle),
              ),
        ])
        .filter(([, list]) => list.length > 0),
    [platformGroups, needle],
  )
  const shownList = useMemo(() => shownGroups.flatMap(([, list]) => list), [shownGroups])

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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Workspaces"
        description="Where agents run. Loaded from ~/.hermes/workspaces.yaml."
        actions={
          <>
            <Button
              variant={autoPing ? "secondary" : "outline"}
              size="sm"
              onClick={() => setAutoPing((v) => !v)}
              aria-pressed={autoPing}
              title="Ping every workspace on a timer"
            >
              <Radio className={cn("size-3.5", autoPing && "animate-lamp")} />
              Auto ping
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void pingAll()} loading={pinging === "__all__"}>
              <RefreshCw className="size-3.5" /> Ping all
            </Button>
            <Button variant="signal" size="sm" onClick={() => setForm({ open: true, edit: null })}>
              <Plus className="size-3.5" /> New workspace
            </Button>
          </>
        }
      >
        <FilterBar
          query={q}
          onQueryChange={setQ}
          placeholder="Search workspaces"
          shown={shownList.length}
          total={workspaces.data?.length ?? 0}
        >
          <FilterChip
            label="Platform"
            value={platform}
            onChange={(v) => setPlatform(v as PlatformKey | "all")}
            options={[
              { value: "all", label: `All (${workspaces.data?.length ?? 0})` },
              ...PLATFORM_ORDER.map((k) => ({
                value: k as string,
                label: `${PLATFORM_META[k].label} (${platformCounts.get(k) ?? 0})`,
              })),
            ]}
          />
        </FilterBar>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {workspaces.isLoading ? (
          <LoadingState label="Loading workspaces" />
        ) : workspaces.isError ? (
          <EmptyState
            title="Couldn't load workspaces"
            hint={(workspaces.error as Error).message}
            action={<Button variant="secondary" onClick={() => void workspaces.refetch()}>Retry</Button>}
          />
        ) : !shownList.length ? (
          <EmptyState
            title={
              (workspaces.data?.length ?? 0) > 0
                ? `No workspaces match "${q.trim()}"`
                : platform !== "all"
                  ? `No ${PLATFORM_META[platform]?.label ?? platform} workspaces`
                  : "No workspaces yet"
            }
            hint={
              (workspaces.data?.length ?? 0) > 0 || platform !== "all"
                ? undefined
                : "Add a host that owns your source code so agents can run there."
            }
            action={
              (workspaces.data?.length ?? 0) > 0 || platform !== "all" ? undefined : (
                <Button variant="signal" onClick={() => setForm({ open: true, edit: null })}>
                  New workspace
                </Button>
              )
            }
          />
        ) : (
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 p-4 md:p-6">
            {shownGroups.map(([key, list]) => {
              const meta = PLATFORM_META[key] ?? PLATFORM_META.other
              return (
                <section key={key} className="flex flex-col gap-3">
                  <SectionHeader
                    title={meta.label}
                    description={`${list.length} ${list.length === 1 ? "host" : "hosts"}`}
                  />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {list.map((ws) => (
                      <WorkspaceCard
                        key={ws.id}
                        ws={ws}
                        pingPoints={pingHistories.data?.[ws.id]}
                        pinging={pinging === ws.id}
                        anyPinging={pinging != null}
                        codeGraphOpen={!!codeGraphOpen[ws.id]}
                        onToggleCodeGraph={() => setCodeGraphOpen((old) => ({ ...old, [ws.id]: !old[ws.id] }))}
                        onPing={() => void pingOne(ws)}
                        onEdit={() => setForm({ open: true, edit: ws })}
                        onLogs={() => setLogsFor(ws)}
                        onDelete={() => setPendingDelete(ws)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete workspace"
        description={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? Agents running on this host lose their working directory. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete workspace"
        busy={del.isPending}
        onConfirm={() => {
          if (pendingDelete) del.mutate(pendingDelete.id)
        }}
      />

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

/**
 * One workspace. Platform, transport and OS are plain text meta rather than
 * three separately tinted badges: they are context, not state, and colouring
 * them put three competing hues on every card.
 */
function WorkspaceCard({
  ws,
  pingPoints,
  pinging,
  anyPinging,
  codeGraphOpen,
  onToggleCodeGraph,
  onPing,
  onEdit,
  onLogs,
  onDelete,
}: {
  ws: Workspace
  pingPoints?: PingPoint[]
  pinging: boolean
  anyPinging: boolean
  codeGraphOpen: boolean
  onToggleCodeGraph: () => void
  onPing: () => void
  onEdit: () => void
  onLogs: () => void
  onDelete: () => void
}) {
  const plat = platformBadge(ws)
  const isSsh = !!ws.host && ws.host !== "localhost" && ws.host !== "127.0.0.1"
  const live = ws.status === "connected" || ws.status === "local"

  return (
    <EntryCard density="identity" title={ws.name} state={<StatusChip ws={ws} />}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-well">
          <FolderGit2 className="size-4 text-ink-3" aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-xs text-ink-3">{plat.label} · {isSsh ? `ssh ${ws.host}` : "local"}</p>
      </div>

      {/* Path truncates from the left: the tail is the part you read. */}
      <p
        className="truncate text-right font-mono text-2xs text-ink-3"
        title={ws.path}
        style={{ direction: "rtl" }}
      >
        <span dir="ltr">{ws.path}</span>
      </p>

      {/* A failure message is worth showing in full. A healthy one is noise, so
          it stays in the tooltip. */}
      {ws.status_message && !live && (
        <p className="text-xs text-danger-text" title={ws.status_message}>
          {ws.status_message}
        </p>
      )}

      <EkgTrace points={pingPoints} live={live} ok={live} height={64} />

      <CodeGraphPanel ws={ws} open={codeGraphOpen} onToggle={onToggleCodeGraph} />
      <FileBrowser ws={ws} />

      <footer className="mt-1 flex flex-wrap items-center gap-1.5">
        <Button variant="secondary" size="sm" onClick={onPing} loading={anyPinging} disabled={anyPinging && !pinging}>
          <RefreshCw className="size-3.5" /> Ping
        </Button>
        <Button variant="secondary" size="sm" onClick={onLogs}>
          <ScrollText className="size-3.5" /> Logs
        </Button>
        <Button variant="secondary" size="sm" onClick={onEdit}>
          <Pencil className="size-3.5" /> Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${ws.name}`} className="ml-auto">
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDelete} className="text-danger-text focus:text-danger-text">
              <Trash2 className="size-3.5" /> Delete workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </footer>
    </EntryCard>
  )
}
