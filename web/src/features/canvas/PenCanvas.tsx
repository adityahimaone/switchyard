import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react"
import * as LucideIcons from "lucide-react"
import {
  ZoomIn,
  ZoomOut,
  Plus,
  Sparkles,
  ArrowUp,
  Hash,
  ChevronDown,
  Upload,
} from "lucide-react"
import type { PenDocument, PenNode, PenVariable } from "./penTypes"
import {
  createDefaultPenDocument,
  findNodeById,
  resolveTokenValue,
  resolveFillStyle,
  resolvePaddingStyle,
  resolveEffects,
  normalizeFlexAlign,
  ensureGoogleFontsLoaded,
} from "./penTypes"
import { cn } from "@/lib/utils"

interface PenCanvasProps {
  document: PenDocument
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onUpdateNode: (updated: PenNode) => void
  onDeleteNode?: (id: string) => void
  onDuplicateNode?: (id: string) => void
  onAddNode?: (parentOrRoot: "root" | string, type: "frame" | "rectangle" | "text") => void
  onResetDocument?: (doc: PenDocument) => void
  onOpenChat?: () => void
  onImportPenFile?: (file: File) => void
  activeModel?: string
  turnCount?: number
  inspectorOpen?: boolean
  leftSidebarOpen?: boolean
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  onReorderNode?: (id: string, direction: "forward" | "backward" | "front" | "back") => void
}

/**
 * Dynamically resolves and renders a Lucide icon by name
 */
function renderPenIcon(iconName?: string, className?: string, style?: React.CSSProperties) {
  if (!iconName) return null
  const pascal = iconName
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("")
  const IconComp = (LucideIcons as Record<string, any>)[pascal] || (LucideIcons as Record<string, any>)[iconName]
  if (IconComp) {
    return <IconComp className={className} style={style} />
  }
  return null
}

interface NodeRendererProps {
  node: PenNode
  isRoot?: boolean
  parentLayout?: string
  variables?: Record<string, PenVariable>
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  onUpdateNode: (updated: PenNode) => void
  zoom: number
}

