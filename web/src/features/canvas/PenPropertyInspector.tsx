import { useCallback } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Layers,
  Palette,
  Type,
  Maximize2,
  Trash2,
  ArrowRight,
  Code2,
} from "lucide-react"
import type { PenFillGradient, PenNode, PenPadding } from "./penTypes"

interface PenPropertyInspectorProps {
  selectedNode: PenNode | null
  onUpdateNode: (updated: PenNode) => void
  onDeleteNode?: (id: string) => void
  saveStatus: "saved" | "saving" | "unsaved"
  onConvertToReact: () => void
  onPromoteToTask: () => void
}

const COLOR_SWATCHES = [
  "#0f1115",
  "#18191f",
  "#262730",
  "#3b82f6",
  "#6366f1",
  "#10b981",
  "#f43f5e",
  "#f59e0b",
  "#ffffff",
  "#000000",
]

export function PenPropertyInspector({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  saveStatus,
  onConvertToReact,
  onPromoteToTask,
}: PenPropertyInspectorProps) {
  // Update helpers
  const handlePropChange = useCallback(
    <K extends keyof PenNode>(prop: K, val: PenNode[K]) => {
      if (!selectedNode) return
      onUpdateNode({ ...selectedNode, [prop]: val })
    },
    [selectedNode, onUpdateNode]
  )

  const handlePaddingChange = useCallback(
    (side: keyof PenPadding, val: number) => {
      if (!selectedNode) return
      const cur =
        typeof selectedNode.padding === "object"
          ? { ...selectedNode.padding }
          : { top: selectedNode.padding, right: selectedNode.padding, bottom: selectedNode.padding, left: selectedNode.padding }
      cur[side] = val
      onUpdateNode({ ...selectedNode, padding: cur })
    },
    [selectedNode, onUpdateNode]
  )

  if (!selectedNode) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[rgba(255,255,255,0.08)] bg-[#121316] font-sans text-xs text-neutral-300">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
          <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-neutral-400">
            <Layers className="size-3.5 text-accent-text" />
            <span>pen.dev Inspector</span>
          </div>
          <span className="font-mono text-[10px] text-neutral-400">
            {saveStatus === "saved" ? "Saved ✨" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
          </span>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-neutral-500">
          <Layers className="size-8 opacity-40 mb-2" />
          <p className="text-xs font-medium text-neutral-400">No element selected</p>
          <p className="mt-1 text-2xs leading-relaxed text-neutral-500">
            Click any frame, shape, or text layer on the canvas to inspect and edit its properties.
          </p>

          <div className="mt-6 w-full space-y-2">
            <button
              type="button"
              onClick={onConvertToReact}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-[rgba(255,255,255,0.1)] bg-[#18191f] px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-[#20212a] active:scale-[0.98] transition-all"
            >
              <Code2 className="size-3.5 text-accent-text" />
              <span>Convert to React (0 Token)</span>
            </button>

            <button
              type="button"
              onClick={onPromoteToTask}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm"
            >
              <ArrowRight className="size-3.5" />
              <span>Promote to Task / Project</span>
            </button>
          </div>
        </div>
      </aside>
    )
  }

  const isText = selectedNode.type === "text"
  const isFrame = selectedNode.type === "frame"

  // Resolve fill string for color picker
  const currentFillHex =
    typeof selectedNode.fill === "string"
      ? selectedNode.fill
      : typeof selectedNode.fill === "object" && (selectedNode.fill as PenFillGradient)?.colors?.[0]?.color
      ? (selectedNode.fill as PenFillGradient).colors[0].color
      : "#18191f"

  const paddingObj: PenPadding =
    typeof selectedNode.padding === "object"
      ? selectedNode.padding
      : typeof selectedNode.padding === "number"
      ? { top: selectedNode.padding, right: selectedNode.padding, bottom: selectedNode.padding, left: selectedNode.padding }
      : {}

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[rgba(255,255,255,0.08)] bg-[#121316] font-sans text-xs text-neutral-300">
      {/* Top Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-accent-text font-semibold">
            {selectedNode.type}
          </span>
          <span className="truncate font-medium text-neutral-200">
            {selectedNode.name || selectedNode.id}
          </span>
        </div>

        <span className="font-mono text-[10px] text-neutral-400">
          {saveStatus === "saved" ? "Saved ✨" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
        </span>
      </header>

      {/* Main Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Text Content Editor (If Text Node) */}
        {isText && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-mono text-2xs uppercase tracking-wider text-neutral-400">
                Text Content
              </label>
            </div>
            <textarea
              value={selectedNode.text || ""}
              onChange={(e) => handlePropChange("text", e.target.value)}
              rows={3}
              className="w-full resize-y rounded-md border border-[rgba(255,255,255,0.1)] bg-[#18191f] p-2 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-accent focus:outline-none"
              placeholder="Type text copy…"
            />
          </section>
        )}

        {/* Geometry & Dimensions */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-neutral-400">
            <Maximize2 className="size-3" />
            <span>Dimensions</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
              <span className="w-5 font-mono text-2xs text-neutral-500">W</span>
              <input
                type="number"
                value={selectedNode.width ?? ""}
                onChange={(e) => handlePropChange("width", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                placeholder="auto"
              />
            </div>

            <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
              <span className="w-5 font-mono text-2xs text-neutral-500">H</span>
              <input
                type="number"
                value={selectedNode.height ?? ""}
                onChange={(e) => handlePropChange("height", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                placeholder="auto"
              />
            </div>

            <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
              <span className="w-5 font-mono text-2xs text-neutral-500">X</span>
              <input
                type="number"
                value={selectedNode.x ?? 0}
                onChange={(e) => handlePropChange("x", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
              />
            </div>

            <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
              <span className="w-5 font-mono text-2xs text-neutral-500">Y</span>
              <input
                type="number"
                value={selectedNode.y ?? 0}
                onChange={(e) => handlePropChange("y", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
              />
            </div>
          </div>

          {/* Corner Radius */}
          {!isText && (
            <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1 mt-1">
              <span className="w-14 font-mono text-2xs text-neutral-500">Radius</span>
              <input
                type="number"
                value={selectedNode.cornerRadius ?? 0}
                onChange={(e) => handlePropChange("cornerRadius", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
              />
            </div>
          )}
        </section>

        {/* Layout & Flexbox (For Frame Nodes) */}
        {isFrame && (
          <section className="space-y-2">
            <div className="flex items-center justify-between font-mono text-2xs uppercase tracking-wider text-neutral-400">
              <span>Auto Layout</span>
              <span className="text-neutral-500 font-mono text-[10px]">
                {selectedNode.layout || "none"}
              </span>
            </div>

            {/* Layout Direction */}
            <div className="flex rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] p-0.5">
              <button
                type="button"
                onClick={() => handlePropChange("layout", "none")}
                className={`flex-1 rounded py-1 text-center font-mono text-2xs transition-colors ${
                  !selectedNode.layout || selectedNode.layout === "none"
                    ? "bg-accent/20 text-accent-text font-semibold"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                None
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("layout", "vertical")}
                className={`flex-1 rounded py-1 text-center font-mono text-2xs transition-colors ${
                  selectedNode.layout === "vertical"
                    ? "bg-accent/20 text-accent-text font-semibold"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Vertical (Col)
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("layout", "horizontal")}
                className={`flex-1 rounded py-1 text-center font-mono text-2xs transition-colors ${
                  selectedNode.layout === "horizontal"
                    ? "bg-accent/20 text-accent-text font-semibold"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                Horizontal (Row)
              </button>
            </div>

            {/* Gap & Padding */}
            {selectedNode.layout && selectedNode.layout !== "none" && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
                  <span className="w-14 font-mono text-2xs text-neutral-500">Gap</span>
                  <input
                    type="number"
                    value={selectedNode.gap ?? 0}
                    onChange={(e) => handlePropChange("gap", Number(e.target.value))}
                    className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
                    <span className="w-7 font-mono text-2xs text-neutral-500">Pad T</span>
                    <input
                      type="number"
                      value={paddingObj.top ?? 0}
                      onChange={(e) => handlePaddingChange("top", Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
                    <span className="w-7 font-mono text-2xs text-neutral-500">Pad R</span>
                    <input
                      type="number"
                      value={paddingObj.right ?? 0}
                      onChange={(e) => handlePaddingChange("right", Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
                    <span className="w-7 font-mono text-2xs text-neutral-500">Pad B</span>
                    <input
                      type="number"
                      value={paddingObj.bottom ?? 0}
                      onChange={(e) => handlePaddingChange("bottom", Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
                    <span className="w-7 font-mono text-2xs text-neutral-500">Pad L</span>
                    <input
                      type="number"
                      value={paddingObj.left ?? 0}
                      onChange={(e) => handlePaddingChange("left", Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Fill / Color Picker */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-neutral-400">
            <Palette className="size-3" />
            <span>Fill / Color</span>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] p-1.5">
            <input
              type="color"
              value={currentFillHex.startsWith("#") ? currentFillHex.slice(0, 7) : "#ffffff"}
              onChange={(e) => handlePropChange("fill", e.target.value)}
              className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <input
              type="text"
              value={typeof selectedNode.fill === "string" ? selectedNode.fill : currentFillHex}
              onChange={(e) => handlePropChange("fill", e.target.value)}
              className="flex-1 bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
              placeholder="#18191f"
            />
          </div>

          {/* Quick Swatches */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {COLOR_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => handlePropChange("fill", hex)}
                style={{ backgroundColor: hex }}
                className="size-5 rounded border border-[rgba(255,255,255,0.15)] transition-transform hover:scale-110 active:scale-95"
                title={hex}
              />
            ))}
          </div>
        </section>

        {/* Typography (If Text Node) */}
        {isText && (
          <section className="space-y-2">
            <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-neutral-400">
              <Type className="size-3" />
              <span>Typography</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
                <span className="w-10 font-mono text-2xs text-neutral-500">Size</span>
                <input
                  type="number"
                  value={selectedNode.fontSize ?? 14}
                  onChange={(e) => handlePropChange("fontSize", Number(e.target.value))}
                  className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                />
              </div>

              <div className="flex items-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] px-2 py-1">
                <span className="w-12 font-mono text-2xs text-neutral-500">Weight</span>
                <select
                  value={String(selectedNode.fontWeight ?? "400")}
                  onChange={(e) => handlePropChange("fontWeight", e.target.value)}
                  className="w-full bg-transparent font-mono text-xs text-neutral-200 focus:outline-none"
                >
                  <option value="400" className="bg-[#121316]">400 Regular</option>
                  <option value="500" className="bg-[#121316]">500 Medium</option>
                  <option value="600" className="bg-[#121316]">600 Semibold</option>
                  <option value="700" className="bg-[#121316]">700 Bold</option>
                </select>
              </div>
            </div>

            {/* Align Buttons */}
            <div className="flex rounded-md border border-[rgba(255,255,255,0.08)] bg-[#18191f] p-0.5">
              <button
                type="button"
                onClick={() => handlePropChange("textAlign", "left")}
                className={`flex-1 py-1 flex justify-center rounded ${
                  selectedNode.textAlign === "left" || !selectedNode.textAlign
                    ? "bg-accent/20 text-accent-text"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <AlignLeft className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("textAlign", "center")}
                className={`flex-1 py-1 flex justify-center rounded ${
                  selectedNode.textAlign === "center"
                    ? "bg-accent/20 text-accent-text"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <AlignCenter className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("textAlign", "right")}
                className={`flex-1 py-1 flex justify-center rounded ${
                  selectedNode.textAlign === "right"
                    ? "bg-accent/20 text-accent-text"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                <AlignRight className="size-3.5" />
              </button>
            </div>
          </section>
        )}

        {/* Delete action */}
        {onDeleteNode && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onDeleteNode(selectedNode.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/10 py-1.5 text-xs text-red-400 hover:bg-red-500/20 active:scale-[0.98] transition-colors"
            >
              <Trash2 className="size-3.5" />
              <span>Delete Layer</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <footer className="border-t border-[rgba(255,255,255,0.08)] p-3 space-y-2 bg-[#101114]">
        <button
          type="button"
          onClick={onConvertToReact}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-[rgba(255,255,255,0.1)] bg-[#18191f] py-2 text-xs font-medium text-neutral-200 hover:bg-[#20212a] active:scale-[0.98] transition-all"
        >
          <Code2 className="size-3.5 text-accent-text" />
          <span>Convert to React (0 Token)</span>
        </button>

        <button
          type="button"
          onClick={onPromoteToTask}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent py-2 text-xs font-semibold text-white hover:bg-accent/90 active:scale-[0.98] transition-all shadow-sm"
        >
          <ArrowRight className="size-3.5" />
          <span>Promote to Task / Project</span>
        </button>
      </footer>
    </aside>
  )
}
