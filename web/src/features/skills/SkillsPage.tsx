import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { EntryCard } from "@/components/app/entry-card"
import { DetailSheet } from "@/components/app/detail-sheet"
import { EmptyState } from "@/components/app/empty-state"
import { FilterChip, FilterBar } from "@/components/app/filter-bar"
import { PageHeader, SectionHeader } from "@/components/app/page-header"
import { Download } from "lucide-react"
import LoadingState from "@/components/feedback/loading-state"

export type SkillOrigin = "npx" | "hermes"

/** Provenance values the `npx skills` lockfile writes into origin_source. */
export type SkillSource = "official" | "skills.sh" | "github" | "local" | "untracked"

interface SkillMeta {
  name: string
  description: string
  category?: string
  path?: string
  origin?: string
  origin_source?: string
}

const ORIGIN_FILTERS: { value: SkillOrigin | "all"; label: string; hint: string }[] = [
  { value: "all", label: "All", hint: "Every skill" },
  { value: "npx", label: "npx skills", hint: "Installed with `npx skills add`" },
  { value: "hermes", label: "Hermes", hint: "Built in, or managed from this UI" },
]

/* Listed in that order regardless of what is installed, so the chip does not
   reshuffle itself as skills come and go. Anything the lockfile reports that is
   not on this list is appended, so an unknown installer still shows up rather
   than being unreachable behind "All". */
const KNOWN_SOURCES: SkillSource[] = ["official", "skills.sh", "github", "local", "untracked"]

const SOURCE_LABEL: Record<string, string> = {
  official: "Official",
  "skills.sh": "skills.sh",
  github: "GitHub",
  local: "Local",
  untracked: "Untracked",
}

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source
}

export function skillOriginLabel(skill: SkillMeta): string {
  if (skill.origin === "npx") return "npx"
  return skill.origin_source === "official" ? "builtin" : "hermes"
}

