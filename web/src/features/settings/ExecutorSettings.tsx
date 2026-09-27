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
  shell: { title: "Shell", hint: "Agentic or direct shell access in the workspace." },
}

const FALLBACK: ExecutorSettings = {
  order: ["auto", "hermes", "codex", "commandcode", "dsh", "shell"],
  disabled: [],
  default_execution_mode: "direct",
}

export function executorIsEnabled(executor: string, settings: ExecutorSettings) {
  if (executor === "auto") return true
  return !settings.disabled.includes(executor)
}

export default function ExecutorSettingsPanel({ show }: { show: (...labels: string[]) => boolean }) {
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

  if (!show("Executor", "Execution", "Agent", "Sort", "Order", "Enable", "Disable", "Mode")) return null

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Executor order</p>
            <p className="text-xs text-ink-4">
              Order shown in the task dialog. Disabled executors are hidden from the picker; tasks that already
              use one keep working.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reset} disabled={save.isPending}>
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {settings.order.map((executor, index) => {
            const meta = LABELS[executor] ?? { title: executor, hint: "" }
            const isAuto = executor === "auto"
            const enabled = executorIsEnabled(executor, settings)
            return (
              <div key={executor} className="flex items-center gap-3 rounded-lg border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{meta.title}</p>
                  <p className="text-xs text-ink-4">{meta.hint}</p>
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
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-line)]/60 bg-[var(--color-surface)]/30 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Default execution mode</p>
          <p className="text-xs text-ink-4">
            Pre-selected when creating a task. Direct runs the executor once; agentic lets it plan and iterate.
          </p>
        </div>
        <Select
          value={settings.default_execution_mode}
          onValueChange={(v) => commit({ ...settings, default_execution_mode: v as ExecutorSettings["default_execution_mode"] })}
          disabled={save.isPending}
        >
          <SelectTrigger className="w-40 shrink-0" aria-label="Default execution mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="direct">Direct</SelectItem>
            <SelectItem value="agentic">Agentic</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {save.isError && (
        <p className="text-xs text-red-400">Could not save executor settings. Check the server logs.</p>
      )}
    </div>
  )
}
