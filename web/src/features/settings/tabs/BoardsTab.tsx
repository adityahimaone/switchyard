import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Archive, ArchiveRestore } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api, archiveBoard, type Board } from "@/api"
import { SettingsSection } from "../settings-parts"

export default function BoardsTab() {
  const qc = useQueryClient()
  const { data: boards = [], isLoading, isError, error } = useQuery<Board[]>({
    queryKey: ["boards"],
    queryFn: () => api<Board[]>("/api/boards"),
  })
  const [busy, setBusy] = useState<string | null>(null)

  const active = boards.filter((b) => !b.archived)
  const archived = boards.filter((b) => b.archived)

  async function toggle(slug: string, next: boolean) {
    setBusy(slug)
    try {
      await archiveBoard(slug, next)
      await qc.invalidateQueries({ queryKey: ["boards"] })
    } finally {
      setBusy(null)
    }
  }

  return (
    <SettingsSection
      title="Boards and dispatch"
      description="Archive a board to retire its queue without deleting its history. Archived boards stay readable but stop dispatching work."
    >
      {isLoading ? (
        <p className="py-4 text-sm text-ink-3">Loading boards…</p>
      ) : isError ? (
        <p className="py-4 text-sm text-danger-text">{(error as Error).message}</p>
      ) : boards.length === 0 ? (
        <p className="py-4 text-sm text-ink-3">No boards yet.</p>
      ) : (
        <div className="flex flex-col">
          {active.map((b) => (
            <div key={b.slug} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">
                  {b.icon ? `${b.icon} ` : ""}{b.name}
                </p>
                <p className="truncate font-mono text-2xs text-ink-3">{b.slug}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === b.slug}
                onClick={() => void toggle(b.slug, true)}
              >
                <Archive className="size-3.5" /> Archive
              </Button>
            </div>
          ))}

          {archived.length > 0 && (
            <>
              <p className="border-t border-line pt-4 pb-1 text-xs font-medium text-ink-3">
                Archived
              </p>
              {archived.map((b) => (
                <div key={b.slug} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-3">
                      {b.icon ? `${b.icon} ` : ""}{b.name}
                    </p>
                    <p className="truncate font-mono text-2xs text-ink-3">{b.slug}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === b.slug}
                    onClick={() => void toggle(b.slug, false)}
                  >
                    <ArchiveRestore className="size-3.5" /> Restore
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </SettingsSection>
  )
}