export default function SkillsPage() {
  const [q, setQ] = useState("")
  const [active, setActive] = useState<string | null>(null)
  const [origin, setOrigin] = useState<SkillOrigin | "all">("all")
  const [source, setSource] = useState<string>("all")

  const skills = useQuery({
    queryKey: ["skills"],
    queryFn: () => api<SkillMeta[]>("/api/skills"),
  })

  const content = useQuery({
    queryKey: ["skill-content", active],
    queryFn: () => api<{ name: string; content: string }>(`/api/skills/content?name=${encodeURIComponent(active ?? "")}`),
    enabled: !!active,
  })

  const all = skills.data ?? []

  const originCounts = useMemo(() => {
    const counts: Record<string, number> = { npx: 0, hermes: 0 }
    for (const s of all) {
      if (s.origin === "npx") counts.npx += 1
      else counts.hermes += 1
    }
    return counts
  }, [all])

  // Known sources first in a fixed order, then anything else the lockfile
  // reports, so an installer we don't know about is still selectable.
  const sourceOptions = useMemo(() => {
    const present = new Set(all.map((s) => s.origin_source || "untracked"))
    const ordered = KNOWN_SOURCES.filter((s) => present.has(s))
    for (const s of present) if (!KNOWN_SOURCES.includes(s as SkillSource)) ordered.push(s as SkillSource)
    return ordered
  }, [all])

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of all) {
      const key = s.origin_source || "untracked"
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [all])

  // Both facet filters are applied before the search short-circuit: a filtered
  // list must not reappear just because the search box is empty.
  const filtered = useMemo(() => {
    const list = all.filter((s) => {
      if (origin !== "all" && s.origin !== origin) return false
      if (source !== "all" && (s.origin_source || "untracked") !== source) return false
      return true
    })
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle) ||
        (s.category ?? "").toLowerCase().includes(needle),
    )
  }, [all, q, origin, source])

  const grouped = useMemo(() => {
    const groups = new Map<string, SkillMeta[]>()
    for (const skill of filtered) {
      const category = skill.category?.trim() || "Uncategorized"
      groups.set(category, [...(groups.get(category) ?? []), skill])
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Skills"
        description="Read-only registry. Select a skill to read its SKILL.md."
      >
        <FilterBar
          query={q}
          onQueryChange={setQ}
          placeholder="Search skills"
          shown={filtered.length}
          total={all.length}
        >
          <FilterChip
            label="Origin"
            value={origin}
            onChange={(v) => setOrigin(v as SkillOrigin | "all")}
            options={ORIGIN_FILTERS.map((f) => ({
              value: f.value,
              label: `${f.label} (${f.value === "all" ? all.length : (originCounts[f.value] ?? 0)})`,
            }))}
          />
          {/* Provenance from ~/.hermes/skills/.hub/lock.json. Narrows the npx
              bucket into where each skill actually came from — skills.sh, a
              direct GitHub install, a local dir — which origin cannot express. */}
          <FilterChip
            label="Source"
            value={source}
            onChange={setSource}
            options={[
              { value: "all", label: `All (${all.length})` },
              ...sourceOptions.map((s) => ({
                value: s,
                label: `${sourceLabel(s)} (${sourceCounts[s] ?? 0})`,
              })),
            ]}
          />
        </FilterBar>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {skills.isLoading ? (
          <LoadingState label="Loading skills" />
        ) : skills.isError ? (
          <EmptyState
            title="Couldn't load skills"
            hint={(skills.error as Error).message}
            action={<Button variant="secondary" onClick={() => void skills.refetch()}>Retry</Button>}
          />
        ) : grouped.length === 0 ? (
          <EmptyState
            title={
              q.trim()
                ? `No skills match "${q.trim()}"`
                : origin !== "all"
                  ? `No skills from ${origin}`
                  : source !== "all"
                    ? `No skills from ${sourceLabel(source)}`
                    : "No skills installed"
            }
            hint={
              q.trim()
                ? undefined
                : "Skills are read from ~/.hermes/skills and installed with `npx skills add`."
            }
          />
        ) : (
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 p-4 md:p-6">
            {grouped.map(([category, categorySkills]) => (
              <section key={category} className="flex flex-col gap-3">
                <SectionHeader
                  title={category}
                  description={`${categorySkills.length} ${categorySkills.length === 1 ? "skill" : "skills"}`}
                />
                {/* Denser than the other collections: 4 across on very wide screens. */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {categorySkills.map((s) => (
                    <SkillCard
                      key={s.path || s.name}
                      skill={s}
                      selected={active === s.name}
                      onOpen={() => setActive(s.name)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <DetailSheet
        open={active !== null}
        onOpenChange={(o) => !o && setActive(null)}
        title={active ?? ""}
        description="SKILL.md"
      >
        {content.isLoading ? (
          <LoadingState label="Loading skill" />
        ) : content.isError ? (
          <EmptyState
            title="Couldn't load this skill"
            hint={(content.error as Error).message}
            action={
              <Button variant="secondary" onClick={() => void content.refetch()}>Retry</Button>
            }
          />
        ) : (
          <pre className="max-w-[72ch] font-mono text-2xs leading-relaxed break-words whitespace-pre-wrap text-ink-2">
            {content.data?.content}
          </pre>
        )}
      </DetailSheet>
    </div>
  )
}

function SkillCard({
  skill,
  selected,
  onOpen,
}: {
  skill: SkillMeta
  selected: boolean
  onOpen: () => void
}) {
  const label = skillOriginLabel(skill)
  // Shown alongside the origin badge: the origin says how the skill was
  // installed, the source says where it came from. They differ for every npx
  // install — skills.sh, GitHub, a local dir — so the card carries both.
  const source = skill.origin_source || "untracked"
  return (
    <EntryCard
      // Hundreds of skills per profile. `flat` keeps the tint and the elevation
      // but drops the backdrop-filter, which would otherwise mean one
      // compositing layer per card.
      material="flat"
      density="registry"
      selected={selected}
      title={skill.name}
      state={
        <span className="flex shrink-0 items-center gap-1">
          <span
            className={
              label === "npx"
                ? "inline-flex items-center gap-1 rounded-control border border-success/30 bg-success-tint px-1.5 py-0.5 text-2xs leading-none text-success-text"
                : "inline-flex items-center gap-1 rounded-control border border-line bg-well px-1.5 py-0.5 text-2xs leading-none text-ink-3"
            }
          >
            {label === "npx" && <Download className="size-2.5" aria-hidden />}
            {label}
          </span>
          {label === "npx" && (
            <span className="rounded-control border border-line bg-well px-1.5 py-0.5 text-2xs leading-none text-ink-3">
              {sourceLabel(source)}
            </span>
          )}
        </span>
      }
      // Two lines, clamped, so the grid keeps a stable rhythm.
      metrics={
        <p className="line-clamp-2 text-xs leading-snug text-ink-3">
          {skill.description || "No description"}
        </p>
      }
      primary={
        <Button variant="secondary" size="xs" onClick={onOpen}>
          Read skill
        </Button>
      }
    />
  )
}
