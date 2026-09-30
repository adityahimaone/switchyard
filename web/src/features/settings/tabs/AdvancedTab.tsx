import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useSoundSettings } from "@/hooks/useSettings"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { SettingRow, SettingsSection } from "../settings-parts"
import { useSetting } from "../useSetting"

const REFRESH_KEY = "kb-refresh-interval"
const DENSITY_KEY = "kb-density"
const PING_KEY = "kb-ping-interval"

export default function AdvancedTab() {
  const qc = useQueryClient()
  const sound = useSoundSettings()
  const [refreshMs] = useSetting(REFRESH_KEY, 15000)
  const [density] = useSetting(DENSITY_KEY, "comfortable")
  const [pingMs] = useSetting(PING_KEY, 30000)

  const [pendingClear, setPendingClear] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null)

  async function clearHistory() {
    setBusy(true)
    setMsg(null)
    try {
      await api("/api/settings/execution-history", { method: "DELETE" })
      await qc.invalidateQueries({ queryKey: ["tasks"] })
      setMsg({ tone: "ok", text: "Execution history cleared." })
      setPendingClear(false)
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  function exportSettings() {
    const payload = JSON.stringify(
      {
        soundOn: sound.enabled,
        volume: sound.volume,
        refreshMs,
        density,
        pingMs,
      },
      null,
      2,
    )
    const blob = new Blob([payload], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "switchyard-settings.json"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Data"
        description="Download or remove what this browser and the server hold."
      >
        <SettingRow
          label="Export settings"
          help="Download the preferences stored in this browser as JSON."
        >
          <Button size="sm" variant="secondary" onClick={exportSettings}>
            Export
          </Button>
        </SettingRow>

        <SettingRow
          label="Polling intervals"
          help="A snapshot of the current intervals, for support."
        >
          <span className="font-mono text-2xs text-ink-3 tabular">
            board {Math.round(refreshMs / 1000)}s · ping {Math.round(pingMs / 1000)}s
          </span>
        </SettingRow>
      </SettingsSection>

      <SettingsSection
        title="Danger zone"
        description="These actions cannot be undone."
        danger
      >
        <SettingRow
          label="Clear execution history"
          help="Removes worker logs, execution events and failure traces. Tasks, comments and attachments are kept, and running tasks are left alone."
        >
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setPendingClear(true)}
            disabled={busy}
          >
            Clear history
          </Button>
        </SettingRow>
        {msg && (
          <p
            role="status"
            className={msg.tone === "ok" ? "py-3 text-sm text-success" : "py-3 text-sm text-danger-text"}
          >
            {msg.text}
          </p>
        )}
      </SettingsSection>

      <ConfirmDialog
        open={pendingClear}
        onOpenChange={setPendingClear}
        title="Clear execution history"
        description="Worker logs, execution events and failure traces are removed. Tasks, comments and attachments stay, and running tasks are not touched. This cannot be undone."
        confirmLabel="Clear history"
        busy={busy}
        onConfirm={() => void clearHistory()}
      />
    </div>
  )
}
