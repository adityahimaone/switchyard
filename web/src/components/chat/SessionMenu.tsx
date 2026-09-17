import { useState } from "react"
import { Copy, Download, GitFork, MoreHorizontal, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { downloadChatTranscript, exportChatSession, forkChatSession, type ChatSession } from "@/api"

type SessionMenuProps = {
  session: ChatSession
  forkMessageId?: string
  onDuplicate: () => void | Promise<void>
  onFork?: (session: ChatSession) => void | Promise<void>
  onDelete: () => void | Promise<void>
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function SessionMenu({ session, forkMessageId, onDuplicate, onFork, onDelete }: SessionMenuProps) {
  const [busy, setBusy] = useState(false)
  async function run(action: () => void | Promise<void>) {
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  async function exportJSON() {
    const snapshot = await exportChatSession(session.id)
    download(`${session.title || "chat"}.json`, JSON.stringify(snapshot, null, 2), "application/json")
  }
  async function transcript() {
    download(`${session.title || "chat"}.md`, await downloadChatTranscript(session.id), "text/markdown;charset=utf-8")
  }
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={`Actions for ${session.title}`} className="size-7"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="border-[var(--color-line)] bg-[var(--color-surface-raised)]">
      <DropdownMenuItem onSelect={() => void run(onDuplicate)}><Copy className="size-3.5" /> Duplicate</DropdownMenuItem>
      <DropdownMenuItem disabled={!forkMessageId || !onFork} onSelect={() => { if (forkMessageId && onFork) void run(() => onFork(session)) }}><GitFork className="size-3.5" /> Fork from message</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void run(exportJSON)}><Download className="size-3.5" /> Export JSON</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => void run(transcript)}><Download className="size-3.5" /> Download transcript</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => void run(onDelete)}><Trash2 className="size-3.5" /> Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}

export async function forkSessionFromMessage(session: ChatSession, messageId: string, onCreated: (fork: ChatSession) => void) {
  onCreated(await forkChatSession(session.id, messageId))
}
