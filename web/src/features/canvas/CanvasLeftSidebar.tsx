import { useState, useRef, useEffect } from "react"
import {
  Layers,
  Sparkles,
  Component,
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
} from "lucide-react"
import type { PenDocument, PenNode } from "./penTypes"
import type { CanvasMessage } from "./CanvasPage"
import { cn } from "@/lib/utils"

export type LeftSidebarTab = "agent" | "layers" | "components"

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
}

function getNodeIcon(node: PenNode) {
  if (node.type === "frame") return <Hash className="size-3.5 shrink-0 text-muted-foreground" />
  if (node.type === "text") return <Type className="size-3.5 shrink-0 text-amber-400/80" />
  if (node.type === "circle" || node.type === "ellipse") return <Circle className="size-3.5 shrink-0 text-cyan-400/80" />
  if (node.type === "rectangle") return <Square className="size-3.5 shrink-0 text-indigo-400/80" />
  return <Folder className="size-3.5 shrink-0 text-muted-foreground" />
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
    <div className="flex flex-col select-none">
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          onSelectNode(node.id)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation()
            onSelectNode(node.id)
          }
        }}
        className={cn(
          "group relative flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors cursor-pointer",
          isSelected
            ? "bg-blue-600/20 text-blue-400 border border-blue-500/40 font-medium shadow-xs"
            : "text-neutral-300 hover:bg-white/[0.04] border border-transparent hover:text-white"
        )}
        style={{ paddingLeft: `${Math.max(6, depth * 14 + 6)}px` }}
      >
        {/* Expand / Collapse Chevron */}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setCollapsed(!collapsed)
            }}
            className="flex size-4 items-center justify-center rounded text-neutral-400 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        ) : (
          <div className="size-4 shrink-0" />
        )}

        {/* Node Type Icon */}
        {getNodeIcon(node)}

        {/* Node Name */}
        <span className="truncate flex-1 font-mono text-[11px] tracking-tight">
          {node.name || node.text || node.id}
        </span>

        {/* Hover Quick Actions */}
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          {/* Toggle Visibility */}
          <button
            type="button"
            title={isHidden ? "Unhide layer" : "Hide layer"}
            onClick={(e) => {
              e.stopPropagation()
              onUpdateNode({ ...node, opacity: isHidden ? 1 : 0 })
            }}
            className="flex size-5 items-center justify-center rounded text-neutral-400 hover:text-white hover:bg-white/10"
          >
            {isHidden ? <EyeOff className="size-3 text-neutral-500" /> : <Eye className="size-3" />}
          </button>

          {/* Reorder Up/Down */}
          {onReorderNode && (
            <>
              <button
                type="button"
                title="Send Backward (Cmd+[)"
                onClick={(e) => {
                  e.stopPropagation()
                  onReorderNode(node.id, "backward")
                }}
                className="flex size-5 items-center justify-center rounded text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <ArrowDown className="size-2.5" />
              </button>
              <button
                type="button"
                title="Bring Forward (Cmd+])"
                onClick={(e) => {
                  e.stopPropagation()
                  onReorderNode(node.id, "forward")
                }}
                className="flex size-5 items-center justify-center rounded text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <ArrowUp className="size-2.5" />
              </button>
            </>
          )}

          {/* Duplicate */}
          {onDuplicateNode && (
            <button
              type="button"
              title="Duplicate (Cmd+D)"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicateNode(node.id)
              }}
              className="flex size-5 items-center justify-center rounded text-neutral-400 hover:text-white hover:bg-white/10"
            >
              <Copy className="size-2.5" />
            </button>
          )}

          {/* Delete */}
          {onDeleteNode && (
            <button
              type="button"
              title="Delete (Backspace)"
              onClick={(e) => {
                e.stopPropagation()
                onDeleteNode(node.id)
              }}
              className="flex size-5 items-center justify-center rounded text-neutral-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="size-2.5" />
            </button>
          )}
        </div>
      </div>

      {/* Children tree */}
      {hasChildren && !collapsed && (
        <div className="flex flex-col">
          {node.children!.map((child) => (
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
}: CanvasLeftSidebarProps) {
  const [promptText, setPromptText] = useState("")
  const [layersSearch, setLayersSearch] = useState("")
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === "agent" && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages, activeTab, busy])

  const handleSendPrompt = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!promptText.trim() || busy) return
    const text = promptText
    setPromptText("")
    onSendMessage(text)
  }

  // Sample component templates to insert
  const handleInsertComponentTemplate = (type: "card" | "dock" | "bento" | "navbar") => {
    if (!onAddNode) return
    const id = `tpl_${Date.now()}`
    if (type === "dock") {
      const dockFrame: PenNode = {
        id,
        type: "frame",
        name: "Audio Visualizer Dock",
        x: 60,
        y: 400,
        width: 320,
        height: 64,
        cornerRadius: 32,
        fill: "rgba(24, 25, 32, 0.85)",
        stroke: "rgba(255, 255, 255, 0.12)",
        strokeWidth: 1,
        layout: "horizontal",
        alignItems: "center",
        justifyContent: "space_between",
        padding: [12, 20, 12, 20],
        effects: "shadow",
        children: [
          {
            id: `${id}_title`,
            type: "text",
            name: "Dock Label",
            text: "Ambient Wave",
            content: "Ambient Wave",
            fontSize: 13,
            fontWeight: "500",
            fill: "#ffffff",
          },
          {
            id: `${id}_pill`,
            type: "frame",
            name: "Status Pill",
            width: 54,
            height: 24,
            cornerRadius: 12,
            fill: "rgba(16, 185, 129, 0.2)",
            stroke: "rgba(16, 185, 129, 0.4)",
            strokeWidth: 1,
            layout: "horizontal",
            alignItems: "center",
            justifyContent: "center",
            children: [
              {
                id: `${id}_pill_txt`,
                type: "text",
                name: "Pill Text",
                text: "Live",
                content: "Live",
                fontSize: 10,
                fontWeight: "600",
                fill: "#10b981",
              },
            ],
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
    <div className="relative z-30 flex h-full shrink-0 select-none items-stretch">
      {/* Expandable Drawer Panel (Agent, Layers, Components) */}
      <div
        className={cn(
          "flex flex-col border-r border-border/70 bg-[#0e0f14]/95 dark:bg-[#0e0f14]/95 backdrop-blur-xl transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden",
          isOpen ? "w-[264px] opacity-100 shadow-xl" : "w-0 opacity-0 pointer-events-none"
        )}
      >
        {/* Top Tab Bar matching Image 1: [ Agent ] [ Layers ] [ Components ] */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/40 px-2.5 bg-muted/20">
          <div className="flex items-center gap-1 rounded-xl bg-black/40 p-0.5 border border-white/5">
            <button
              type="button"
              onClick={() => onSelectTab("agent")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.98]",
                activeTab === "agent"
                  ? "bg-white/10 text-white shadow-xs font-semibold"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Sparkles className="size-3 text-accent-text" />
              <span>Agent</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab("layers")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.98]",
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
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all active:scale-[0.98]",
                activeTab === "components"
                  ? "bg-white/10 text-white shadow-xs font-semibold"
                  : "text-neutral-400 hover:text-white"
              )}
            >
              <Component className="size-3" />
              <span>Assets</span>
            </button>
          </div>
        </div>

        {/* TAB CONTENT: 1. LAYERS TREE (Matching Image 1) */}
        {activeTab === "layers" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Quick Actions & Search */}
            <div className="flex items-center justify-between border-b border-border/30 px-3 py-2 bg-muted/10 gap-2">
              <input
                type="text"
                placeholder="Filter layers…"
                value={layersSearch}
                onChange={(e) => setLayersSearch(e.target.value)}
                className="w-full rounded-md bg-white/5 px-2 py-1 text-[11px] text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-accent-text"
              />
              {onAddNode && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAddNode(selectedNodeId || "root", "frame")}
                    className="flex size-6 items-center justify-center rounded hover:bg-white/10 text-neutral-400 hover:text-white transition-colors"
                    title="Add Frame"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              )}
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

        {/* TAB CONTENT: 2. AGENT BRAINSTORM (Embedded chat) */}
        {activeTab === "agent" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Model & Turns Subheader */}
            <div className="flex items-center justify-between border-b border-border/30 px-3 py-2 bg-muted/10 text-[11px] text-neutral-400 font-mono">
              <span className="truncate max-w-36">{activeModel || "DeepSeek V4.1 Flash"}</span>
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-accent-text">
                turn {turnCount}
              </span>
            </div>

            {/* Messages Feed */}
            <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 text-xs">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-4 text-neutral-400">
                  <Sparkles className="size-8 text-accent-text/60 mb-2" />
                  <p className="font-semibold text-neutral-200 text-xs">AI Canvas Assistant</p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Describe layout adjustments, color tokens, or ask to generate fresh variations.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-xl px-3 py-2 leading-relaxed text-xs whitespace-pre-wrap select-text",
                      m.role === "user"
                        ? "bg-blue-600/20 text-blue-200 border border-blue-500/30 ml-3"
                        : m.role === "system"
                        ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                        : "bg-white/[0.04] border border-white/10 text-neutral-200 mr-2"
                    )}
                  >
                    <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-neutral-400 font-semibold">
                      {m.role}
                    </div>
                    {m.content}
                  </div>
                ))
              )}

              {busy && (
                <div className="flex items-center gap-2 text-xs text-neutral-400 py-2 font-mono">
                  <Loader2 className="size-3.5 animate-spin text-accent-text" />
                  <span>Agent is sketching layout…</span>
                </div>
              )}

              {lastError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
                  {lastError}
                </div>
              )}
            </div>

            {/* Quick Inspiration Prompts */}
            <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 border-t border-border/20 bg-muted/5 no-scrollbar">
              <button
                type="button"
                onClick={() => onSendMessage("Add frosted glass background and neon border")}
                className="shrink-0 rounded-full bg-white/5 hover:bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300 transition-colors"
              >
                ✨ Glassmorphism
              </button>
              <button
                type="button"
                onClick={() => onSendMessage("Refactor selected frame into 2-column bento grid")}
                className="shrink-0 rounded-full bg-white/5 hover:bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300 transition-colors"
              >
                🍱 Bento Grid
              </button>
            </div>

            {/* Prompt Input Form */}
            <form onSubmit={handleSendPrompt} className="flex gap-2 border-t border-border/30 p-2.5 bg-black/30">
              <input
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Ask AI to design or modify…"
                disabled={busy}
                className="flex-1 rounded-xl bg-white/5 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-accent-text border border-white/5"
              />
              <button
                type="submit"
                disabled={busy || !promptText.trim()}
                className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-accent-text text-black hover:opacity-90 active:scale-95 transition-all disabled:opacity-30"
              >
                <ArrowUp className="size-3.5 stroke-[2.5]" />
              </button>
            </form>
          </div>
        )}

        {/* TAB CONTENT: 3. COMPONENTS & TEMPLATES */}
        {activeTab === "components" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 space-y-3">
            <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              Ready-to-use Elements
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => handleInsertComponentTemplate("dock")}
                className="flex flex-col items-start gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:bg-white/[0.07] hover:border-white/20 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Sliders className="size-3.5 text-accent-text" />
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
      </div>

      {/* Vertical Tool Rail (Matching Image 1 & Image 2) */}
      <div className="flex w-11 flex-col items-center justify-between border-r border-border/70 bg-[#121319]/90 backdrop-blur-xl py-3 px-1.5 z-30">
        {/* Top: Dedicated Collapse/Expand Toggle + Drawing Tools */}
        <div className="flex flex-col items-center gap-2 w-full">
          {/* Dedicated Self-Sidebar Toggle matching Image 1 & Image 2 */}
          <button
            type="button"
            onClick={onToggleOpen}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl transition-all active:scale-[0.96]",
              isOpen ? "text-neutral-300 hover:text-white hover:bg-white/10" : "bg-white/10 text-white shadow-xs"
            )}
            title={isOpen ? "Collapse Left Sidebar" : "Expand Left Sidebar"}
          >
            {isOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </button>

          <div className="h-px w-6 bg-border/50 my-0.5" />

          {/* Select Tool (V) */}
          <button
            type="button"
            onClick={() => onSelectTool("pointer")}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl transition-all active:scale-[0.96]",
              activeTool === "pointer"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Select tool (V)"
          >
            <MousePointer className="size-4" />
          </button>

          {/* Frame Tool (F) */}
          <button
            type="button"
            onClick={() => {
              onSelectTool("frame")
              if (onAddNode) onAddNode(selectedNodeId || "root", "frame")
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl transition-all active:scale-[0.96]",
              activeTool === "frame"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Frame tool (F)"
          >
            <Square className="size-4" />
          </button>

          {/* Rectangle Tool (R) */}
          <button
            type="button"
            onClick={() => {
              onSelectTool("rectangle")
              if (onAddNode) onAddNode(selectedNodeId || "root", "rectangle")
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl transition-all active:scale-[0.96]",
              activeTool === "rectangle"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Rectangle tool (R)"
          >
            <Square className="size-4 stroke-[1.5]" />
          </button>

          {/* Text Tool (T) */}
          <button
            type="button"
            onClick={() => {
              onSelectTool("text")
              if (onAddNode) onAddNode(selectedNodeId || "root", "text")
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl transition-all active:scale-[0.96]",
              activeTool === "text"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Text tool (T)"
          >
            <Type className="size-4" />
          </button>

          {/* Hand Tool (H) */}
          <button
            type="button"
            onClick={() => onSelectTool("hand")}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl transition-all active:scale-[0.96]",
              activeTool === "hand"
                ? "bg-blue-600 text-white shadow-xs font-semibold"
                : "text-neutral-400 hover:text-white hover:bg-white/10"
            )}
            title="Hand / Pan tool (H)"
          >
            <Hand className="size-4" />
          </button>
        </div>

        {/* Bottom Rail Actions: Undo / Redo / Chat Trigger */}
        <div className="flex flex-col items-center gap-1.5 w-full">
          {/* Undo (Cmd+Z) */}
          {onUndo && (
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 disabled:opacity-25 transition-all"
              title="Undo (Cmd+Z)"
            >
              <Undo2 className="size-3.5" />
            </button>
          )}

          {/* Redo (Cmd+Shift+Z) */}
          {onRedo && (
            <button
              type="button"
              disabled={!canRedo}
              onClick={onRedo}
              className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 disabled:opacity-25 transition-all"
              title="Redo (Cmd+Shift+Z)"
            >
              <Redo2 className="size-3.5" />
            </button>
          )}

          <div className="h-px w-5 bg-border/50 my-0.5" />

          {/* AI Trigger */}
          <button
            type="button"
            onClick={() => {
              onSelectTab("agent")
              if (!isOpen) onToggleOpen()
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-xl text-accent-text hover:bg-white/10 active:scale-[0.96] transition-all",
              isOpen && activeTab === "agent" ? "bg-white/10 shadow-xs" : ""
            )}
            title="AI Brainstorm"
          >
            <Sparkles className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
