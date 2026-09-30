import { useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { api, getJEVStatus } from "@/api"
import { SettingRow, SettingsSection } from "../settings-parts"
import AttachmentAnalysisSettings from "../AttachmentAnalysisSettings"

/** Connection state is a label plus a lamp, not a colour alone. */
function ConnectionPill({ online, configured }: { online?: boolean; configured?: boolean }) {
  const tone = online ? "text-success" : configured ? "text-warning" : "text-ink-3"
  const label = online ? "Online" : configured ? "Configured, offline" : "Fallback mode"
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${tone}`}>
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full ${online ? "bg-current" : "border border-current"}`}
      />
      {label}
    </span>
  )
}

export default function VisionTab() {
  const qc = useQueryClient()
  const { data: jev, isFetching, refetch } = useQuery({
    queryKey: ["jev-status"],
    queryFn: getJEVStatus,
    refetchInterval: 30_000,
  })

  async function toggleJEV(enabled: boolean) {
    await api("/api/settings/jev", { method: "PUT", body: JSON.stringify({ enabled }) })
    await qc.invalidateQueries({ queryKey: ["jev-status"] })
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Task routing"
        description="Classifies a task before dispatch so the worker receives a focused context instead of the whole repository."
      >
        <SettingRow
          label="JEV task routing"
          help="Identify the task case and workspace scope before execution."
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Refresh JEV status"
            className="text-ink-3"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Switch
            checked={jev?.enabled ?? true}
            onCheckedChange={(v) => void toggleJEV(v)}
            disabled={!jev}
            aria-label="Enable JEV task routing"
          />
        </SettingRow>

        <SettingRow label="Connection">
          <ConnectionPill online={jev?.online} configured={jev?.configured} />
        </SettingRow>

        <SettingRow label="Model">
          <span className="truncate font-mono text-2xs text-ink-2">
            {jev?.model ?? "Checking…"}
          </span>
        </SettingRow>

        <SettingRow
          label="Classifications"
          help={`${jev?.successful_calls ?? 0} routed · ${jev?.fallback_calls ?? 0} fallback`}
        >
          <span className="text-xs text-ink-3 tabular">
            chat {jev?.chat_calls ?? 0} · board {jev?.kanban_calls ?? 0}
          </span>
        </SettingRow>

        {jev && jev.calls > 0 && (
          <p className="py-3 text-xs text-ink-3">
            Last classification took {jev.last_latency_ms} ms
            {jev.last_input_tokens ? ` and used ${jev.last_input_tokens} input tokens` : ""}.
          </p>
        )}
      </SettingsSection>

      <AttachmentAnalysisSettings />
    </div>
  )
}
