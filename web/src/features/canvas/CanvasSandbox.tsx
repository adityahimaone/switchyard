import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { AlertCircle, Loader2, GripHorizontal, Check, Sparkles } from "lucide-react"

export interface CanvasSandboxProps {
  sessionId: string
  files: Record<string, string>
  activeFile?: string
  onSelectFile?: (file: string) => void
  dialkitProps: Record<string, any>
  frame: "freeform" | "desktop" | "tablet" | "mobile"
  zoom: number // Decimal scale, 1.0 = 100%
  pan: { x: number; y: number }
  onPanChange: (pan: { x: number; y: number }) => void
  onZoomChange: (zoom: number) => void
  onControlsDiscovered?: (controls: any[]) => void
}

const FRAME_DIMENSIONS: Record<string, { width: number; height: number; label: string }> = {
  freeform: { width: 1200, height: 820, label: "Responsive Stage" },
  desktop: { width: 1200, height: 820, label: "Desktop · 1200 × 820" },
  tablet: { width: 768, height: 1024, label: "Tablet · 768 × 1024" },
  mobile: { width: 375, height: 812, label: "iPhone 16 Pro · 375 × 812" },
}

interface ArtboardPosition {
  x: number
  y: number
}

function extractTitle(content?: string, fallback: string = ""): string {
  if (content) {
    const dialMatch = content.match(/useDialKit\(\s*['"`]([^'"`]+)['"`]/)
    if (dialMatch && dialMatch[1].trim()) return dialMatch[1].trim()
    const m = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (m && m[1].trim()) return m[1].trim()
  }
  const base = fallback.split("/").pop() || fallback
  if (base === "variant-1.html" || base === "variant-1.tsx") return "Variant 1 · Modern Bento Card"
  if (base === "variant-2.html" || base === "variant-2.tsx") return "Variant 2 · Audio Deck"
  return base.replace(/\.(html|tsx|jsx)$/, "")
}

export function CanvasSandbox({
  sessionId,
  files,
  activeFile,
  onSelectFile,
  dialkitProps,
  frame,
  zoom,
  pan,
  onPanChange,
  onZoomChange,
  onControlsDiscovered,
}: CanvasSandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({})
  const readyFramesRef = useRef<Set<string>>(new Set())

  // Panning state
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const [isSpacePressed, setIsSpacePressed] = useState(false)

  // Dragging artboard state
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragStartMouseRef = useRef({ x: 0, y: 0 })
  const artboardStartPosRef = useRef({ x: 0, y: 0 })

  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [errorMap, setErrorMap] = useState<Record<string, string | null>>({})

  // Clean files: filter out macOS AppleDouble files and OS metadata
  const cleanFiles = useMemo(() => {
    const res: Record<string, string> = {}
    for (const [k, v] of Object.entries(files)) {
      const base = k.split("/").pop() || ""
      if (base.startsWith("._") || base === ".DS_Store" || k.includes("__MACOSX")) {
        continue
      }
      res[k] = v
    }
    return res
  }, [files])

  // Multi-frame artboards: every canvas variation or component
  const artboardKeys = useMemo(() => {
    const keys = Object.keys(cleanFiles).filter(
      (k) =>
        !k.includes("._") &&
        !k.includes(".DS_Store") &&
        !k.endsWith("page.tsx") &&
        !k.endsWith("page.jsx") &&
        (k.endsWith(".html") || k.endsWith(".tsx") || k.endsWith(".jsx"))
    )
    return keys.length > 0 ? keys : Object.keys(cleanFiles).filter((k) => !k.includes("._"))
  }, [cleanFiles])

  // Artboard positions state with persistence
  const [positions, setPositions] = useState<Record<string, ArtboardPosition>>({})

  // Initialize or restore layout
  useEffect(() => {
    if (artboardKeys.length === 0) return
    const storageKey = `canvas-positions-${sessionId}`
    let saved: Record<string, ArtboardPosition> = {}
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) saved = JSON.parse(raw)
    } catch (_) {}

    const frameWidth = FRAME_DIMENSIONS[frame].width
    const next: Record<string, ArtboardPosition> = {}
    artboardKeys.forEach((key, index) => {
      if (saved[key] && typeof saved[key].x === "number" && typeof saved[key].y === "number") {
        next[key] = saved[key]
      } else {
        // Lay out in a clean horizontal row
        next[key] = {
          x: 60 + index * (frameWidth + 80),
          y: 60,
        }
      }
    })
    setPositions(next)
  }, [artboardKeys, sessionId, frame])

  // Save positions when changed
  const savePositions = useCallback(
    (pos: Record<string, ArtboardPosition>) => {
      try {
        localStorage.setItem(`canvas-positions-${sessionId}`, JSON.stringify(pos))
      } catch (_) {}
    },
    [sessionId],
  )

  // Send bundle to a specific iframe
  const sendToFrame = useCallback(
    (fileKey: string) => {
      const frameEl = iframeRefs.current[fileKey]
      if (!frameEl?.contentWindow || !readyFramesRef.current.has(fileKey)) return
      frameEl.contentWindow.postMessage(
        {
          type: "LOAD_CANVAS",
          files: cleanFiles,
          entryFile: fileKey,
          props: dialkitProps,
        },
        "*",
      )
    },
    [cleanFiles, dialkitProps],
  )

  // Listen for iframe readiness & status
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "CANVAS_FRAME_READY") {
        // Find which frame sent this
        for (const [key, el] of Object.entries(iframeRefs.current)) {
          if (el?.contentWindow === e.source) {
            readyFramesRef.current.add(key)
            sendToFrame(key)
            break
          }
        }
      } else if (e.data?.type === "CANVAS_STATUS") {
        for (const [key, el] of Object.entries(iframeRefs.current)) {
          if (el?.contentWindow === e.source) {
            if (e.data.status === "ready") {
              setLoadingMap((prev) => ({ ...prev, [key]: false }))
              setErrorMap((prev) => ({ ...prev, [key]: null }))
              if (e.data.controls && onControlsDiscovered) {
                onControlsDiscovered(e.data.controls)
              }
            } else if (e.data.status === "error") {
              setLoadingMap((prev) => ({ ...prev, [key]: false }))
              setErrorMap((prev) => ({ ...prev, [key]: e.data.error }))
            }
            break
          }
        }
      }
    }
    window.addEventListener("message", handleMsg)
    return () => window.removeEventListener("message", handleMsg)
  }, [sendToFrame, onControlsDiscovered])

  // Broadcast DialKit prop changes to ALL frames live
  useEffect(() => {
    for (const el of Object.values(iframeRefs.current)) {
      if (el?.contentWindow) {
        el.contentWindow.postMessage({ type: "UPDATE_DIALKIT", props: dialkitProps }, "*")
      }
    }
  }, [dialkitProps])

  // Push bundle when files change
  useEffect(() => {
    for (const key of artboardKeys) {
      if (readyFramesRef.current.has(key)) {
        sendToFrame(key)
      }
    }
  }, [cleanFiles, artboardKeys, sendToFrame])

  // Spacebar pan listener
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !e.repeat && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        setIsSpacePressed(true)
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        setIsSpacePressed(false)
        isPanningRef.current = false
      }
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [])

  // Canvas Pan handlers (clicking empty space or space+drag)
  const onCanvasMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking canvas background or space is pressed
    if (isSpacePressed || e.button === 1 || (e.target as HTMLElement).dataset.canvasSurface === "true") {
      isPanningRef.current = true
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
      e.preventDefault()
    }
  }

  // Frame Drag Move handlers
  const onStartDragArtboard = (e: React.MouseEvent, artboardId: string) => {
    e.stopPropagation()
    e.preventDefault()
    setDraggingId(artboardId)
    dragStartMouseRef.current = { x: e.clientX, y: e.clientY }
    const currentPos = positions[artboardId] || { x: 60, y: 60 }
    artboardStartPosRef.current = { ...currentPos }
    if (onSelectFile) onSelectFile(artboardId)
  }

  // Global mousemove for panning canvas or dragging artboard
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (draggingId) {
        // Move specific artboard in canvas coordinates
        const dx = (e.clientX - dragStartMouseRef.current.x) / zoom
        const dy = (e.clientY - dragStartMouseRef.current.y) / zoom
        const newX = Math.round(artboardStartPosRef.current.x + dx)
        const newY = Math.round(artboardStartPosRef.current.y + dy)
        setPositions((prev) => ({
          ...prev,
          [draggingId]: { x: newX, y: newY },
        }))
      } else if (isPanningRef.current) {
        onPanChange({
          x: e.clientX - panStartRef.current.x,
          y: e.clientY - panStartRef.current.y,
        })
      }
    }

    const onMouseUp = () => {
      if (draggingId) {
        setPositions((curr) => {
          savePositions(curr)
          return curr
        })
        setDraggingId(null)
      }
      isPanningRef.current = false
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
    }
  }, [draggingId, zoom, onPanChange, savePositions])

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.05 : 0.05
      const nextZoom = Math.min(Math.max(Math.round((zoom + delta) * 100) / 100, 0.2), 3.0)
      onZoomChange(nextZoom)
    } else if (isSpacePressed) {
      onPanChange({ x: pan.x - e.deltaX, y: pan.y - e.deltaY })
    }
  }

  // Auto-arrange all artboards in a tidy row
  const autoArrange = useCallback(() => {
    const frameWidth = FRAME_DIMENSIONS[frame].width
    const next: Record<string, ArtboardPosition> = {}
    artboardKeys.forEach((key, index) => {
      next[key] = {
        x: 80 + index * (frameWidth + 80),
        y: 80,
      }
    })
    setPositions(next)
    savePositions(next)
  }, [artboardKeys, frame, savePositions])

  const dim = FRAME_DIMENSIONS[frame]

  return (
    <div
      ref={containerRef}
      onMouseDown={onCanvasMouseDown}
      onWheel={onWheel}
      data-canvas-surface="true"
      className={`relative h-full w-full overflow-hidden select-none bg-[var(--c-canvas)] ${
        isSpacePressed ? (isPanningRef.current ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
      }`}
      style={{
        backgroundImage: "radial-gradient(circle, var(--c-line) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
      }}
    >
      {/* Top Canvas Utilities: Auto-Arrange & Count */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-2 rounded-full border border-[var(--c-line)] bg-background/90 backdrop-blur-md px-3 py-1 shadow-sm text-xs">
        <Sparkles className="size-3.5 text-accent" />
        <span className="font-medium text-ink-1">
          {artboardKeys.length} {artboardKeys.length === 1 ? "Artboard" : "Artboards"}
        </span>
        <span className="text-ink-3">·</span>
        <button
          type="button"
          onClick={autoArrange}
          className="text-ink-3 hover:text-ink-1 hover:underline text-[11px] font-mono active:scale-95 transition-transform"
          title="Rearrange artboards in a clean row"
        >
          Auto Arrange
        </button>
      </div>

      {/* Infinite Canvas Transform Plane */}
      <div
        data-canvas-surface="true"
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          transition: isPanningRef.current || draggingId ? "none" : "transform 75ms ease-out",
        }}
      >
        {artboardKeys.map((key) => {
          const pos = positions[key] || { x: 80, y: 80 }
          const title = extractTitle(cleanFiles[key], key)
          const isSelected = activeFile === key
          const isDragging = draggingId === key
          const isLoading = loadingMap[key] !== false
          const error = errorMap[key]

          return (
            <div
              key={key}
              style={{
                position: "absolute",
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                width: dim.width,
                zIndex: isDragging ? 50 : isSelected ? 40 : 10,
              }}
              className={`flex flex-col transition-shadow duration-150 ${
                isDragging ? "opacity-95 shadow-2xl scale-[1.01]" : ""
              }`}
              onClick={() => onSelectFile?.(key)}
            >
              {/* Artboard Frame Header Bar (Move Handle) */}
              <div
                onMouseDown={(e) => onStartDragArtboard(e, key)}
                className={`flex items-center justify-between rounded-t-2xl border border-b-0 border-[var(--c-line)] px-3.5 py-2.5 backdrop-blur-md transition-colors cursor-grab active:cursor-grabbing select-none ${
                  isSelected
                    ? "bg-accent-tint/90 border-accent/60 text-ink-1"
                    : "bg-background/90 text-ink-2 hover:bg-background"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <GripHorizontal className="size-4 shrink-0 text-ink-3 hover:text-ink-1" />
                  <span className="truncate text-xs font-semibold">{title}</span>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-mono text-accent shrink-0">
                    {key.split("/").pop()}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono text-ink-3">
                  <span>{dim.width} × {dim.height}</span>
                  {isSelected && (
                    <span className="flex items-center gap-1 text-accent font-medium">
                      <Check className="size-3" /> Active
                    </span>
                  )}
                </div>
              </div>

              {/* Artboard Live Frame */}
              <div
                style={{
                  width: dim.width,
                  height: dim.height,
                  background: dialkitProps.theme === "dark" ? "#0f1115" : "#ffffff",
                }}
                className={`relative overflow-hidden rounded-b-2xl border border-[var(--c-line)] shadow-xl transition-all duration-150 ${
                  isSelected ? "ring-2 ring-accent/60 shadow-2xl" : ""
                }`}
              >
                {/* Pointer events overlay while panning canvas or dragging frame */}
                {(isSpacePressed || isPanningRef.current || draggingId) && (
                  <div className="absolute inset-0 z-20 cursor-inherit pointer-events-auto" />
                )}

                <iframe
                  ref={(el) => {
                    iframeRefs.current[key] = el
                  }}
                  src={`/canvas-sandbox/${sessionId}?file=${encodeURIComponent(key)}`}
                  title={`Artboard ${key}`}
                  sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
                  className="h-full w-full border-0 bg-transparent"
                />

                {isLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur-xs">
                    <Loader2 className="size-6 animate-spin text-accent" />
                  </div>
                )}

                {error && (
                  <div className="absolute bottom-4 left-4 right-4 z-20 rounded-xl border border-rose-500/30 bg-rose-950/90 p-3 text-xs text-rose-200 backdrop-blur-md flex items-start gap-2.5">
                    <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-400" />
                    <div className="flex-1 font-mono text-[11px] whitespace-pre-wrap">{error}</div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
