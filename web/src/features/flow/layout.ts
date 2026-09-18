import { elbowPath, pathLength } from "./elbow"
import type { FlowStage } from "./useFlowTasks"

export type FlowNodeId = "orchestrator" | "kanban" | "dispatcher" | "memory" | "node-agent-server" | "tailscale" | "mac" | "windows" | "review"
export interface Point { x: number; y: number }
export interface FlowTaskCard { task_id: string; title: string }
export interface LayoutNode { id: FlowNodeId; label: string; sub: string; row: number; col: number; x: number; y: number; hue: string; group: string }
export interface LayoutEdge { from: FlowNodeId; to: FlowNodeId; color: string }

const COL_W = 270
const ROW_H = 120
const PAD_X = 120
const PAD_Y = 70

export const NODES: LayoutNode[] = [
  { id: "orchestrator", label: "Orchestrator", sub: "intent + memory", row: 0, col: 1, x: PAD_X + COL_W * 1, y: PAD_Y + ROW_H * 0, hue: "#10e0dd", group: "Control Plane" },
  { id: "kanban", label: "Kanban", sub: "SQLite · task lifecycle", row: 1, col: 0, x: PAD_X + COL_W * 0, y: PAD_Y + ROW_H * 1, hue: "#9a5cff", group: "Task Intake" },
  { id: "dispatcher", label: "Dispatcher", sub: "claim · resolve route", row: 1, col: 1, x: PAD_X + COL_W * 1, y: PAD_Y + ROW_H * 1, hue: "#f59e0b", group: "Control Plane" },
  { id: "memory", label: "Memory", sub: "fact store", row: 1, col: 2, x: PAD_X + COL_W * 2, y: PAD_Y + ROW_H * 1, hue: "#6366f1", group: "Context" },
  { id: "node-agent-server", label: "Node-agent server", sub: "queue · auth · capability", row: 2, col: 1, x: PAD_X + COL_W * 1, y: PAD_Y + ROW_H * 2, hue: "#f09a2f", group: "Dispatch" },
  { id: "tailscale", label: "Tailscale", sub: "tailnet transport", row: 3, col: 1, x: PAD_X + COL_W * 1, y: PAD_Y + ROW_H * 3, hue: "#38bdf8", group: "Network" },
  { id: "mac", label: "Mac worker", sub: "launchd · workspace", row: 4, col: 0, x: PAD_X + COL_W * 0, y: PAD_Y + ROW_H * 4, hue: "#ec4899", group: "Execution" },
  { id: "windows", label: "Windows worker", sub: "scheduled task · workspace", row: 4, col: 2, x: PAD_X + COL_W * 2, y: PAD_Y + ROW_H * 4, hue: "#3b82f6", group: "Execution" },
  { id: "review", label: "Review gate", sub: "diff · approve · commit", row: 5, col: 1, x: PAD_X + COL_W * 1, y: PAD_Y + ROW_H * 5, hue: "#22c55e", group: "Quality Gate" },
]

export const EDGES: LayoutEdge[] = [
  { from: "orchestrator", to: "kanban", color: "#8f83ff" },
  { from: "orchestrator", to: "memory", color: "#6477ff" },
  { from: "kanban", to: "dispatcher", color: "#e5a84b" },
  { from: "dispatcher", to: "node-agent-server", color: "#e5a84b" },
  { from: "node-agent-server", to: "tailscale", color: "#43c6d9" },
  { from: "tailscale", to: "mac", color: "#5a9cff" },
  { from: "tailscale", to: "windows", color: "#e87baf" },
  { from: "mac", to: "review", color: "#57d18d" },
  { from: "windows", to: "review", color: "#2dd4bf" },
  { from: "review", to: "kanban", color: "#f2c94c" },
]

export const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n])) as Record<FlowNodeId, LayoutNode>
export const rowOf = (id: FlowNodeId) => nodeMap[id]?.row ?? 0

export function channelPath(stage: FlowStage, nodeId: string): FlowNodeId[] {
  if (stage === "dispatched") return ["kanban", "dispatcher", "node-agent-server"]
  if (stage === "running") {
    if (nodeId === "mac" || nodeId === "windows") return ["kanban", "dispatcher", "node-agent-server", "tailscale", nodeId]
    return ["kanban", "dispatcher", "node-agent-server"]
  }
  if (stage === "done" || stage === "failed") {
    if (nodeId === "mac" || nodeId === "windows") return [nodeId, "review", "kanban"]
    return ["node-agent-server", "review", "kanban"]
  }
  return []
}

export function joinedPath(ids: FlowNodeId[], anchors: (a: FlowNodeId, b: FlowNodeId) => [Point, Point]) {
  return ids.slice(0, -1).map((id, i) => {
    const [from, to] = anchors(id, ids[i + 1])
    return elbowPath(from, to, (from.x + to.x) / 2)
  }).join(" ")
}

export function channelDistances(ids: FlowNodeId[], anchors: (a: FlowNodeId, b: FlowNodeId) => [Point, Point]) {
  const out = [0]
  let total = 0
  for (let i = 0; i < ids.length - 1; i++) {
    const [from, to] = anchors(ids[i], ids[i + 1])
    total += pathLength(elbowPath(from, to, (from.x + to.x) / 2))
    out.push(total)
  }
  return out
}

export function stageNode(stage: FlowStage, nodeId: string): FlowNodeId | null {
  if (stage === "dispatched") return "dispatcher"
  if (stage === "running") return nodeId === "mac" || nodeId === "windows" ? nodeId : "node-agent-server"
  if (stage === "done" || stage === "failed") return nodeId === "mac" || nodeId === "windows" ? nodeId : "review"
  return null
}

export function taskCardPositions(tasks: FlowTaskCard[], center: Point): Point[] {
  const gap = 68
  const start = center.y - ((tasks.length - 1) * gap) / 2
  return tasks.map((_, index) => ({ x: center.x, y: start + index * gap }))
}
