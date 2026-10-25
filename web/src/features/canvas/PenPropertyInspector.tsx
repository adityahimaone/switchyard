import { useCallback, useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  ArrowDown,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Code2,
  Hash,
  Layers,
  LayoutGrid,
  Minus,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react"
import type { PenNode, PenPadding } from "./penTypes"
import { cn } from "@/lib/utils"

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
  const [contextOpen, setContextOpen] = useState(false)
  const [fillPickerOpen, setFillPickerOpen] = useState(false)

  // Update helpers
  const handlePropChange = useCallback(
    <K extends keyof PenNode>(prop: K, val: PenNode[K]) => {
      if (!selectedNode) return
      onUpdateNode({ ...selectedNode, [prop]: val })
    },
    [selectedNode, onUpdateNode]
  )

  if (!selectedNode) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[rgba(255,255,255,0.08)] bg-[#121318] font-sans text-xs text-neutral-300 select-none">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4">
          <div className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wider text-neutral-400">
            <Hash className="size-3.5 text-accent-text" />
            <span>Inspector</span>
          </div>
          <span className="font-mono text-[10px] text-neutral-400">
            {saveStatus === "saved" ? "Saved ✨" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
          </span>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-neutral-500">
          <Layers className="size-8 opacity-40 mb-2" />
          <p className="text-xs font-medium text-neutral-400">No element selected</p>
          <p className="mt-1 text-2xs leading-relaxed text-neutral-500">
            Click any frame, layer, or text on the canvas to inspect and edit its properties.
          </p>

          <div className="mt-6 w-full space-y-2">
            <button
              type="button"
              onClick={onConvertToReact}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#181922] px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-[#20212a] active:scale-[0.98] transition-all"
            >
              <Code2 className="size-3.5 text-accent-text" />
              <span>Convert to React (0 Token)</span>
            </button>

            <button
              type="button"
              onClick={onPromoteToTask}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-accent-text/30 bg-accent-text/10 px-3 py-2 text-xs font-medium text-accent-text hover:bg-accent-text/20 active:scale-[0.98] transition-all"
            >
              <Sparkles className="size-3.5" />
              <span>Promote to Kanban Task</span>
            </button>
          </div>
        </div>
      </aside>
    )
  }

  const isText = selectedNode.type === "text"
  const isFrame = selectedNode.type === "frame" || selectedNode.type === "rectangle"

  // Current fill value
  const curFillColor = typeof selectedNode.fill === "string" ? selectedNode.fill : "#121316"
  const isGradient = typeof selectedNode.fill === "object" && selectedNode.fill !== null

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[rgba(255,255,255,0.08)] bg-[#121318] font-sans text-xs text-neutral-300 select-none overflow-y-auto">
      {/* Header matching pen.dev Image 1 */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-4 bg-[#14151d]">
        <div className="flex items-center gap-1.5 min-w-0">
          <Hash className="size-3.5 text-neutral-400 shrink-0" />
          <input
            type="text"
            value={selectedNode.name || selectedNode.id}
            onChange={(e) => handlePropChange("name", e.target.value)}
            className="w-36 truncate bg-transparent font-medium text-xs text-white outline-none focus:border-b focus:border-accent-text"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-neutral-400 mr-1">
            {saveStatus === "saved" ? "Saved ✨" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
          </span>
          {onDeleteNode && (
            <button
              type="button"
              onClick={() => onDeleteNode(selectedNode.id)}
              className="flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
              title="Delete element"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Prominent Action Button matching Image 1: "+ Create Component" */}
      <div className="p-3 border-b border-[rgba(255,255,255,0.06)]">
        <button
          type="button"
          onClick={onConvertToReact}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1e202a] hover:bg-[#262836] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-xs font-semibold text-white shadow-sm active:scale-[0.98] transition-all"
        >
          <Code2 className="size-3.5 text-accent-text" />
          <span>Convert to React (0 Token)</span>
        </button>
      </div>

      {/* Section: Context (Collapsible) */}
      <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-2.5">
        <button
          type="button"
          onClick={() => setContextOpen(!contextOpen)}
          className="flex w-full items-center justify-between text-2xs uppercase tracking-wider font-semibold text-neutral-400 hover:text-neutral-200"
        >
          <span>Context</span>
          {contextOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        {contextOpen && (
          <div className="mt-2 text-2xs text-neutral-500 font-mono">
            ID: {selectedNode.id} • Type: {selectedNode.type}
          </div>
        )}
      </div>

      {/* Section: Alignment matching Image 1 */}
      <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
        <h4 className="text-2xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Alignment</h4>
        <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] p-1">
          <button
            type="button"
            title="Align Left"
            onClick={() => handlePropChange("justifyContent", "start")}
            className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
          >
            <AlignLeft className="size-3.5" />
          </button>
          <button
            type="button"
            title="Align Center Horizontal"
            onClick={() => handlePropChange("alignItems", "center")}
            className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
          >
            <AlignCenter className="size-3.5" />
          </button>
          <button
            type="button"
            title="Align Right"
            onClick={() => handlePropChange("justifyContent", "end")}
            className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
          >
            <AlignRight className="size-3.5" />
          </button>
          <div className="h-4 w-px bg-[rgba(255,255,255,0.1)]" />
          <button
            type="button"
            title="Align Top"
            onClick={() => handlePropChange("alignItems", "start")}
            className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
          >
            <AlignVerticalJustifyStart className="size-3.5" />
          </button>
          <button
            type="button"
            title="Align Center Vertical"
            onClick={() => handlePropChange("justifyContent", "center")}
            className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
          >
            <AlignVerticalJustifyCenter className="size-3.5" />
          </button>
          <button
            type="button"
            title="Align Bottom"
            onClick={() => handlePropChange("alignItems", "end")}
            className="flex size-7 items-center justify-center rounded text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
          >
            <AlignVerticalJustifyEnd className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Section: Position matching Image 1 */}
      <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
        <h4 className="text-2xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Position</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
            <span className="font-mono text-neutral-500 text-2xs mr-2">X</span>
            <input
              type="number"
              value={selectedNode.x ?? 0}
              onChange={(e) => handlePropChange("x", parseInt(e.target.value) || 0)}
              className="w-full bg-transparent font-mono text-xs text-white outline-none"
            />
          </div>
          <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
            <span className="font-mono text-neutral-500 text-2xs mr-2">Y</span>
            <input
              type="number"
              value={selectedNode.y ?? 0}
              onChange={(e) => handlePropChange("y", parseInt(e.target.value) || 0)}
              className="w-full bg-transparent font-mono text-xs text-white outline-none"
            />
          </div>
          <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
            <span className="font-mono text-neutral-500 text-2xs mr-2">∠</span>
            <input
              type="number"
              value={selectedNode.rotation ?? 0}
              onChange={(e) => handlePropChange("rotation", parseInt(e.target.value) || 0)}
              placeholder="0°"
              className="w-full bg-transparent font-mono text-xs text-white outline-none"
            />
            <span className="text-neutral-500 text-2xs">°</span>
          </div>
        </div>
      </div>

      {/* Section: Layout (Auto-Layout / Flexbox) matching Image 1 */}
      {isFrame && (
        <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-neutral-400">Layout</h4>
            <LayoutGrid className="size-3 text-neutral-500" />
          </div>

          {/* Direction toggle: Auto / Vertical / Horizontal */}
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] p-0.5">
            <button
              type="button"
              onClick={() => handlePropChange("layout", "none")}
              className={cn(
                "py-1 text-2xs font-medium rounded transition-colors text-center",
                (!selectedNode.layout || selectedNode.layout === "none") ? "bg-[#252735] text-white" : "text-neutral-400 hover:text-white"
              )}
            >
              Free
            </button>
            <button
              type="button"
              onClick={() => handlePropChange("layout", "vertical")}
              className={cn(
                "flex items-center justify-center py-1 text-2xs font-medium rounded transition-colors",
                selectedNode.layout === "vertical" ? "bg-[#252735] text-accent-text" : "text-neutral-400 hover:text-white"
              )}
            >
              <ArrowDown className="size-3 mr-1" /> Col
            </button>
            <button
              type="button"
              onClick={() => handlePropChange("layout", "horizontal")}
              className={cn(
                "flex items-center justify-center py-1 text-2xs font-medium rounded transition-colors",
                selectedNode.layout === "horizontal" ? "bg-[#252735] text-accent-text" : "text-neutral-400 hover:text-white"
              )}
            >
              <ArrowRight className="size-3 mr-1" /> Row
            </button>
          </div>

          {/* Dimensions W and H matching Image 1 */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
              <span className="font-mono text-neutral-500 text-2xs mr-2">W</span>
              <input
                type="number"
                value={selectedNode.width ?? 390}
                onChange={(e) => handlePropChange("width", parseInt(e.target.value) || 0)}
                className="w-full bg-transparent font-mono text-xs text-white outline-none"
              />
            </div>
            <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
              <span className="font-mono text-neutral-500 text-2xs mr-2">H</span>
              <input
                type="number"
                value={selectedNode.height ?? 844}
                onChange={(e) => handlePropChange("height", parseInt(e.target.value) || 0)}
                className="w-full bg-transparent font-mono text-xs text-white outline-none"
              />
            </div>
          </div>

          {/* Fill Width & Fill Height checkboxes matching Image 1 */}
          <div className="mt-2.5 flex items-center justify-between text-2xs text-neutral-400">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-neutral-200">
              <input
                type="checkbox"
                checked={selectedNode.fillWidth || false}
                onChange={(e) => handlePropChange("fillWidth", e.target.checked)}
                className="size-3.5 rounded bg-[#161720] border-[rgba(255,255,255,0.1)]"
              />
              <span>Fill Width</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-neutral-200">
              <input
                type="checkbox"
                checked={selectedNode.fillHeight || false}
                onChange={(e) => handlePropChange("fillHeight", e.target.checked)}
                className="size-3.5 rounded bg-[#161720] border-[rgba(255,255,255,0.1)]"
              />
              <span>Fill Height</span>
            </label>
          </div>

          {/* Gap & Padding */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <span className="font-mono text-[10px] text-neutral-500 uppercase">Gap</span>
              <div className="mt-1 flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
                <input
                  type="number"
                  value={selectedNode.gap ?? 0}
                  onChange={(e) => handlePropChange("gap", parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent font-mono text-xs text-white outline-none"
                />
                <span className="text-neutral-500 text-2xs">px</span>
              </div>
            </div>
            <div>
              <span className="font-mono text-[10px] text-neutral-500 uppercase">Padding</span>
              <div className="mt-1 flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
                <input
                  type="number"
                  value={typeof selectedNode.padding === "number" ? selectedNode.padding : (selectedNode.padding as PenPadding)?.top ?? 16}
                  onChange={(e) => handlePropChange("padding", parseInt(e.target.value) || 0)}
                  className="w-full bg-transparent font-mono text-xs text-white outline-none"
                />
                <span className="text-neutral-500 text-2xs">px</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section: Typography (if text layer) */}
      {isText && (
        <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-neutral-400">Typography</h4>
            <Type className="size-3 text-neutral-500" />
          </div>

          <div className="space-y-2">
            <div>
              <span className="font-mono text-[10px] text-neutral-500">CONTENT</span>
              <textarea
                rows={2}
                value={selectedNode.text || ""}
                onChange={(e) => handlePropChange("text", e.target.value)}
                className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] p-2 text-xs text-white outline-none focus:border-accent-text"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
                <span className="text-neutral-500 text-2xs mr-2 font-mono">Size</span>
                <input
                  type="number"
                  value={selectedNode.fontSize ?? 14}
                  onChange={(e) => handlePropChange("fontSize", parseInt(e.target.value) || 14)}
                  className="w-full bg-transparent font-mono text-xs text-white outline-none"
                />
              </div>

              <select
                value={String(selectedNode.fontWeight ?? "400")}
                onChange={(e) => handlePropChange("fontWeight", e.target.value)}
                className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5 font-mono text-xs text-white outline-none"
              >
                <option value="400">Regular (400)</option>
                <option value="500">Medium (500)</option>
                <option value="600">Semibold (600)</option>
                <option value="700">Bold (700)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Section: Appearance matching Image 1 */}
      <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
        <h4 className="text-2xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">Appearance</h4>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
            <span className="text-neutral-500 text-2xs mr-2 font-mono">Opacity</span>
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round((selectedNode.opacity ?? 1) * 100)}
              onChange={(e) => handlePropChange("opacity", (parseInt(e.target.value) || 100) / 100)}
              className="w-full bg-transparent font-mono text-xs text-white outline-none"
            />
            <span className="text-neutral-500 text-2xs">%</span>
          </div>

          <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
            <span className="text-neutral-500 text-2xs mr-2 font-mono">Radius</span>
            <input
              type="number"
              value={selectedNode.cornerRadius ?? 0}
              onChange={(e) => handlePropChange("cornerRadius", parseInt(e.target.value) || 0)}
              className="w-full bg-transparent font-mono text-xs text-white outline-none"
            />
            <span className="text-neutral-500 text-2xs">px</span>
          </div>
        </div>

        <div className="mt-2.5">
          <label className="flex items-center gap-2 cursor-pointer text-2xs text-neutral-400 hover:text-neutral-200">
            <input
              type="checkbox"
              checked={selectedNode.clip || false}
              onChange={(e) => handlePropChange("clip", e.target.checked)}
              className="size-3.5 rounded bg-[#161720] border-[rgba(255,255,255,0.1)]"
            />
            <span>Clip Content</span>
          </label>
        </div>
      </div>

      {/* Section: Fill matching Image 1 */}
      <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-2xs font-semibold uppercase tracking-wider text-neutral-400">Fill</h4>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Add fill"
              onClick={() => handlePropChange("fill", "#1e2029")}
              className="flex size-5 items-center justify-center rounded text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Fill Row matching Image 1 */}
        <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] p-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="size-5 shrink-0 rounded border border-[rgba(255,255,255,0.2)] shadow-sm"
              style={{ backgroundColor: curFillColor }}
            />
            <span className="font-mono text-xs text-neutral-200 truncate">
              {isGradient ? "gradient" : curFillColor}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFillPickerOpen(!fillPickerOpen)}
              className="p-1 rounded text-neutral-400 hover:text-white"
              title="Choose color"
            >
              <Palette className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handlePropChange("fill", undefined)}
              className="p-1 rounded text-neutral-400 hover:text-red-400"
              title="Remove fill"
            >
              <Minus className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Color Palette dropdown */}
        {fillPickerOpen && (
          <div className="mt-2 grid grid-cols-5 gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#1a1b24] p-2">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => {
                  handlePropChange("fill", swatch)
                  setFillPickerOpen(false)
                }}
                className="size-6 rounded-md border border-[rgba(255,255,255,0.15)] hover:scale-110 active:scale-95 transition-transform"
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Section: Stroke matching Image 1 */}
      <div className="border-b border-[rgba(255,255,255,0.06)] px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-2xs font-semibold uppercase tracking-wider text-neutral-400">Stroke</h4>
          <button
            type="button"
            onClick={() => {
              if (selectedNode.stroke) {
                handlePropChange("stroke", undefined)
              } else {
                handlePropChange("stroke", "rgba(255,255,255,0.15)")
                handlePropChange("strokeWidth", 1)
              }
            }}
            className="flex size-5 items-center justify-center rounded text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white"
          >
            {selectedNode.stroke ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
          </button>
        </div>
        {selectedNode.stroke && (
          <div className="flex items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#161720] px-2 py-1.5">
            <span className="font-mono text-neutral-400 text-2xs truncate flex-1">{selectedNode.stroke}</span>
            <input
              type="number"
              min={1}
              max={12}
              value={selectedNode.strokeWidth ?? 1}
              onChange={(e) => handlePropChange("strokeWidth", parseInt(e.target.value) || 1)}
              className="w-10 bg-transparent font-mono text-xs text-white text-right outline-none"
            />
            <span className="text-neutral-500 text-2xs">px</span>
          </div>
        )}
      </div>

      {/* Section: Effects matching Image 1 */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-2xs font-semibold uppercase tracking-wider text-neutral-400">Effects</h4>
          <Plus className="size-3.5 text-neutral-500" />
        </div>
        <div className="rounded-lg border border-dashed border-[rgba(255,255,255,0.08)] bg-[#14151e]/50 p-2 text-center text-2xs text-neutral-500">
          Drop shadow, inner blur & glassmorphic depth
        </div>
      </div>
    </aside>
  )
}
