import { useState } from "react"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Sun,
  Moon,
  Check,
  Save,
  RotateCcw,
  Sliders,
  Sparkles,
  Maximize2,
  Palette,
  Play,
  Copy,
  ChevronDown,
  ChevronRight,
  MousePointerClick,
  X,
} from "lucide-react"

export interface DialKitProps {
  theme: "light" | "dark"
  radius: number
  padding: number
  scale: number
  accentColor: string
  [key: string]: any
}

export interface SelectedElementInfo {
  tagName: string
  id?: string
  className?: string
  text: string
  matchedDialKey?: string
  styles: {
    color?: string
    backgroundColor?: string
    fontSize?: string
    borderRadius?: string
    padding?: string
    accentColor?: string
    [key: string]: any
  }
}

export interface DiscoveredSchemaItem {
  type: "slider" | "color" | "text" | "action"
  default?: any
  min?: number
  max?: number
  step?: number
}

export interface DialKitInspectorProps {
  props: DialKitProps
  onChange: (next: DialKitProps) => void
  onSyncCode: () => Promise<void>
  isSyncing: boolean
  isDirty: boolean
  selectedElement?: SelectedElementInfo | null
  onUpdateElement?: (update: { text?: string; matchedDialKey?: string; styles?: Record<string, string> }) => void
  onDeselectElement?: () => void
  activeComponentTitle?: string
  schema?: Record<string, DiscoveredSchemaItem>
}

export const DEFAULT_DIALKIT_PROPS: DialKitProps = {
  theme: "dark",
  radius: 16,
  padding: 24,
  scale: 100,
  accentColor: "#6366f1",
}

const ACCENT_SWATCHES = [
  "#6366f1", // Indigo
  "#38bdf8", // Sky
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#a855f7", // Purple
  "#ffffff", // White
]

