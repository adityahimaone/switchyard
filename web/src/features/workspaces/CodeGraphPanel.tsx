import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { play } from "cuelume"
import { api, codeGraphIndex, codeGraphJob, codeGraphReport, type CodeGraphEntry, type CodeGraphJob as CodeGraphJobData, type Workspace } from "@/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Network, ChevronDown, ChevronRight, RefreshCw, Loader2, EyeOff, Eye, FolderMinus, Plus, Folder, FolderOpen, FileCode2 } from "lucide-react"

const CG_STATE_STYLE: Record<string, { dot: string; label: string }> = {
  indexed: { dot: "bg-emerald-400", label: "indexed" },
  missing: { dot: "bg-amber-400", label: "missing" },
  unavailable: { dot: "bg-red-400", label: "unavailable" },
}

function cgRelative(ts: number | undefined): string {
  if (!ts) return ""
  const s = Math.floor(Date.now() / 1000 - ts)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

type CGTreeNode = {
  name: string
  path: string
  children: CGTreeNode[]
  app?: CodeGraphEntry
}

// Build a folder tree from relative app paths: gadjian/app -> gadjian/ -> app(leaf)
export function buildCodeGraphTree(apps: CodeGraphEntry[]): CGTreeNode[] {
  const roots: CGTreeNode[] = []
  const find = (nodes: CGTreeNode[], name: string): CGTreeNode | undefined => nodes.find((n) => n.name === name && !n.app)
  for (const app of apps) {
    // "." means workspace-root index — render as single leaf at top level (ponytail: map "." -> display name, upgrade path: dedicated root node type)
    if (app.path === ".") {
      roots.push({ name: app.name, path: ".", children: [], app })
      continue
    }
    const segs = app.path.split("/").filter(Boolean)
    let level = roots
    let prefix = ""
    for (let i = 0; i < segs.length; i++) {
      prefix = prefix ? `${prefix}/${segs[i]}` : segs[i]
      const isLeaf = i === segs.length - 1
      if (isLeaf) {
        const existing = find(level, segs[i])
        if (existing) {
          existing.app = app
        } else {
          level.push({ name: segs[i], path: prefix, children: [], app })
        }
        break
      }
      let node = find(level, segs[i])
      if (!node) {
        node = { name: segs[i], path: prefix, children: [] }
        level.push(node)
      }
      level = node.children
    }
  }
  const sortTree = (nodes: CGTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    for (const n of nodes) sortTree(n.children)
  }
  sortTree(roots)
  return roots
}

export function CodeGraphPanel({ ws, open, onToggle }: { ws: Workspace; open: boolean; onToggle: () => void }) {
  const qc = useQueryClient()
  const [jobs, setJobs] = useState<Record<string, CodeGraphJobData>>({})
  const [showHidden, setShowHidden] = useState(false)
  const [addingApp, setAddingApp] = useState(false)
  const [newAppPath, setNewAppPath] = useState("")
  const [addErr, setAddErr] = useState<string | null>(null)
  // collapsed branch names (prefix path); default: all expanded
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const report = useQuery({ queryKey: ["ws-codegraph", ws.id], queryFn: () => codeGraphReport(ws.id), enabled: true })

  useEffect(() => {
    const running = Object.values(jobs).filter((j) => j.state === "queued" || j.state === "running")
    if (!running.length) return
    const iv = setInterval(async () => {
      let changed = false
      const next: Record<string, CodeGraphJobData> = { ...jobs }
      for (const j of running) {
        try { const u = await codeGraphJob(ws.id, j.id); next[j.id] = u; if (u.state !== j.state) changed = true } catch { /* keep */ }
      }
      setJobs(next)
      if (changed && Object.values(next).some((j) => j.state === "done" || j.state === "failed")) qc.invalidateQueries({ queryKey: ["ws-codegraph", ws.id] })
    }, 2000)
    return () => clearInterval(iv)
  }, [jobs, ws.id, qc])

  const saveApps = useMutation({
    mutationFn: (next: Workspace) => api<Workspace>(`/api/workspaces/${ws.id}`, { method: "PUT", body: JSON.stringify(next) }),
    onSuccess: (updated) => {
      qc.setQueryData<Workspace[]>(["workspaces"], (old) => (old ? old.map((w) => (w.id === ws.id ? { ...w, ...updated } : w)) : old))
      qc.invalidateQueries({ queryKey: ["ws-codegraph", ws.id] })
    },
  })

  async function addApp() {
    const p = newAppPath.trim().replace(/\/+$/, "")
    if (!p) return
    if (p.startsWith("/") || p.includes("..") || p.includes("\\")) { setAddErr("Path must be relative, e.g. gadjian"); return }
    setAddErr(null)
    try {
      await saveApps.mutateAsync({ ...ws, codegraph_apps: [...(ws.codegraph_apps ?? []), { path: p, name: p.split("/").pop() ?? p }] })
      setNewAppPath(""); setAddingApp(false); play("success")
    } catch (e) { setAddErr((e as Error).message); play("error") }
  }

  async function hideApp(path: string, manual: boolean) {
    const nextHidden = manual ? ws.codegraph_hidden ?? [] : [...(ws.codegraph_hidden ?? []), path]
    const nextApps = manual ? (ws.codegraph_apps ?? []).filter((a) => a.path !== path) : ws.codegraph_apps
    await saveApps.mutateAsync({ ...ws, codegraph_apps: nextApps as never, codegraph_hidden: nextHidden as never })
    play("success")
  }

  async function restoreHidden(path: string) {
    const nextHidden = (ws.codegraph_hidden ?? []).filter((h) => h !== path)
    await saveApps.mutateAsync({ ...ws, codegraph_hidden: nextHidden as never }); play("success")
  }

  async function reindex(path: string) {
    try { const job = await codeGraphIndex(ws.id, path); setJobs((o) => ({ ...o, [job.id]: job })) }
    catch (e) { play("error"); setJobs((o) => ({ ...o, [`err_${Date.now()}`]: { id: `err`, path, state: "failed", message: (e as Error).message } })) }
  }

  const apps = report.data?.apps ?? []
  const hidden = report.data?.hidden ?? ws.codegraph_hidden ?? []
  const indexedCount = apps.filter((a) => a.status.state === "indexed").length
  const tree = useMemo(() => buildCodeGraphTree(apps), [apps])

  return (
    <div className="mt-3 rounded-md border border-[var(--color-line)]/70 bg-[var(--color-bg)]/40">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Network className="size-3.5 text-[var(--color-accent)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-300">CodeGraph</span>
        {apps.length > 0 && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
            {indexedCount}/{apps.length} indexed
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <span onClick={(e) => { e.stopPropagation(); report.refetch() }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.target as HTMLElement).click() } }} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${report.isFetching ? "text-neutral-400" : "text-neutral-400 hover:bg-[var(--color-surface)] hover:text-neutral-200"}`} title="Scan workspace for apps (depth 3)">
            <RefreshCw className={`size-3 ${report.isFetching ? "animate-spin" : ""}`} /> Scan
          </span>
          <ChevronDown className={`size-3.5 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--color-line)]/60 px-3 py-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] text-neutral-500">folder tree · only folders with own .codegraph index are listed · auto-scan depth 3</span>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] text-neutral-400" onClick={() => report.refetch()} disabled={report.isFetching} title="Rescan workspace (depth 3)">
              <RefreshCw className={`size-3 ${report.isFetching ? "animate-spin" : ""}`} /> Rescan
            </Button>
          </div>
          {report.isLoading ? (
            <p className="py-1 text-[11px] text-neutral-500">Scanning…</p>
          ) : report.isError ? (
            <p className="py-1 text-[11px] text-red-400">{(report.error as Error).message}</p>
          ) : tree.length === 0 ? (
            <p className="py-1 text-[11px] text-neutral-500">No indexed app detected. Add app folder.</p>
          ) : (
            <div className="cg-tree" role="tree" aria-label={`CodeGraph indexes in ${ws.name || ws.id}`}>
              <CGTreeBranch nodes={tree} depth={0} collapsed={collapsed} jobs={jobs} onToggleCollapse={(path) => setCollapsed((o) => ({ ...o, [path]: !o[path] }))} onReindex={reindex} onHide={hideApp} keyRoot={ws.id} />
            </div>
          )}
          {hidden.length > 0 && (
            <div className="mt-2">
              <button type="button" className="text-[10px] text-neutral-500 hover:text-neutral-300" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? "▾" : "▸"} {hidden.length} hidden app{hidden.length > 1 ? "s" : ""}
              </button>
              {showHidden && (
                <ul className="mt-1 space-y-1">
                  {hidden.map((h) => (
                    <li key={h} className="flex items-center gap-2 text-[11px] text-neutral-500">
                      <FolderMinus className="size-3" />
                      <span className="font-mono">{h}</span>
                      <Button variant="ghost" size="sm" className="ml-auto h-6 px-1.5 text-[10px]" onClick={() => restoreHidden(h)}>
                        <Eye className="size-3" /> restore
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {addingApp ? (
            <div className="mt-2 flex items-center gap-1.5">
              <Input value={newAppPath} onChange={(e) => setNewAppPath(e.target.value)} placeholder="relative/path" className="h-7 text-[11px]" autoFocus onKeyDown={(e) => { if (e.key === "Enter") addApp(); if (e.key === "Escape") { setAddingApp(false); setAddErr(null) } }} />
              <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={addApp} disabled={saveApps.isPending}>Add</Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { setAddingApp(false); setAddErr(null) }}>✕</Button>
              {addErr && <span className="text-[10px] text-red-400">{addErr}</span>}
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="mt-1 h-6 px-1.5 text-[10px] text-neutral-400" onClick={() => setAddingApp(true)}>
              <Plus className="size-3" /> Add app folder
            </Button>
          )}
          {report.isFetching && <p className="mt-1 text-[10px] text-neutral-600">refreshing…</p>}
        </div>
      )}
    </div>
  )
}

const CG_FALLBACK = CG_STATE_STYLE.unavailable

function CGTreeBranch({ nodes, depth, collapsed, jobs, onToggleCollapse, onReindex, onHide, keyRoot }: {
  nodes: CGTreeNode[]
  depth: number
  collapsed: Record<string, boolean>
  jobs: Record<string, CodeGraphJobData>
  onToggleCollapse: (path: string) => void
  onReindex: (path: string) => void
  onHide: (path: string, manual: boolean) => void
  keyRoot: string
}) {
  return (
    <ul role={depth === 0 ? undefined : "group"} className="relative">
      {nodes.map((node, i) => {
        const isBranch = node.children.length > 0
        const isOpen = isBranch && !collapsed[node.path]
        // waterfall: each visible row falls in sequence, per depth level
        const delay = { animationDelay: `${(depth * 90 + i * 70)}ms` }
        return (
          <li key={`${keyRoot}:${node.path}`} role="treeitem" aria-expanded={isBranch ? isOpen : undefined} className="cg-tree-row" style={delay}>
            {isBranch ? (
              <button type="button" onClick={() => onToggleCollapse(node.path)} className="cg-tree-label group" style={{ paddingLeft: `${depth * 14}px` }}>
                <span className="cg-tree-indent" aria-hidden="true">{Array.from({ length: depth }).map((_, d) => <span key={d} className="cg-tree-guide" />)}</span>
                <ChevronRight className={`cg-tree-chevron transition-transform ${isOpen ? "rotate-90" : ""}`} />
                {isOpen ? <FolderOpen className="size-3.5 text-[var(--color-info)]" /> : <Folder className="size-3.5 text-[var(--color-info)]" />}
                <span className="truncate text-[11px] font-medium text-neutral-200" title={node.path}>{node.name}</span>
                <span className="cg-tree-count">{node.children.length}</span>
              </button>
            ) : node.app ? (
              <div className="cg-tree-label" style={{ paddingLeft: `${depth * 14}px` }}>
                <span className="cg-tree-indent" aria-hidden="true">{Array.from({ length: depth }).map((_, d) => <span key={d} className="cg-tree-guide" />)}</span>
                <span className="cg-tree-leaf-slot"><FileCode2 className="size-3.5 text-[var(--color-accent)]" /></span>
                <CodeGraphAppInline app={node.app} job={Object.values(jobs).find((j) => j.path === node.path && (j.state === "queued" || j.state === "running" || j.state === "failed"))} onReindex={() => onReindex(node.path)} onHide={() => onHide(node.path, !!node.app!.manual)} />
              </div>
            ) : null}
            {isBranch && isOpen && (
              <CGTreeBranch nodes={node.children} depth={depth + 1} collapsed={collapsed} jobs={jobs} onToggleCollapse={onToggleCollapse} onReindex={onReindex} onHide={onHide} keyRoot={keyRoot} />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CodeGraphAppInline({ app, job, onReindex, onHide }: { app: CodeGraphEntry; job?: CodeGraphJobData; onReindex: () => void; onHide: () => void }) {
  const st = CG_STATE_STYLE[app.status.state] ?? CG_FALLBACK
  const running = job?.state === "queued" || job?.state === "running"
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className={`size-1.5 shrink-0 rounded-full ${st.dot} ${running ? "animate-pulse" : ""}`} title={app.status.message ?? st.label} />
      <span className="truncate text-[11px] font-medium text-neutral-200" title={app.path}>{app.name}</span>
      <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px] text-neutral-500">{app.manual ? "manual" : "detected"}</Badge>
      <p className="ml-auto hidden truncate font-mono text-[10px] text-neutral-500 sm:block" title={app.status.message ?? ""}>
        {running ? `indexing… (${job?.state})` : st.label}
        {app.status.last_changed ? ` · ${cgRelative(app.status.last_changed)}` : ""}
        {app.status.state === "unavailable" && app.status.message ? ` · ${app.status.message}` : ""}
      </p>
      <Button variant="ghost" size="sm" className="h-6 shrink-0 px-1.5 text-[10px] text-neutral-400 hover:text-red-300" onClick={onHide} title="Hide app">
        <EyeOff className="size-3" />
      </Button>
      <Button variant="outline" size="sm" className="h-6 shrink-0 px-1.5 text-[10px]" onClick={onReindex} disabled={running} title={`codegraph ${app.status.indexed ? "index --force" : "init"} ${app.path}`}>
        {running ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Re-index
      </Button>
    </div>
  )
}
