import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react"
import {
  ZoomIn,
  ZoomOut,
  Plus,
  Type,
  Square,
  Sparkles,
  MousePointer,
  Hand,
  ArrowUp,
  Hash,
  ChevronDown,
} from "lucide-react"
import type { PenDocument, PenFill, PenFillGradient, PenNode, PenPadding } from "./penTypes"
import { createDefaultPenDocument } from "./penTypes"
import { cn } from "@/lib/utils"

interface PenCanvasProps {
  document: PenDocument
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onUpdateNode: (updated: PenNode) => void
  onAddNode?: (parentOrRoot: "root" | string, type: "frame" | "rectangle" | "text") => void
  onResetDocument?: (doc: PenDocument) => void
  onOpenChat?: () => void
  activeModel?: string
  turnCount?: number
}

function resolveFillStyle(fill?: PenFill): React.CSSProperties {
  if (!fill) return {}
  if (typeof fill === "string") {
    return { backgroundColor: fill }
  }
  const grad = fill as PenFillGradient
  if (grad.colors && grad.colors.length) {
    const stops = grad.colors.map((c) => `${c.color} ${Math.round(c.position * 100)}%`).join(", ")
    const bgString =
      grad.gradientType === "radial"
        ? `radial-gradient(circle, ${stops})`
        : `linear-gradient(${grad.rotation ?? 180}deg, ${stops})`
    return { background: bgString }
  }
  return {}
}

function resolvePaddingStyle(padding?: number | PenPadding): React.CSSProperties {
  if (!padding) return {}
  if (typeof padding === "number") {
    return { padding: `${padding}px` }
  }
  return {
    paddingTop: padding.top !== undefined ? `${padding.top}px` : undefined,
    paddingRight: padding.right !== undefined ? `${padding.right}px` : undefined,
    paddingBottom: padding.bottom !== undefined ? `${padding.bottom}px` : undefined,
    paddingLeft: padding.left !== undefined ? `${padding.left}px` : undefined,
  }
}

interface NodeRendererProps {
  node: PenNode
  isRoot?: boolean
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onUpdateNode: (updated: PenNode) => void
  zoom: number
}

