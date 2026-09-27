import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Puzzle, Search, X } from "lucide-react"
import LoadingState from "@/components/LoadingState"

interface SkillMeta {
  name: string
  description: string
  category?: string
  path?: string
}

export default function SkillsPage() {
  const [q, setQ] = useState("")
  const [active, setActive] = useState<string | null>(null)

  const skills = useQuery({
    queryKey: ["skills"],
    queryFn: () => api<SkillMeta[]>("/api/skills"),
  })

  const content = useQuery({
    queryKey: ["skill-content", active],
    queryFn: () => api<{ name: string; content: string }>(`/api/skills/content?name=${encodeURIComponent(active ?? "")}`),
    enabled: !!active,
  })

  const filtered = useMemo(() => {
    const list = skills.data ?? []
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (s) => s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle) || (s.category ?? "").toLowerCase().includes(needle),
    )
  }, [skills.data, q])

  const grouped = useMemo(() => {
    const groups = new Map<string, SkillMeta[]>()
    for (const skill of filtered) {
      const category = skill.category?.trim() || "Uncategorized"
      groups.set(category, [...(groups.get(category) ?? []), skill])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Registry</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Skills</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">Read-only registry dari <code className="text-ink-3">~/.hermes/skills</code> — klik skill buat liat SKILL.md.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-ink-3">{skills.data?.length ?? 0} installed</span>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari skill…" className="h-8 border-[var(--color-line)] bg-[var(--color-bg)] pl-7 text-xs" />
          </div>
        </div>
      </div>

      <Separator className="my-3" />

      {skills.isLoading ? (
        <LoadingState label="Memuat skills" />
      ) : skills.isError ? (
        <p className="text-sm text-red-400">Gagal load skills: {(skills.error as Error).message}</p>
      ) : (
        <div className={`grid min-h-0 flex-1 gap-3 overflow-hidden ${active ? "lg:grid-cols-[1fr_1.2fr]" : ""}`}>
          <div className="min-h-0 overflow-y-auto pr-1">
            {grouped.map(([category, categorySkills]) => (
              <section key={category} className="mb-5 last:mb-0">
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-3" title={category}>{category}</h2>
                  <span className="font-mono text-[10px] text-ink-4">{categorySkills.length}</span>
                  <div className="h-px flex-1 bg-[var(--color-line)]" />
                </div>
                <div className={`grid gap-2 ${active ? "lg:grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                  {categorySkills.map((s) => (
                    <Card
                      key={s.path || s.name}
                      className={`decorative-card cursor-pointer border-[var(--color-line)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-accent)]/35 ${active === s.name ? "border-[var(--color-accent)]/60" : ""}`}
                      onClick={() => setActive(s.name)}
                    >
                      <CardContent className="flex min-h-[96px] flex-col p-3.5">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-[var(--color-accent)]/15 bg-[var(--color-inset)]">
                            <Puzzle className="size-3.5 text-[var(--color-accent)]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold leading-5" title={s.name}>{s.name}</h3>
                            <p className="mt-1 line-clamp-2 min-h-[30px] text-[11px] leading-snug text-ink-3">{s.description || "—"}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
            {!filtered.length && <p className="text-sm text-ink-4">No skills matched "{q}".</p>}
          </div>

          {active && (
            <div className="flex min-h-0 flex-col rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
              <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-3 py-2">
                <h2 className="truncate font-mono text-xs font-semibold text-[var(--color-accent)]">{active}/SKILL.md</h2>
                <Button variant="ghost" size="sm" className="ml-auto size-6 p-0" onClick={() => setActive(null)}>
                  <X className="size-3.5" />
                </Button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-relaxed text-ink-2">
                {content.isLoading ? "Loading…" : content.isError ? (content.error as Error).message : content.data?.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
