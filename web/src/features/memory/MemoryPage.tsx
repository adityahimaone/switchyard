import { useEffect, useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Brain, User, Sparkles } from "lucide-react"
import LoadingState from "@/components/LoadingState"

interface MemorySnapshot {
  memory: string
  user: string
  soul: string
  memory_path: string
  user_path: string
  soul_path: string
  memory_mtime: number | null
  user_mtime: number | null
  soul_mtime: number | null
}

function fmtMtime(v: number | null): string {
  if (v == null) return "—"
  return new Date(v * 1000).toLocaleString("id-ID")
}

type ProfileMemory = { content: string; mtime: number | null }

function ProfileMemoryEditor({ profile, scope }: { profile: string; scope: "memory" | "user" }) {
  const item = useQuery({ queryKey: ["profile-memory", profile, scope], queryFn: () => api<ProfileMemory>(`/api/profiles/${encodeURIComponent(profile)}/memory/${scope}`) })
  const [draft, setDraft] = useState("")
  useEffect(() => { if (item.data) setDraft(item.data.content) }, [item.data?.content])
  const save = useMutation({ mutationFn: () => api(`/api/profiles/${encodeURIComponent(profile)}/memory/${scope}`, { method: "PUT", body: JSON.stringify({ content: draft }) }), onSuccess: () => item.refetch() })
  return <Card className="flex min-h-0 flex-col border-[var(--color-line)] bg-[var(--color-surface)]">
    <CardHeader className="pb-2"><CardTitle className="text-sm">{scope === "memory" ? "MEMORY.md" : "USER.md"} · {profile}</CardTitle><p className="text-[11px] text-neutral-500">{item.data?.mtime ? fmtMtime(item.data.mtime) : "not saved"}</p></CardHeader>
    <Separator /><CardContent className="space-y-2 p-3"><Textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-40 font-mono text-[11px]" placeholder={item.isLoading ? "Loading…" : "Empty"} /><div className="flex justify-end"><Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || item.isLoading}>{save.isPending ? "Saving…" : "Save"}</Button></div>{save.isError && <p className="text-xs text-red-300">{(save.error as Error).message}</p>}</CardContent>
  </Card>
}

function MemoryCard({ icon: Icon, title, path, mtime, content }: { icon: typeof Brain; title: string; path: string; mtime: number | null; content: string }) {
  return (
    <Card className="decorative-card flex min-h-0 flex-col border-[var(--color-line)] bg-[var(--color-surface)]">
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-[var(--color-accent)]" /> {title}
        </CardTitle>
        <p className="font-mono text-[11px] text-neutral-500" title={path}>{path}</p>
        <p className="text-[11px] text-neutral-500">mtime: {fmtMtime(mtime)} · {content.length} chars</p>
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
        <pre className="whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-neutral-300">
          {content || <span className="text-neutral-500">(empty)</span>}
        </pre>
      </CardContent>
    </Card>
  )
}

export default function MemoryPage() {
  const mem = useQuery({ queryKey: ["memory"], queryFn: () => api<MemorySnapshot>("/api/memory") })

  if (mem.isLoading) return <LoadingState label="Memuat memory" />
  if (mem.isError) return <p className="p-4 text-sm text-red-400">Gagal load memory: {(mem.error as Error).message}</p>
  const d = mem.data!

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-4">
      <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Context</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">Memory</h1>
      <p className="mt-1 text-xs text-[var(--color-ink-3)]">
        Read-only snapshot dari <code className="text-neutral-400">~/.hermes/memories/MEMORY.md</code>,{" "}
        <code className="text-neutral-400">USER.md</code>, dan <code className="text-neutral-400">~/.hermes/SOUL.md</code> — mirrors hermes-web-go <code className="text-neutral-400">/api/memory</code>.
      </p>
      <Separator className="my-3" />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto lg:grid-cols-3">
        <MemoryCard icon={Brain} title="MEMORY.md" path={d.memory_path} mtime={d.memory_mtime} content={d.memory} />
        <MemoryCard icon={User} title="USER.md" path={d.user_path} mtime={d.user_mtime} content={d.user} />
        <MemoryCard icon={Sparkles} title="SOUL.md" path={d.soul_path} mtime={d.soul_mtime} content={d.soul} />
        <ProfileMemoryEditor profile="default" scope="memory" />
        <ProfileMemoryEditor profile="default" scope="user" />
      </div>
    </div>
  )
}
