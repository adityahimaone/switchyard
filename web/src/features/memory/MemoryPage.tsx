import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, toastGlobal, type Profile } from "@/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, Brain, CheckCircle2, FileText, Heart, RefreshCw, Save, Search, User } from "lucide-react"
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

function fmtMtime(value: number | null): string {
  if (value == null) return "Belum tersimpan"
  return new Date(value * 1000).toLocaleString("id-ID")
}

type ProfileMemory = { content: string; mtime: number | null }
type MemoryScope = "memory" | "user"

function ProfileMemoryEditor({
  profile,
  scope,
  onDirtyChange,
}: {
  profile: string
  scope: MemoryScope
  onDirtyChange: (dirty: boolean) => void
}) {
  const queryClient = useQueryClient()
  const item = useQuery({
    queryKey: ["profile-memory", profile, scope],
    queryFn: () => api<ProfileMemory>(`/api/profiles/${encodeURIComponent(profile)}/memory/${scope}`),
  })
  const [draft, setDraft] = useState("")
  const [saved, setSaved] = useState(false)
  const originalRef = useRef("")

  useEffect(() => {
    if (!item.data) return
    setDraft(item.data.content)
    originalRef.current = item.data.content
    onDirtyChange(false)
  }, [item.data?.content, onDirtyChange])

  const isDirty = draft !== originalRef.current

  useEffect(() => {
    onDirtyChange(isDirty)
    if (isDirty) setSaved(false)
  }, [isDirty, onDirtyChange])

  const save = useMutation({
    mutationFn: () =>
      api(`/api/profiles/${encodeURIComponent(profile)}/memory/${scope}`, {
        method: "PUT",
        body: JSON.stringify({ content: draft }),
      }),
    onSuccess: async () => {
      originalRef.current = draft
      setSaved(true)
      onDirtyChange(false)
      await queryClient.invalidateQueries({ queryKey: ["profile-memory", profile, scope] })
    },
    onError: (error: Error) => toastGlobal(error.message, "error"),
  })

  const label = scope === "memory" ? "MEMORY.md" : "USER.md"
  const description = scope === "memory" ? "Fakta dan konteks yang dipakai lintas percakapan." : "Preferensi dan informasi tentang user."

  return (
    <Card className="flex min-h-[22rem] flex-col gap-0 border-[var(--color-line)] bg-[var(--color-surface)]/70">
      <CardHeader className="gap-1 border-b border-[var(--color-line)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
              <FileText aria-hidden="true" className="size-4 shrink-0 text-[var(--color-accent)]" />
              <span>{label}</span>
            </CardTitle>
            <p className="mt-1 text-[11px] leading-4 text-[var(--color-ink-3)]">{description}</p>
          </div>
          <span className="shrink-0 text-right text-[10px] text-[var(--color-ink-4)]">
            {item.data ? fmtMtime(item.data.mtime) : "Loading…"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <Textarea
          aria-label={`${label} content`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={item.isLoading || save.isPending}
          className="min-h-48 flex-1 resize-y border-[var(--color-line)] bg-[var(--color-bg)] font-mono text-xs leading-5 text-[var(--color-ink)] placeholder:text-[var(--color-ink-4)] focus-visible:ring-[var(--color-accent)]/40"
          placeholder={item.isLoading ? "Memuat…" : "Belum ada isi. Tambahkan konteks yang ingin diingat Hermes."}
        />
        <div className="flex min-h-8 items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0 text-[11px]">
            {save.isError && <span className="flex items-center gap-1.5 text-[var(--color-danger)]"><AlertCircle aria-hidden="true" className="size-3.5 shrink-0" /> Gagal menyimpan</span>}
            {!save.isError && saved && <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" /> Tersimpan</span>}
            {!save.isError && !saved && isDirty && <span className="text-amber-300">Perubahan belum disimpan</span>}
          </div>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || item.isLoading || !isDirty}
            className="h-8 shrink-0 gap-1.5 bg-[var(--color-accent)] px-3 text-xs text-black hover:bg-[var(--color-accent)]/90 active:scale-[.98]"
          >
            {save.isPending ? <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" /> : <Save aria-hidden="true" className="size-3.5" />}
            {save.isPending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function MemoryCard({
  icon: Icon,
  title,
  description,
  path,
  mtime,
  content,
}: {
  icon: typeof Brain
  title: string
  description: string
  path: string
  mtime: number | null
  content: string
}) {
  return (
    <Card className="flex min-h-[18rem] flex-col gap-0 border-[var(--color-line)] bg-[var(--color-surface)]/55">
      <CardHeader className="gap-1 border-b border-[var(--color-line)] px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
          <Icon aria-hidden="true" className="size-4 text-[var(--color-ink-3)]" />
          {title}
        </CardTitle>
        <p className="text-[11px] leading-4 text-[var(--color-ink-3)]">{description}</p>
        <p className="truncate font-mono text-[10px] text-[var(--color-ink-4)]" title={path}>{path}</p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2 text-[10px] text-[var(--color-ink-4)]">
          <span>{fmtMtime(mtime)}</span>
          <span>{content.length.toLocaleString("en-US")} karakter</span>
        </div>
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-[var(--color-ink-2)]">
          {content || <span className="text-[var(--color-ink-4)]">Belum ada isi.</span>}
        </pre>
      </CardContent>
    </Card>
  )
}

export default function MemoryPage() {
  const memory = useQuery({ queryKey: ["memory"], queryFn: () => api<MemorySnapshot>("/api/memory") })
  const profiles = useQuery({ queryKey: ["profiles"], queryFn: () => api<Profile[]>("/api/profiles") })
  const [activeProfile, setActiveProfile] = useState("default")
  const [searchTerm, setSearchTerm] = useState("")
  const [dirty, setDirty] = useState<Record<MemoryScope, boolean>>({ memory: false, user: false })

  useEffect(() => {
    if (profiles.data?.length && !profiles.data.some((profile) => profile.name === activeProfile)) {
      setActiveProfile(profiles.data[0].name)
    }
  }, [profiles.data, activeProfile])

  useEffect(() => {
    if (!Object.values(dirty).some(Boolean)) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const setMemoryDirty = useCallback((scope: MemoryScope, value: boolean) => {
    setDirty((current) => current[scope] === value ? current : { ...current, [scope]: value })
  }, [])

  if (memory.isLoading) return <LoadingState label="Memuat memory" description="Menyiapkan konteks Hermes." />
  if (memory.isError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
          <div className="flex items-center gap-2 font-medium"><AlertCircle aria-hidden="true" className="size-4" /> Gagal memuat memory</div>
          <p className="mt-1 text-xs leading-5 text-red-200/80">{(memory.error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => memory.refetch()} className="mt-3 h-8 gap-1.5 border-red-400/30 text-xs text-red-100 hover:bg-red-400/10">
            <RefreshCw aria-hidden="true" className="size-3.5" /> Coba lagi
          </Button>
        </div>
      </div>
    )
  }

  const snapshot = memory.data!
  const query = searchTerm.trim().toLowerCase()
  const match = (content: string) => !query || content.toLowerCase().includes(query)
  const visibleCount = [snapshot.memory, snapshot.user, snapshot.soul].filter(match).length
  const hasUnsaved = Object.values(dirty).some(Boolean)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-4 sm:px-5 lg:px-8">
        <header className="flex flex-col gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/60 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[.16em] text-[var(--color-ink-4)]">Hermes context</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--color-ink)]">Memory</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--color-ink-3)]">Kelola konteks global dan profile memory yang dipakai agent saat memahami percakapan dan task.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[18rem]">
            <label htmlFor="memory-search" className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-ink-4)]">Cari isi memory</label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-ink-4)]" />
              <input id="memory-search" type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Filter konteks…" className="h-9 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] pl-9 pr-3 text-xs text-[var(--color-ink)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-accent)]/60 focus:ring-2 focus:ring-[var(--color-accent)]/15" />
            </div>
          </div>
        </header>

        <section className="space-y-3" aria-labelledby="global-context-heading">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="global-context-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]"><Brain aria-hidden="true" className="size-4 text-[var(--color-accent)]" /> Global context</h2>
              <p className="mt-1 text-xs text-[var(--color-ink-3)]">Snapshot read-only dari konteks Hermes bersama.</p>
            </div>
            <span className="text-[10px] text-[var(--color-ink-4)]">{query ? `${visibleCount}/3 cocok` : "read-only"}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            {match(snapshot.memory) && <MemoryCard icon={Brain} title="MEMORY.md" description="Fakta dan konteks lintas sesi." path={snapshot.memory_path} mtime={snapshot.memory_mtime} content={snapshot.memory} />}
            {match(snapshot.user) && <MemoryCard icon={User} title="USER.md" description="Preferensi dan detail tentang user." path={snapshot.user_path} mtime={snapshot.user_mtime} content={snapshot.user} />}
            {match(snapshot.soul) && <MemoryCard icon={Heart} title="SOUL.md" description="Persona dan prinsip perilaku Hermes." path={snapshot.soul_path} mtime={snapshot.soul_mtime} content={snapshot.soul} />}
          </div>
          {query && visibleCount === 0 && <div className="rounded-lg border border-dashed border-[var(--color-line)] px-4 py-8 text-center text-xs text-[var(--color-ink-3)]">Tidak ada memory yang cocok dengan “{searchTerm}”.</div>}
        </section>

        <section className="space-y-3" aria-labelledby="profile-memory-heading">
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/45 p-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="profile-memory-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]"><FileText aria-hidden="true" className="size-4 text-[var(--color-accent)]" /> Profile memory</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--color-ink-3)]">Edit konteks yang spesifik untuk profile agent terpilih.</p>
            </div>
            <div className="flex items-center gap-3">
              {hasUnsaved && <span className="text-[11px] text-amber-300" aria-live="polite">Perubahan belum disimpan</span>}
              <Select value={activeProfile} onValueChange={(nextProfile) => {
                if (hasUnsaved && !window.confirm("Perubahan belum disimpan. Ganti profile dan buang perubahan?")) return
                setDirty({ memory: false, user: false })
                setActiveProfile(nextProfile)
              }}>
                <SelectTrigger aria-label="Pilih profile memory" className="h-9 w-44 border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue placeholder="Pilih profile" /></SelectTrigger>
                <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
                  {(profiles.data ?? []).map((profile) => <SelectItem key={profile.name} value={profile.name} className="text-xs">{profile.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <ProfileMemoryEditor profile={activeProfile} scope="memory" onDirtyChange={(value) => setMemoryDirty("memory", value)} />
            <ProfileMemoryEditor profile={activeProfile} scope="user" onDirtyChange={(value) => setMemoryDirty("user", value)} />
          </div>
        </section>
      </div>
    </div>
  )
}
