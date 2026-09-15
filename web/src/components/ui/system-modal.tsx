import { useEffect, type ReactNode } from "react"

export function SystemModal({ open, title, description, children, footer, onClose }: { open: boolean; title: string; description?: string; children?: ReactNode; footer?: ReactNode; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onClose, open])
  if (!open) return null
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="system-modal-title" className="w-full max-w-md rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-surface-raised)] p-4 shadow-2xl">
      <h2 id="system-modal-title" className="text-sm font-semibold text-[var(--color-ink)]">{title}</h2>
      {description && <p className="mt-1 text-xs leading-5 text-[var(--color-ink-3)]">{description}</p>}
      <div className="mt-4">{children}</div>
      {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
    </section>
  </div>
}
