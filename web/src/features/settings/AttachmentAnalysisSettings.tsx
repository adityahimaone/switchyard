import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getAttachmentAnalysisConfig, listProviders, saveAttachmentAnalysisConfig,
  type AttachmentAnalysisConfig, type ProviderModel,
} from "@/api"
import { SettingRow, SettingsSection } from "./settings-parts"

export default function AttachmentAnalysisSettings() {
  const [config, setConfig] = useState<AttachmentAnalysisConfig | null>(null)
  const [providers, setProviders] = useState<ProviderModel[]>([])
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const [search, setSearch] = useState("")

  const models = useMemo(
    () =>
      providers.flatMap((p) =>
        p.models.map((model) => {
          let endpoint = ""
          try {
            endpoint = new URL(p.base_url).pathname.split("/").filter(Boolean).at(-1) || ""
          } catch {
            endpoint = ""
          }
          return { model, provider: p.name, endpoint, capability: p.capabilities?.[model] }
        }),
      ),
    [providers],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return models
    return models.filter(
      (m) => m.model.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    )
  }, [models, search])

  useEffect(() => {
    void Promise.all([getAttachmentAnalysisConfig(), listProviders()])
      .then(([c, p]) => { setConfig(c); setProviders(p) })
      .catch((e) => setMessage({ tone: "error", text: (e as Error).message }))
  }, [])

  if (!config) {
    return (
      <SettingsSection title="Attachments" description="Loading attachment settings…">
        <p className="py-4 text-sm text-ink-3">Loading…</p>
      </SettingsSection>
    )
  }

  const update = (patch: Partial<AttachmentAnalysisConfig>) => setConfig({ ...config, ...patch })
  const selectedLabel = config.dedicated_model
    ? `${config.dedicated_provider} / ${config.dedicated_model}`
    : "Select a model"

  async function save() {
    try {
      await saveAttachmentAnalysisConfig(config!)
      setMessage({ tone: "ok", text: "Attachment settings saved." })
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message })
    }
  }

  return (
    <SettingsSection
      title="Attachments"
      description="Model routing for image and PDF analysis."
      footer={
        <Button size="sm" variant="signal" onClick={() => void save()}>
          Save changes
        </Button>
      }
    >
      <SettingRow
        label="Routing mode"
        help="Auto picks the first model that advertises vision. Dedicated always uses the model below."
        htmlFor="att-mode"
      >
        <Select
          value={config.mode}
          onValueChange={(v) => update({ mode: v as AttachmentAnalysisConfig["mode"] })}
        >
          <SelectTrigger id="att-mode" size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto with fallback</SelectItem>
            <SelectItem value="dedicated">Dedicated model</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>

      <SettingRow
        label="Dedicated model"
        help="Used when the request is an image or a PDF, and in fallback mode."
        htmlFor="att-model"
      >
        <Select
          value={`${config.dedicated_provider}::${config.dedicated_model}`}
          onValueChange={(v) => {
            const idx = v.indexOf("::")
            update({ dedicated_provider: v.slice(0, idx), dedicated_model: v.slice(idx + 2) })
          }}
        >
          <SelectTrigger id="att-model" size="sm" className="w-64">
            <SelectValue placeholder={selectedLabel} />
          </SelectTrigger>
          <SelectContent className="w-[min(32rem,calc(100vw-1rem))]">
            <div className="sticky top-0 z-10 bg-raised p-1" onKeyDown={(e) => e.stopPropagation()}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models"
                aria-label="Search models"
              />
            </div>
            <SelectItem value="::">Select a model</SelectItem>
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-ink-3">No models match</p>
            )}
            {filtered.map(({ model, provider, endpoint, capability }) => (
              <SelectItem
                key={`${provider}::${model}`}
                value={`${provider}::${model}`}
                title={`${provider}/${model}`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 truncate">{provider} / {model}</span>
                  {endpoint && <span className="shrink-0 text-2xs text-ink-3">/{endpoint}</span>}
                  {capability?.vision && (
                    <span className="shrink-0 text-2xs text-success">vision</span>
                  )}
                  {capability?.pdf && <span className="shrink-0 text-2xs text-info">pdf</span>}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>

      {message && (
        <p
          role="status"
          className={message.tone === "ok" ? "py-3 text-sm text-success" : "py-3 text-sm text-danger-text"}
        >
          {message.text}
        </p>
      )}
    </SettingsSection>
  )
}