function NodeRenderer({
  node,
  isRoot,
  parentLayout,
  variables,
  selectedNodeId,
  onSelectNode,
  onUpdateNode,
  zoom,
}: NodeRendererProps) {
  const isSelected = selectedNodeId === node.id
  const [isEditingText, setIsEditingText] = useState(false)
  const currentText = node.content !== undefined ? node.content : (node.text !== undefined ? node.text : "")
  const [editTextVal, setEditTextVal] = useState(currentText)

  useEffect(() => {
    setEditTextVal(node.content !== undefined ? node.content : (node.text !== undefined ? node.text : ""))
  }, [node.content, node.text])

  // Dragging to reposition root frames
  const isDraggingRoot = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, nodeX: node.x || 0, nodeY: node.y || 0 })

  const handleMouseDown = (e: ReactMouseEvent) => {
    e.stopPropagation()
    onSelectNode(node.id)

    // Direct manipulation dragging: root frames or absolute / unconstrained layers
    const canDrag = (isRoot || parentLayout === "none" || !parentLayout) && e.button === 0
    if (canDrag) {
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

  // 8-Point Interactive Resizing (1:1 Figma direct manipulation)
  const handleResizeStart = (e: ReactMouseEvent, direction: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w") => {
    e.stopPropagation()
    e.preventDefault()

    const startX = e.clientX
    const startY = e.clientY
    const startW = typeof node.width === "number" ? node.width : 390
    const startH = typeof node.height === "number" ? node.height : 844
    const startNodeX = node.x || (isRoot ? 80 : 0)
    const startNodeY = node.y || (isRoot ? 80 : 0)
    const aspectRatio = startW / startH

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const dx = (moveEvent.clientX - startX) / zoom
      const dy = (moveEvent.clientY - startY) / zoom
      const shift = moveEvent.shiftKey

      let newW = startW
      let newH = startH
      let newX = startNodeX
      let newY = startNodeY

      // Width & horizontal position
      if (direction.includes("e")) {
        newW = Math.max(10, startW + dx)
      } else if (direction.includes("w")) {
        const potentialW = startW - dx
        if (potentialW >= 10) {
          newW = potentialW
          newX = startNodeX + dx
        }
      }

      // Height & vertical position
      if (direction.includes("s")) {
        newH = Math.max(10, startH + dy)
      } else if (direction.includes("n")) {
        const potentialH = startH - dy
        if (potentialH >= 10) {
          newH = potentialH
          newY = startNodeY + dy
        }
      }

      // Shift key constrains aspect ratio
      if (shift && (direction === "se" || direction === "sw" || direction === "ne" || direction === "nw")) {
        newH = Math.round(newW / aspectRatio)
      }

      onUpdateNode({
        ...node,
        width: Math.round(newW),
        height: Math.round(newH),
        x: Math.round(newX),
        y: Math.round(newY),
      })
    }

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

  // Handle text edit commit
  const handleCommitText = () => {
    setIsEditingText(false)
    if (editTextVal !== currentText) {
      onUpdateNode({ ...node, text: editTextVal, content: editTextVal })
    }
  }

  // 1. Icon Node Rendering
  if (node.type === "icon") {
    const iconColor = resolveTokenValue(node.fill, variables) || "#ffffff"
    const numW = typeof node.width === "number" ? node.width : 16
    const numH = typeof node.height === "number" ? node.height : 16
    const size = Math.max(numW, numH)
    const iconStyle: React.CSSProperties = {
      color: iconColor,
      width: `${size}px`,
      height: `${size}px`,
      opacity: node.opacity !== undefined ? node.opacity : 1,
      transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    }

    if (parentLayout === "none") {
      iconStyle.position = "absolute"
      iconStyle.left = `${node.x || 0}px`
      iconStyle.top = `${node.y || 0}px`
    }

    return (
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelectNode(node.id)
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectNode(node.id)
        }}
        className={cn(
          "relative inline-flex items-center justify-center transition-shadow cursor-pointer shrink-0 select-none",
          isSelected ? "ring-2 ring-accent-text ring-offset-1 ring-offset-background" : "hover:ring-1 hover:ring-border"
        )}
        style={iconStyle}
        title={node.name || node.icon || "Icon"}
      >
        {isSelected && (
          <div className="absolute -top-5 left-0 z-20 flex items-center gap-1 rounded bg-accent-text px-1 py-0.5 font-mono text-[9px] font-semibold text-white shadow pointer-events-none">
            <span>{node.name || node.icon || "Icon"}</span>
          </div>
        )}
        {renderPenIcon(node.icon || node.name, "w-full h-full", { strokeWidth: node.strokeWidth || 2 })}
      </div>
    )
  }

  // 2. Text Node Rendering
  if (node.type === "text") {
    const resolvedFont = resolveTokenValue(node.fontFamily, variables) || "inherit"
    const resolvedColor = resolveTokenValue(node.fill, variables) || "#ffffff"

    const textStyle: React.CSSProperties = {
      fontSize: node.fontSize ? `${node.fontSize}px` : "14px",
      fontWeight: node.fontWeight || 400,
      fontStyle: (node.fontStyle as any) || undefined,
      fontFamily: resolvedFont.includes(" ") ? `"${resolvedFont}", sans-serif` : resolvedFont,
      color: typeof resolvedColor === "string" ? resolvedColor : "#ffffff",
      textAlign: (node.textAlign as any) || "left",
      lineHeight: node.lineHeight !== undefined ? (typeof node.lineHeight === "number" ? `${node.lineHeight}` : node.lineHeight) : "1.4",
      letterSpacing: node.letterSpacing !== undefined ? `${node.letterSpacing}px` : "normal",
      opacity: node.opacity !== undefined ? node.opacity : 1,
      userSelect: isEditingText ? "text" : "none",
      cursor: isEditingText ? "text" : "pointer",
      transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
      whiteSpace: node.textGrowth === "fixed-width" ? "normal" : "pre-wrap",
    }

    if (node.width === "fill_container" || node.fillWidth) {
      textStyle.flex = "1 1 0%"
      textStyle.minWidth = 0
    } else if (typeof node.width === "number") {
      textStyle.width = `${node.width}px`
    }

    if (parentLayout === "none") {
      textStyle.position = "absolute"
      textStyle.left = `${node.x || 0}px`
      textStyle.top = `${node.y || 0}px`
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
          setEditTextVal(currentText)
        }}
        className={cn(
          "relative inline-block transition-shadow group shrink-0",
          isSelected ? "ring-2 ring-accent-text ring-offset-1 ring-offset-background" : "hover:ring-1 hover:ring-border"
        )}
        style={textStyle}
      >
        {isSelected && (
          <div className="absolute -top-5 left-0 z-20 flex items-center gap-1 rounded bg-accent-text px-1 py-0.5 font-mono text-[9px] font-semibold text-white shadow pointer-events-none">
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
                setEditTextVal(currentText)
              }
            }}
            className="w-full bg-transparent outline-none ring-1 ring-accent-text"
            style={{ font: "inherit", color: "inherit", textAlign: "inherit" }}
          />
        ) : (
          <span>{currentText || (node.name ? "" : "Type something…")}</span>
        )}
      </div>
    )
  }

  // 3. Ellipse / Circle / Donut Arc Node Rendering
  if (node.type === "ellipse" || node.type === "circle") {
    const strokeColor = resolveTokenValue(node.stroke, variables)
    const fillColor = resolveTokenValue(typeof node.fill === "string" ? node.fill : undefined, variables)
    const w = typeof node.width === "number" ? node.width : 32
    const h = typeof node.height === "number" ? node.height : 32

    const containerStyle: React.CSSProperties = {
      width: `${w}px`,
      height: `${h}px`,
      opacity: node.opacity !== undefined ? node.opacity : 1,
      transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
    }

    if (parentLayout === "none") {
      containerStyle.position = "absolute"
      containerStyle.left = `${node.x || 0}px`
      containerStyle.top = `${node.y || 0}px`
    }

    // Check if this is a Donut / Progress Arc (innerRadius > 0)
    if (node.innerRadius && node.innerRadius > 0) {
      const R = w / 2
      const innerR = R * node.innerRadius
      const midR = (R + innerR) / 2
      const strokeW = R - innerR
      const C = 2 * Math.PI * midR

      const color = fillColor || strokeColor || "#000000"
      const sweep = node.sweepAngle !== undefined ? Math.abs(node.sweepAngle) : 360
      const start = node.startAngle !== undefined ? node.startAngle : -90
      const arcLength = (sweep / 360) * C

      return (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelectNode(node.id)
          }}
          onClick={(e) => {
            e.stopPropagation()
            onSelectNode(node.id)
          }}
          className={cn(
            "relative cursor-pointer select-none shrink-0",
            isSelected ? "ring-2 ring-accent-text ring-offset-1 ring-offset-background" : "hover:ring-1 hover:ring-border"
          )}
          style={containerStyle}
          title={node.name || "Donut Ring"}
        >
          {isSelected && (
            <div className="absolute -top-5 left-0 z-20 flex items-center gap-1 rounded bg-accent-text px-1 py-0.5 font-mono text-[9px] font-semibold text-white shadow pointer-events-none">
              <span>{node.name || "Donut"}</span>
            </div>
          )}
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
            <circle
              cx={R}
              cy={R}
              r={midR}
              fill="none"
              stroke={color}
              strokeWidth={strokeW}
              strokeDasharray={sweep < 360 ? `${arcLength} ${C}` : undefined}
              strokeLinecap="round"
              transform={sweep < 360 ? `rotate(${start} ${R} ${R})` : undefined}
            />
          </svg>
        </div>
      )
    }

    // Regular solid or gradient ellipse (e.g. ambient background glow blobs)
    return (
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onSelectNode(node.id)
        }}
        onClick={(e) => {
          e.stopPropagation()
          onSelectNode(node.id)
        }}
        className={cn(
          "relative transition-shadow cursor-pointer select-none shrink-0",
          isSelected ? "ring-2 ring-accent-text ring-offset-1 ring-offset-background" : "hover:ring-1 hover:ring-border"
        )}
        style={{
          ...containerStyle,
          ...resolveFillStyle(node.fill, variables),
          borderRadius: "50%",
          border: node.strokeWidth && strokeColor ? `${node.strokeWidth}px solid ${strokeColor}` : strokeColor ? `1px solid ${strokeColor}` : undefined,
        }}
        title={node.name || "Ellipse"}
      >
        {isSelected && (
          <div className="absolute -top-5 left-0 z-20 flex items-center gap-1 rounded bg-accent-text px-1 py-0.5 font-mono text-[9px] font-semibold text-white shadow pointer-events-none">
            <span>{node.name || "Ellipse"}</span>
          </div>
        )}
      </div>
    )
  }

  // 4. Frame or Rectangle Node Rendering
  const strokeColor = resolveTokenValue(node.stroke, variables)
  const baseStyle: React.CSSProperties = {
    ...resolveFillStyle(node.fill, variables),
    ...resolvePaddingStyle(node.padding),
    ...resolveEffects(node.effect || node.effects, variables),
    border: node.strokeWidth && strokeColor ? `${node.strokeWidth}px solid ${strokeColor}` : strokeColor ? `1px solid ${strokeColor}` : undefined,
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
  } else if (parentLayout === "none") {
    baseStyle.position = "absolute"
    baseStyle.left = `${node.x || 0}px`
    baseStyle.top = `${node.y || 0}px`
  } else {
    baseStyle.position = "relative"
  }

  if (node.width === "fill_container" || node.fillWidth) {
    baseStyle.flex = "1 1 0%"
    baseStyle.minWidth = 0
    baseStyle.width = "100%"
  } else if (node.width === "hug_contents") {
    baseStyle.width = "fit-content"
  } else if (typeof node.width === "number") {
    baseStyle.width = `${node.width}px`
  }

  if (node.height === "fill_container" || node.fillHeight) {
    baseStyle.flex = "1 1 0%"
    baseStyle.minHeight = 0
    baseStyle.height = "100%"
  } else if (node.height === "hug_contents") {
    baseStyle.height = "fit-content"
  } else if (typeof node.height === "number") {
    baseStyle.height = `${node.height}px`
  }

  // Flexbox layout or freeform coordinate container
  const isExplicitVertical = node.layout === "vertical"
  const isExplicitHorizontal = node.layout === "horizontal"
  const isAutoLayout =
    node.layout !== "none" &&
    (isExplicitVertical ||
      isExplicitHorizontal ||
      node.alignItems !== undefined ||
      node.justifyContent !== undefined ||
      node.gap !== undefined)

  if (isAutoLayout) {
    baseStyle.display = "flex"
    baseStyle.flexDirection = isExplicitVertical ? "column" : "row"
    if (node.gap) {
      baseStyle.gap = `${node.gap}px`
    }
    if (node.alignItems) {
      baseStyle.alignItems = normalizeFlexAlign(node.alignItems)
    }
    if (node.justifyContent) {
      baseStyle.justifyContent = normalizeFlexAlign(node.justifyContent)
    }
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
      onMouseDown={handleMouseDown}
      className={cn(
        "relative transition-all select-none",
        isRoot ? "cursor-move" : "cursor-pointer",
        isSelected
          ? "ring-2 ring-accent-text ring-offset-2 ring-offset-background shadow-lg"
          : "hover:ring-1 hover:ring-border"
      )}
      style={baseStyle}
    >
      {/* Selection Bounding Box Details & 8 Interactive Resize Handles */}
      {isSelected && (
        <>
          {/* Top-left Layer Name Badge */}
          <div className="absolute -top-6 left-0 z-20 flex items-center gap-1 rounded bg-accent-text px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white shadow pointer-events-none">
            <span>{node.name || "Frame"}</span>
          </div>

          {/* Underneath Blue Dimension Pill: "[W] × [H]" */}
          <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-md bg-accent-text px-2 py-0.5 font-mono text-[10px] font-semibold text-white shadow pointer-events-none">
            <span>
              {node.width ?? "auto"} × {node.height ?? "auto"}
            </span>
          </div>

          {/* 8 Interactive Resize Handles (Figma Style) */}
          {/* NW - Top Left */}
          <div
            onMouseDown={(e) => handleResizeStart(e, "nw")}
            className="absolute -top-1.5 -left-1.5 size-2.5 rounded-xs bg-white border-2 border-accent-text z-30 cursor-nwse-resize shadow-xs hover:scale-125 transition-transform"
            title="Resize Top-Left"
          />
          {/* N - Top Center */}
          <div
            onMouseDown={(e) => handleResizeStart(e, "n")}
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 size-2.5 rounded-xs bg-white border-2 border-accent-text z-30 cursor-ns-resize shadow-xs hover:scale-125 transition-transform"
            title="Resize Top"
          />
          {/* NE - Top Right */}
          <div
            onMouseDown={(e) => handleResizeStart(e, "ne")}
            className="absolute -top-1.5 -right-1.5 size-2.5 rounded-xs bg-white border-2 border-accent-text z-30 cursor-nesw-resize shadow-xs hover:scale-125 transition-transform"
            title="Resize Top-Right"
          />
          {/* E - Middle Right */}
          <div
            onMouseDown={(e) => handleResizeStart(e, "e")}
            className="absolute top-1/2 -translate-y-1/2 -right-1.5 size-2.5 rounded-xs bg-white border-2 border-accent-text z-30 cursor-ew-resize shadow-xs hover:scale-125 transition-transform"
            title="Resize Right"
          />
          {/* SE - Bottom Right */}
          <div
            onMouseDown={(e) => handleResizeStart(e, "se")}
            className="absolute -bottom-1.5 -right-1.5 size-2.5 rounded-xs bg-white border-2 border-accent-text z-30 cursor-nwse-resize shadow-xs hover:scale-125 transition-transform"
            title="Resize Bottom-Right"
          />
          {/* S - Bottom Center */}
          <div
            onMouseDown={(e) => handleResizeStart(e, "s")}
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 size-2.5 rounded-xs bg-white border-2 border-accent-text z-30 cursor-ns-resize shadow-xs hover:scale-125 transition-transform"
            title="Resize Bottom"
          />
          {/* SW - Bottom Left */}
          <div
            onMouseDown={(e) => handleResizeStart(e, "sw")}
            className="absolute -bottom-1.5 -left-1.5 size-2.5 rounded-xs bg-white border-2 border-accent-text z-30 cursor-nesw-resize shadow-xs hover:scale-125 transition-transform"
            title="Resize Bottom-Left"
          />
          {/* W - Middle Left */}
          <div
            onMouseDown={(e) => handleResizeStart(e, "w")}
            className="absolute top-1/2 -translate-y-1/2 -left-1.5 size-2.5 rounded-xs bg-white border-2 border-accent-text z-30 cursor-ew-resize shadow-xs hover:scale-125 transition-transform"
            title="Resize Left"
          />
        </>
      )}

      {/* Render nested children */}
      {node.children &&
        node.children.map((child) => (
          <NodeRenderer
            key={child.id}
            node={child}
            parentLayout={isAutoLayout ? (isExplicitVertical ? "vertical" : "horizontal") : "none"}
            variables={variables}
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
  onDeleteNode,
  onDuplicateNode,
  onAddNode,
  onResetDocument,
  onOpenChat,
  onImportPenFile,
  activeModel = "DeepSeek V4.1 Flash",
  turnCount: _turnCount = 1,
  inspectorOpen = false,
  leftSidebarOpen = false,
  canUndo: _canUndo = false,
  canRedo: _canRedo = false,
  onUndo,
  onRedo,
  onReorderNode,
}: PenCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const [zoom, setZoom] = useState(1.0)
  const [isPanning, setIsPanning] = useState(false)
  const [activeTool, setActiveTool] = useState<"pointer" | "frame" | "text" | "hand">("pointer")
  const [isDraggingPenFile, setIsDraggingPenFile] = useState(false)
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

  // Drag & drop file directly onto canvas
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingPenFile(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingPenFile(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingPenFile(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onImportPenFile) {
      const file = e.dataTransfer.files[0]
      if (file.name.endsWith(".pen") || file.name.endsWith(".json")) {
        onImportPenFile(file)
      }
    }
  }

  const hasChildren = document.children && document.children.length > 0

  // Auto load Google Fonts defined in document variables or font families
  useEffect(() => {
    const fonts: string[] = []
    if (document.variables) {
      for (const [key, v] of Object.entries(document.variables)) {
        if (typeof v.value === "string" && (key.includes("font") || v.type === "string")) {
          fonts.push(v.value)
        }
      }
    }
    function scanFonts(nodes: PenNode[]) {
      for (const n of nodes) {
        if (n.fontFamily && !n.fontFamily.startsWith("$")) fonts.push(n.fontFamily)
        if (n.children) scanFonts(n.children)
      }
    }
    if (document.children) scanFonts(document.children)
    ensureGoogleFontsLoaded(fonts)
  }, [document.variables, document.children])

  // Selected node lookup
  const selectedNode = selectedNodeId
    ? findNodeById(document.children, selectedNodeId) || { name: "Mellow" }
    : { name: document.children[0]?.name || "Mellow" }

  // 1:1 Figma & Pen.dev Keyboard Shortcuts (Undo, Redo, Delete, Nudge, Duplicate, Escape, Layer Reorder, Tool Switching)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement | null
      const isInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (isInput) return

      // Undo (Cmd+Z)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z" && onUndo) {
        e.preventDefault()
        onUndo()
        return
      }

      // Redo (Cmd+Shift+Z or Cmd+Y)
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z")) &&
        onRedo
      ) {
        e.preventDefault()
        onRedo()
        return
      }

      // Layer Reordering: Cmd+] (forward) or Cmd+[ (backward)
      if ((e.metaKey || e.ctrlKey) && (e.key === "]" || e.key === "[") && selectedNodeId && onReorderNode) {
        e.preventDefault()
        const direction = e.shiftKey
          ? (e.key === "]" ? "front" : "back")
          : (e.key === "]" ? "forward" : "backward")
        onReorderNode(selectedNodeId, direction)
        return
      }

      // Delete or Backspace to delete selected layer
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId && onDeleteNode) {
        e.preventDefault()
        onDeleteNode(selectedNodeId)
        return
      }

      // Escape to deselect
      if (e.key === "Escape") {
        e.preventDefault()
        onSelectNode(null)
        return
      }

      // Cmd/Ctrl + D to duplicate selected node
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedNodeId && onDuplicateNode) {
        e.preventDefault()
        onDuplicateNode(selectedNodeId)
        return
      }

      // Arrow keys to nudge selected element (1px normally, 10px with Shift)
      if (selectedNodeId && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")) {
        const found = findNodeById(document.children, selectedNodeId)
        if (found) {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          let dx = 0
          let dy = 0
          if (e.key === "ArrowLeft") dx = -step
          if (e.key === "ArrowRight") dx = step
          if (e.key === "ArrowUp") dy = -step
          if (e.key === "ArrowDown") dy = step
          onUpdateNode({
            ...found,
            x: (found.x ?? 0) + dx,
            y: (found.y ?? 0) + dy,
          })
          return
        }
      }

      // Tool Switching (V, F, T, H)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key.toLowerCase() === "v") setActiveTool("pointer")
        if (e.key.toLowerCase() === "f") {
          setActiveTool("frame")
          if (onAddNode) onAddNode(selectedNodeId || "root", "frame")
        }
        if (e.key.toLowerCase() === "t") {
          setActiveTool("text")
          if (onAddNode) onAddNode(selectedNodeId || "root", "text")
        }
        if (e.key.toLowerCase() === "h") setActiveTool("hand")
      }

      // Zoom Shortcuts
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
  }, [
    selectedNodeId,
    onDeleteNode,
    onDuplicateNode,
    onSelectNode,
    onUpdateNode,
    onAddNode,
    onUndo,
    onRedo,
    onReorderNode,
    document.children,
  ])

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative h-full w-full overflow-hidden bg-background font-sans select-none",
        isPanning || activeTool === "hand" ? "cursor-grabbing" : "cursor-default"
      )}
      style={{
        backgroundImage: `
          radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)
        `,
        color: "rgba(128, 128, 128, 0.12)",
        backgroundSize: `${32 * zoom}px ${32 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* File Drop Visual Hint */}
      {isDraggingPenFile && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-accent-text pointer-events-none">
          <Upload className="size-10 text-accent-text animate-bounce mb-2" />
          <p className="text-sm font-semibold text-foreground">Drop .pen file to load into canvas</p>
        </div>
      )}

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
              parentLayout="none"
              variables={document.variables}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
              onUpdateNode={onUpdateNode}
              zoom={zoom}
            />
          ))
        ) : (
          <div className="flex h-72 w-96 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center backdrop-blur-sm">
            <Sparkles className="size-8 text-accent-text opacity-60 mb-2" />
            <h4 className="text-sm font-semibold text-foreground">Empty Canvas</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Start by scaffolding a component frame or dropping a <code>.pen</code> file.
            </p>
            <button
              type="button"
              onClick={() => {
                if (onResetDocument) {
                  onResetDocument(createDefaultPenDocument("Visual Component"))
                }
              }}
              className="mt-4 flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted active:scale-[0.98] transition-all shadow-xs"
            >
              <Plus className="size-3.5 text-accent-text" />
              <span>Scaffold Sample Frame</span>
            </button>
          </div>
        )}
      </div>

      {/* Zoom Controls Pill (Bottom Right) */}
      <div
        className={cn(
          "absolute bottom-5 z-20 flex items-center gap-1 rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-2xl backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
          inspectorOpen ? "right-[276px]" : "right-5"
        )}
      >
        <button
          type="button"
          title="Zoom Out (Ctrl -)"
          onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
          className="min-w-12 px-2 py-1 text-center font-mono text-[11px] font-medium text-foreground hover:text-accent-text transition-colors"
        >
          {Math.round(zoom * 100)}%
        </button>

        <button
          type="button"
          title="Zoom In (Ctrl +)"
          onClick={() => setZoom((z) => Math.min(3.0, z * 1.2))}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ZoomIn className="size-3.5" />
        </button>
      </div>

      {/* Floating AI Command Capsule (Image 1: Docked bottom-left when sidebar open, Image 2: Centered when minimized) */}
      <div
        className={cn(
          "absolute bottom-5 z-20 flex items-center gap-2 rounded-2xl border border-border/80 bg-card/95 px-3 py-2 shadow-2xl backdrop-blur-md max-w-[calc(100vw-24rem)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
          leftSidebarOpen ? "left-6 md:left-8" : "left-1/2 -translate-x-1/2"
        )}
      >
        <button
          type="button"
          onClick={onOpenChat}
          className="flex size-7 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all shrink-0 active:scale-95"
          title="Add Prompt Attachment"
        >
          <Plus className="size-4" />
        </button>

        <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground shrink-0 shadow-2xs">
          <Hash className="size-3 text-accent-text" />
          <span className="truncate max-w-28 font-mono text-[11px]">{selectedNode.name || "Canvas"}</span>
        </div>

        <button
          type="button"
          onClick={onOpenChat}
          className="flex-1 min-w-36 md:min-w-56 text-left px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors truncate"
        >
          Design anything…
        </button>

        <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground shrink-0 hidden sm:flex">
          <span className="truncate max-w-28 font-mono text-[11px]">{activeModel}</span>
          <ChevronDown className="size-3 opacity-60" />
        </div>

        <button
          type="button"
          onClick={onOpenChat}
          className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 active:scale-95 transition-all shadow-xs shrink-0"
          title="Ask AI"
        >
          <ArrowUp className="size-3.5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  )
}