function NodeRenderer({
  node,
  isRoot,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  zoom,
}: NodeRendererProps) {
  const isSelected = selectedNodeId === node.id
  const [isEditingText, setIsEditingText] = useState(false)
  const [editTextVal, setEditTextVal] = useState(node.text || "")

  // Dragging to reposition root frames
  const isDraggingRoot = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, nodeX: node.x || 0, nodeY: node.y || 0 })

  const handleMouseDown = (e: ReactMouseEvent) => {
    e.stopPropagation()
    onSelectNode(node.id)

    if (isRoot && e.button === 0) {
      isDraggingRoot.current = true
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        nodeX: node.x || 0,
        nodeY: node.y || 0,
      }

      const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
        if (!isDraggingRoot.current) return
        const dx = (moveEvent.clientX - dragStart.current.x) / zoom
        const dy = (moveEvent.clientY - dragStart.current.y) / zoom
        onUpdateNode({
          ...node,
          x: Math.round(dragStart.current.nodeX + dx),
          y: Math.round(dragStart.current.nodeY + dy),
        })
      }

      const handleMouseUp = () => {
        isDraggingRoot.current = false
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }

      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    }
  }

  // Handle text edit commit
  const handleCommitText = () => {
    setIsEditingText(false)
    if (editTextVal !== node.text) {
      onUpdateNode({ ...node, text: editTextVal })
    }
  }

  if (node.type === "text") {
    const textStyle: React.CSSProperties = {
      fontSize: node.fontSize ? `${node.fontSize}px` : "14px",
      fontWeight: node.fontWeight || 400,
      fontFamily: node.fontFamily || "inherit",
      color: typeof node.fill === "string" ? node.fill : "#ffffff",
      textAlign: node.textAlign || "left",
      lineHeight: node.lineHeight !== undefined ? (typeof node.lineHeight === "number" ? `${node.lineHeight}px` : node.lineHeight) : "1.4",
      letterSpacing: node.letterSpacing !== undefined ? `${node.letterSpacing}px` : "normal",
      opacity: node.opacity !== undefined ? node.opacity : 1,
      userSelect: isEditingText ? "text" : "none",
      cursor: isEditingText ? "text" : "pointer",
    }

    return (
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onSelectNode(node.id)
          }
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectNode(node.id)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setIsEditingText(true)
          setEditTextVal(node.text || "")
        }}
        className={cn(
          "relative inline-block transition-shadow group",
          isSelected ? "ring-2 ring-[#2563eb] ring-offset-1 ring-offset-[#121316]" : "hover:ring-1 hover:ring-[rgba(255,255,255,0.2)]"
        )}
        style={textStyle}
      >
        {isSelected && (
          <div className="absolute -top-5 left-0 z-20 flex items-center gap-1 rounded bg-[#2563eb] px-1 py-0.5 font-mono text-[9px] font-semibold text-white shadow">
            <span>{node.name || "Text"}</span>
          </div>
        )}

        {isEditingText ? (
          <input
            type="text"
            autoFocus
            value={editTextVal}
            onChange={(e) => setEditTextVal(e.target.value)}
            onBlur={handleCommitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCommitText()
              if (e.key === "Escape") {
                setIsEditingText(false)
                setEditTextVal(node.text || "")
              }
            }}
            className="w-full bg-transparent outline-none ring-1 ring-accent-text"
            style={{ font: "inherit", color: "inherit", textAlign: "inherit" }}
          />
        ) : (
          <span>{node.text || "Type something…"}</span>
        )}
      </div>
    )
  }

  // Frame or Rectangle
  const baseStyle: React.CSSProperties = {
    ...resolveFillStyle(node.fill),
    ...resolvePaddingStyle(node.padding),
    border: node.strokeWidth && node.stroke ? `${node.strokeWidth}px solid ${node.stroke}` : node.stroke ? `1px solid ${node.stroke}` : undefined,
    borderRadius: node.cornerRadius ? `${node.cornerRadius}px` : undefined,
    opacity: node.opacity !== undefined ? node.opacity : 1,
    overflow: node.clip ? "hidden" : "visible",
    transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
  }

  // Dimensioning & positioning
  if (isRoot) {
    baseStyle.position = "absolute"
    baseStyle.left = `${node.x || 80}px`
    baseStyle.top = `${node.y || 80}px`
  }

  if (node.width !== undefined) baseStyle.width = `${node.width}px`
  if (node.height !== undefined) baseStyle.height = `${node.height}px`

  // Flexbox layout
  if (node.layout === "vertical") {
    baseStyle.display = "flex"
    baseStyle.flexDirection = "column"
    baseStyle.gap = `${node.gap || 0}px`
  } else if (node.layout === "horizontal") {
    baseStyle.display = "flex"
    baseStyle.flexDirection = "row"
    baseStyle.gap = `${node.gap || 0}px`
  }

  if (node.alignItems) {
    baseStyle.alignItems =
      node.alignItems === "center"
        ? "center"
        : node.alignItems === "start"
        ? "flex-start"
        : node.alignItems === "end"
        ? "flex-end"
        : "stretch"
  }

  if (node.justifyContent) {
    baseStyle.justifyContent =
      node.justifyContent === "center"
        ? "center"
        : node.justifyContent === "space-between"
        ? "space-between"
        : node.justifyContent === "start"
        ? "flex-start"
        : node.justifyContent === "end"
        ? "flex-end"
        : "flex-start"
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onSelectNode(node.id)
        }
      }}
      onMouseDown={handleMouseDown}
      className={cn(
        "relative select-none box-border transition-[box-shadow] duration-75",
        isSelected
          ? "ring-2 ring-[#2563eb] shadow-[0_0_25px_rgba(37,99,235,0.25)]"
          : "hover:ring-1 hover:ring-[rgba(255,255,255,0.2)]"
      )}
      style={baseStyle}
    >
      {/* Node tag at top-right (matching pen.dev Image 1) */}
      {isSelected && (
        <div className="absolute -top-3 -right-3 z-20 flex size-6 items-center justify-center rounded-full bg-[#2563eb] text-white shadow-md">
          <Sparkles className="size-3" />
        </div>
      )}

      {/* Resize corner handles when selected */}
      {isSelected && (
        <>
          <div className="absolute -top-1.5 -left-1.5 size-3 rounded-full border border-black bg-[#2563eb] shadow pointer-events-none" />
          <div className="absolute -top-1.5 -right-1.5 size-3 rounded-full border border-black bg-[#2563eb] shadow pointer-events-none" />
          <div className="absolute -bottom-1.5 -left-1.5 size-3 rounded-full border border-black bg-[#2563eb] shadow pointer-events-none" />
          <div className="absolute -bottom-1.5 -right-1.5 size-3 rounded-full border border-black bg-[#2563eb] shadow pointer-events-none" />
        </>
      )}

      {/* Dimension Badge underneath frame (Exact match of pen.dev Image 1: e.g. "390 × 844") */}
      {isSelected && isRoot && node.width && node.height && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center rounded bg-[#2563eb] px-2 py-0.5 font-mono text-[11px] font-semibold text-white shadow-md pointer-events-none">
          <span>{Math.round(node.width)} × {Math.round(node.height)}</span>
        </div>
      )}

      {/* Nested children */}
      {node.children &&
        node.children.map((child) => (
          <NodeRenderer
            key={child.id}
            node={child}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
            onUpdateNode={onUpdateNode}
            zoom={zoom}
          />
        ))}
    </div>
  )
}

