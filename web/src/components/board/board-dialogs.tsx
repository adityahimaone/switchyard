import { useState } from "react"
import { api, type Board } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function NewBoardDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (b: Board | null) => void }) {
  const [slug, setSlug] = useState("")
  const [name, setName] = useState("")
  const [icon, setIcon] = useState("🗂")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!slug.trim()) { setErr("Slug is required"); return }
    setBusy(true); setErr(null)
    try {
      const b = await api<Board>("/api/boards", {
        method: "POST",
        body: JSON.stringify({ slug: slug.trim().toLowerCase(), name: name.trim(), icon }),
      })
      onCreated(b)
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-panel border border-line bg-raised p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink">New board</h2>
        <label className="mt-3 block text-xs text-ink-3" htmlFor="nb-slug">Slug</label>
        <Input id="nb-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="f8-gadjian" className="mt-1" />
        <label className="mt-3 block text-xs text-ink-3" htmlFor="nb-name">Name</label>
        <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="F8 Gadjian" className="mt-1" />
        <label className="mt-3 block text-xs text-ink-3" htmlFor="nb-icon">Icon (emoji)</label>
        <Input id="nb-icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="mt-1 w-20" />
        {err && <p className="mt-3 text-xs text-danger-text">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="signal" size="sm" loading={busy} onClick={submit}>Create board</Button>
        </div>
      </div>
    </div>
  )
}

export function EditBoardDialog({ board, onClose, onSaved }: { board: Board; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(board.name)
  const [icon, setIcon] = useState(board.icon)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!name.trim()) { setErr("Name is required"); return }
    setBusy(true); setErr(null)
    try {
      await api(`/api/boards/${board.slug}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), icon }),
      })
      onSaved()
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-panel border border-line bg-raised p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-ink">Edit board</h2>
        <label className="mt-3 block text-xs text-ink-3" htmlFor="eb-slug">Slug (read-only)</label>
        <Input id="eb-slug" value={board.slug} disabled className="mt-1" />
        <label className="mt-3 block text-xs text-ink-3" htmlFor="eb-name">Name</label>
        <Input id="eb-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        <label className="mt-3 block text-xs text-ink-3" htmlFor="eb-icon">Icon (emoji)</label>
        <Input id="eb-icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="mt-1 w-20" />
        {err && <p className="mt-3 text-xs text-danger-text">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="signal" size="sm" loading={busy} onClick={submit}>Save changes</Button>
        </div>
      </div>
    </div>
  )
}
