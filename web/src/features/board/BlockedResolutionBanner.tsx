import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, RotateCcw, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchSelect } from "@/components/ui/search-select"
import { useExecutorModels } from "./modelCatalog"
import { api, toastGlobal, type Task } from "@/api"

const EXECUTOR_OPTIONS = [
  { value: "commandcode", label: "Command Code" },
  { value: "dsh", label: "DeepSeek Harness" },
  { value: "hermes", label: "Hermes" },
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "omp", label: "omp (oh-my-pi)" },
  { value: "shell", label: "Shell agent" },
]

export function BlockedResolutionBanner({
  task,
  slug,
  className = "",
  onRetried,
}: {
  task: Task
  slug: string
  className?: string
  onRetried?: () => void
}) {
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)

  // Normalize initial executor
  const initialExecutor =
    (task.executor as string) === "cmd" ? "commandcode"
    : task.executor && task.executor !== "auto" ? task.executor
    : "commandcode"

  const [selectedExecutor, setSelectedExecutor] = useState<string>(initialExecutor)
  const { models } = useExecutorModels(selectedExecutor)

  // Initial model or sensible default for executor
  const [selectedModel, setSelectedModel] = useState(task.model || "")

  const handleExecutorChange = (nextExec: string) => {
    setSelectedExecutor(nextExec)
    // Clear or reset model when switching executor if not applicable
    setSelectedModel("")
  }

  const copyError = () => {
    if (!task.last_failure_error) return
    navigator.clipboard.writeText(task.last_failure_error).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const retryMutation = useMutation({
    mutationFn: async () => {
      const payload: { executor?: string; model?: string } = {
        executor: selectedExecutor,
        model: selectedModel.trim(),
      }
      return api<Task>(`/api/boards/${encodeURIComponent(slug)}/tasks/${encodeURIComponent(task.id)}/retry`, {
        method: "POST",
        body: JSON.stringify(payload),
      })
    },
    onSuccess: () => {
      toastGlobal(`Task requeued to todo with ${selectedExecutor}${selectedModel ? ` (${selectedModel})` : ""}`, "success")
      queryClient.invalidateQueries({ queryKey: ["tasks", slug] })
      queryClient.invalidateQueries({ queryKey: ["task", slug, task.id] })
      queryClient.invalidateQueries({ queryKey: ["board", slug] })
      queryClient.invalidateQueries({ queryKey: ["events", slug, task.id] })
      queryClient.invalidateQueries({ queryKey: ["runs", slug, task.id] })
      onRetried?.()
    },
    onError: (err: Error) => {
      toastGlobal(err.message || "Failed to retry task", "error")
    },
  })

  return (
    <div className={`rounded-xl border border-danger/40 bg-gradient-to-b from-danger/15 to-danger/5 p-3.5 shadow-sm ${className}`}>
      {/* Header & Failure Message */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0 text-danger-text" />
          <span className="text-2xs font-semibold uppercase tracking-wider text-danger-text">
            Task Execution Blocked
          </span>
        </div>
        {task.last_failure_error && (
          <Button
            variant="ghost"
            size="xs"
            onClick={copyError}
            className="h-6 gap-1 px-1.5 text-2xs text-danger-text hover:bg-danger/20"
            title="Copy error details"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            <span>{copied ? "Copied" : "Copy error"}</span>
          </Button>
        )}
      </div>

      {task.last_failure_error && (
        <div className="mt-2 rounded-md bg-black/40 p-2 font-mono text-2xs leading-relaxed text-danger-text">
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap break-words selection:bg-danger/30">
            {task.last_failure_error}
          </p>
        </div>
      )}

      {/* Resolution & Re-dispatch Controls */}
      <div className="mt-3.5 border-t border-danger/20 pt-3">
        <p className="text-2xs font-medium text-ink-2">
          Re-route and dispatch with updated executor or model:
        </p>

        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Executor Selector */}
          <div>
            <label className="block text-[11px] font-medium text-ink-3">Executor</label>
            <Select value={selectedExecutor} onValueChange={handleExecutorChange}>
              <SelectTrigger size="sm" className="mt-1 w-full bg-surface text-ink-1 border-subtle">
                <SelectValue placeholder="Select executor…" />
              </SelectTrigger>
              <SelectContent>
                {EXECUTOR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Selector */}
          <div>
            <label className="block text-[11px] font-medium text-ink-3">
              Model {models.length > 0 ? `(${models.length} available)` : ""}
            </label>
            {models.length > 0 ? (
              <SearchSelect
                value={selectedModel}
                onValueChange={setSelectedModel}
                options={models}
                placeholder="Select or search model…"
                searchPlaceholder="Search models…"
                emptyMessage="No model found"
                className="mt-1"
                triggerClassName="bg-surface text-ink-1 border-subtle"
              />
            ) : (
              <input
                type="text"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                placeholder="e.g. claude-sonnet-5-5 or default"
                className="mt-1 h-8 w-full rounded-md border border-subtle bg-surface px-2.5 text-xs text-ink-1 placeholder:text-ink-4 focus:border-accent focus:outline-none"
              />
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="default"
            disabled={retryMutation.isPending}
            onClick={() => retryMutation.mutate()}
            className="gap-1.5 shadow-sm"
          >
            <RotateCcw className={`size-3.5 ${retryMutation.isPending ? "animate-spin" : ""}`} />
            <span>{retryMutation.isPending ? "Requeueing…" : "Apply & Retry"}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