export function PenCanvas({
  document,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  onAddNode,
  onResetDocument,
  onOpenChat,
  activeModel = "DeepSeek V4.1 Flash",
  turnCount: _turnCount = 1,
}: PenCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const [zoom, setZoom] = useState(1.0)
  const [isPanning, setIsPanning] = useState(false)
  const [activeTool, setActiveTool] = useState<"pointer" | "frame" | "text" | "hand">("pointer")
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Focal zoom on trackpad pinch or Ctrl + Wheel
  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      if (e.ctrlKey || e.metaKey) {
        // Focal Zoom anchored at cursor
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const zoomDelta = -e.deltaY * 0.005
        const newZoom = Math.min(Math.max(0.2, zoom + zoomDelta), 3.0)

        const scaleFactor = newZoom / zoom
        const newPanX = mouseX - (mouseX - pan.x) * scaleFactor
        const newPanY = mouseY - (mouseY - pan.y) * scaleFactor

        setZoom(newZoom)
        setPan({ x: newPanX, y: newPanY })
      } else {
        // Two finger pan
        setPan((p) => ({
          x: p.x - e.deltaX,
          y: p.y - e.deltaY,
        }))
      }
    },
    [zoom, pan]
  )

  // Mouse pan
  const handleMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (activeTool === "hand" || e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      onSelectNode(null)
      setIsPanning(true)
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      }
    }
  }

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanning) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    setPan({
      x: panStart.current.panX + dx,
      y: panStart.current.panY + dy,
    })
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  // Keyboard zoom shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "0") {
        e.preventDefault()
        setZoom(1.0)
        setPan({ x: 80, y: 60 })
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault()
        setZoom((z) => Math.min(3.0, z * 1.15))
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "-" || e.key === "_")) {
        e.preventDefault()
        setZoom((z) => Math.max(0.2, z / 1.15))
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const hasChildren = document.children && document.children.length > 0

  // Selected node name
  const selectedNode = selectedNodeId
    ? document.children.find((c) => c.id === selectedNodeId) || { name: "Mellow" }
    : { name: document.children[0]?.name || "Mellow" }

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={cn(
        "relative h-full w-full overflow-hidden bg-[#0d0e12]",
        isPanning || activeTool === "hand" ? "cursor-grabbing" : "cursor-default"
      )}
      style={{
        backgroundImage: `
          radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.05) 1px, transparent 0)
        `,
        backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Canvas Viewport Transformer */}
      <div
        className="absolute origin-top-left transition-transform duration-75"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {hasChildren ? (
          document.children.map((rootNode) => (
            <NodeRenderer
              key={rootNode.id}
              node={rootNode}
              isRoot
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onUpdateNode={onUpdateNode}
              zoom={zoom}
            />
          ))
        ) : (
          <div className="flex h-72 w-96 flex-col items-center justify-center rounded-2xl border border-dashed border-[rgba(255,255,255,0.12)] bg-[#121316]/60 p-6 text-center backdrop-blur-sm">
            <Sparkles className="size-8 text-accent-text opacity-60 mb-2" />
            <h4 className="text-sm font-semibold text-neutral-200">Empty pen.dev Canvas</h4>
            <p className="mt-1 text-xs text-neutral-400">
              Start by scaffolding a component frame or adding shapes.
            </p>
            <button
              type="button"
              onClick={() => {
                if (onResetDocument) {
                  onResetDocument(createDefaultPenDocument("Visual Component"))
                }
              }}
              className="mt-4 flex items-center gap-1.5 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#18191f] px-3.5 py-2 text-xs font-medium text-neutral-100 hover:bg-[#20212a] active:scale-[0.98] transition-all"
            >
              <Plus className="size-3.5 text-accent-text" />
              <span>Scaffold Sample Frame</span>
            </button>
          </div>
        )}
      </div>

      {/* Left Slim Vertical Tool Rail (Exact match of pen.dev Image 1) */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[#14151c]/90 p-1.5 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveTool("pointer")}
          className={cn(
            "flex size-8 items-center justify-center rounded-xl transition-all",
            activeTool === "pointer" ? "bg-[#252735] text-white shadow-sm" : "text-neutral-400 hover:text-white hover:bg-[rgba(255,255,255,0.06)]"
          )}
          title="Select / Move (V)"
        >
          <MousePointer className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTool("frame")
            if (onAddNode) onAddNode("root", "frame")
          }}
          className={cn(
            "flex size-8 items-center justify-center rounded-xl transition-all",
            activeTool === "frame" ? "bg-[#252735] text-white shadow-sm" : "text-neutral-400 hover:text-white hover:bg-[rgba(255,255,255,0.06)]"
          )}
          title="Frame tool (F)"
        >
          <Square className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTool("text")
            if (onAddNode) onAddNode(selectedNodeId || "root", "text")
          }}
          className={cn(
            "flex size-8 items-center justify-center rounded-xl transition-all",
            activeTool === "text" ? "bg-[#252735] text-white shadow-sm" : "text-neutral-400 hover:text-white hover:bg-[rgba(255,255,255,0.06)]"
          )}
          title="Text tool (T)"
        >
          <Type className="size-4" />
        </button>

        <button
          type="button"
          onClick={() => setActiveTool("hand")}
          className={cn(
            "flex size-8 items-center justify-center rounded-xl transition-all",
            activeTool === "hand" ? "bg-[#252735] text-white shadow-sm" : "text-neutral-400 hover:text-white hover:bg-[rgba(255,255,255,0.06)]"
          )}
          title="Hand / Pan tool (H)"
        >
          <Hand className="size-4" />
        </button>

        <div className="h-px w-5 bg-[rgba(255,255,255,0.08)] my-0.5" />

        {onOpenChat && (
          <button
            type="button"
            onClick={onOpenChat}
            className="flex size-8 items-center justify-center rounded-xl text-neutral-400 hover:text-accent-text hover:bg-[rgba(255,255,255,0.06)] transition-all"
            title="Ask AI Agent"
          >
            <Sparkles className="size-4" />
          </button>
        )}
      </div>

      {/* Bottom Floating AI Command Capsule (Exact match of pen.dev Image 1) */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[#14151c]/90 px-3 py-2 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          onClick={onOpenChat}
          className="flex size-7 items-center justify-center rounded-xl text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-all"
        >
          <Plus className="size-4" />
        </button>

        <div className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1a1b24] px-2.5 py-1 text-xs font-medium text-neutral-200">
          <Hash className="size-3 text-neutral-400" />
          <span>{selectedNode.name || "Frame"}</span>
        </div>

        <span className="flex items-center gap-1 rounded-md bg-[rgba(255,255,255,0.05)] px-2 py-0.5 font-mono text-[11px] text-amber-400">
          <span>⚡ 1x</span>
        </span>

        <span className="flex items-center gap-1 rounded-md bg-[rgba(255,255,255,0.05)] px-2 py-0.5 font-mono text-[11px] text-neutral-400">
          <span>⚅ 1x</span>
        </span>

        <div className="flex items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1a1b24] px-2.5 py-1 text-xs text-neutral-300">
          <span>{activeModel}</span>
          <ChevronDown className="size-3 text-neutral-500" />
        </div>

        <button
          type="button"
          onClick={onOpenChat}
          className="flex size-7 items-center justify-center rounded-full bg-neutral-200 text-black hover:bg-white active:scale-95 transition-all shadow"
        >
          <ArrowUp className="size-3.5 stroke-[2.5]" />
        </button>
      </div>

      {/* Bottom Right Floating Zoom Pill (Exact match of pen.dev Image 1) */}
      <div className="absolute bottom-5 right-5 z-30 flex items-center gap-1 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[#14151c]/90 p-1.5 shadow-2xl backdrop-blur-md">
        <button
          type="button"
          title="Zoom Out (Ctrl -)"
          onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
          className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-[rgba(255,255,255,0.06)] hover:text-neutral-100 transition-colors"
        >
          <ZoomOut className="size-3.5" />
        </button>

        <button
          type="button"
          title="Reset Zoom (Ctrl 0)"
          onClick={() => {
            setZoom(1.0)
            setPan({ x: 80, y: 60 })
          }}
          className="min-w-12 px-2 py-1 text-center font-mono text-[11px] font-medium text-neutral-300 hover:text-white transition-colors"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          title="Zoom In (Ctrl +)"
          onClick={() => setZoom((z) => Math.min(3.0, z * 1.2))}
          className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-[rgba(255,255,255,0.06)] hover:text-neutral-100 transition-colors"
        >
          <ZoomIn className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
