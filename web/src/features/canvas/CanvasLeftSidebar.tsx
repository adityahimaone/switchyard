import { useState, useRef, useEffect } from "react"
import {
  Layers,
  Sparkles,
  Component,
  Code2,
  ChevronRight,
  ChevronDown,
  Hash,
  Type,
  Square,
  Circle,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Plus,
  Loader2,
  ArrowUp,
  ArrowDown,
  MousePointer,
  Hand,
  Undo2,
  Redo2,
  PanelLeftClose,
  PanelLeftOpen,
  Folder,
  Sliders,
  LayoutGrid,
  Ruler,
  PenTool,
  MoreHorizontal,
  Zap,
  Grid,
  Keyboard,
  X,
} from "lucide-react"
import type { PenDocument, PenNode } from "./penTypes"
import type { CanvasMessage } from "./CanvasPage"
import { cn } from "@/lib/utils"

export type LeftSidebarTab = "agent" | "layers" | "components" | "code"

interface CanvasLeftSidebarProps {
  isOpen: boolean
  onToggleOpen: () => void
  activeTab: LeftSidebarTab
  onSelectTab: (tab: LeftSidebarTab) => void
  activeTool: "pointer" | "frame" | "rectangle" | "ellipse" | "text" | "hand"
  onSelectTool: (tool: "pointer" | "frame" | "rectangle" | "ellipse" | "text" | "hand") => void
  document: PenDocument
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onUpdateNode: (updated: PenNode) => void
  onDeleteNode?: (id: string) => void
  onDuplicateNode?: (id: string) => void
  onReorderNode?: (id: string, direction: "forward" | "backward" | "front" | "back") => void
  onAddNode?: (parentOrRoot: "root" | string, type: "frame" | "rectangle" | "text") => void
  messages: CanvasMessage[]
  busy: boolean
  turnCount: number
  lastError?: string
  onSendMessage: (msg: string) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  activeModel?: string
  autoRulerEnabled?: boolean
  onToggleAutoRuler?: () => void
  onConvertToReact?: () => void
  onNewSession?: () => void
}

function getNodeIcon(node: PenNode) {
  if (node.type === "frame") return <Hash className="size-3.5 shrink-0 text-neutral-400" />
  if (node.type === "text") return <Type className="size-3.5 shrink-0 text-amber-400/90" />
  if (node.type === "circle" || node.type === "ellipse") return <Circle className="size-3.5 shrink-0 text-cyan-400/90" />
  if (node.type === "rectangle") return <Square className="size-3.5 shrink-0 text-indigo-400/90" />
  return <Folder className="size-3.5 shrink-0 text-neutral-400" />
}

interface TreeItemProps {
  node: PenNode
  depth: number
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onUpdateNode: (updated: PenNode) => void
  onDeleteNode?: (id: string) => void
  onDuplicateNode?: (id: string) => void
  onReorderNode?: (id: string, direction: "forward" | "backward" | "front" | "back") => void
}

