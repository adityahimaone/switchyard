import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getExecutorSettings, saveExecutorSettings, type ExecutorSettings } from "@/api"

const LABELS: Record<string, { title: string; hint: string }> = {
  auto: { title: "Auto", hint: "Compatibility fallback. Resolves Hermes, then Codex, then Command Code." },
  hermes: { title: "Hermes", hint: "Hermes CLI agent session." },
  codex: { title: "Codex", hint: "OpenAI Codex CLI session." },
  commandcode: { title: "Command Code", hint: "Command Code headless session, with per-card continuity." },
  dsh: { title: "DeepSeek Harness", hint: "DSH headless profile, with per-card session continuity." },
  omp: { title: "omp (oh-my-pi)", hint: "omp headless session, with per-card session continuity." },
  shell: { title: "Shell", hint: "Agentic or direct shell access in the workspace." },
}

const FALLBACK: ExecutorSettings = {
  order: ["auto", "hermes", "codex", "commandcode", "dsh", "omp", "shell"],
  disabled: [],
  default_execution_mode: "direct",
}

export function executorIsEnabled(executor: string, settings: ExecutorSettings) {
  if (executor === "auto") return true
  return !settings.disabled.includes(executor)
}

export default function ExecutorSettingsPanel() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["executor-settings"], queryFn: getExecutorSettings })
  const settings = data ?? FALLBACK

  const save = useMutation({
    mutationFn: saveExecutorSettings,
    onSuccess: (saved) => {
      qc.setQueryData(["executor-settings"], saved)
    },
  })

  // Optimistic local copy so reordering feels instant; the server normalizes and
  // the mutation result replaces it with exactly what was stored.
  const commit = (next: ExecutorSettings) => save.mutate(next)

  const move = (executor: string, delta: -1 | 1) => {
    const order = [...settings.order]
    const i = order.indexOf(executor)
    const j = i + delta
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    commit({ ...settings, order })
  }

  const toggle = (executor: string, enabled: boolean) => {
    const disabled = enabled
      ? settings.disabled.filter((e) => e !== executor)
      : [...settings.disabled, executor]
    commit({ ...settings, disabled })
  }

  const reset = () => commit({ ...FALLBACK, order: [...settings.order] })

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-[640px] flex-col">
        <h2 className="text-lg font-semibold text-ink">Executors</h2>
        <p className="mt-1 max-w-[56ch] text-sm text-ink-3">
          Order shown in the task dialog. Disabled executors are hidden from the
          picker; tasks that already use one keep working.
        </p>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={reset} disabled={save.isPending}>
            <RotateCcw className="size-3.5" /> Reset to default
          </Button>
        </div>
        <div className="mt-3 divide-y divide-line border-y border-line">
          {settings.order.map((executor, index) => {
            const meta = LABELS[executor] ?? { title: executor, hint: "" }
            const isAuto = executor === "auto"
            const enabled = executorIsEnabled(executor, settings)
            return (
              <div key={executor} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{meta.title}</p>
                  <p className="text-xs text-ink-3">{meta.hint}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${meta.title} up`} disabled={index === 0 || save.isPending} onClick={() => move(executor, -1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${meta.title} down`} disabled={index === settings.order.length - 1 || save.isPending} onClick={() => move(executor, 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
                <Switch
                  checked={enabled}
                  disabled={isAuto || save.isPending}
                  onCheckedChange={(v) => toggle(executor, v)}
                  aria-label={`${enabled ? "Disable" : "Enable"} ${meta.title}`}
                />
              </div>
            )
          })}
        </div>
        {save.isError && (
          <p className="mt-3 text-sm text-danger-text">
            Could not save executor settings. Check the server logs.
          </p>
        )}
      </div>

      <div className="flex max-w-[640px] flex-col">
        <h2 className="text-lg font-semibold text-ink">Default execution mode</h2>
        <p className="mt-1 max-w-[56ch] text-sm text-ink-3">
          Pre-selected when creating a task. Direct runs the executor once;
          agentic lets it plan and iterate.
        </p>
        <div className="mt-4 flex justify-end">
          <Select
            value={settings.default_execution_mode}
            onValueChange={(v) =>
              commit({ ...settings, default_execution_mode: v as ExecutorSettings["default_execution_mode"] })
            }
            disabled={save.isPending}
          >
            <SelectTrigger className="w-40" aria-label="Default execution mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="agentic">Agentic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
