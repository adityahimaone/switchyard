import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, CheckCircle2, RefreshCw, RotateCcw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select"
import {
  getExecutorSettings,
  saveExecutorSettings,
  type ExecutorConfig,
  type ExecutorSettings,
  type ModelCatalogSource,
} from "@/api"
import { useExecutorModels } from "@/features/board/modelCatalog"
import { cn } from "@/lib/utils"

const LABELS: Record<string, { title: string; hint: string }> = {
  auto: { title: "Auto", hint: "Compatibility fallback. Resolves Hermes, then Codex, then Command Code." },
  hermes: { title: "Hermes", hint: "Hermes CLI agent session." },
  codex: { title: "Codex", hint: "OpenAI Codex CLI session." },
  commandcode: { title: "Command Code", hint: "Command Code headless session, with per-card continuity." },
  claude: { title: "Claude Code", hint: "Claude Code CLI session with per-card continuity; trusted workers only." },
  dsh: { title: "DeepSeek Harness", hint: "DSH headless profile, with per-card session continuity." },
  omp: { title: "omp (oh-my-pi)", hint: "omp headless session, with per-card session continuity." },
  shell: { title: "Shell", hint: "Agentic or direct shell access in the workspace." },
}

/** Executors whose model list is owned by the worker, not by this server. */
const CATALOG_EXECUTORS = new Set(["dsh", "commandcode"])

const FALLBACK: ExecutorSettings = {
  order: ["auto", "hermes", "codex", "commandcode", "claude", "dsh", "omp", "shell"],
  disabled: [],
  default_execution_mode: "direct",
}

export function executorIsEnabled(executor: string, settings: ExecutorSettings) {
  if (executor === "auto") return true
  return !settings.disabled.includes(executor)
}

const SOURCE_TEXT: Record<ModelCatalogSource, { label: string; tone: "ok" | "warn" | "muted" }> = {
  probed: { label: "probed by worker", tone: "ok" },
  cached: { label: "last known", tone: "muted" },
  pending: { label: "waiting for worker", tone: "warn" },
  unverified: { label: "unverified guess", tone: "warn" },
  unavailable: { label: "nobody can run this", tone: "warn" },
  local: { label: "this server", tone: "muted" },
}

function SourceBadge({ source }: { source?: ModelCatalogSource }) {
  if (!source) return null
  const meta = SOURCE_TEXT[source] ?? { label: source, tone: "muted" as const }
  return (
    <Badge variant={meta.tone === "ok" ? "success" : meta.tone === "warn" ? "review" : "secondary"} className="gap-1 font-normal">
      {meta.tone === "ok" ? (
        <CheckCircle2 className="size-3" />
      ) : meta.tone === "warn" ? (
        <TriangleAlert className="size-3" />
      ) : null}
      {meta.label}
    </Badge>
  )
}

function relativeTime(unix?: number) {
  if (!unix) return "never"
  const secs = Math.max(0, Math.round(Date.now() / 1000 - unix))
  if (secs < 90) return "just now"
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  return `${Math.round(secs / 86400)}d ago`
}

/**
 * Settings → Execution.
 *
 * Left: which executors the create-task dialog offers, in order. Right: the
 * per-executor defaults that seed that dialog. Only dsh and Command Code carry a
 * model catalog today — those two are the ones whose model list lives on the
 * worker; every other executor gets the enable switch until its settings land.
 */
