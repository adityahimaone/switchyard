import { useEffect, useState } from "react"
import { Layers, Loader2, RefreshCw, X } from "lucide-react"
import {
  createDesignSlice,
  listDesignFrames,
  type DesignFrame,
  type DesignSlice,
} from "../../api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * Create-time Doop frame picker.
 *
 * Only frames a human marked `ready_for_dev` are offered. "Snapshot & attach"
 * freezes the chosen frame on the control plane and hands the card an immutable
 * design_ref + design_source — never a live Doop URL for the agent to fetch.
 */
export interface DoopAttachment {
  designRef: string
  designSource: string
  selectors: string[]
  previewUrl: string
  slice: DesignSlice
}

export function DoopDesignPicker({
  slug,
  attachment,
  onAttach,
  onClear,
}: {
  slug: string
  attachment: DoopAttachment | null
  onAttach: (next: DoopAttachment) => void
  onClear: () => void
}) {
  const [frames, setFrames] = useState<DesignFrame[]>([])
  const [configured, setConfigured] = useState(true)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState("")
  const [selectorsRaw, setSelectorsRaw] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const res = await listDesignFrames(slug)
      setConfigured(res.configured)
      setFrames(res.frames ?? [])
      setError(res.configured ? (res.error ?? "") : (res.error ?? "Doop is not configured on the control plane."))
      setSelected((current) => {
        const ids = (res.frames ?? []).map(frameKey)
        return current && ids.includes(current) ? current : ids[0] ?? ""
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not list Doop frames")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Reload when the board changes; a manual refresh is available below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  const chosen = frames.find((f) => frameKey(f) === selected)

  async function snapshot() {
    if (!chosen) return
    setBusy(true)
    setError("")
    try {
      const selectors = selectorsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await createDesignSlice(slug, {
        canvas_id: chosen.canvas_id,
        frame_id: chosen.frame_id,
        ...(chosen.version ? { version: chosen.version } : {}),
        ...(selectors.length ? { selectors } : {}),
      })
      onAttach({
        designRef: res.design_ref,
        designSource: res.design_source,
        selectors: res.slice.selectors ?? [],
        previewUrl: res.preview_url,
        slice: res.slice,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not snapshot the frame")
    } finally {
      setBusy(false)
    }
  }

  const selCls = "border-[var(--c-line)] bg-[var(--c-canvas)] text-xs text-ink"

  return (
    <div className="mt-2 space-y-3 rounded-card border border-[var(--c-accent)]/30 bg-[var(--c-surface)]/60 p-3">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--c-line)] pb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
          <Layers className="size-3.5 text-accent" />
          <span>Doop design frame</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-[11px] text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
          title="Refresh ready-for-dev frames"
        >
          <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {!configured && (
        <p className="text-[11px] text-ink-3">
          Set <code className="font-mono text-accent">DOOP_AGENT_KEY</code> on the control plane to enable
          the Doop MCP. Changing <code className="font-mono">DOOP_MCP_URL</code> later switches from
          hosted doop.design to a self-hosted instance without changing this form.
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <div className="min-w-0">
          <Label className="block text-xs text-ink-3" htmlFor="task-doop-frame">
            Ready for dev
          </Label>
          <select
            id="task-doop-frame"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loading || frames.length === 0}
            className={cn(selCls, "mt-1 h-8 w-full rounded-control px-2 outline-none")}
          >
            {frames.length === 0 && <option value="">No ready-for-dev frames</option>}
            {frames.map((f) => (
              <option key={frameKey(f)} value={frameKey(f)}>
                {f.name || f.frame_id}
                {f.width ? ` · ${f.width}×${f.height}` : ""}
                {f.version ? ` · ${f.version}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          size="sm"
          variant="signal"
          onClick={() => void snapshot()}
          disabled={!chosen || busy}
          className="h-8 shrink-0 text-xs"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : "Snapshot & attach"}
        </Button>
      </div>

      <div className="min-w-0">
        <Label className="block text-xs text-ink-3" htmlFor="task-doop-selectors">
          Layers in scope <span className="text-ink-3">(optional, comma separated)</span>
        </Label>
        <Input
          id="task-doop-selectors"
          value={selectorsRaw}
          onChange={(e) => setSelectorsRaw(e.target.value)}
          placeholder="#hero, .pricing-card"
          className={cn(selCls, "mt-1 h-8")}
        />
        <p className="mt-1 text-[11px] text-ink-3">
          Narrow implementation to specific selectors from Doop element comments. Leave empty to
          implement the whole frame.
        </p>
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {attachment && (
        <div className="flex items-center gap-3 rounded-card border border-[var(--c-line)] bg-[var(--c-canvas)]/60 p-2">
          <img
            src={attachment.previewUrl}
            alt="Attached Doop frame"
            className="h-14 w-20 shrink-0 rounded border border-[var(--c-line)] object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink">
              {attachment.slice.frame_name || attachment.slice.frame_id}
            </p>
            <p className="truncate font-mono text-[10px] text-ink-3" title={attachment.designRef}>
              {attachment.designRef}
            </p>
            <p className="mt-0.5 text-[10px] text-ink-3">
              {attachment.slice.html_bytes} B HTML · {attachment.selectors.length} selectors · frozen
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded-control p-1 text-ink-3 transition-colors hover:text-ink"
            title="Detach design"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

function frameKey(f: DesignFrame) {
  return `${f.canvas_id}/${f.frame_id}`
}