function TreeItem({
  node,
  depth,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
  onReorderNode,
}: TreeItemProps) {
  const [collapsed, setCollapsed] = useState(false)
  const isSelected = selectedNodeId === node.id
  const hasChildren = Boolean(node.children && node.children.length > 0)
  const isHidden = node.opacity === 0

  return (
    <div className="select-none text-xs">
      <div
        className={cn(
          "group relative flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer transition-all duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.98]",
          isSelected
            ? "bg-[#223354] text-white border border-[#3b82f6]/50 shadow-xs font-medium"
            : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
        )}
        style={{ paddingLeft: `${Math.max(8, depth * 14 + 8)}px` }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectNode(node.id)
        }}
      >
        {/* Collapse chevron or leaf bullet */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setCollapsed((c) => !c)
            }}
            className="flex size-4 shrink-0 items-center justify-center rounded text-neutral-400 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}

        {/* Node Type Icon */}
        {getNodeIcon(node)}

        {/* Node Name */}
        <span className={cn("truncate flex-1 font-mono text-[11px]", isHidden && "line-through opacity-40")}>
          {node.name || node.type}
        </span>

        {/* Quick action buttons on hover / selection */}
        <div
          className={cn(
            "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity",
            isSelected && "opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Hide/Show */}
          <button
            type="button"
            onClick={() => onUpdateNode({ ...node, opacity: isHidden ? 1 : 0 })}
            className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
            title={isHidden ? "Show layer" : "Hide layer"}
          >
            {isHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
          </button>

          {/* Reorder Up */}
          {onReorderNode && (
            <button
              type="button"
              onClick={() => onReorderNode(node.id, "forward")}
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Bring forward (Cmd+])"
            >
              <ArrowUp className="size-3" />
            </button>
          )}

          {/* Reorder Down */}
          {onReorderNode && (
            <button
              type="button"
              onClick={() => onReorderNode(node.id, "backward")}
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Send backward (Cmd+[)"
            >
              <ArrowDown className="size-3" />
            </button>
          )}

          {/* Duplicate */}
          {onDuplicateNode && (
            <button
              type="button"
              onClick={() => onDuplicateNode(node.id)}
              className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Duplicate (Cmd+D)"
            >
              <Copy className="size-3" />
            </button>
          )}

          {/* Delete */}
          {onDeleteNode && (
            <button
              type="button"
              onClick={() => onDeleteNode(node.id)}
              className="p-1 rounded text-neutral-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Delete (Backspace)"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Children list */}
      {!collapsed && hasChildren && node.children && (
        <div className="space-y-0.5 mt-0.5">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onUpdateNode={onUpdateNode}
              onDeleteNode={onDeleteNode}
              onDuplicateNode={onDuplicateNode}
              onReorderNode={onReorderNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const PROMPT_SUGGESTIONS = [
  "Editorial portfolio for an avant-garde fashion photographer",
  "Vintage ticketing site for an independent arthouse cinema",
  "Bold magazine-style blog for urban skateboarding culture",
  "Playful ordering app for matcha cakes",
  "Audio docking station for ambient lo-fi soundscapes",
]

export function CanvasLeftSidebar({
  isOpen,
  onToggleOpen,
  activeTab,
  onSelectTab,
  activeTool,
  onSelectTool,
  document,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
  onReorderNode,
  onAddNode,
  messages,
  busy,
  turnCount,
  lastError,
  onSendMessage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  activeModel,
  autoRulerEnabled,
  onToggleAutoRuler,
  onConvertToReact,
  onNewSession,
}: CanvasLeftSidebarProps) {
  const [promptText, setPromptText] = useState("")
  const [layersSearch, setLayersSearch] = useState("")
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages, busy])

  // Find selected node name
  function findNode(nodes: PenNode[] | undefined, id: string | null): PenNode | null {
    if (!nodes || !id) return null
    for (const n of nodes) {
      if (n.id === id) return n
      const child = findNode(n.children, id)
      if (child) return child
    }
    return null
  }
  const selectedNode = findNode(document.children, selectedNodeId)

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = promptText.trim()
    if (!trimmed || busy) return

    let finalPrompt = trimmed
    if (selectedNode) {
      finalPrompt = `[Context: Selected layer "${selectedNode.name || selectedNode.type}" (id: ${selectedNode.id})]\n${trimmed}`
    }

    onSendMessage(finalPrompt)
    setPromptText("")
  }

  const handleInsertComponentTemplate = (kind: "dock" | "card") => {
    if (!onAddNode) return
    if (kind === "dock") {
      const id = "dock_" + Math.random().toString(36).slice(2, 8)
      const dockFrame: PenNode = {
        id,
        type: "frame",
        name: "Audio Dock",
        x: 100,
        y: 100,
        width: 320,
        height: 64,
        fill: "#181920",
        cornerRadius: 24,
        layout: "horizontal",
        padding: [12, 16, 12, 16],
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        effect: [{ type: "shadow", color: "rgba(0,0,0,0.5)", offset: { x: 0, y: 12 }, blur: 32, spread: 0 }],
        children: [
          {
            id: id + "_pill",
            type: "rectangle",
            name: "Status Indicator",
            width: 8,
            height: 8,
            fill: "#10b981",
            cornerRadius: 4,
          },
          {
            id: id + "_text",
            type: "text",
            name: "Playing Track",
            content: "Atmospheric Lo-Fi Beat",
            fontSize: 13,
            fontWeight: "bold",
            fill: "#ffffff",
          },
        ],
      }
      onUpdateNode(dockFrame)
      onSelectNode(id)
    } else {
      onAddNode(selectedNodeId || "root", "frame")
    }
  }

  return (
    <div className="absolute top-3 left-3 bottom-3 z-30 pointer-events-none flex gap-2.5 items-stretch select-none">
      {/* 1. FLOATING DRAWER CARD (Image 2 & 3: Agent, Layers, Assets, Code) */}
      <div
        className={cn(
          "flex flex-col rounded-[20px] border border-white/[0.08] bg-[#14151c]/95 dark:bg-[#14151c]/95 backdrop-blur-2xl shadow-2xl transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden",
          isOpen
            ? "w-[304px] sm:w-[320px] opacity-100 translate-x-0 pointer-events-auto"
            : "w-0 opacity-0 -translate-x-4 pointer-events-none border-transparent"
        )}
      >
        {/* Top Tab Bar: [ 💬 Agent ] [ ◫ Layers ] [ ❖ Assets ] [ 💻 Code ] */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.08] px-2.5 bg-black/20">
          <div className="flex items-center gap-1 rounded-xl bg-black/40 p-0.5 border border-white/5 w-full">
            <button
              type="button"
              onClick={() => onSelectTab("agent")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium transition-all active:scale-[0.98]",
                activeTab === "agent"
                  ? "bg-white/10 text-white shadow-xs font-semibold"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Sparkles className="size-3 text-cyan-400" />
              <span>Agent</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab("layers")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium transition-all active:scale-[0.98]",
                activeTab === "layers"
                  ? "bg-white/10 text-white shadow-xs font-semibold"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Layers className="size-3" />
              <span>Layers</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab("components")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium transition-all active:scale-[0.98]",
                activeTab === "components"
                  ? "bg-white/10 text-white shadow-xs font-semibold"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Component className="size-3" />
              <span>Assets</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (onConvertToReact) onConvertToReact()
                else onSelectTab("code")
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium transition-all active:scale-[0.98]",
                activeTab === "code"
                  ? "bg-white/10 text-white shadow-xs font-semibold"
                  : "text-neutral-400 hover:text-white"
              )}
              title="React Transpiler (0 Tokens)"
            >
              <Code2 className="size-3 text-indigo-400" />
              <span>Code</span>
            </button>
          </div>
        </div>

        {/* TAB 1: AGENT (Chat / Suggestions matching Image 2) */}
        {activeTab === "agent" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Model & New Action Bar */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2 bg-white/[0.02] text-xs">
              <div className="flex items-center gap-1.5 text-neutral-300 font-mono text-[11px]">
                <span>{activeModel || "DeepSeek V4.1 Flash"}</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-cyan-400">
                  turn {turnCount}
                </span>
              </div>

              {onNewSession && (
                <button
                  type="button"
                  onClick={onNewSession}
                  className="flex items-center gap-1 rounded-md bg-white/10 hover:bg-white/20 px-2 py-0.5 text-[11px] font-medium text-white transition-all active:scale-95"
                  title="Create New Agent Variation"
                >
                  <Plus className="size-3" />
                  <span>New</span>
                </button>
              )}
            </div>

            {/* Content area: Prompts list or Chat messages */}
            <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-xs">
              {messages.length === 0 ? (
                <div className="flex flex-col pt-2">
                  <h3 className="text-sm font-semibold text-white/90">Ask me to design anything</h3>
                  <p className="text-[11px] text-neutral-400 mt-0.5 mb-3">
                    or select one of these to see what is possible:
                  </p>

                  <div className="space-y-1.5">
                    {PROMPT_SUGGESTIONS.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setPromptText(item)
                        }}
                        className="w-full text-left rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/20 p-2.5 text-xs text-neutral-200 transition-all duration-150 active:scale-[0.98]"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-xl px-3 py-2 leading-relaxed text-xs whitespace-pre-wrap select-text",
                      m.role === "user"
                        ? "bg-blue-600/20 text-blue-200 border border-blue-500/30 ml-2"
                        : m.role === "system"
                        ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                        : "bg-white/[0.04] border border-white/10 text-neutral-200 mr-2"
                    )}
                  >
                    <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-neutral-400 font-semibold">
                      {m.role === "user" ? "You" : m.role === "system" ? "System" : activeModel || "Agent"}
                    </div>
                    {m.content}
                  </div>
                ))
              )}

              {busy && (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs text-neutral-300">
                  <Loader2 className="size-3.5 animate-spin text-cyan-400" />
                  <span>Designing canvas elements…</span>
                </div>
              )}

              {lastError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
                  {lastError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: LAYERS (Tree matching Image 3) */}
        {activeTab === "layers" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Root Document Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2 bg-white/[0.02]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Hash className="size-3.5 text-neutral-400" />
                <span>{document.name || "Mellow"}</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500">
                {document.children?.length || 0} nodes
              </span>
            </div>

            {/* Search filter input */}
            <div className="border-b border-white/[0.06] px-3 py-1.5">
              <input
                type="text"
                placeholder="Filter layers…"
                value={layersSearch}
                onChange={(e) => setLayersSearch(e.target.value)}
                className="w-full rounded-md bg-white/[0.05] px-2 py-1 text-[11px] text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Tree View */}
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {document.children && document.children.length > 0 ? (
                document.children.map((rootNode) => (
                  <TreeItem
                    key={rootNode.id}
                    node={rootNode}
                    depth={0}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={onSelectNode}
                    onUpdateNode={onUpdateNode}
                    onDeleteNode={onDeleteNode}
                    onDuplicateNode={onDuplicateNode}
                    onReorderNode={onReorderNode}
                  />
                ))
              ) : (
                <div className="p-4 text-center text-xs text-neutral-500">
                  No layers yet. Click Frame to begin.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: ASSETS / COMPONENTS */}
        {activeTab === "components" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 space-y-3">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Component Presets
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleInsertComponentTemplate("dock")}
                className="flex flex-col items-start gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.07] hover:border-white/20 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Sliders className="size-3.5 text-cyan-400" />
                  <span>Audio Dock</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Floating glass capsule with title and live status pill.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleInsertComponentTemplate("card")}
                className="flex flex-col items-start gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.07] hover:border-white/20 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <LayoutGrid className="size-3.5 text-indigo-400" />
                  <span>Mobile Screen Shell</span>
                </div>
                <p className="text-[11px] text-neutral-400">
                  Standard 390x844 iPhone viewport with auto-layout container.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: CODE VIEW */}
        {activeTab === "code" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">React Transpiler</span>
              <button
                type="button"
                onClick={onConvertToReact}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 text-xs font-medium"
              >
                Open Full Modal
              </button>
            </div>
            <pre className="flex-1 overflow-auto rounded-xl bg-black/50 border border-white/10 p-2.5 font-mono text-[10px] text-neutral-300">
              {JSON.stringify(document, null, 2)}
            </pre>
          </div>
        )}

        {/* DOCKED BOTTOM AI COMMAND CAPSULE (Matching Image 2 & Image 3) */}
        <div className="border-t border-white/[0.08] p-2 bg-black/40 backdrop-blur-md">
          <form
            onSubmit={handlePromptSubmit}
            className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-[#181922] p-2 shadow-inner"
          >
            {/* Selected Element Pill */}
            {selectedNode && (
              <div className="flex items-center justify-between bg-white/[0.06] rounded-lg px-2 py-0.5 text-[11px] text-neutral-300">
                <div className="flex items-center gap-1.5 truncate">
                  {getNodeIcon(selectedNode)}
                  <span className="truncate font-mono">{selectedNode.name || selectedNode.type}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectNode(null)}
                  className="text-neutral-400 hover:text-white p-0.5"
                  title="Deselect layer"
                >
                  <X className="size-3" />
                </button>
              </div>
            )}

            {/* Prompt input field */}
            <input
              type="text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={selectedNode ? `Modify ${selectedNode.name || "selected"}…` : "Design anything…"}
              disabled={busy}
              className="w-full bg-transparent px-1 py-1 text-xs text-white placeholder-neutral-500 outline-none"
            />

            {/* Capsule controls bottom row */}
            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <div className="flex items-center gap-1 text-neutral-400">
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                  title="Attach asset"
                >
                  <Plus className="size-3.5" />
                </button>

                <div className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono hover:bg-white/10 cursor-pointer">
                  <Zap className="size-3 text-amber-400" />
                  <span>1x</span>
                </div>

                <div className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono hover:bg-white/10 cursor-pointer">
                  <Grid className="size-3" />
                  <span>1x</span>
                </div>

                <span className="text-[10px] font-mono text-neutral-500 truncate max-w-20 hidden sm:inline">
                  {activeModel || "DeepSeek"}
                </span>
              </div>

              {/* Submit circular button */}
              <button
                type="submit"
                disabled={busy || !promptText.trim()}
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-black hover:bg-neutral-200 active:scale-95 transition-all disabled:opacity-30 shadow-md font-bold"
                title="Send instruction to agent"
              >
                <ArrowUp className="size-3.5 stroke-[2.5]" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* 2. FLOATING VERTICAL TOOL RAIL (Matching Image 1, 2, 3) */}
      <div className="pointer-events-auto flex flex-col items-center justify-between">
        {/* Top: Dedicated Circular Panel Toggle [ | ] */}
        <button
          type="button"
          onClick={onToggleOpen}
          className={cn(
            "flex size-9 items-center justify-center rounded-full border border-white/10 bg-[#16171f]/95 text-neutral-300 hover:text-white hover:bg-white/10 backdrop-blur-xl shadow-xl transition-all duration-150 active:scale-[0.94]",
            isOpen && "bg-white/10 text-white border-white/20"
          )}
          title={isOpen ? "Collapse Sidebar ([)" : "Expand Sidebar ([)"}
        >
          {isOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
        </button>

        {/* Middle: Floating Pill Tool Capsule */}
        <div className="flex flex-col items-center gap-1.5 rounded-full border border-white/10 bg-[#16171f]/95 backdrop-blur-xl py-2 px-1 shadow-2xl my-auto">
          {/* Cursor / Select Tool (V) */}
          <button
            type="button"
            onClick={() => onSelectTool("pointer")}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.96]",
              activeTool === "pointer"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Select tool (V)"
          >
            <MousePointer className="size-4" />
          </button>

          {/* Frame / Rectangle Tool (R) */}
          <button
            type="button"
            onClick={() => {
              onSelectTool("rectangle")
              if (onAddNode) onAddNode(selectedNodeId || "root", "rectangle")
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.96]",
              activeTool === "rectangle" || activeTool === "frame"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Rectangle / Frame tool (R)"
          >
            <Square className="size-4 stroke-[1.75]" />
          </button>

          {/* Pen / Vector Path Tool */}
          <button
            type="button"
            onClick={() => onSelectTool("frame")}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.96]",
              activeTool === "frame"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Pen / Path tool (P)"
          >
            <PenTool className="size-3.5" />
          </button>

          {/* Text Tool (T) */}
          <button
            type="button"
            onClick={() => {
              onSelectTool("text")
              if (onAddNode) onAddNode(selectedNodeId || "root", "text")
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.96]",
              activeTool === "text"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Text tool (T)"
          >
            <Type className="size-4" />
          </button>

          {/* Auto Ruler / Smart Guides Tool */}
          {onToggleAutoRuler && (
            <button
              type="button"
              onClick={onToggleAutoRuler}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.96]",
                autoRulerEnabled
                  ? "bg-[#ff5533]/20 text-[#ff5533] border border-[#ff5533]/40 shadow-xs font-semibold"
                  : "text-neutral-400 hover:text-white hover:bg-white/10"
              )}
              title={`Auto Ruler / Smart Guides (Shift+R) - ${autoRulerEnabled ? "Active" : "Off"}`}
            >
              <Ruler className="size-4" />
            </button>
          )}

          {/* Hand Pan Tool (H) */}
          <button
            type="button"
            onClick={() => onSelectTool("hand")}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.96]",
              activeTool === "hand"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Hand / Pan tool (H)"
          >
            <Hand className="size-4" />
          </button>

          <div className="h-px w-5 bg-white/10 my-0.5" />

          {/* Agent Shortcut Button */}
          <button
            type="button"
            onClick={() => {
              onSelectTab("agent")
              if (!isOpen) onToggleOpen()
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.96]",
              isOpen && activeTab === "agent"
                ? "bg-cyan-500/20 text-cyan-400 shadow-xs"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="AI Agent"
          >
            <Sparkles className="size-4 text-cyan-400" />
          </button>

          {/* Layers Shortcut Button */}
          <button
            type="button"
            onClick={() => {
              onSelectTab("layers")
              if (!isOpen) onToggleOpen()
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.96]",
              isOpen && activeTab === "layers"
                ? "bg-white/20 text-white shadow-xs"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Layers tree"
          >
            <Layers className="size-4" />
          </button>
        </div>

        {/* Bottom: Floating Circular More Options Button (···) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShortcutsModalOpen((v) => !v)}
            className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-[#16171f]/95 text-neutral-300 hover:text-white hover:bg-white/10 backdrop-blur-xl shadow-xl transition-all duration-150 active:scale-[0.94]"
            title="Shortcuts & Options"
          >
            <MoreHorizontal className="size-4" />
          </button>

          {/* Quick Shortcuts Popover */}
          {shortcutsModalOpen && (
            <div className="absolute left-11 bottom-0 w-52 rounded-2xl border border-white/10 bg-[#16171f]/95 p-3 shadow-2xl backdrop-blur-2xl z-40 text-xs text-neutral-300 space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-white/10 font-semibold text-white">
                <div className="flex items-center gap-1.5">
                  <Keyboard className="size-3.5 text-cyan-400" />
                  <span>Shortcuts</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShortcutsModalOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  <X className="size-3" />
                </button>
              </div>

              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between py-0.5">
                  <span className="text-neutral-400">Select</span>
                  <span className="rounded bg-white/10 px-1 text-white">V</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-neutral-400">Rectangle</span>
                  <span className="rounded bg-white/10 px-1 text-white">R</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-neutral-400">Text</span>
                  <span className="rounded bg-white/10 px-1 text-white">T</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-neutral-400">Hand / Pan</span>
                  <span className="rounded bg-white/10 px-1 text-white">H</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-neutral-400">Smart Guides</span>
                  <span className="rounded bg-white/10 px-1 text-white">⇧R</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-neutral-400">Undo / Redo</span>
                  <span className="rounded bg-white/10 px-1 text-white">⌘Z / ⌘⇧Z</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-neutral-400">Reorder Layer</span>
                  <span className="rounded bg-white/10 px-1 text-white">⌘] / ⌘[</span>
                </div>
              </div>
              {/* Undo & Redo Quick Triggers */}
              {(onUndo || onRedo) && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-white/10">
                  {onUndo && (
                    <button
                      type="button"
                      disabled={!canUndo}
                      onClick={onUndo}
                      className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white transition-all text-[11px]"
                    >
                      <Undo2 className="size-3" />
                      <span>Undo</span>
                    </button>
                  )}
                  {onRedo && (
                    <button
                      type="button"
                      disabled={!canRedo}
                      onClick={onRedo}
                      className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 text-white transition-all text-[11px]"
                    >
                      <Redo2 className="size-3" />
                      <span>Redo</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
