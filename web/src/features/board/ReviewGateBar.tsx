import { Check, GitCommitVertical, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * The review gate. Sticky at the foot of the diff column while status is
 * review, so the decision is always reachable without scrolling back.
 *
 * Actions are explicit buttons rather than a "Choose an action…" select: the
 * two commit paths differ only in whether they push, and hiding that behind a
 * dropdown meant the user had to guess which option did what.
 */
export function ReviewGateBar({
  files,
  added,
  removed,
  selectedCount,
  clean,
  busy,
  error,
  onMarkDone,
  onCommit,
  onCommitPush,
}: {
  files: number
  added: number
  removed: number
  selectedCount: number
  /** True when there is nothing to commit; only "Mark done" applies. */
  clean: boolean
  busy: boolean
  error?: string | null
  onMarkDone: () => void
  onCommit: () => void
  onCommitPush: () => void
}) {
  const partial = selectedCount > 0 && selectedCount < files
  const fileLabel =
    selectedCount === files ? "all files" : `${selectedCount} of ${files} files`

  return (
    <div className="sticky bottom-0 z-10 border-t border-line bg-surface">
      {error && (
        <p role="alert" className="border-b border-danger/30 bg-danger-tint px-4 py-2 text-xs text-danger-text">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <p className="text-sm text-ink-2 tabular">
          {files === 1 ? "1 file" : `${files} files`}
          <span className="ml-2 text-success-text">+{added}</span>
          <span className="ml-1 text-danger-text">−{removed}</span>
        </p>

        {clean ? (
          <>
            <p className="text-xs text-ink-3">No workspace changes, nothing to commit.</p>
            <Button
              variant="signal"
              size="sm"
              className="ml-auto"
              loading={busy}
              onClick={onMarkDone}
            >
              <Check className="size-3.5" /> Mark done
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs text-ink-3">
              {partial ? `Committing ${fileLabel}` : "Committing all files"}
            </p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" loading={busy} onClick={onMarkDone}>
                Mark done
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                disabled={selectedCount === 0}
                onClick={onCommit}
              >
                <GitCommitVertical className="size-3.5" />
                Commit{partial ? ` ${selectedCount}` : ""}
              </Button>
              <Button
                variant="signal"
                size="sm"
                loading={busy}
                disabled={selectedCount === 0}
                onClick={onCommitPush}
              >
                <Upload className="size-3.5" />
                {partial ? `Approve ${selectedCount} and push` : "Approve and push"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
