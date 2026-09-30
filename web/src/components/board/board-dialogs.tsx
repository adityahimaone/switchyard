import { useState } from "react"
import { api, type Board } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

/**
 * Board forms. These are short, so they use Dialog rather than a Sheet — a
 * Sheet is for viewing or editing an existing entry, a Dialog for creating one.
 */
export function NewBoardDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (b: Board | null) => void }) {
  const [slug, setSlug] = useState("")
  const [name, setName] = useState("")
  const [icon, setIcon] = useState("🗂")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" showClose={false}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New board</DialogTitle>
            <DialogDescription>Boards hold their own task queue.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nb-slug">Slug</Label>
              <Input
                id="nb-slug" value={slug} onChange={(e) => setSlug(e.target.value)}
                placeholder="f8-gadjian" autoFocus aria-invalid={!!err}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nb-name">Name</Label>
              <Input id="nb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="F8 Gadjian" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nb-icon">Icon</Label>
              <Input id="nb-icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="w-20" />
            </div>
            {err && <p className="text-sm text-danger-text" role="alert">{err}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="signal" loading={busy}>Create board</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditBoardDialog({ board, onClose, onSaved }: { board: Board; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(board.name)
  const [icon, setIcon] = useState(board.icon)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
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
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm" showClose={false}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Edit board</DialogTitle>
            <DialogDescription className="font-mono text-2xs">{board.slug}</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eb-name">Name</Label>
              <Input id="eb-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={!!err} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eb-icon">Icon</Label>
              <Input id="eb-icon" value={icon} onChange={(e) => setIcon(e.target.value)} className="w-20" />
            </div>
            {err && <p className="text-sm text-danger-text" role="alert">{err}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="signal" loading={busy}>Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
