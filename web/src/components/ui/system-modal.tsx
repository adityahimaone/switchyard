import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"

export function SystemModal({ open, title, description, children, footer, onClose }: { open: boolean; title: string; description?: string; children?: ReactNode; footer?: ReactNode; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose, open])
  if (!open) return null
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="system-modal-title" className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] shadow-2xl">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <div><h2 id="system-modal-title" className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-[var(--color-ink-3)]">{description}</p>}</div>
        <button type="button" aria-label="Close dialog" onClick={onClose} className="rounded-md p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-inset)] hover:text-[var(--color-ink)]"><X className="size-4" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      {footer && <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--color-line)] bg-[var(--color-surface)]/40 px-4 py-3">{footer}</footer>}
    </section>
  </div>
}
