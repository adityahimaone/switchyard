import { Attachment } from "@/api"
import { FileText, ImageIcon, X } from "lucide-react"

export function AttachmentChip({ att, onRemove, showPreview = false }: { att: Attachment; onRemove?: () => void; showPreview?: boolean }) {
  const isImage = att.mime.startsWith("image/")
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-xs">
      {showPreview && isImage ? (
        <img src={`/api/attachments/${att.id}`} alt={att.filename} className="size-8 shrink-0 rounded object-cover" />
      ) : isImage ? (
        <ImageIcon className="size-4 shrink-0 text-sky-400" />
      ) : (
        <FileText className="size-4 shrink-0 text-amber-400" />
      )}
      <a href={`/api/attachments/${att.id}/download`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline-offset-2 hover:underline" title={`${att.filename} · ${att.size} bytes`}>
        {att.filename}
      </a>
      <span className="shrink-0 text-[10px] text-neutral-500">{att.mime.split("/")[1]?.toUpperCase()}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="shrink-0 text-neutral-400 hover:text-red-400" aria-label="remove">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
