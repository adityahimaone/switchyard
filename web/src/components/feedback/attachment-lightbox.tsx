import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Download, X } from "lucide-react"

/**
 * The fields the lightbox renders. A structural subset of both
 * Attachment and VerifyAttachment, so a chip, a chat message
 * and a verification screenshot can all open it without the
 * storage bookkeeping neither renders.
 */
export interface LightboxAttachment {
  id: string
  filename: string
  mime: string
  size: number
}

/**
 * AttachmentLightbox is the full-size view of an image attachment.
 *
 * Screenshots and design exports are the evidence a reviewer
 * actually looks at, and a thumbnail or a h-28 preview cannot
 * show what a reviewer needs to see — a contrast regression, a
 * spacing drift, the design the card was graded against. The
 * shared Dialog primitive keeps one modal language: Escape
 * closes, the scrim dims, focus stays trapped.
 *
 * `att` is null while closed. Passing the whole attachment —
 * not just its id — keeps the caption honest about what it is.
 */
export function AttachmentLightbox({
  att,
  onClose,
}: {
  att: LightboxAttachment | null
  onClose: () => void
}) {
  return (
    <Dialog open={att != null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className="max-h-[92dvh] max-w-5xl gap-3 bg-[var(--c-canvas)]! p-4"
        showClose={false}
      >
        {att && (
          <>
            <div className="flex shrink-0 items-center justify-between gap-3">
              <span
                className="min-w-0 truncate font-mono text-xs text-ink-2"
                title={`${att.filename} · ${att.size} bytes · ${att.mime}`}
              >
                {att.filename}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-2xs tabular-nums text-ink-3">
                  {att.mime.split("/")[1]?.toUpperCase()} · {att.size} B
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1"
                  onClick={() => window.open(`/api/attachments/${att.id}/download`, "_blank")}
                >
                  <Download className="size-3" />
                  Download
                </Button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-raised hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <img
              src={`/api/attachments/${att.id}`}
              alt={att.filename}
              className="mx-auto max-h-[80dvh] w-auto max-w-full rounded-control border border-[var(--c-line)] bg-[var(--c-well)] object-contain"
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
