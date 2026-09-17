import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AppWindow, Brain, Database, Expand, GitPullRequest, Kanban, Laptop, Minimize2, Network, Radio, Search, Server, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react"
import { NODES, EDGES, type FlowNodeId, type Point } from "./layout"
import { elbowPath, elbowPathV, pathLength } from "./elbow"
import { TravelingDot } from "./TravelingDot"
import { useFlowTasks, type FlowStage, type FlowTask } from "./useFlowTasks"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CARD_W = 188
const CARD_H = 52
const GRAPH_W = 1360
const GRAPH_H = 700
const MINIMAP_W = 176
const MINIMAP_H = 112
const POS: Record<FlowNodeId, Point> = {
  kanban: { x: 120, y: 350 }, orchestrator: { x: 400, y: 160 }, dispatcher: { x: 400, y: 350 }, memory: { x: 400, y: 540 },
  "node-agent-server": { x: 680, y: 350 }, tailscale: { x: 960, y: 350 }, mac: { x: 1240, y: 230 }, windows: { x: 1240, y: 470 }, review: { x: 960, y: 600 },
}
const GROUP: Record<FlowNodeId, string> = {
  kanban: "TASK STATE", orchestrator: "CONTROL PLANE", dispatcher: "SCHEDULING", memory: "CONTEXT", "node-agent-server": "DISPATCH",
  tailscale: "NETWORK", mac: "EXECUTION", windows: "EXECUTION", review: "QUALITY GATE",
}
const LABEL: Record<FlowNodeId, string> = {
  kanban: "Kanban State", orchestrator: "Orchestrator", dispatcher: "Task Dispatcher", memory: "Memory + Prequest", "node-agent-server": "Node-agent Server",
  tailscale: "Tailscale Transport", mac: "Mac Worker", windows: "Windows Worker", review: "Review Gate",
}
const ICON: Record<FlowNodeId, typeof Brain> = { kanban: Kanban, orchestrator: Brain, dispatcher: Server, memory: Database, "node-agent-server": Server, tailscale: Radio, mac: Laptop, windows: AppWindow, review: GitPullRequest }
const COLORS: Record<FlowNodeId, string> = { kanban: "#8f83ff", orchestrator: "var(--color-accent)", dispatcher: "#f59e0b", memory: "#6366f1", "node-agent-server": "var(--color-warning)", tailscale: "#64b7ff", mac: "var(--color-success)", windows: "var(--color-success)", review: "var(--color-success)" }
const STAGE_COLOR: Record<FlowStage, string> = { dispatched: "var(--color-warning)", running: "var(--color-success)", done: "var(--color-success)", failed: "var(--color-danger)" }
type View = { x: number; y: number; scale: number }

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }

function anchor(a: FlowNodeId, b: FlowNodeId, positions: Record<FlowNodeId, Point>): [Point, Point, string] {
  const from = positions[a], to = positions[b]
  if (from.y === to.y) return [{ x: from.x + CARD_W / 2, y: from.y }, { x: to.x - CARD_W / 2, y: to.y }, elbowPath({ x: from.x + CARD_W / 2, y: from.y }, { x: to.x - CARD_W / 2, y: to.y }, (from.x + to.x) / 2)]
  if (from.x === to.x) return [{ x: from.x, y: from.y + CARD_H / 2 }, { x: to.x, y: to.y - CARD_H / 2 }, elbowPathV({ x: from.x, y: from.y + CARD_H / 2 }, { x: to.x, y: to.y - CARD_H / 2 }, (from.y + to.y) / 2)]
  const left = to.x > from.x
  const p1 = { x: from.x + (left ? CARD_W / 2 : -CARD_W / 2), y: from.y }
  const p2 = { x: to.x - (left ? CARD_W / 2 : -CARD_W / 2), y: to.y }
  return [p1, p2, elbowPath(p1, p2, (p1.x + p2.x) / 2)]
}

function stageFor(node: FlowNodeId, tasks: FlowTask[]) { return tasks.find((t) => (t.node_id === node || (t.stage === "dispatched" && node === "dispatcher") || ((t.stage === "done" || t.stage === "failed") && node === "review"))) }

