import { useCallback, useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, toastGlobal, type Profile } from "@/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader, SectionHeader } from "@/components/app/page-header"
import { CollectionBody, CollectionGrid } from "@/components/app/collection"
import { EmptyState } from "@/components/app/empty-state"
import { AlertCircle, Brain, CheckCircle2, FileText, Heart, RefreshCw, Save, Search, User } from "lucide-react"
import LoadingState from "@/components/feedback/loading-state"

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
  if (value == null) return "Never written"
  return new Date(value * 1000).toLocaleString()
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
  const description =
    scope === "memory"
      ? "Facts and context carried across conversations."
      : "Preferences and details about the user."

  return (
    <Card className="flex min-h-[22rem] flex-col gap-0">
      <CardHeader className="gap-1 border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-ink">
              <FileText aria-hidden="true" className="size-4 shrink-0 text-accent" />
              <span>{label}</span>
            </CardTitle>
            <p className="mt-1 text-[11px] leading-4 text-ink-3">{description}</p>
          </div>
          <span className="shrink-0 text-right text-[10px] text-ink-3">
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
          className="min-h-48 flex-1 resize-y border-line bg-well font-mono text-xs leading-5 text-ink focus-visible:ring-focus/40"
          placeholder={item.isLoading ? "Loading…" : "Empty. Add the context Hermes should remember."}
        />
        <div className="flex min-h-8 items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0 text-[11px]">
            {save.isError && (
              <span className="flex items-center gap-1.5 text-danger-text">
                <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" /> Could not save
              </span>
            )}
            {!save.isError && saved && (
              <span className="flex items-center gap-1.5 text-success-text">
                <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0" /> Saved
              </span>
            )}
            {!save.isError && !saved && isDirty && (
              <span className="text-warning-text">Unsaved changes</span>
            )}
          </div>
          <Button variant="signal" size="sm" onClick={() => save.mutate()} disabled={save.isPending || item.isLoading || !isDirty}>
            {save.isPending ? (
              <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-3.5" />
            )}
            {save.isPending ? "Saving…" : "Save"}
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
    <Card className="flex min-h-[18rem] flex-col gap-0">
      <CardHeader className="gap-1 border-b border-line px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon aria-hidden="true" className="size-4 text-ink-3" />
          {title}
        </CardTitle>
        <p className="text-[11px] leading-4 text-ink-3">{description}</p>
        <p className="truncate font-mono text-[10px] text-ink-3" title={path}>
          {path}
        </p>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-2 text-[10px] text-ink-3">
          <span>{fmtMtime(mtime)}</span>
          <span className="tabular">{content.length.toLocaleString()} characters</span>
        </div>
        <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-ink-2">
          {content || <span className="text-ink-3">Empty.</span>}
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
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  const setMemoryDirty = useCallback((scope: MemoryScope, value: boolean) => {
    setDirty((current) => (current[scope] === value ? current : { ...current, [scope]: value }))
  }, [])

  if (memory.isLoading) return <LoadingState label="Loading memory" description="Preparing the Hermes context." />
  if (memory.isError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-panel border border-danger/30 bg-danger-tint p-4 text-sm text-danger-text" role="alert">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle aria-hidden="true" className="size-4" /> Could not load memory
          </div>
          <p className="mt-1 text-xs leading-5 text-danger-text">{(memory.error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => memory.refetch()} className="mt-3 border-danger/40 text-danger-text hover:bg-danger/15">
            <RefreshCw aria-hidden="true" className="size-3.5" /> Try again
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
      <PageHeader
        title="Memory"
        description="Global context and per-profile memory that agents read when they pick up a conversation or a task."
      >
        <div className="flex items-center gap-2">
          <Search aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
          <input
            id="memory-search"
            type="search"
            aria-label="Filter memory content"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Filter content…"
            className="h-8 w-full max-w-[28rem] rounded-control border border-line bg-well px-3 text-xs text-ink outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-accent/60 focus:ring-[3px] focus:ring-focus/40"
          />
        </div>
      </PageHeader>

      <CollectionBody className="flex flex-col gap-6 pt-5 pb-6">
        <section className="flex flex-col gap-3" aria-labelledby="global-context-heading">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 id="global-context-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Brain aria-hidden="true" className="size-4 text-accent" /> Global context
              </h2>
              <p className="mt-1 text-xs text-ink-3">A read-only snapshot of the shared Hermes context.</p>
            </div>
            <span className="text-[10px] text-ink-3">{query ? `${visibleCount}/3 match` : "read-only"}</span>
          </div>

          {query && visibleCount === 0 ? (
            <EmptyState
              title="Nothing matched that filter"
              hint={`No memory file contains “${searchTerm}”.`}
            />
          ) : (
            <CollectionGrid className="xl:grid-cols-3">
              {match(snapshot.memory) && (
                <MemoryCard
                  icon={Brain}
                  title="MEMORY.md"
                  description="Facts and context across sessions."
                  path={snapshot.memory_path}
                  mtime={snapshot.memory_mtime}
                  content={snapshot.memory}
                />
              )}
              {match(snapshot.user) && (
                <MemoryCard
                  icon={User}
                  title="USER.md"
                  description="Preferences and details about the user."
                  path={snapshot.user_path}
                  mtime={snapshot.user_mtime}
                  content={snapshot.user}
                />
              )}
              {match(snapshot.soul) && (
                <MemoryCard
                  icon={Heart}
                  title="SOUL.md"
                  description="Persona and behavioural principles."
                  path={snapshot.soul_path}
                  mtime={snapshot.soul_mtime}
                  content={snapshot.soul}
                />
              )}
            </CollectionGrid>
          )}
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="profile-memory-heading">
          <SectionHeader
            title={
              <span id="profile-memory-heading" className="flex items-center gap-2">
                <FileText aria-hidden="true" className="size-4 text-accent" /> Profile memory
              </span>
            }
            description="Context that applies only to the selected agent profile."
            actions={
              <div className="flex items-center gap-3">
                {hasUnsaved && (
                  <span className="text-[11px] text-warning-text" aria-live="polite">
                    Unsaved changes
                  </span>
                )}
                <Select
                  value={activeProfile}
                  onValueChange={(nextProfile) => {
                    if (hasUnsaved && !window.confirm("Unsaved changes. Switch profile and discard them?")) return
                    setDirty({ memory: false, user: false })
                    setActiveProfile(nextProfile)
                  }}
                >
                  <SelectTrigger aria-label="Select a profile" className="w-44 text-xs">
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {(profiles.data ?? []).map((profile) => (
                      <SelectItem key={profile.name} value={profile.name} className="text-xs">
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            }
          />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <ProfileMemoryEditor
              profile={activeProfile}
              scope="memory"
              onDirtyChange={(value) => setMemoryDirty("memory", value)}
            />
            <ProfileMemoryEditor
              profile={activeProfile}
              scope="user"
              onDirtyChange={(value) => setMemoryDirty("user", value)}
            />
          </div>
        </section>
      </CollectionBody>
    </div>
  )
}
