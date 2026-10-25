import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { AlertCircle, Loader2 } from "lucide-react"

export interface CanvasSandboxProps {
  sessionId: string
  files: Record<string, string>
  entryFile?: string
  dialkitProps: Record<string, any>
  frame: "freeform" | "desktop" | "tablet" | "mobile"
  zoom: number // Decimal scale, 1.0 = 100%
  pan: { x: number; y: number }
  onPanChange: (pan: { x: number; y: number }) => void
  onZoomChange: (zoom: number) => void
  onControlsDiscovered?: (controls: any[]) => void
}

const FRAME_DIMENSIONS: Record<string, { width: string; height: string; label: string }> = {
  freeform: { width: "100%", height: "100%", label: "Responsive Stage" },
  desktop: { width: "1200px", height: "800px", label: "Desktop · 1200 × 800" },
  tablet: { width: "768px", height: "1024px", label: "Tablet · 768 × 1024" },
  mobile: { width: "375px", height: "812px", label: "iPhone 16 Pro · 375 × 812" },
}

export function CanvasSandbox({
  sessionId,
  files,
  entryFile,
  dialkitProps,
  frame,
  zoom,
  pan,
  onPanChange,
  onZoomChange,
  onControlsDiscovered,
}: CanvasSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const isFrameReadyRef = useRef(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Filter out macOS AppleDouble files and OS metadata
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

  // Determine valid entry point
  const activeEntry = useMemo(() => {
    if (entryFile && cleanFiles[entryFile]) return entryFile
    const keys = Object.keys(cleanFiles)
    const bento = keys.find((k) => k.includes("bento") || k.includes("component") || k.includes("hero"))
    if (bento) return bento
    const candidate = keys.find((k) => k.endsWith(".tsx") && !k.endsWith("page.tsx"))
    if (candidate) return candidate
    return keys[0] || ""
  }, [entryFile, cleanFiles])

  // Push current bundle to the iframe
  const pushBundleToFrame = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !isFrameReadyRef.current) return
    iframeRef.current.contentWindow.postMessage(
      {
        type: "LOAD_CANVAS",
        files: cleanFiles,
        entryFile: activeEntry,
        props: dialkitProps,
      },
      "*",
    )
  }, [cleanFiles, activeEntry, dialkitProps])

  // Send updates when files or entry change
  useEffect(() => {
    if (isFrameReadyRef.current && Object.keys(cleanFiles).length > 0) {
      pushBundleToFrame()
    }
  }, [cleanFiles, activeEntry, pushBundleToFrame])

  // Send prop changes live to iframe without full bundle reload
  useEffect(() => {
    if (isFrameReadyRef.current && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "UPDATE_DIALKIT", props: dialkitProps },
        "*",
      )
    }
  }, [dialkitProps])

  // Handle postMessage communication from iframe
  useEffect(() => {
    function handleMsg(e: MessageEvent) {
      if (e.data?.type === "CANVAS_FRAME_READY") {
        isFrameReadyRef.current = true
        pushBundleToFrame()
      } else if (e.data?.type === "CANVAS_STATUS") {
        if (e.data.status === "ready") {
          setIsLoading(false)
          setRuntimeError(null)
          if (e.data.controls && onControlsDiscovered) {
            onControlsDiscovered(e.data.controls)
          }
        } else if (e.data.status === "error") {
          setIsLoading(false)
          setRuntimeError(e.data.error)
        }
      }
    }
    window.addEventListener("message", handleMsg)
    return () => window.removeEventListener("message", handleMsg)
  }, [pushBundleToFrame, onControlsDiscovered])

  // Spacebar panning listener
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

  // Mouse pan handlers
  const onMouseDown = (e: React.MouseEvent) => {
    if (isSpacePressed || e.button === 1) {
      isPanningRef.current = true
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
      e.preventDefault()
    }
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanningRef.current) {
      onPanChange({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      })
    }
  }

  const onMouseUp = () => {
    isPanningRef.current = false
  }

  // Wheel zoom with normalized scale (1.0 = 100%)
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

  const dim = FRAME_DIMENSIONS[frame]

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      className={`relative h-full w-full overflow-hidden select-none ${
        isSpacePressed ? (isPanningRef.current ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
      }`}
      style={{
        backgroundImage: "radial-gradient(circle, var(--c-line) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Pan & Zoom Transform Layer */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          transition: isPanningRef.current ? "none" : "transform 100ms ease-out",
        }}
      >
        <div
          className={`pointer-events-auto relative shadow-2xl transition-all duration-200 ${
            frame === "freeform"
              ? "h-full w-full max-w-6xl max-h-[85vh] rounded-2xl"
              : "rounded-3xl border border-[var(--c-line)] shadow-xl"
          }`}
          style={{
            width: dim.width,
            height: dim.height,
            background: dialkitProps.theme === "dark" ? "#0f1115" : "#ffffff",
          }}
        >
          {/* Frame Header Tag */}
          <div className="absolute -top-7 left-2 flex items-center gap-2 text-[11px] font-mono text-ink-3">
            <span>{dim.label}</span>
            {activeEntry && <span className="opacity-60">• {activeEntry}</span>}
          </div>

          {/* Sandboxed Live Evaluator */}
          <iframe
            ref={iframeRef}
            src={`/canvas-sandbox/${sessionId}`}
            title="Live Canvas Component"
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
            className="h-full w-full rounded-inherit border-0 bg-transparent"
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-xs rounded-inherit">
              <Loader2 className="size-6 animate-spin text-ink-2" />
            </div>
          )}

          {runtimeError && (
            <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-rose-500/30 bg-rose-950/80 p-3 text-xs text-rose-200 backdrop-blur-md flex items-start gap-2.5">
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1 font-mono text-[11px] whitespace-pre-wrap">{runtimeError}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