export default function AgentMappingPage() {
  const { data: tasks = [], isError } = useFlowTasks()
  const [query, setQuery] = useState("")
  const [stage, setStage] = useState<FlowStage | "all">("all")
  const [selected, setSelected] = useState<FlowNodeId | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [overrides, setOverrides] = useState<Partial<Record<FlowNodeId, Point>>>({})
  const [dims, setDims] = useState({ w: 1000, h: 700 })
  const [pan, setPan] = useState<Point | null>(null)
  const [expanded, setExpanded] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const nodeDragRef = useRef<{ id: FlowNodeId; x: number; y: number; origin: Point } | null>(null)

  useLayoutEffect(() => {
    if (!canvasRef.current) return
    const ro = new ResizeObserver(([entry]) => setDims({ w: entry.contentRect.width, h: entry.contentRect.height }))
    ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const onFullscreenChange = () => setExpanded(document.fullscreenElement === canvasRef.current)
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])
  const fit = useMemo(() => { const scale = Math.min(1, (dims.w - 96) / GRAPH_W, (dims.h - 96) / GRAPH_H); return { scale: Math.max(.35, scale), x: (dims.w - GRAPH_W * scale) / 2, y: (dims.h - GRAPH_H * scale) / 2 } }, [dims])
  const v = view ?? fit
  const visibleTasks = useMemo(() => tasks.filter((t) => (stage === "all" || t.stage === stage) && (!query.trim() || `${t.title} ${t.task_id} ${t.board}`.toLowerCase().includes(query.toLowerCase()))), [tasks, stage, query])
  const zoomAt = useCallback((factor: number) => setView((base) => { const b = base ?? fit; const scale = Math.max(.35, Math.min(2, b.scale * factor)); const cx = dims.w / 2, cy = dims.h / 2; return { scale, x: cx - ((cx - b.x) / b.scale) * scale, y: cy - ((cy - b.y) / b.scale) * scale } }), [dims, fit])
  const onPointerDown = (e: React.PointerEvent) => { if (e.button !== 0) return; dragRef.current = { x: e.clientX, y: e.clientY, px: v.x, py: v.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
  const onPointerMove = (e: React.PointerEvent) => { const d = dragRef.current; if (d) setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }) }
  const onPointerUp = () => { if (pan) setView({ ...v, ...pan }); setPan(null); dragRef.current = null }
  const actualView = pan ? { ...v, ...pan } : v
  const minimapView = useMemo(() => {
    const left = clamp(-actualView.x / actualView.scale, 0, GRAPH_W)
    const top = clamp(-actualView.y / actualView.scale, 0, GRAPH_H)
    const right = clamp((-actualView.x + dims.w) / actualView.scale, 0, GRAPH_W)
    const bottom = clamp((-actualView.y + dims.h) / actualView.scale, 0, GRAPH_H)
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }, [actualView, dims])
  const positions = useMemo(() => ({ ...POS, ...overrides }), [overrides])
  const countFor = (id: FlowNodeId) => visibleTasks.filter((t) => t.node_id === id || (t.stage === "dispatched" && id === "dispatcher") || ((t.stage === "done" || t.stage === "failed") && id === "review")).length
  const selectedTask = selected ? stageFor(selected, visibleTasks) : undefined
  const activeEdgeKeys = new Set<string>(); for (const t of visibleTasks) { const chain = channelChain(t); for (let i = 0; i < chain.length - 1; i++) { activeEdgeKeys.add(`${chain[i]}-${chain[i + 1]}`); activeEdgeKeys.add(`${chain[i + 1]}-${chain[i]}`) } }
  const edgePaths = EDGES.map((edge) => ({ ...edge, path: anchor(edge.from, edge.to, positions)[2], active: activeEdgeKeys.has(`${edge.from}-${edge.to}`) }))
  const activeCount = tasks.filter((t) => t.stage === "dispatched" || t.stage === "running").length
  const onNodePointerDown = (e: React.PointerEvent, id: FlowNodeId) => {
    e.stopPropagation()
    nodeDragRef.current = { id, x: e.clientX, y: e.clientY, origin: positions[id] }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onNodePointerMove = (e: React.PointerEvent) => {
    const drag = nodeDragRef.current
    if (!drag) return
    setOverrides((current) => ({ ...current, [drag.id]: { x: drag.origin.x + (e.clientX - drag.x) / actualView.scale, y: drag.origin.y + (e.clientY - drag.y) / actualView.scale } }))
  }
  const onNodePointerUp = (e: React.PointerEvent, id: FlowNodeId) => {
    e.stopPropagation()
    nodeDragRef.current = null
    setSelected(id)
  }
  const toggleExpand = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else canvasRef.current?.requestFullscreen()
  }

  return <div className="relative flex min-h-0 flex-1 flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
    <div className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <div className="mr-auto flex items-center gap-2"><Network className="size-4 text-[var(--color-accent)]" /><div><h1 className="text-sm font-semibold tracking-tight">Flow Map</h1><p className="text-[10px] text-[var(--color-ink-3)]">Live task routing and execution map</p></div></div>
      <div className="relative w-full sm:w-48"><Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-[var(--color-ink-3)]" /><input aria-label="Search active tasks" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" className="h-8 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] pl-7 pr-2 text-xs outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]/70 focus:ring-1 focus:ring-[var(--color-accent)]/20" /></div>
      <Select value={stage} onValueChange={(value) => setStage(value as FlowStage | "all")}>
        <SelectTrigger size="sm" aria-label="Filter task stage" className="h-8 w-32 bg-[var(--color-bg)] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">All stages</SelectItem><SelectItem value="dispatched">Dispatched</SelectItem><SelectItem value="running">Running</SelectItem><SelectItem value="done">Done</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent>
      </Select>
      <span className="border-l border-[var(--color-line)] pl-3 font-mono text-[10px] text-[var(--color-ink-3)]">{activeCount} active</span><span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-300"><i className="size-1.5 rounded-full bg-current" /> connected</span>
    </div>
    {isError && <div className="border-b border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-4 py-2 text-xs text-[var(--color-danger)]">Flow Map could not load /api/flow/active.</div>}
    <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-hidden select-none bg-bg" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.12 : .89) } }} style={{ backgroundImage: "radial-gradient(color-mix(in srgb, var(--color-accent) 14%, transparent) 1px, transparent 1px)", backgroundSize: "18px 18px" }}>
      <div className="absolute left-0 top-0 z-10 origin-top-left" style={{ width: GRAPH_W, height: GRAPH_H, transform: `translate(${actualView.x}px, ${actualView.y}px) scale(${actualView.scale})` }}>
        <svg className="pointer-events-none absolute inset-0" width={GRAPH_W} height={GRAPH_H}>
          <defs><filter id="flow-edge-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter></defs>
          {edgePaths.map((e) => <g key={`${e.from}-${e.to}`}>
            <path d={e.path} fill="none" stroke={e.color} strokeWidth={e.active ? 18 : 9} opacity={e.active ? .5 : .3} filter="url(#flow-edge-blur)" />
            <path d={e.path} fill="none" stroke={e.color} strokeWidth={e.active ? 5 : 3.5} opacity={e.active ? 1 : .8} strokeLinecap="round" />
          </g>)}
        </svg>
        {visibleTasks.slice(0, 24).flatMap((t, i) => { const chain = channelChain(t); return chain.slice(0, -1).flatMap((from, hop) => { const to = chain[hop + 1]; const path = anchor(from, to, positions)[2]; return [0, 1, 2, 3, 4, 5, 6, 7].map((dot) => <TravelingDot key={`${t.task_id}-${from}-${to}-${dot}`} taskId={`${t.task_id}-${i}`} pathD={path} pathLen={pathLength(path)} phaseRatio={dot / 8} active />) }) })}
        {edgePaths.flatMap((edge, i) => [0, 1].map((phase) => <TravelingDot key={`idle-${edge.from}-${edge.to}-${phase}`} taskId={`idle-${i}`} pathD={edge.path} pathLen={pathLength(edge.path)} phaseRatio={(i * .21 + phase / 2) % 1} idle />))}
        {NODES.map((node) => { const Icon = ICON[node.id], task = stageFor(node.id, visibleTasks), color = task ? STAGE_COLOR[task.stage] : COLORS[node.id]; return <button key={node.id} type="button" onPointerDown={(e) => onNodePointerDown(e, node.id)} onPointerMove={onNodePointerMove} onPointerUp={(e) => onNodePointerUp(e, node.id)} onPointerCancel={() => { nodeDragRef.current = null }} className={`map-node glass-panel-raised absolute flex h-[52px] w-[188px] cursor-grab items-center gap-2 rounded-xl border bg-[var(--color-surface)] px-3 text-left shadow-[0_8px_24px_rgba(0,0,0,.18)] transition-colors duration-150 hover:bg-[var(--color-inset)] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${!visibleTasks.length ? "map-idle-card" : ""} ${selected === node.id ? "ring-1" : ""}`} style={{ left: positions[node.id].x - CARD_W / 2, top: positions[node.id].y - CARD_H / 2, borderColor: task ? color : selected === node.id ? color : "rgba(30,36,48,.9)", boxShadow: task ? `0 0 0 1px ${color}, 0 0 18px ${color}66, 0 8px 24px rgba(0,0,0,.22)` : selected === node.id ? `0 0 0 1px ${color}, 0 8px 24px rgba(0,0,0,.22)` : undefined }}><span className="absolute inset-y-2 left-0.5 w-0.5 rounded-full" style={{ background: color }} /><Icon className="ml-1 size-3.5 shrink-0" style={{ color }} /><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold">{LABEL[node.id]}</span><span className="block truncate font-mono text-[9px] text-[var(--color-ink-3)]">{task ? `${task.stage} · ${task.task_id}` : node.sub}</span></span>{countFor(node.id) > 0 && <span className="flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-black" style={{ background: color }}>{countFor(node.id)}</span>}</button> })}
        <div className="absolute left-16 top-[282px] font-mono text-[9px] uppercase tracking-[.16em] text-[#666960]">{visibleTasks.length ? "live route activity" : "no active task"}</div>
      </div>
      <div onPointerDown={(e) => e.stopPropagation()} className="absolute bottom-4 left-4 flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]/95 p-1 shadow-[0_8px_24px_rgba(0,0,0,.18)]"><button aria-label="Zoom out" title="Zoom out" className="map-control" onClick={() => zoomAt(.8)}><ZoomOut className="size-3.5" /></button><span className="w-10 text-center font-mono text-[10px] text-[var(--color-ink-3)]">{Math.round(actualView.scale * 100)}%</span><button aria-label="Zoom in" title="Zoom in" className="map-control" onClick={() => zoomAt(1.2)}><ZoomIn className="size-3.5" /></button><button aria-label="Fit graph" title="Fit graph" className="map-control" onClick={() => setView(null)}><Maximize2 className="size-3.5" /></button><button aria-label={expanded ? "Exit expanded map" : "Expand map"} title={expanded ? "Exit expanded map" : "Expand map"} className="map-control" onClick={toggleExpand}>{expanded ? <Minimize2 className="size-3.5" /> : <Expand className="size-3.5" />}</button></div>
      <button type="button" aria-label="Recenter map from minimap" title="Recenter map" onPointerDown={(e) => e.stopPropagation()} onClick={() => setView({ scale: actualView.scale, x: dims.w / 2 - (GRAPH_W / 2) * actualView.scale, y: dims.h / 2 - (GRAPH_H / 2) * actualView.scale })} className="absolute bottom-4 right-4 hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/95 p-2 text-left shadow-[0_8px_24px_rgba(0,0,0,.22)] md:block" style={{ width: MINIMAP_W, height: MINIMAP_H }}>
        <span className="absolute inset-2 block">
          <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} preserveAspectRatio="xMidYMid meet" aria-label="Map minimap" role="img" className="h-full w-full" onClick={(e) => {
            e.stopPropagation()
            const rect = e.currentTarget.getBoundingClientRect()
            const scale = Math.min(rect.width / GRAPH_W, rect.height / GRAPH_H)
            const offsetX = (rect.width - GRAPH_W * scale) / 2
            const offsetY = (rect.height - GRAPH_H * scale) / 2
            const gx = clamp((e.clientX - rect.left - offsetX) / scale, 0, GRAPH_W)
            const gy = clamp((e.clientY - rect.top - offsetY) / scale, 0, GRAPH_H)
            setView({ scale: actualView.scale, x: dims.w / 2 - gx * actualView.scale, y: dims.h / 2 - gy * actualView.scale })
          }}>
            {edgePaths.map((edge) => <path key={`${edge.from}-${edge.to}`} d={edge.path} fill="none" stroke="#2a3140" strokeWidth="7" strokeLinecap="round" />)}
            {NODES.map((n) => <rect key={n.id} x={positions[n.id].x - CARD_W / 2} y={positions[n.id].y - CARD_H / 2} width={CARD_W} height={CARD_H} rx="12" fill={COLORS[n.id]} opacity=".72" />)}
            <rect x={minimapView.left} y={minimapView.top} width={minimapView.width} height={minimapView.height} rx="8" fill="rgba(16,224,221,.08)" stroke="var(--color-accent)" strokeWidth="3" />
          </svg>
        </span>
        <span className="absolute bottom-1.5 right-2 font-mono text-[8px] tracking-[.14em] text-[var(--color-ink-4)]">MINIMAP</span>
      </button>
    </div>
    {selected && <aside className="absolute right-0 top-16 bottom-0 z-20 w-full max-w-[320px] border-l border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-2xl md:top-16"><button aria-label="Close inspector" title="Close inspector" onClick={() => setSelected(null)} className="absolute right-3 top-3 rounded-md p-1 text-[var(--color-ink-4)] hover:bg-[var(--color-inset)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"><X className="size-4" /></button><p className="font-mono text-[9px] uppercase tracking-[.16em]" style={{ color: COLORS[selected] }}>{GROUP[selected]}</p><h2 className="mt-2 text-base font-semibold tracking-tight">{LABEL[selected]}</h2><p className="mt-1 font-mono text-[10px] text-[var(--color-ink-3)]">{nodeMapSub(selected)}</p><div className="my-4 border-t border-[var(--color-line)]" /><p className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">Route activity</p>{selectedTask ? <div className="mt-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] p-3"><p className="truncate text-xs font-medium">{selectedTask.title}</p><p className="mt-2 font-mono text-[10px]" style={{ color: STAGE_COLOR[selectedTask.stage] }}>{selectedTask.stage}</p><p className="mt-1 truncate font-mono text-[10px] text-[var(--color-ink-3)]">{selectedTask.task_id}</p><p className="mt-3 text-[10px] text-[var(--color-ink-4)]">{new Date(selectedTask.updated_at).toLocaleString()}</p></div> : <p className="mt-2 text-xs text-[var(--color-ink-3)]">No matching task currently routed through this service.</p>}</aside>}
  </div>
}

function channelChain(t: FlowTask): FlowNodeId[] { return t.stage === "dispatched" ? ["kanban", "dispatcher", "node-agent-server"] : t.stage === "running" && (t.node_id === "mac" || t.node_id === "windows") ? ["kanban", "dispatcher", "node-agent-server", "tailscale", t.node_id as FlowNodeId] : t.stage === "running" ? ["kanban", "dispatcher", "node-agent-server"] : (t.stage === "done" || t.stage === "failed") && (t.node_id === "mac" || t.node_id === "windows") ? [t.node_id as FlowNodeId, "review", "kanban"] : (t.stage === "done" || t.stage === "failed") ? ["node-agent-server", "review", "kanban"] : [] }

function nodeMapSub(id: FlowNodeId) { return NODES.find((node) => node.id === id)?.sub ?? "Existing service" }