export function DialKitInspector({
  props,
  onChange,
  onSyncCode,
  isSyncing,
  isDirty,
  selectedElement,
  onUpdateElement,
  onDeselectElement,
  activeComponentTitle = "Component",
  schema = {},
}: DialKitInspectorProps) {
  const [copied, setCopied] = useState(false)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    element: true,
    schema: true,
    geometry: true,
    colors: true,
    motion: true,
  })

  const toggleFolder = (folder: string) => {
    setOpenFolders((prev) => ({ ...prev, [folder]: !prev[folder] }))
  }

  const update = (partial: Record<string, any>) => {
    onChange({ ...props, ...partial })
  }

  const reset = () => {
    onChange(DEFAULT_DIALKIT_PROPS)
  }

  const copyValues = () => {
    const json = JSON.stringify(props, null, 2)
    navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const hasSchema = Object.keys(schema).length > 0

  return (
    <div className="flex h-full flex-col text-xs bg-[#121316] text-[#e6edf3] select-none font-sans border-l border-white/5">
      {/* Top Header: DialKit Popover Style */}
      <header className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5 bg-[#18191f]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-5 rounded-md bg-accent/20 border border-accent/40 flex items-center justify-center text-accent shrink-0">
            <Sliders className="size-3" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-white text-xs">
              {selectedElement ? "Element Properties" : activeComponentTitle}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-400">
              {selectedElement ? (
                <span className="text-emerald-400 font-medium">✦ double-clicked item</span>
              ) : (
                <span>DialKit Live Panel</span>
              )}
              {isDirty && (
                <Badge variant="outline" className="border-amber-500/40 text-[9px] text-amber-400 font-normal py-0 h-3.5">
                  Modified
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedElement && (
            <button
              type="button"
              onClick={onDeselectElement}
              className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 hover:bg-white/10 text-neutral-300 transition-colors flex items-center gap-1 active:scale-95"
              title="Return to whole component tuner"
            >
              <X className="size-3" /> Done
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            title="Reset to defaults"
            className="text-neutral-400 hover:text-white transition-colors p-1 rounded hover:bg-white/5 active:scale-90"
          >
            <RotateCcw className="size-3.5" />
          </button>
        </div>
      </header>

      {/* Main Controls Scroll Container */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3 scrollbar-none">
        {/* SECTION 1: Selected Element Inspector (Figma / Pen.dev style) */}
        {selectedElement && (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-accent font-bold">
                <MousePointerClick className="size-3.5" />
                <span>&lt;{selectedElement.tagName}&gt;</span>
                {selectedElement.id && <span className="text-neutral-400 font-normal">#{selectedElement.id}</span>}
              </div>
              <Badge variant="outline" className="text-[9px] border-accent/40 text-accent font-mono py-0 h-4">
                ACTIVE FOCUS
              </Badge>
            </div>

            {/* Live Text Copy Editor */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 flex items-center justify-between">
                <span>Text Content</span>
                <span className="text-[9px] text-accent">0ms Live Edit</span>
              </Label>
              <Textarea
                rows={2}
                value={selectedElement.text}
                onChange={(e) => {
                  const newText = e.target.value
                  if (onUpdateElement) {
                    onUpdateElement({
                      text: newText,
                      matchedDialKey: selectedElement.matchedDialKey,
                    })
                  }
                  // If matched DialKit key exists, sync to component props
                  if (selectedElement.matchedDialKey) {
                    update({ [selectedElement.matchedDialKey]: newText })
                  }
                }}
                className="bg-black/50 border-white/10 text-white font-mono text-xs focus-visible:ring-accent/80 min-h-[50px] resize-y"
                placeholder="Edit element text..."
              />
            </div>

            {/* Quick Computed Attributes */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/5">
              <div>
                <span className="text-neutral-500">Size: </span>
                <span className="text-white">{selectedElement.styles.fontSize || "inherit"}</span>
              </div>
              <div>
                <span className="text-neutral-500">Radius: </span>
                <span className="text-white">{selectedElement.styles.borderRadius || "inherit"}</span>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: Discovered useDialKit Knobs (If Component declares schema) */}
        {hasSchema && (
          <div className="rounded-xl border border-white/10 bg-[#171920] overflow-hidden">
            <button
              type="button"
              onClick={() => toggleFolder("schema")}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-300 hover:text-white transition-colors border-b border-white/5 bg-white/5"
            >
              <span className="flex items-center gap-1.5 text-accent">
                <Sparkles className="size-3" />
                <span>Component Knobs</span>
              </span>
              {openFolders.schema ? <ChevronDown className="size-3 text-neutral-400" /> : <ChevronRight className="size-3 text-neutral-400" />}
            </button>

            {openFolders.schema && (
              <div className="p-3 space-y-4">
                {Object.entries(schema).map(([key, item]) => {
                  const currentVal = props[key] !== undefined ? props[key] : item.default

                  if (item.type === "slider") {
                    const min = item.min ?? 0
                    const max = item.max ?? 100
                    const step = item.step ?? (max <= 1 ? 0.05 : 1)
                    const numVal = typeof currentVal === "number" ? currentVal : (item.default || 0)

                    return (
                      <div key={key} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-[11px] font-mono text-neutral-300 capitalize">{key}</Label>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-accent font-semibold border border-white/10">
                            {numVal}
                          </span>
                        </div>
                        <Slider
                          min={min}
                          max={max}
                          step={step}
                          value={[numVal]}
                          onValueChange={(val) => val?.[0] !== undefined && update({ [key]: val[0] })}
                          className="py-1"
                        />
                      </div>
                    )
                  }

                  if (item.type === "color") {
                    const colorVal = typeof currentVal === "string" ? currentVal : (item.default || "#6366f1")
                    return (
                      <div key={key} className="space-y-1.5">
                        <Label className="text-[11px] font-mono text-neutral-300 capitalize">{key}</Label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Input
                              value={colorVal}
                              onChange={(e) => update({ [key]: e.target.value })}
                              className="h-7 text-xs font-mono bg-black/40 border-white/10 text-white pl-7"
                            />
                            <div
                              style={{ backgroundColor: colorVal }}
                              className="absolute left-1.5 top-1.5 size-4 rounded-full border border-white/20"
                            />
                          </div>
                        </div>
                      </div>
                    )
                  }

                  if (item.type === "text") {
                    const textVal = typeof currentVal === "string" ? currentVal : (item.default || "")
                    return (
                      <div key={key} className="space-y-1.5">
                        <Label className="text-[11px] font-mono text-neutral-300 capitalize">{key}</Label>
                        <Input
                          value={textVal}
                          onChange={(e) => update({ [key]: e.target.value })}
                          className="h-7 text-xs bg-black/40 border-white/10 text-white"
                        />
                      </div>
                    )
                  }

                  if (item.type === "action") {
                    return (
                      <div key={key} className="pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => update({ [key]: Date.now() })}
                          className="w-full h-7 text-xs gap-1.5 border-accent/40 text-accent hover:bg-accent/10 active:scale-[0.97]"
                        >
                          <Play className="size-3" /> Trigger {key}
                        </Button>
                      </div>
                    )
                  }

                  return null
                })}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: Global Theme & Geometry */}
        <div className="rounded-xl border border-white/10 bg-[#171920] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleFolder("geometry")}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-300 hover:text-white transition-colors border-b border-white/5 bg-white/5"
          >
            <span className="flex items-center gap-1.5">
              <Maximize2 className="size-3 text-neutral-400" />
              <span>Geometry & Layout</span>
            </span>
            {openFolders.geometry ? <ChevronDown className="size-3 text-neutral-400" /> : <ChevronRight className="size-3 text-neutral-400" />}
          </button>

          {openFolders.geometry && (
            <div className="p-3 space-y-4">
              {/* Corner Radius */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-mono text-neutral-300">Corner Radius</Label>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white border border-white/10">
                    {props.radius}px
                  </span>
                </div>
                <Slider
                  min={0}
                  max={48}
                  step={2}
                  value={[props.radius]}
                  onValueChange={(val) => val?.[0] !== undefined && update({ radius: val[0] })}
                  className="py-1"
                />
              </div>

              {/* Inner Padding */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-mono text-neutral-300">Inner Padding</Label>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white border border-white/10">
                    {props.padding}px
                  </span>
                </div>
                <Slider
                  min={8}
                  max={64}
                  step={4}
                  value={[props.padding]}
                  onValueChange={(val) => val?.[0] !== undefined && update({ padding: val[0] })}
                  className="py-1"
                />
              </div>

              {/* Component Scale */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-mono text-neutral-300">Stage Scale</Label>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white border border-white/10">
                    {props.scale}%
                  </span>
                </div>
                <Slider
                  min={70}
                  max={130}
                  step={5}
                  value={[props.scale]}
                  onValueChange={(val) => val?.[0] !== undefined && update({ scale: val[0] })}
                  className="py-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* SECTION 4: Theme & Appearance */}
        <div className="rounded-xl border border-white/10 bg-[#171920] overflow-hidden">
          <button
            type="button"
            onClick={() => toggleFolder("colors")}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono font-bold uppercase tracking-wider text-neutral-300 hover:text-white transition-colors border-b border-white/5 bg-white/5"
          >
            <span className="flex items-center gap-1.5">
              <Palette className="size-3 text-neutral-400" />
              <span>Theme & Colors</span>
            </span>
            {openFolders.colors ? <ChevronDown className="size-3 text-neutral-400" /> : <ChevronRight className="size-3 text-neutral-400" />}
          </button>

          {openFolders.colors && (
            <div className="p-3 space-y-4">
              {/* Dark / Light Toggle */}
              <div className="space-y-1.5">
                <Label className="text-[11px] font-mono text-neutral-300">Color Scheme</Label>
                <div className="grid grid-cols-2 gap-2 bg-black/40 p-1 rounded-lg border border-white/5">
                  <button
                    type="button"
                    onClick={() => update({ theme: "dark" })}
                    className={`h-7 rounded text-xs flex items-center justify-center gap-1.5 transition-all font-mono active:scale-95 ${
                      props.theme === "dark"
                        ? "bg-accent text-white shadow-md font-bold"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Moon className="size-3.5" /> Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => update({ theme: "light" })}
                    className={`h-7 rounded text-xs flex items-center justify-center gap-1.5 transition-all font-mono active:scale-95 ${
                      props.theme === "light"
                        ? "bg-accent text-white shadow-md font-bold"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    <Sun className="size-3.5" /> Light
                  </button>
                </div>
              </div>

              {/* Accent Color */}
              <div className="space-y-2">
                <Label className="text-[11px] font-mono text-neutral-300">Accent Swatches</Label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {ACCENT_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => update({ accentColor: hex })}
                      className={`size-6 rounded-full transition-transform active:scale-90 flex items-center justify-center border border-white/20 ${
                        props.accentColor === hex ? "ring-2 ring-accent ring-offset-2 ring-offset-[#121316] scale-110" : ""
                      }`}
                      style={{ backgroundColor: hex }}
                    >
                      {props.accentColor === hex && <Check className="size-3 text-white drop-shadow" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Copy & Sync */}
      <footer className="border-t border-white/10 p-3 bg-[#18191f] space-y-2">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs border-white/10 bg-white/5 hover:bg-white/10 text-neutral-200 active:scale-[0.97]"
            onClick={copyValues}
          >
            {copied ? <Check className="size-3.5 text-emerald-400 mr-1.5" /> : <Copy className="size-3.5 mr-1.5" />}
            {copied ? "Copied JSON" : "Copy Values"}
          </Button>
          <Button
            size="sm"
            className="flex-1 h-8 text-xs bg-accent hover:bg-accent/90 text-white font-medium active:scale-[0.97]"
            onClick={onSyncCode}
            disabled={isSyncing}
          >
            <Save className="size-3.5 mr-1.5" />
            {isSyncing ? "Saving..." : "Sync Code"}
          </Button>
        </div>
        <p className="text-[9px] font-mono text-center text-neutral-500">
          DialKit standard · Double-click element to inspect
        </p>
      </footer>
    </div>
  )
}
