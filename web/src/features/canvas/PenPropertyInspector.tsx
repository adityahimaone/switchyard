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
  ChevronsUpDown,
  Code2,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Hash,
  LayoutGrid,
  Maximize2,
  Minus,
  PanelRightClose,
  Plus,
  PlusCircle,
  RotateCw,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react"
import type { PenNode } from "./penTypes"
import { cn } from "@/lib/utils"

interface PenPropertyInspectorProps {
  selectedNode: PenNode | null
  onUpdateNode: (updated: PenNode) => void
  onDeleteNode?: (id: string) => void
  onCloseInspector?: () => void
  saveStatus: "saved" | "saving" | "unsaved"
  onConvertToReact: () => void
  onPromoteToTask: () => void
}

const COLOR_SWATCHES = [
  "#0f1115",
  "#181920",
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
  onCloseInspector,
  saveStatus,
  onConvertToReact,
  onPromoteToTask,
}: PenPropertyInspectorProps) {
  const [contextOpen, setContextOpen] = useState(false)
  const [fillPickerOpen, setFillPickerOpen] = useState(false)
  const [codeDrawerOpen, setCodeDrawerOpen] = useState(false)
  const [strokeActive, setStrokeActive] = useState(() => Boolean(selectedNode?.stroke))
  const [effectsActive, setEffectsActive] = useState(() => Boolean(selectedNode?.effects && selectedNode.effects !== "none"))

  // Update helpers
  const handlePropChange = useCallback(
    <K extends keyof PenNode>(prop: K, val: PenNode[K]) => {
      if (!selectedNode) return
      onUpdateNode({ ...selectedNode, [prop]: val })
    },
    [selectedNode, onUpdateNode]
  )

  // Floating empty state when no layer is selected
  if (!selectedNode) {
    return (
      <aside className="absolute top-3 right-3 bottom-3 w-72 sm:w-80 z-30 flex flex-col rounded-2xl border border-border/80 bg-card/95 dark:bg-[#15161d]/95 backdrop-blur-xl shadow-2xl overflow-hidden font-sans text-xs text-foreground select-none">
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-border/50 px-3.5 bg-muted/30">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-muted-foreground">
            <Hash className="size-3.5 text-accent-text" />
            <span>Canvas Root</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {saveStatus === "saved" ? "Saved ✨" : saveStatus === "saving" ? "Saving…" : "Unsaved"}
            </span>
            {onCloseInspector && (
              <button
                type="button"
                onClick={onCloseInspector}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Close Inspector"
              >
                <PanelRightClose className="size-3.5" />
              </button>
            )}
          </div>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center p-5 text-center text-muted-foreground">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-muted/60 mb-3 text-muted-foreground">
            <LayoutGrid className="size-5 opacity-70" />
          </div>
          <p className="text-xs font-semibold text-foreground">Select a layer</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground max-w-56">
            Click any frame, layer, or text on the canvas to inspect and edit its physical properties.
          </p>

          <div className="mt-6 w-full space-y-2">
            <button
              type="button"
              onClick={onConvertToReact}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold px-3 py-2 text-xs hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
            >
              <PlusCircle className="size-3.5" />
              <span>Create Component</span>
            </button>

            <button
              type="button"
              onClick={onPromoteToTask}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent-text/30 bg-accent-text/10 px-3 py-2 text-xs font-medium text-accent-text hover:bg-accent-text/20 active:scale-[0.98] transition-all"
            >
              <Sparkles className="size-3.5" />
              <span>Promote to Task Card</span>
            </button>
          </div>
        </div>
      </aside>
    )
  }

  // Active fill representation
  const curFillColor = typeof selectedNode.fill === "string" ? selectedNode.fill : "#181920"
  const isFillHidden = selectedNode.fill === "transparent" || selectedNode.fill === ""

  return (
    <aside className="absolute top-3 right-3 bottom-3 w-72 sm:w-80 z-30 flex flex-col rounded-2xl border border-border/80 bg-card/95 dark:bg-[#15161d]/95 backdrop-blur-xl shadow-2xl overflow-hidden font-sans text-xs text-foreground select-none">
      {/* 1. Header matching Reference Image: "# Mellow" and Dock icon */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-border/50 px-3.5 bg-muted/30">
        <div className="flex items-center gap-1.5 min-w-0">
          <Hash className="size-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={selectedNode.name || selectedNode.id}
            onChange={(e) => handlePropChange("name", e.target.value)}
            className="w-36 truncate bg-transparent font-semibold text-xs text-foreground outline-none focus:border-b focus:border-accent-text"
            placeholder="Layer Name"
          />
        </div>
        <div className="flex items-center gap-1">
          {onDeleteNode && (
            <button
              type="button"
              onClick={() => onDeleteNode(selectedNode.id)}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Delete element"
            >
              <Trash2 className="size-3" />
            </button>
          )}
          {onCloseInspector && (
            <button
              type="button"
              onClick={onCloseInspector}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-0.5"
              title="Close panel"
            >
              <PanelRightClose className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-3 space-y-3.5">
        {/* 2. Primary Action Button matching Reference Image: "⨁ Create Component" */}
        <button
          type="button"
          onClick={onConvertToReact}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-muted/80 dark:bg-[#20222a] hover:bg-muted dark:hover:bg-[#272934] border border-border/70 dark:border-white/10 px-3 py-2 text-xs font-semibold text-foreground shadow-sm active:scale-[0.98] transition-all"
        >
          <PlusCircle className="size-3.5 text-accent-text" />
          <span>Create Component</span>
        </button>

        {/* 3. Section: Context (Collapsible) matching Reference Image */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setContextOpen(!contextOpen)}
            className="flex w-full items-center justify-between text-[11px] font-semibold text-muted-foreground hover:text-foreground py-0.5"
          >
            <span>Context</span>
            {contextOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
          {contextOpen && (
            <div className="mt-2 rounded-lg bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground space-y-1">
              <div>Type: <span className="text-foreground">{selectedNode.type}</span></div>
              <div>ID: <span className="text-foreground">{selectedNode.id}</span></div>
              {selectedNode.children && (
                <div>Children: <span className="text-foreground">{selectedNode.children.length}</span> layers</div>
              )}
            </div>
          )}
        </div>

        {/* 4. Section: Alignment matching Reference Image */}
        <div className="pt-2 space-y-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground">Alignment</div>
          <div className="grid grid-cols-2 gap-1.5">
            {/* Horizontal Alignment Group */}
            <div className="flex items-center rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] p-0.5">
              <button
                type="button"
                onClick={() => handlePropChange("alignItems", "start")}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95",
                  selectedNode.alignItems === "start" && "bg-background text-foreground shadow-xs"
                )}
                title="Align Left"
              >
                <AlignLeft className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("alignItems", "center")}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95",
                  selectedNode.alignItems === "center" && "bg-background text-foreground shadow-xs"
                )}
                title="Align Center"
              >
                <AlignCenter className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("alignItems", "end")}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95",
                  selectedNode.alignItems === "end" && "bg-background text-foreground shadow-xs"
                )}
                title="Align Right"
              >
                <AlignRight className="size-3.5" />
              </button>
            </div>

            {/* Vertical Alignment Group */}
            <div className="flex items-center rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] p-0.5">
              <button
                type="button"
                onClick={() => handlePropChange("justifyContent", "start")}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95",
                  selectedNode.justifyContent === "start" && "bg-background text-foreground shadow-xs"
                )}
                title="Align Top"
              >
                <AlignVerticalJustifyStart className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("justifyContent", "center")}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95",
                  selectedNode.justifyContent === "center" && "bg-background text-foreground shadow-xs"
                )}
                title="Align Middle"
              >
                <AlignVerticalJustifyCenter className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("justifyContent", "end")}
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95",
                  selectedNode.justifyContent === "end" && "bg-background text-foreground shadow-xs"
                )}
                title="Align Bottom"
              >
                <AlignVerticalJustifyEnd className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 5. Section: Position matching Reference Image */}
        <div className="pt-2 space-y-1.5">
          <div className="text-[11px] font-semibold text-muted-foreground">Position</div>
          {/* X and Y Inputs */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">X</span>
              <input
                type="number"
                value={selectedNode.x ?? 0}
                onChange={(e) => handlePropChange("x", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">Y</span>
              <input
                type="number"
                value={selectedNode.y ?? 0}
                onChange={(e) => handlePropChange("y", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
              />
            </div>
          </div>

          {/* Rotation & Flip Controls */}
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">∠</span>
              <input
                type="number"
                value={selectedNode.rotation ?? 0}
                onChange={(e) => handlePropChange("rotation", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
              />
              <span className="text-[10px] text-muted-foreground">°</span>
            </div>

            <div className="flex items-center rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] p-0.5">
              <button
                type="button"
                onClick={() => handlePropChange("rotation", ((selectedNode.rotation ?? 0) + 90) % 360)}
                className="flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95"
                title="Rotate 90°"
              >
                <RotateCw className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("rotation", ((selectedNode.rotation ?? 0) + 180) % 360)}
                className="flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95"
                title="Flip Vertical"
              >
                <FlipVertical className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handlePropChange("rotation", (360 - (selectedNode.rotation ?? 0)) % 360)}
                className="flex flex-1 items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-all active:scale-95"
                title="Flip Horizontal"
              >
                <FlipHorizontal className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 6. Section: Layout matching Reference Image */}
        <div className="pt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>Layout</span>
            <LayoutGrid className="size-3.5 opacity-60" />
          </div>

          {/* 3-Segment Layout Switcher: Free / Col / Row */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] p-0.5">
            <button
              type="button"
              onClick={() => handlePropChange("layout", "none")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-xs transition-all active:scale-95",
                (!selectedNode.layout || selectedNode.layout === "none")
                  ? "bg-background text-foreground shadow-xs font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Freeform / Absolute"
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handlePropChange("layout", "vertical")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-xs transition-all active:scale-95",
                selectedNode.layout === "vertical"
                  ? "bg-background text-foreground shadow-xs font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Column (Vertical)"
            >
              <ArrowDown className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handlePropChange("layout", "horizontal")}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-xs transition-all active:scale-95",
                selectedNode.layout === "horizontal"
                  ? "bg-background text-foreground shadow-xs font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title="Row (Horizontal)"
            >
              <ArrowRight className="size-3.5" />
            </button>
          </div>

          {/* Dimensions Subheading & Inputs */}
          <div className="text-[10px] font-medium text-muted-foreground pt-0.5">Dimensions</div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">W</span>
              <input
                type="number"
                value={selectedNode.width ?? 0}
                onChange={(e) => handlePropChange("width", Math.max(1, Number(e.target.value)))}
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">H</span>
              <input
                type="number"
                value={selectedNode.height ?? 0}
                onChange={(e) => handlePropChange("height", Math.max(1, Number(e.target.value)))}
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
              />
            </div>
          </div>

          {/* Fill Width & Fill Height Checkboxes */}
          <div className="grid grid-cols-2 gap-2 pt-0.5 text-[11px] text-muted-foreground">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
              <input
                type="checkbox"
                checked={Boolean(selectedNode.fillWidth)}
                onChange={(e) => handlePropChange("fillWidth", e.target.checked)}
                className="rounded border-border text-accent-text focus:ring-0"
              />
              <span>Fill Width</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
              <input
                type="checkbox"
                checked={Boolean(selectedNode.fillHeight)}
                onChange={(e) => handlePropChange("fillHeight", e.target.checked)}
                className="rounded border-border text-accent-text focus:ring-0"
              />
              <span>Fill Height</span>
            </label>
          </div>

          {/* Gap & Padding if auto-layout */}
          {selectedNode.layout && selectedNode.layout !== "none" && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
                <span className="font-mono text-[10px] text-muted-foreground">Gap</span>
                <input
                  type="number"
                  value={selectedNode.gap ?? 0}
                  onChange={(e) => handlePropChange("gap", Number(e.target.value))}
                  className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
                <span className="font-mono text-[10px] text-muted-foreground">Pad</span>
                <input
                  type="number"
                  value={typeof selectedNode.padding === "number" ? selectedNode.padding : (selectedNode.padding?.top ?? 0)}
                  onChange={(e) => handlePropChange("padding", Number(e.target.value))}
                  className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 7. Section: Appearance matching Reference Image */}
        <div className="pt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>Appearance</span>
            <Eye className="size-3.5 opacity-60" />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {/* Opacity */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">⌧</span>
              <input
                type="number"
                min={0}
                max={100}
                value={selectedNode.opacity !== undefined ? Math.round(selectedNode.opacity * 100) : 100}
                onChange={(e) => handlePropChange("opacity", Number(e.target.value) / 100)}
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
              />
              <span className="text-[10px] text-muted-foreground">%</span>
            </div>

            {/* Corner Radius */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">⸤⸣</span>
              <input
                type="number"
                min={0}
                value={selectedNode.cornerRadius ?? 0}
                onChange={(e) => handlePropChange("cornerRadius", Number(e.target.value))}
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
              />
              <Maximize2 className="size-3 text-muted-foreground/60 shrink-0" />
            </div>
          </div>

          {/* Clip Content Checkbox */}
          <div className="pt-0.5 text-[11px] text-muted-foreground">
            <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
              <input
                type="checkbox"
                checked={selectedNode.clip ?? true}
                onChange={(e) => handlePropChange("clip", e.target.checked)}
                className="rounded border-border text-accent-text focus:ring-0"
              />
              <span>Clip Content</span>
            </label>
          </div>
        </div>

        {/* 8. Section: Fill matching Reference Image */}
        <div className="pt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>Fill</span>
            <button
              type="button"
              onClick={() => handlePropChange("fill", "#181920")}
              className="flex size-5 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Add Fill"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] p-1.5">
            {/* Swatch Square */}
            <button
              type="button"
              onClick={() => setFillPickerOpen(!fillPickerOpen)}
              className="size-5 rounded border border-border/80 shadow-xs shrink-0 cursor-pointer"
              style={{ backgroundColor: isFillHidden ? "transparent" : curFillColor }}
              title="Pick color"
            />

            {/* Color Value / Label */}
            <input
              type="text"
              value={isFillHidden ? "none" : curFillColor}
              onChange={(e) => handlePropChange("fill", e.target.value)}
              className="w-full bg-transparent font-mono text-xs text-foreground outline-none uppercase"
            />

            {/* Controls: Mode switcher, Eye, Delete */}
            <button
              type="button"
              onClick={() => setFillPickerOpen(!fillPickerOpen)}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              title="Color Swatches"
            >
              <ChevronsUpDown className="size-3" />
            </button>

            <button
              type="button"
              onClick={() => handlePropChange("fill", isFillHidden ? "#181920" : "transparent")}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
              title={isFillHidden ? "Show Fill" : "Hide Fill"}
            >
              {isFillHidden ? <EyeOff className="size-3 text-muted-foreground" /> : <Eye className="size-3" />}
            </button>

            <button
              type="button"
              onClick={() => handlePropChange("fill", "transparent")}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-destructive transition-colors"
              title="Remove Fill"
            >
              <Minus className="size-3" />
            </button>
          </div>

          {/* Color Presets Popover */}
          {fillPickerOpen && (
            <div className="rounded-lg border border-border/80 bg-popover p-2 shadow-lg space-y-1.5 animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="text-[10px] font-semibold text-muted-foreground">Presets</div>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => {
                      handlePropChange("fill", hex)
                      setFillPickerOpen(false)
                    }}
                    className={cn(
                      "size-5 rounded border border-border/60 transition-transform active:scale-90",
                      curFillColor === hex && "ring-2 ring-accent-text"
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 9. Section: Stroke matching Reference Image */}
        <div className="pt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>Stroke</span>
            <button
              type="button"
              onClick={() => {
                if (!strokeActive) {
                  setStrokeActive(true)
                  handlePropChange("stroke", "rgba(255,255,255,0.15)")
                  handlePropChange("strokeWidth", 1)
                } else {
                  setStrokeActive(false)
                  handlePropChange("stroke", undefined)
                }
              }}
              className="flex size-5 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Toggle Stroke"
            >
              {strokeActive ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
            </button>
          </div>

          {strokeActive && (
            <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] p-1.5">
              <div
                className="size-5 rounded border border-border/80 shadow-xs shrink-0"
                style={{ backgroundColor: selectedNode.stroke || "rgba(255,255,255,0.2)" }}
              />
              <input
                type="text"
                value={selectedNode.stroke || ""}
                onChange={(e) => handlePropChange("stroke", e.target.value)}
                className="w-full bg-transparent font-mono text-xs text-foreground outline-none"
                placeholder="#3b82f6"
              />
              <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] text-muted-foreground px-1">
                <span>W:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={selectedNode.strokeWidth ?? 1}
                  onChange={(e) => handlePropChange("strokeWidth", Math.max(1, Number(e.target.value)))}
                  className="w-7 bg-transparent text-foreground outline-none text-right"
                />
              </div>
            </div>
          )}
        </div>

        {/* 10. Section: Effects matching Reference Image */}
        <div className="pt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>Effects</span>
            <button
              type="button"
              onClick={() => {
                if (!effectsActive) {
                  setEffectsActive(true)
                  handlePropChange("effects", "shadow-xl")
                } else {
                  setEffectsActive(false)
                  handlePropChange("effects", undefined)
                }
              }}
              className="flex size-5 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Toggle Effects"
            >
              {effectsActive ? <Minus className="size-3.5" /> : <Plus className="size-3.5" />}
            </button>
          </div>

          {effectsActive && (
            <div className="rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] p-2 text-[11px] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Drop Shadow</span>
                <span className="font-mono text-xs font-semibold text-accent-text">Applied</span>
              </div>
            </div>
          )}
        </div>

        {/* 11. Section: Code matching Reference Image */}
        <div className="pt-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
            <span>Code</span>
            <button
              type="button"
              onClick={() => setCodeDrawerOpen(!codeDrawerOpen)}
              className="flex size-5 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Code Settings"
            >
              <Settings className="size-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={onConvertToReact}
            className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/50 dark:bg-[#1a1b22] px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <Code2 className="size-3.5 text-accent-text" />
              <span>React JSX Preview</span>
            </div>
            <span className="font-mono text-[10px] text-accent-text font-semibold">0 Token</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
