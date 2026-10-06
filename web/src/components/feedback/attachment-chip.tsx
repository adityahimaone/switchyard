import { useState } from "react"
import { Attachment } from "@/api"
import { FileText, ImageIcon, X } from "lucide-react"
import { AttachmentLightbox, type LightboxAttachment } from "./attachment-lightbox"

export function AttachmentChip({ att, onRemove, showPreview = false }: { att: Attachment; onRemove?: () => void; showPreview?: boolean }) {
  const isImage = att.mime.startsWith("image/")
  const [view, setView] = useState<LightboxAttachment | null>(null)
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-xs">
      {isImage ? (
        <button
          type="button"
          onClick={() => setView(att)}
          title={`View ${att.filename} full size`}
          className="shrink-0 cursor-zoom-in"
        >
          {showPreview ? (
            <img src={`/api/attachments/${att.id}`} alt={att.filename} className="size-8 rounded object-cover" />
          ) : (
            <ImageIcon className="size-4 text-sky-400" />
          )}
        </button>
      ) : (
        <FileText className="size-4 shrink-0 text-amber-400" />
      )}
      <a href={`/api/attachments/${att.id}/download`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline-offset-2 hover:underline" title={`${att.filename} · ${att.size} bytes`}>
        {att.filename}
      </a>
      <span className="shrink-0 text-[10px] text-ink-4">{att.mime.split("/")[1]?.toUpperCase()}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="shrink-0 text-ink-3 hover:text-red-400" aria-label="remove">
          <X className="size-3.5" />
        </button>
      )}
      <AttachmentLightbox att={view} onClose={() => setView(null)} />
    </div>
  )
}