export default function ExecutorSettingsPanel() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["executor-settings"], queryFn: getExecutorSettings })
  const settings = data ?? FALLBACK
  const [selected, setSelected] = useState("dsh")

  const save = useMutation({
    mutationFn: saveExecutorSettings,
    onSuccess: (saved) => {
      qc.setQueryData(["executor-settings"], saved)
    },
  })

  // Optimistic local copy so toggling feels instant; the server normalizes and
  // the mutation result replaces it with exactly what was stored.
  const commit = (next: ExecutorSettings) => save.mutate(next)

  const configFor = (executor: string): ExecutorConfig => settings.executors?.[executor] ?? {}

  const patchConfig = (executor: string, patch: Partial<ExecutorConfig>) => {
    const executors = { ...(settings.executors ?? {}) }
    executors[executor] = { ...configFor(executor), ...patch }
    commit({ ...settings, executors })
  }

  const move = (executor: string, delta: -1 | 1) => {
    const order = [...settings.order]
    const i = order.indexOf(executor)
    const j = i + delta
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    commit({ ...settings, order })
  }

  const toggle = (executor: string, enabled: boolean) => {
    // `enabled` also goes into the executor config so the dialog and this menu
    // read the same intent; the server folds it into the legacy `disabled` list.
    const executors = { ...(settings.executors ?? {}) }
    executors[executor] = { ...configFor(executor), enabled }
    const disabled = enabled
      ? settings.disabled.filter((e) => e !== executor)
      : [...settings.disabled, executor]
    commit({ ...settings, disabled, executors })
  }

  const reset = () => commit({ ...FALLBACK, order: [...settings.order], executors: {} })

  const selectedMeta = LABELS[selected] ?? { title: selected, hint: "" }
  const cfg = configFor(selected)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[60ch]">
          <h2 className="text-lg font-semibold text-ink">Execution</h2>
          <p className="mt-1 text-sm text-ink-3">
            Which agents a card can run on, and the defaults the create-task dialog
            opens with. A card keeps the choice it was created with — changing a
            default here never rewrites existing cards.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={reset} disabled={save.isPending}>
          <RotateCcw className="size-3.5" /> Reset to default
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Master: picker order and enable switches */}
        <div className="divide-y divide-line border-y border-line lg:border-y-0 lg:border-r lg:border-line lg:pr-4">
          {settings.order.map((executor, index) => {
            const meta = LABELS[executor] ?? { title: executor, hint: "" }
            const enabled = executorIsEnabled(executor, settings)
            return (
              <div
                key={executor}
                className={cn("flex items-center gap-2 py-2", selected === executor && "bg-raised/60")}
              >
                <button
                  type="button"
                  onClick={() => setSelected(executor)}
                  aria-current={selected === executor ? "true" : undefined}
                  className={cn(
                    "min-w-0 flex-1 truncate rounded-sm px-1 text-left text-sm",
                    selected === executor ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
                    !enabled && "opacity-60",
                  )}
                >
                  {meta.title}
                </button>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${meta.title} up`}
                    disabled={index === 0 || save.isPending}
                    onClick={() => move(executor, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Move ${meta.title} down`}
                    disabled={index === settings.order.length - 1 || save.isPending}
                    onClick={() => move(executor, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
                <Switch
                  checked={enabled}
                  disabled={executor === "auto" || save.isPending}
                  onCheckedChange={(v) => toggle(executor, v)}
                  aria-label={`${enabled ? "Disable" : "Enable"} ${meta.title}`}
                />
              </div>
            )
          })}
        </div>

        {/* Detail */}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-medium text-ink">{selectedMeta.title}</h3>
              <p className="mt-0.5 text-sm text-ink-3">{selectedMeta.hint}</p>
            </div>
            <Badge variant={selected === "auto" || executorIsEnabled(selected, settings) ? "secondary" : "review"} className="shrink-0 font-normal">
              {selected === "auto"
                ? "always on"
                : executorIsEnabled(selected, settings)
                  ? "enabled"
                  : "hidden from picker"}
            </Badge>
          </div>

          {CATALOG_EXECUTORS.has(selected) ? (
            <CatalogDefaults
              executor={selected}
              cfg={cfg}
              pending={save.isPending}
              onPatch={(patch) => patchConfig(selected, patch)}
            />
          ) : (
            <p className="mt-6 max-w-[56ch] text-sm text-ink-3">
              This executor has no per-agent settings yet — the enable switch is all it
              exposes today. Defaults land here the same way once its model list is
              owned by the worker instead of this server.
            </p>
          )}

          <div className="mt-8 max-w-[520px] border-t border-line pt-4">
            <p className="text-sm font-medium text-ink">Default execution mode</p>
            <p className="mt-0.5 text-xs text-ink-3">
              Pre-selected for new tasks. Direct runs the executor once; agentic lets it
              plan and iterate.
            </p>
            <Select
              value={settings.default_execution_mode}
              onValueChange={(v) =>
                commit({
                  ...settings,
                  default_execution_mode: v as ExecutorSettings["default_execution_mode"],
                })
              }
              disabled={save.isPending}
            >
              <SelectTrigger className="mt-3 w-40" aria-label="Default execution mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="direct">Direct</SelectItem>
                <SelectItem value="agentic">Agentic</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {save.isError && (
            <p className="mt-6 text-sm text-danger-text">
              Could not save execution settings. Check the server logs.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Defaults for an executor whose model list comes from the worker. */
function CatalogDefaults({
  executor,
  cfg,
  pending,
  onPatch,
}: {
  executor: string
  cfg: ExecutorConfig
  pending: boolean
  onPatch: (patch: Partial<ExecutorConfig>) => void
}) {
  const { models, source, profile, nodeId, detail, fetchedAt, isPending, isLoading, refresh } =
    useExecutorModels(executor, { profile: cfg.model_profile })

  const options: SearchSelectOption[] = models
  const selectedModel = cfg.default_model ?? ""
  // A stored default can name a model this worker no longer offers. Showing it as
  // the current value would be a lie, so it is surfaced as an unmapped value.
  const missing = selectedModel !== "" && !options.some((o) => o.value === selectedModel)

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="rounded-lg border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">Model catalog</p>
            <SourceBadge source={source} />
          </div>
          <Button variant="secondary" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} /> Fetch models now
          </Button>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
          <dt className="text-ink-3">Worker</dt>
          <dd className="truncate text-ink-2">{nodeId || "resolving…"}</dd>
          <dt className="text-ink-3">Profile</dt>
          <dd className="truncate text-ink-2">
            {profile || (executor === "dsh" ? cfg.model_profile || "live" : "—")}
          </dd>
          <dt className="text-ink-3">Fetched</dt>
          <dd className="truncate text-ink-2">{relativeTime(fetchedAt)}</dd>
          <dt className="text-ink-3">Models</dt>
          <dd className="truncate text-ink-2">{options.length}</dd>
        </dl>
        {isPending && (
          <p className="mt-3 text-xs text-warning-text">
            The worker has not reported this catalog yet. It answers on its next
            heartbeat, and this panel polls until it does.
          </p>
        )}
        {detail && !isPending && <p className="mt-3 text-xs text-ink-3">{detail}</p>}
      </div>

      <div className="max-w-[420px]">
        <p className="text-sm font-medium text-ink">Default model</p>
        <p className="mt-0.5 text-xs text-ink-3">
          Pre-selected in the create-task dialog. Only models this worker reports are
          offered.
        </p>
        <SearchSelect
          className="mt-3"
          options={options}
          value={selectedModel}
          onValueChange={(v) => {
            const chosen = options.find((o) => o.value === v)
            onPatch({ default_model: v, default_provider: chosen?.badge ?? cfg.default_provider })
          }}
          placeholder={isLoading ? "Loading models…" : "No default — the dialog decides"}
          searchPlaceholder="Search models…"
          emptyMessage="This worker reports no models."
        />
        {missing && (
          <p className="mt-2 text-xs text-warning-text">
            Stored default <span className="font-mono">{selectedModel}</span> is not in
            this worker's list. Pick one from the list to replace it.
          </p>
        )}
        {selectedModel && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            disabled={pending}
            onClick={() => onPatch({ default_model: "", default_provider: "" })}
          >
            Clear default
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="max-w-[200px]">
          <p className="text-sm font-medium text-ink">Reasoning effort</p>
          <Select
            value={cfg.default_effort || "auto"}
            onValueChange={(v) => onPatch({ default_effort: v === "auto" ? "" : v })}
            disabled={pending}
          >
            <SelectTrigger className="mt-2 w-40" aria-label="Default reasoning effort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automatic</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {executor === "dsh" && (
          <div className="max-w-[240px]">
            <p className="text-sm font-medium text-ink">Model source</p>
            <p className="mt-0.5 text-xs text-ink-3">
              <span className="font-mono">live</span> asks the worker's running DSH
              host what it can actually route — the same list its GUI shows.{" "}
              <span className="font-mono">headless</span> reads the profile file cards
              run, which names providers but not their models.
            </p>
            <Select
              value={cfg.model_profile || "live"}
              onValueChange={(v) => onPatch({ model_profile: v === "live" ? "" : v, default_model: "" })}
              disabled={pending}
            >
              <SelectTrigger className="mt-2 w-40" aria-label="DSH model source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">live (host)</SelectItem>
                <SelectItem value="headless">headless (config)</SelectItem>
              </SelectContent>
            </Select>
            {cfg.model_profile === "headless" && (
              <p className="mt-2 text-xs text-warning-text">
                The config list only contains providers the profile declares, so
                account-backed providers (DeepSeek Account, Gemini Code Assist) are
                missing. Cards still run this profile; the router provider is
                translated from <code>adit-router</code> to <code>adit-9router</code>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
