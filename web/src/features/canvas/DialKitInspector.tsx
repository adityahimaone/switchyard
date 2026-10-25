import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sun, Moon, Check, Save, RotateCcw, Sliders } from "lucide-react"

export interface DialKitProps {
  theme: "light" | "dark"
  radius: number
  padding: number
  scale: number
  accentColor: string
  [key: string]: any
}

export interface DialKitInspectorProps {
  props: DialKitProps
  onChange: (next: DialKitProps) => void
  onSyncCode: () => Promise<void>
  isSyncing: boolean
  isDirty: boolean
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
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Rose
  "#8b5cf6", // Purple
]

export function DialKitInspector({
  props,
  onChange,
  onSyncCode,
  isSyncing,
  isDirty,
}: DialKitInspectorProps) {
  const update = (partial: Partial<DialKitProps>) => {
    onChange({ ...props, ...partial })
  }

  const reset = () => {
    onChange(DEFAULT_DIALKIT_PROPS)
  }

  return (
    <div className="flex h-full flex-col text-xs">
      <header className="flex items-center justify-between border-b border-[var(--c-line)] px-4 py-3">
        <div className="flex items-center gap-2 font-medium">
          <Sliders className="size-3.5 text-accent" />
          <span>DialKit Live Controls</span>
          {isDirty && (
            <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-500 font-normal">
              Modified
            </Badge>
          )}
        </div>
        <button
          onClick={reset}
          title="Reset to defaults"
          className="text-ink-3 hover:text-ink-1 transition-colors p-1"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Theme Mode */}
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wider text-ink-3">Theme</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant={props.theme === "dark" ? "default" : "outline"}
              className="h-8 gap-1.5 text-xs active:scale-[0.97] transition-transform"
              onClick={() => update({ theme: "dark" })}
            >
              <Moon className="size-3.5" /> Dark
            </Button>
            <Button
              size="sm"
              variant={props.theme === "light" ? "default" : "outline"}
              className="h-8 gap-1.5 text-xs active:scale-[0.97] transition-transform"
              onClick={() => update({ theme: "light" })}
            >
              <Sun className="size-3.5" /> Light
            </Button>
          </div>
        </div>

        {/* Border Radius */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] uppercase tracking-wider text-ink-3">Corner Radius</Label>
            <span className="font-mono text-ink-2">{props.radius}px</span>
          </div>
          <Slider
            min={0}
            max={32}
            step={2}
            value={[props.radius]}
            onValueChange={(val) => val?.[0] !== undefined && update({ radius: val[0] })}
          />
        </div>

        {/* Padding / Spacing */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] uppercase tracking-wider text-ink-3">Inner Padding</Label>
            <span className="font-mono text-ink-2">{props.padding}px</span>
          </div>
          <Slider
            min={8}
            max={48}
            step={4}
            value={[props.padding]}
            onValueChange={(val) => val?.[0] !== undefined && update({ padding: val[0] })}
          />
        </div>

        {/* Accent Color */}
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-wider text-ink-3">Accent Color</Label>
          <div className="flex items-center gap-2">
            {ACCENT_SWATCHES.map((hex) => (
              <button
                key={hex}
                onClick={() => update({ accentColor: hex })}
                className={`size-6 rounded-full transition-transform active:scale-90 flex items-center justify-center ${
                  props.accentColor === hex ? "ring-2 ring-offset-2 ring-offset-background ring-ink-1 scale-110" : ""
                }`}
                style={{ backgroundColor: hex }}
              >
                {props.accentColor === hex && <Check className="size-3 text-white" />}
              </button>
            ))}
          </div>
        </div>

        {/* Scale */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] uppercase tracking-wider text-ink-3">Component Scale</Label>
            <span className="font-mono text-ink-2">{props.scale}%</span>
          </div>
          <Slider
            min={75}
            max={125}
            step={5}
            value={[props.scale]}
            onValueChange={(val) => val?.[0] !== undefined && update({ scale: val[0] })}
          />
        </div>
      </div>

      {/* Footer Sync Button */}
      <footer className="border-t border-[var(--c-line)] p-4 space-y-2">
        <Button
          className="w-full gap-2 active:scale-[0.97] transition-transform"
          onClick={onSyncCode}
          disabled={isSyncing}
        >
          <Save className="size-3.5" />
          {isSyncing ? "Syncing..." : "Sync Tweaks to Code"}
        </Button>
        <p className="text-[10px] text-center text-ink-3">
          Applies current DialKit knobs directly to git worktree
        </p>
      </footer>
    </div>
  )
}
