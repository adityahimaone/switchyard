import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getAttachmentAnalysisConfig, listProviders, saveAttachmentAnalysisConfig, type AttachmentAnalysisConfig, type ProviderModel } from "@/api"

export default function AttachmentAnalysisSettings({ show }: { show: (...labels: string[]) => boolean }) {
  const [config, setConfig] = useState<AttachmentAnalysisConfig | null>(null)
  const [providers, setProviders] = useState<ProviderModel[]>([])
  const [message, setMessage] = useState("")
  const [search, setSearch] = useState("")
  const models = useMemo(() => providers.flatMap((p) => p.models.map((model) => ({
    model,
    provider: p.name,
    endpoint: (() => {
      try {
        const path = new URL(p.base_url).pathname.split("/").filter(Boolean)
        return path.at(-1) || ""
      } catch {
        return ""
      }
    })(),
    capability: p.capabilities?.[model],
  }))), [providers])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return models
    return models.filter((m) => m.model.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q))
  }, [models, search])
  useEffect(() => { void Promise.all([getAttachmentAnalysisConfig(), listProviders()]).then(([c, p]) => { setConfig(c); setProviders(p) }).catch((e) => setMessage((e as Error).message)) }, [])
  if (!show("AI", "Vision", "Image", "PDF", "Attachment", "Model")) return null
  if (!config) return <p className="text-xs text-neutral-500">Loading vision settings…</p>
  const update = (patch: Partial<AttachmentAnalysisConfig>) => setConfig({ ...config, ...patch })
  const selectedLabel = config.dedicated_model ? `${config.dedicated_provider} / ${config.dedicated_model}` : "Select model…"
  return <div className="space-y-4 rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
    <div><p className="text-sm font-medium text-neutral-200">Attachment Analysis</p><p className="text-xs text-neutral-500">Global model routing for image and PDF analysis.</p></div>
    <div className="flex items-center justify-between text-xs text-neutral-300"><span>Routing mode</span>
      <Select value={config.mode} onValueChange={(v) => update({ mode: v as AttachmentAnalysisConfig["mode"] })}>
        <SelectTrigger size="sm" className="h-7 w-40 border-[var(--color-line)] bg-transparent px-2.5 text-[11px]"><SelectValue /></SelectTrigger>
        <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
          <SelectItem value="auto" className="text-sm">Auto + fallback</SelectItem>
          <SelectItem value="dedicated" className="text-sm">Dedicated model</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="space-y-2">
      <p className="text-xs text-neutral-300">Dedicated model</p>
      <Select value={`${config.dedicated_provider}::${config.dedicated_model}`} onValueChange={(v) => {
        const idx = v.indexOf("::")
        update({ dedicated_provider: v.slice(0, idx), dedicated_model: v.slice(idx + 2) })
      }}>
        <SelectTrigger size="sm" className="h-7 w-full border-[var(--color-line)] bg-transparent px-2.5 text-[11px]"><SelectValue placeholder={selectedLabel} /></SelectTrigger>
        <SelectContent className="w-[min(32rem,calc(100vw-1rem))] max-h-[min(28rem,calc(100dvh-1rem))] border-[var(--color-line)] bg-[var(--color-surface)]">
          <div className="sticky top-0 z-10 bg-[var(--color-surface)] p-1" onKeyDown={(e) => e.stopPropagation()}>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search model…" className="h-7 border-[var(--color-line)] bg-[var(--color-bg)] text-xs" />
          </div>
          <SelectItem value="::" className="text-sm">Select model…</SelectItem>
          {filtered.length === 0 && <p className="px-2 py-1.5 text-xs text-neutral-500">No match</p>}
          {filtered.map(({ model, provider, endpoint, capability }) => (
            <SelectItem key={`${provider}::${model}`} value={`${provider}::${model}`} className="text-sm" title={`${provider}/${model}`}>
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate">{provider} / {model}</span>
                {endpoint && <span className="shrink-0 text-[9px] text-neutral-500">/{endpoint}</span>}
                {capability?.vision && <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0 text-[9px] leading-none text-emerald-400">vision</span>}
                {capability?.pdf && <span className="shrink-0 rounded border border-blue-500/30 bg-blue-500/10 px-1 py-0 text-[9px] leading-none text-blue-400">pdf</span>}
                {!capability?.vision && !capability?.pdf && <span className="shrink-0 text-[9px] text-neutral-500">unknown</span>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
    <div className="flex items-center justify-between"><span className="text-xs text-neutral-500">Unknown current model falls back to dedicated model.</span><Button size="sm" onClick={() => void saveAttachmentAnalysisConfig(config).then(() => setMessage("Saved")).catch((e) => setMessage((e as Error).message))}>Save</Button></div>
    {message && <p className="text-xs text-neutral-500">{message}</p>}
  </div>
}
