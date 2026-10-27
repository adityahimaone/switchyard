import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ExecutorSettings, Profile, Task, VerifyProfile, Workspace } from "../../api"
import { api, getExecutorSettings, listSkills, startTask, validateTask } from "../../api"
import { BranchPicker } from "@/components/git/branch-picker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SearchSelect, type SearchSelectOption } from "@/components/ui/search-select"
import { Segmented } from "@/components/ui/segmented"
import { Sparkles, Loader2, Paperclip, ChevronRight, PenTool, SlidersHorizontal, X, Puzzle, FileCode, Code2, Layers, BookOpen, Zap, Palette } from "lucide-react"
import { AttachmentChip } from "@/components/feedback/attachment-chip"
import { uploadAttachment, type Attachment } from "../../api"
import { cn } from "@/lib/utils"
import type { CanvasPrefill } from "../canvas/canvasPrefill"
import {
  buildCreatePayload,
  canSubmit,
  issuesForField,
  isShortcutSubmitKey,
  splitPathInput,
  type CreateTaskDraft,
  type DependencyCandidate,
  type ValidationIssue,
} from "./taskDraft"

const EXECUTOR_LABELS: Record<string, string> = {
  auto: "Auto (workspace policy)",
  hermes: "Hermes",
  codex: "Codex",
  commandcode: "Command Code",
  claude: "Claude Code",
  dsh: "DeepSeek Harness",
  omp: "omp (oh-my-pi)",
  shell: "Shell agent (workspace access)",
}

/* The dispatcher auto-loads these for every pen.dev card. Keep the list in
   sync with internal/kanban/design_skills.go: the UI is a read-out of what
   the server will inject, not a second source of truth. */
const AUTO_DESIGN_SKILLS = ["sunnyside-brand-system", "pen-dev", "better-typography"] as const
const OPTIONAL_DESIGN_SKILL = "implement-brand-system"

export {
  FALLBACK_DSH_MODELS as DSH_MODEL_OPTIONS,
  FALLBACK_COMMANDCODE_MODELS as COMMANDCODE_MODEL_OPTIONS,
} from "./modelCatalog"
import { useExecutorModels } from "./modelCatalog"

export const DSH_EFFORT_OPTIONS = [
  { value: "auto", label: "Auto (default)" },
  { value: "off", label: "Off — instant" },
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
  { value: "max", label: "Max — deep thinking" },
]

export const COMMANDCODE_EFFORT_OPTIONS = [
  { value: "auto", label: "Auto (default)" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
]

export const COMMANDCODE_MODE_OPTIONS = [
  { value: "yolo", label: "Yolo — auto-approve edits" },
  { value: "plan", label: "Plan — propose plan & options" },
  { value: "accept-edits", label: "Accept edits" },
  { value: "standard", label: "Standard" },
]

const FALLBACK_EXECUTORS: ExecutorSettings = {
  order: ["auto", "hermes", "codex", "commandcode", "claude", "dsh", "omp", "shell"],
  disabled: [],
  default_execution_mode: "direct",
}

// A settings load must never leave the picker empty: fall back to the full list
// until the real config arrives, and always keep "auto".
export function visibleExecutorsFor(settings?: ExecutorSettings): string[] {
  const s = settings ?? FALLBACK_EXECUTORS
  return s.order.filter((e) => e === "auto" || !s.disabled.includes(e))
}

function isRemoteWorkspace(w: Workspace): boolean {
  if (w.host && w.host !== "localhost" && w.host !== "127.0.0.1") return true
  if (/^[A-Za-z]:[\\/]/.test(w.path)) return true
  if (w.path.startsWith("/Users/")) return true
  return false
}

function isSshWorkspace(w: Workspace): boolean {
  return !!w.host && w.host !== "localhost" && w.host !== "127.0.0.1"
}

function isLive(w: Workspace): boolean {
  return w.status === "connected" || w.status === "local"
}

export function defaultWorkspacePath(
  workspaces: Workspace[],
  boardTasks: Pick<Task, "workspace_path">[] = [],
  slug = "",
): string {
  if (workspaces.length === 0) return ""
  const validPaths = new Set(workspaces.map((w) => w.path))
  // 1. Prefer the workspace most recently used by tasks on this board.
  for (const t of boardTasks) {
    if (t.workspace_path && validPaths.has(t.workspace_path)) {
      return t.workspace_path
    }
  }
  // 2. Match workspace name or path to the board slug when possible.
  if (slug) {
    const slugTokens = slug.toLowerCase().split(/[-_\s]+/).filter((tok) => tok.length >= 3)
    const slugMatched = workspaces.find((w) => {
      const hay = `${w.name} ${w.path}`.toLowerCase()
      return slugTokens.some((tok) => hay.includes(tok))
    })
    if (slugMatched) return slugMatched.path
  }
  // 3. Prefer a connected / live workspace (e.g. connected Mac node-agent or local checkout).
  const live = workspaces.find((w) => isLive(w))
  if (live) return live.path
  const local = workspaces.find((w) => !isRemoteWorkspace(w))
  return local?.path ?? workspaces[0].path
}

/**
 * CollapsibleSection is the in-feature pattern already used by TaskDetailPage:
 * a labelled header with a rule and a count, expanding to reveal content.
 *
 * It is deliberately not the Radix Collapsible. That one is used only by the
 * sidebar, and rolling our own keeps the header layout (rule, count, chevron)
 * consistent with the other collapsible groups in the app.
 */
function CollapsibleSection({
  title,
  open,
  onToggle,
  badge,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="group/head -mx-1 flex w-full items-center gap-1.5 rounded px-1 py-1 text-left transition-transform duration-150 ease-[var(--ease-out-expo)] active:scale-[0.99]"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-ink-3 transition-transform duration-150 ease-[var(--ease-out-expo)]",
            open && "rotate-90",
          )}
        />
        <span className="text-2xs font-semibold tracking-[0.14em] text-ink-2 uppercase">{title}</span>
        <span className="h-px flex-1 bg-[var(--c-line)]" aria-hidden />
        {badge}
      </button>
      {open && <div className="mt-2 flex flex-col gap-3">{children}</div>}
    </section>
  )
}

export default function TaskDialog({
  slug,
  workspaces,
  profiles,
  candidates = [],
  onClose,
  onCreate,
  onOpenCanvas,
}: {
  slug: string
  workspaces: Workspace[]
  profiles: Profile[]
  /** Board tasks offered as dependencies. */
  candidates?: DependencyCandidate[]
  onClose: () => void
  onCreate: (p: Record<string, unknown>) => Promise<unknown>
  /** Hand the draft to Canvas Studio instead of creating a card. */
  onOpenCanvas?: (prefill: CanvasPrefill) => void
}) {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [ws, setWs] = useState(() => defaultWorkspacePath(workspaces, [], slug))
  const [wsUserEdited, setWsUserEdited] = useState(false)
  const [assignee, setAssignee] = useState(profiles[0]?.name ?? "default")
  const [executor, setExecutor] = useState("dsh")
  const [dshModel, setDshModel] = useState("deepseek-account:DeepSeek-V4.1-Flash")
  const [cmdModel, setCmdModel] = useState("qwen/qwen3.8-omni-flash")
  const { models: dynamicModels } = useExecutorModels(executor)

  const activeModel = executor === "dsh" ? dshModel : cmdModel
  const handleModelChange = (v: string) => {
    if (!v) return
    if (executor === "dsh") {
      setDshModel(v)
    } else if (executor === "commandcode") {
      setCmdModel(v)
    }
  }

  const [effort, setEffort] = useState("auto")
  const [commandCodeMode, setCommandCodeMode] = useState("yolo")
  const [executionMode, setExecutionMode] = useState<"direct" | "agentic">("direct")
  const [maxIterations, setMaxIterations] = useState("6")
  const [priority, setPriority] = useState("0")
  const [pathsRaw, setPathsRaw] = useState("")
  const [deps, setDeps] = useState<string[]>([])
  const [gateCommand, setGateCommand] = useState("")
  const [startMode, setStartMode] = useState<"manual" | "now">("now")
  const [isolation, setIsolation] = useState<"auto" | "workspace" | "worktree">("auto")
  const [baseBranch, setBaseBranch] = useState("")
  const [verifyProfile, setVerifyProfile] = useState<VerifyProfile | "auto">("auto")
  const [designSource, setDesignSource] = useState("")
  // "none" is the form's sentinel for "no pen.dev design" — Radix
  // Select items need non-empty values, the API wants the absence.
  const [designTool, setDesignTool] = useState<"none" | "pen_cli" | "pencil_mcp">("none")
  const [designScope, setDesignScope] = useState<"design_only" | "design_and_code">("design_only")
  const [penModel, setPenModel] = useState("deepseek:deepseek-flash")
  const { models: penDynamicModels } = useExecutorModels("pen")
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMode, setAiMode] = useState<"fast" | "deep" | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [execOverrideOpen, setExecOverrideOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const improveCache = useRef(new Map<string, string>())
  const [cursorPos, setCursorPos] = useState(0)

  // Omnibox @ trigger (Files, Symbols, Cards)
  const [atDismissed, setAtDismissed] = useState(false)
  const [atActiveIndex, setAtActiveIndex] = useState(0)
  const atListRef = useRef<HTMLDivElement>(null)
  const atItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const atMatch = useMemo(() => {
    if (atDismissed) return null
    const textBefore = body.slice(0, cursorPos)
    const m = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_\-./#]*)$/)
    if (!m) return null
    return {
      query: m[1],
      tokenStart: cursorPos - m[1].length - 1,
    }
  }, [body, cursorPos, atDismissed])

  const selectedWorkspace = useMemo(() => workspaces.find((w) => w.path === ws), [workspaces, ws])

  const isWorkWorkspace = useMemo(() => {
    if (!selectedWorkspace) return false
    return Boolean(
      selectedWorkspace.labels?.includes("work") ||
      selectedWorkspace.labels?.includes("saas") ||
      selectedWorkspace.name?.toLowerCase().includes("gadjian") ||
      selectedWorkspace.name?.toLowerCase().includes("hadirr") ||
      selectedWorkspace.name?.toLowerCase().includes("baktiku") ||
      selectedWorkspace.path?.toLowerCase().includes("saas")
    )
  }, [selectedWorkspace])

  interface FileSearchMatch {
    path: string
    basename: string
    directory: string
    score: number
  }

  interface SymbolSearchMatch {
    name: string
    kind: string
    file_path: string
    line: number
  }

  const atFilesQuery = useQuery({
    queryKey: ["ws-files-search", selectedWorkspace?.id, atMatch?.query],
    queryFn: () =>
      selectedWorkspace?.id
        ? api<FileSearchMatch[]>(
            `/api/workspaces/${selectedWorkspace.id}/files/search?q=${encodeURIComponent(atMatch?.query ?? "")}&limit=10`
          )
        : Promise.resolve([]),
    enabled: Boolean(selectedWorkspace?.id && atMatch),
    staleTime: 5000,
  })

  const atSymbolsQuery = useQuery({
    queryKey: ["ws-symbols-search", selectedWorkspace?.id, atMatch?.query],
    queryFn: () =>
      selectedWorkspace?.id && (atMatch?.query.length ?? 0) >= 2
        ? api<SymbolSearchMatch[]>(
            `/api/workspaces/${selectedWorkspace.id}/codegraph/symbols?q=${encodeURIComponent(atMatch?.query ?? "")}&limit=6`
          )
        : Promise.resolve([]),
    enabled: Boolean(selectedWorkspace?.id && atMatch && (atMatch.query.length >= 2)),
    staleTime: 5000,
  })

  const { data: boardTasks } = useQuery({
    queryKey: ["tasks", slug],
    queryFn: () => api<Task[]>(`/api/boards/${slug}/tasks`),
  })

  type OmniboxItem =
    | { kind: "file"; file: FileSearchMatch }
    | { kind: "symbol"; symbol: SymbolSearchMatch }
    | { kind: "card"; card: Task }

  const omniboxItems = useMemo<OmniboxItem[]>(() => {
    if (!atMatch) return []
    const items: OmniboxItem[] = []
    for (const f of atFilesQuery.data ?? []) {
      items.push({ kind: "file", file: f })
    }
    for (const s of atSymbolsQuery.data ?? []) {
      items.push({ kind: "symbol", symbol: s })
    }
    const q = atMatch.query.toLowerCase().replace(/^#/, "")
    const matchingCards = (boardTasks ?? []).filter(
      (t) => t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)
    ).slice(0, 4)
    for (const c of matchingCards) {
      items.push({ kind: "card", card: c })
    }
    return items
  }, [atMatch, atFilesQuery.data, atSymbolsQuery.data, boardTasks])

  const isAtPickerOpen = Boolean(atMatch && omniboxItems.length > 0)

  useEffect(() => {
    setAtActiveIndex(0)
  }, [atMatch?.query])

  useEffect(() => {
    if (!isAtPickerOpen) return
    const el = atItemRefs.current[atActiveIndex]
    el?.scrollIntoView({ block: "nearest" })
  }, [atActiveIndex, isAtPickerOpen])

  useEffect(() => {
    if (!isAtPickerOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (
        atListRef.current &&
        !atListRef.current.contains(e.target as Node) &&
        bodyRef.current &&
        !bodyRef.current.contains(e.target as Node)
      ) {
        setAtDismissed(true)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isAtPickerOpen])

  // Load workspace-inferred defaults (suggested gate & verify profile)
  useEffect(() => {
    if (!selectedWorkspace?.id) return
    api<{ suggested_gate_command?: string; suggested_verify_profile?: string }>(
      `/api/workspaces/${selectedWorkspace.id}/defaults`
    )
      .then((defs) => {
        if (defs.suggested_gate_command && !gateCommand.trim()) {
          setGateCommand(defs.suggested_gate_command)
        }
        if (defs.suggested_verify_profile && (verifyProfile === "fast" || !verifyProfile)) {
          setVerifyProfile(defs.suggested_verify_profile as VerifyProfile)
        }
      })
      .catch(() => {})
  }, [selectedWorkspace?.id])

  function insertOmniboxItem(item: OmniboxItem) {
    const textarea = bodyRef.current
    const cursor = textarea?.selectionStart ?? cursorPos ?? body.length
    const textBefore = body.slice(0, cursor)
    const textAfter = body.slice(cursor)
    const m = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_\-./#]*)$/)
    if (!m) return

    const replaceStart = cursor - m[1].length - 1
    let token = ""
    if (item.kind === "file") {
      token = `@${item.file.path} `
      // Auto-add to declared paths lease scope
      setPathsRaw((prev) => {
        const list = splitPathInput(prev)
        if (!list.includes(item.file.path)) {
          return list.length > 0 ? `${prev}, ${item.file.path}` : item.file.path
        }
        return prev
      })
    } else if (item.kind === "symbol") {
      token = `@${item.symbol.file_path}#L${item.symbol.line} (${item.symbol.name}) `
      setPathsRaw((prev) => {
        const list = splitPathInput(prev)
        if (!list.includes(item.symbol.file_path)) {
          return list.length > 0 ? `${prev}, ${item.symbol.file_path}` : item.symbol.file_path
        }
        return prev
      })
    } else if (item.kind === "card") {
      token = `#${item.card.id} `
      setDeps((prev) => (prev.includes(item.card.id) ? prev : [...prev, item.card.id]))
    }

    const newBefore = body.slice(0, replaceStart) + token
    const nextBody = newBefore + textAfter
    setBody(nextBody)
    setAtDismissed(true)

    setTimeout(() => {
      if (textarea) {
        textarea.focus()
        const newPos = newBefore.length
        textarea.setSelectionRange(newPos, newPos)
        setCursorPos(newPos)
      }
    }, 0)
  }

  function handleTriggerAt() {
    setAtDismissed(false)
    setBody((prev) => {
      const needsSpace = prev.length > 0 && !prev.endsWith(" ") && !prev.endsWith("\n")
      const next = `${prev}${needsSpace ? " " : ""}@`
      setTimeout(() => {
        if (bodyRef.current) {
          bodyRef.current.focus()
          bodyRef.current.setSelectionRange(next.length, next.length)
          setCursorPos(next.length)
        }
      }, 0)
      return next
    })
  }

  // Skills query and autocomplete for prompt/body ($ trigger)
  const skillsQuery = useQuery({ queryKey: ["task-skills"], queryFn: () => listSkills() })
  const [skillDismissed, setSkillDismissed] = useState(false)
  const [skillActiveIndex, setSkillActiveIndex] = useState(0)
  const skillListRef = useRef<HTMLDivElement>(null)
  const skillItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const skillMatch = useMemo(() => {
    if (skillDismissed) return null
    const textBefore = body.slice(0, cursorPos)
    const m = textBefore.match(/(?:^|\s)\$([a-zA-Z0-9_\-]*)$/)
    if (!m) return null
    return {
      query: m[1],
      tokenStart: cursorPos - m[1].length - 1,
    }
  }, [body, cursorPos, skillDismissed])

  const skillMatches = useMemo(() => {
    if (!skillMatch) return []
    const q = skillMatch.query.toLowerCase()
    return (skillsQuery.data ?? []).filter((s) => {
      const nameMatch = s.name.toLowerCase().includes(q)
      const descMatch = s.description?.toLowerCase().includes(q)
      return nameMatch || descMatch
    })
  }, [skillMatch, skillsQuery.data])

  const isSkillPickerOpen = Boolean(skillMatch && skillMatches.length > 0)

  useEffect(() => {
    setSkillActiveIndex(0)
  }, [skillMatch?.query])

  useEffect(() => {
    if (!isSkillPickerOpen) return
    const el = skillItemRefs.current[skillActiveIndex]
    el?.scrollIntoView({ block: "nearest" })
  }, [skillActiveIndex, isSkillPickerOpen])

  useEffect(() => {
    if (!isSkillPickerOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (
        skillListRef.current &&
        !skillListRef.current.contains(e.target as Node) &&
        bodyRef.current &&
        !bodyRef.current.contains(e.target as Node)
      ) {
        setSkillDismissed(true)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isSkillPickerOpen])

  function insertSkill(name: string) {
    const textarea = bodyRef.current
    const cursor = textarea?.selectionStart ?? cursorPos ?? body.length
    const textBefore = body.slice(0, cursor)
    const textAfter = body.slice(cursor)
    const m = textBefore.match(/(?:^|\s)\$([a-zA-Z0-9_\-]*)$/)
    if (!m) return

    const replaceStart = cursor - m[1].length - 1
    const newBefore = body.slice(0, replaceStart) + `$${name} `
    const nextBody = newBefore + textAfter
    setBody(nextBody)
    setSkillDismissed(true)

    setTimeout(() => {
      if (textarea) {
        textarea.focus()
        const newPos = newBefore.length
        textarea.setSelectionRange(newPos, newPos)
        setCursorPos(newPos)
      }
    }, 0)
  }

  function handleTriggerSkill() {
    setSkillDismissed(false)
    setBody((prev) => {
      const needsSpace = prev.length > 0 && !prev.endsWith(" ") && !prev.endsWith("\n")
      const next = `${prev}${needsSpace ? " " : ""}$`
      setTimeout(() => {
        if (bodyRef.current) {
          bodyRef.current.focus()
          bodyRef.current.setSelectionRange(next.length, next.length)
          setCursorPos(next.length)
        }
      }, 0)
      return next
    })
  }

  const summonedSkills = useMemo(() => {
    const matches = body.match(/(?:^|\s)\$([a-zA-Z0-9_\-]+)/g) || []
    return Array.from(new Set(matches.map((m) => m.trim().slice(1))))
  }, [body])

  const installedSkills = useMemo(
    () => new Set((skillsQuery.data ?? []).map((s) => s.name)),
    [skillsQuery.data],
  )
  const hasImplementSkill = summonedSkills.includes(OPTIONAL_DESIGN_SKILL)

  const summonedRefs = useMemo(() => {
    const matches = body.match(/(?:^|\s)@([a-zA-Z0-9_\-./]+)/g) || []
    return Array.from(new Set(matches.map((m) => m.trim().slice(1))))
  }, [body])

  const summonedCards = useMemo(() => {
    const matches = body.match(/(?:^|\s)#([a-zA-Z0-9_\-]+)/g) || []
    return Array.from(new Set(matches.map((m) => m.trim().slice(1))))
  }, [body])

  function removeSummonedSkill(skillName: string) {
    setBody((prev) =>
      prev
        .replace(new RegExp(`(?:^|\\s)\\$${skillName}(?=\\s|$)`, "g"), " ")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
  }

  function addSkillMention(skillName: string) {
    setBody((prev) => {
      const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      if (new RegExp(`(?:^|\\s)\\$${escaped}(?=\\s|$)`).test(prev)) return prev
      const needsSpace = prev.length > 0 && !/\s$/.test(prev)
      return `${prev}${needsSpace ? " " : ""}$${skillName} `
    })
    setTimeout(() => {
      const el = bodyRef.current
      if (!el) return
      const end = el.value.length
      el.focus()
      el.setSelectionRange(end, end)
      setCursorPos(end)
    }, 0)
  }

  // Opting into implementation is deliberately one click but two visible
  // changes: the skill is summoned (so the dispatcher loads its content) and
  // the scope becomes Design & Implement (so code edits are allowed and the
  // direct pen-only shell harness is replaced by an agent harness).
  function addImplementationSkill() {
    setDesignScope("design_and_code")
    if (executor === "shell") setExecutor("dsh")
    addSkillMention(OPTIONAL_DESIGN_SKILL)
  }

  function removeSummonedRef(refPath: string) {
    const escaped = refPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    setBody((prev) =>
      prev
        .replace(new RegExp(`(?:^|\\s)@${escaped}(?=\\s|$)`, "g"), " ")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    setPathsRaw((prev) =>
      splitPathInput(prev)
        .filter((p) => p !== refPath)
        .join(", ")
    )
  }

  function removeSummonedCard(cardId: string) {
    setBody((prev) =>
      prev
        .replace(new RegExp(`(?:^|\\s)#${cardId}(?=\\s|$)`, "g"), " ")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
  }

  function handleBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isAtPickerOpen && omniboxItems.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        setAtActiveIndex((prev) => (prev + 1) % omniboxItems.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        setAtActiveIndex((prev) => (prev - 1 + omniboxItems.length) % omniboxItems.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        e.stopPropagation()
        const selected = omniboxItems[atActiveIndex]
        if (selected) {
          insertOmniboxItem(selected)
        }
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setAtDismissed(true)
        return
      }
    }
    if (isSkillPickerOpen && skillMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        setSkillActiveIndex((prev) => (prev + 1) % skillMatches.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        setSkillActiveIndex((prev) => (prev - 1 + skillMatches.length) % skillMatches.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        e.stopPropagation()
        const selected = skillMatches[skillActiveIndex]
        if (selected) {
          insertSkill(selected.name)
        }
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setSkillDismissed(true)
        return
      }
    }
  }

  const paths = useMemo(() => splitPathInput(pathsRaw), [pathsRaw])

  const { data: executorSettings } = useQuery({
    queryKey: ["executor-settings"],
    queryFn: getExecutorSettings,
  })
  const visibleExecutors = useMemo(() => visibleExecutorsFor(executorSettings), [executorSettings])

  // Auto-select workspace from board tasks or live workspaces until user manually picks one.
  useEffect(() => {
    if (wsUserEdited) return
    const nextWs = defaultWorkspacePath(workspaces, boardTasks ?? [], slug)
    if (nextWs && nextWs !== ws) {
      setWs(nextWs)
    }
  }, [workspaces, boardTasks, slug, ws, wsUserEdited])

  // Switch executor and ensure reasoning effort defaults are aligned.
  function handleExecutorChange(nextExec: string) {
    setExecutor(nextExec)
    if (nextExec === "dsh") {
      if (!DSH_EFFORT_OPTIONS.some((o) => o.value === effort)) {
        setEffort("auto")
      }
    } else if (nextExec === "commandcode") {
      if (!COMMANDCODE_EFFORT_OPTIONS.some((o) => o.value === effort)) {
        setEffort("auto")
      }
    }
  }

  // Seed the default mode once, without stomping a user change on re-render.
  const seededMode = useRef(false)
  useEffect(() => {
    if (seededMode.current || !executorSettings) return
    setExecutionMode(executorSettings.default_execution_mode)
    if (!visibleExecutors.includes(executor)) {
      setExecutor(visibleExecutors[0] ?? "auto")
    }
    seededMode.current = true
  }, [executorSettings, visibleExecutors, executor])

  const draft: CreateTaskDraft = {
    title,
    body,
    workspacePath: ws,
    assignee,
    executor,
    executionMode,
    maxIterations,
    priority,
    paths,
    deps,
    gateCommand,
    startMode,
    isolation,
    baseBranch,
    verifyProfile,
    designSource,
    designTool: designTool === "none" ? "" : designTool,
    designScope: designTool === "none" ? undefined : designScope,
    penAgent: designTool === "none" ? undefined : (penModel.includes(":") ? penModel.split(":")[0] : "gemini"),
    penModel: designTool === "none" ? undefined : (penModel.includes(":") ? penModel.split(":")[1] : penModel),
    model: executor === "dsh" ? dshModel : executor === "commandcode" ? cmdModel : undefined,
    effort: executor === "dsh" || executor === "commandcode" ? effort : undefined,
    commandCodeMode: executor === "commandcode" ? commandCodeMode : undefined,
  }

  // Dry-run validation, debounced so typing a title does not fire a request per
  // keystroke. Advisory only: the server re-checks on create regardless.
  useEffect(() => {
    if (!title.trim()) {
      setIssues([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      validateTask(slug, buildCreatePayload(draft))
        .then((r) => {
          if (!cancelled) setIssues(r.issues ?? [])
        })
        .catch(() => {
          // Validation is a convenience; a failure here must not block the form.
          if (!cancelled) setIssues([])
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // draft is rebuilt every render; the individual fields are the real inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, title, body, ws, executor, executionMode, maxIterations, priority, pathsRaw, gateCommand, isolation, baseBranch, verifyProfile, designSource, designTool, designScope, penModel, dshModel, cmdModel, effort, commandCodeMode, deps.join(",")])

  async function improveBody(mode: "fast" | "deep") {
    if (!body.trim()) return
    const cacheKey = `${title.trim()}::${body.trim()}::${mode}`
    const cached = improveCache.current.get(cacheKey)
    if (cached) {
      setBody(cached)
      return
    }
    if (aiBusy) return
    setAiBusy(true)
    setAiMode(mode)
    setErr(null)
    const requestBody = body.trim()
    const requestTitle = title.trim()
    try {
      if (mode === "deep") {
        // Show deterministic structure while the model works, so the user sees
        // useful output immediately rather than waiting on nothing.
        const fast = await api<{ improved: string }>("/api/ai/improve-prompt", {
          method: "POST",
          body: JSON.stringify({ title: requestTitle, body: requestBody, mode: "fast" }),
        })
        setBody(fast.improved)
      }
      const res = await api<{ improved: string }>("/api/ai/improve-prompt", {
        method: "POST",
        body: JSON.stringify({ title: requestTitle, body: requestBody, mode }),
      })
      improveCache.current.set(cacheKey, res.improved)
      setBody(res.improved)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setAiBusy(false)
      setAiMode(null)
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files as FileList)
    if (!list.length) return
    setUploading(true)
    for (const f of list) {
      try {
        const att = await uploadAttachment(f as File)
        setPendingAtts((prev) => [...prev, att])
      } catch (e) {
        setErr((e as Error).message)
      }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (uploading) {
      setErr("Wait for attachment upload to finish")
      return
    }
    if (!title.trim()) {
      setErr("Title required")
      return
    }
    setBusy(true)
    setErr(null)
    let created: unknown = null
    try {
      created = await onCreate(buildCreatePayload(draft))
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
      return
    }
    const rec = created as { id?: string } | null
    const taskId = rec?.id ? String(rec.id) : ""

    // Attachments are linked after creation because they need the task id.
    if (pendingAtts.length > 0 && taskId && slug) {
      try {
        await Promise.all(
          pendingAtts.map((a) =>
            api(`/api/boards/${slug}/tasks/${taskId}/attachments`, {
              method: "POST",
              body: JSON.stringify({ attachment_id: a.id }),
            }),
          ),
        )
      } catch (e) {
        setErr(`Task created, but attachment link failed: ${(e as Error).message}`)
        setBusy(false)
        return
      }
    }

    // "Start now" wakes the dispatcher instead of waiting
    // for its next poll; the dispatcher's pass is what
    // claims the card. A refusal is a legitimate outcome —
    // a lease held by another task, or an unmet dependency —
    // so it is reported rather than blocking the close: the
    // card exists and is queued either way.
    if (startMode === "now" && taskId && slug) {
      try {
        const res = await startTask(slug, taskId)
        if (!res.started && res.code) {
          // eslint-disable-next-line no-console
          console.info(
            `[task ${taskId}] not started: ${res.code}${res.message ? ` — ${res.message}` : ""}`,
          )
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.info(`[task ${taskId}] start request failed: ${(e as Error).message}`)
      }
    }
    onClose()
  }

  const selCls =
    "w-full rounded-control border border-line/60 bg-surface/50 hover:bg-surface/80 dark:bg-well/30 dark:hover:bg-well/60 text-sm data-[size=default]:h-9"
  /* The branch control shares its row with the Pull button, so the trigger takes
     the leftover width instead of `w-full`, which would push the button out. */
  const branchSelCls =
    "min-w-0 flex-1 rounded-control border border-line/60 bg-surface/50 hover:bg-surface/80 dark:bg-well/30 dark:hover:bg-well/60 text-sm data-[size=default]:h-9"
  const pathIssues = issuesForField(issues, "paths")
  const depOptions = candidates.filter((c) => !deps.includes(c.id))
  const depSearchOptions: SearchSelectOption[] = useMemo(
    () =>
      depOptions.map((c) => ({
        value: c.id,
        label: c.title,
        badge: c.status,
      })),
    [depOptions]
  )
  const workspaceSearchOptions: SearchSelectOption[] = useMemo(() => {
    const list: SearchSelectOption[] = workspaces.map((w) => {
      const ssh = isSshWorkspace(w)
      const live = isLive(w)
      const os = (w.os || "").toLowerCase()
      const osLabel =
        os === "mac" ? "mac" : os === "windows" ? "win" : os === "linux" ? "linux" : ""
      return {
        value: w.path,
        label: w.name,
        sublabel: w.path,
        keywords: [
          w.name,
          w.path,
          w.host ?? "",
          os,
          ...(w.labels ?? []),
          ssh ? "ssh" : "local",
        ],
        icon: live ? (
          <span
            className="size-1.5 shrink-0 animate-pulse rounded-full bg-success"
            title={w.status === "local" ? "local" : `connected ${w.ping_ms != null ? Math.round(w.ping_ms) + "ms" : ""}`}
          />
        ) : undefined,
        badgeNode: (
          <span className="flex items-center gap-1">
            {ssh && (
              <Badge
                variant="outline"
                className="shrink-0 border-review/30 bg-review-tint px-1 py-0 text-[9px] leading-none text-review-text"
              >
                ssh
              </Badge>
            )}
            {osLabel && (
              <Badge
                variant="outline"
                className="shrink-0 border-[var(--c-line)] bg-[var(--c-canvas)] px-1 py-0 text-[9px] leading-none text-ink-3"
              >
                {osLabel}
              </Badge>
            )}
            {w.labels?.includes("work") && (
              <Badge
                variant="outline"
                className="shrink-0 border-purple-500/30 bg-purple-500/10 px-1 py-0 text-[9px] font-medium leading-none text-purple-400"
              >
                work
              </Badge>
            )}
          </span>
        ),
      }
    })
    list.push({
      value: "__scratch",
      label: "(no workspace — scratch)",
      sublabel: "Run outside any workspace",
      keywords: ["scratch", "none"],
    })
    return list
  }, [workspaces])
  const submitReady = canSubmit(issues, { title, body, paths, gateCommand })

  return (
    /* Moved onto the shared `Dialog` primitive. This was a hand-rolled
       `fixed inset-0` + `role="dialog"` pair with its own `bg-black/60` scrim,
       which cost it three things the primitive gives for free: Escape to
       close, focus trapping (a text field outside the trap was reachable with
       the keyboard while the modal was open), and scroll locking. It was also
       the only dialog in the app not dimming by `--scrim`, so it read as a
       heavier modal than the identical ones next to it. */
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="p-0" showClose>
        <form
          onSubmit={submit}
          onKeyDown={(e) => {
            if (isShortcutSubmitKey(e) && !busy && !uploading && submitReady) {
              e.preventDefault()
              void submit()
            }
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader>
            <DialogTitle id="task-dialog-title">New Task</DialogTitle>
            <DialogDescription>
              Configure workspace, branch, and execution settings for the agent.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="flex flex-col">
            <Label className="block text-xs text-ink-3" htmlFor="task-title">
              Title
            </Label>
            <Input
              id="task-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault()
                  bodyRef.current?.focus()
                }
              }}
              placeholder="Task title"
              aria-invalid={issuesForField(issues, "title").length > 0}
              className="mt-1 border-[var(--c-line)] bg-[var(--c-canvas)]"
            />
            {issuesForField(issues, "title").map((i) => (
              <FieldIssue key={i.code + i.message} issue={i} />
            ))}

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-ink-3" htmlFor="task-body">
                  Prompt
                </Label>
                {summonedSkills.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/25 bg-purple-500/10 px-1.5 py-0.5 font-mono text-[10px] text-purple-700 dark:text-purple-300">
                    <Puzzle className="size-2.5" />
                    {summonedSkills.length} skill{summonedSkills.length > 1 ? "s" : ""}
                  </span>
                )}
                {summonedRefs.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                    <FileCode className="size-2.5" />
                    {summonedRefs.length} file{summonedRefs.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTriggerAt}
                  className="h-6 gap-1 border-[var(--c-line)] px-2 text-[11px] text-ink-2 hover:border-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 hover:text-[var(--c-accent)]"
                  title="Reference a file, symbol, or card (@)"
                >
                  <FileCode className="size-3 text-[var(--c-accent)]" />
                  @ File
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTriggerSkill}
                  className="h-6 gap-1 border-[var(--c-line)] px-2 text-[11px] text-ink-2 hover:border-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 hover:text-[var(--c-accent)]"
                  title="Insert a skill reference ($)"
                >
                  <Puzzle className="size-3 text-[var(--c-accent)]" />
                  Skill
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={aiBusy || !body.trim()}
                  onClick={() => improveBody("fast")}
                  className="h-6 gap-1 border-[var(--c-accent)]/40 px-2 text-[11px] text-[var(--c-accent)] hover:bg-[var(--c-accent)]/10 hover:text-[var(--c-accent)]"
                  title="Fill a template instantly, no AI call"
                >
                  <Sparkles className="size-3" />
                  Fast
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={aiBusy || !body.trim()}
                  onClick={() => improveBody("deep")}
                  className="h-6 gap-1 border-[var(--c-line)] px-2 text-[11px] text-ink-2 hover:bg-[var(--c-accent)]/10 hover:text-[var(--c-accent)]"
                  title="Rewrite with an AI model. Slower, but more contextual."
                >
                  {aiMode === "deep" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Sparkles className="size-3" />
                  )}
                  {aiMode === "deep" ? "Improving…" : "Deep"}
                </Button>
              </div>
            </div>
            <div className="relative mt-1">
              <Textarea
                ref={bodyRef}
                id="task-body"
                value={body}
                onChange={(e) => {
                  setBody(e.target.value)
                  setCursorPos(e.target.selectionStart ?? e.target.value.length)
                  setSkillDismissed(false)
                }}
                onSelect={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  setCursorPos(target.selectionStart)
                }}
                onClick={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  setCursorPos(target.selectionStart)
                  setSkillDismissed(false)
                }}
                onKeyUp={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    const target = e.target as HTMLTextAreaElement
                    setCursorPos(target.selectionStart)
                  }
                }}
                onKeyDown={handleBodyKeyDown}
                rows={4}
                placeholder="What should the agent do? Type $ to select a skill. Enter adds a line, ⌘↵ creates the task."
                className="border-[var(--c-line)] bg-[var(--c-canvas)] text-sm"
              />
              {isSkillPickerOpen && (
                <div
                  ref={skillListRef}
                  role="listbox"
                  aria-label="Skill suggestions"
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto overscroll-contain rounded-control border border-line-strong/60 bg-surface/95 p-1 backdrop-blur-xl shadow-lg ring-1 ring-black/5 dark:bg-card/95 [scrollbar-width:thin]"
                >
                  <div className="px-2 py-1 text-[10px] font-medium tracking-wider text-ink-3 uppercase">
                    Agent Skills ({skillMatches.length})
                  </div>
                  {skillMatches.slice(0, 15).map((skill, idx) => {
                    const isActive = idx === skillActiveIndex
                    return (
                      <button
                        key={skill.name}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        ref={(el) => {
                          skillItemRefs.current[idx] = el
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          insertSkill(skill.name)
                        }}
                        onMouseEnter={() => setSkillActiveIndex(idx)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded px-2.5 py-1.5 text-left transition-colors duration-100 outline-none select-none",
                          isActive
                            ? "bg-accent/15 text-accent-text dark:bg-accent/20"
                            : "hover:bg-raised text-ink"
                        )}
                      >
                        <Puzzle className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-medium text-ink">
                              ${skill.name}
                            </span>
                            {skill.category && (
                              <span className="rounded bg-well px-1 py-0.2 font-mono text-[9px] text-ink-3">
                                {skill.category}
                              </span>
                            )}
                          </div>
                          {skill.description && (
                            <p className="line-clamp-1 text-[11px] text-ink-3">
                              {skill.description}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              {isAtPickerOpen && (
                <div
                  ref={atListRef}
                  role="listbox"
                  aria-label="File and symbol suggestions"
                  className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto overscroll-contain rounded-control border border-line-strong/60 bg-surface/95 p-1 backdrop-blur-xl shadow-lg ring-1 ring-black/5 dark:bg-card/95 [scrollbar-width:thin]"
                >
                  <div className="px-2 py-1 text-[10px] font-medium tracking-wider text-ink-3 uppercase">
                    Workspace Context &amp; References ({omniboxItems.length})
                  </div>
                  {omniboxItems.slice(0, 15).map((item, idx) => {
                    const isActive = idx === atActiveIndex
                    const isFile = item.kind === "file"
                    const isSymbol = item.kind === "symbol"
                    const isCard = item.kind === "card"
                    return (
                      <button
                        key={isFile ? item.file.path : isSymbol ? `${item.symbol.file_path}:${item.symbol.line}` : item.card.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        ref={(el) => {
                          atItemRefs.current[idx] = el
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          insertOmniboxItem(item)
                        }}
                        onMouseEnter={() => setAtActiveIndex(idx)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded px-2.5 py-1.5 text-left transition-colors duration-100 outline-none select-none",
                          isActive
                            ? "bg-accent/15 text-accent-text dark:bg-accent/20"
                            : "hover:bg-raised text-ink"
                        )}
                      >
                        {isFile && <FileCode className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />}
                        {isSymbol && <Code2 className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />}
                        {isCard && <Layers className="mt-0.5 size-3.5 shrink-0 text-blue-500" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-medium text-ink truncate">
                              {isFile ? item.file.basename : isSymbol ? item.symbol.name : `#${item.card.id}`}
                            </span>
                            <span className="rounded bg-well px-1 py-0.2 font-mono text-[9px] text-ink-3">
                              {isFile ? "file" : isSymbol ? item.symbol.kind : item.card.status}
                            </span>
                          </div>
                          <p className="line-clamp-1 font-mono text-[11px] text-ink-3">
                            {isFile ? item.file.path : isSymbol ? `${item.symbol.file_path}#L${item.symbol.line}` : item.card.title}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Highlighted summoned tokens shelf */}
            {(summonedSkills.length > 0 || summonedRefs.length > 0 || summonedCards.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-card border border-[var(--c-line)] bg-[var(--c-surface)]/70 px-3 py-2 shadow-2xs backdrop-blur-md">
                <span className="text-[10px] font-semibold tracking-wider text-ink-3 uppercase">
                  Summoned:
                </span>
                {summonedSkills.map((sk) => (
                  <span
                    key={sk}
                    className="inline-flex items-center gap-1 rounded-full border border-purple-500/35 bg-purple-500/12 px-2.5 py-0.5 font-mono text-xs font-medium text-purple-700 shadow-2xs dark:text-purple-300"
                    title={`Active Skill: $${sk}`}
                  >
                    <Puzzle className="size-3 text-purple-600 dark:text-purple-400" />
                    <span>${sk}</span>
                    <button
                      type="button"
                      onClick={() => removeSummonedSkill(sk)}
                      className="ml-0.5 rounded-full p-0.5 text-purple-500/70 hover:bg-purple-500/25 hover:text-purple-800 dark:hover:text-purple-100"
                      aria-label={`Remove skill $${sk}`}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                {summonedRefs.map((ref) => (
                  <span
                    key={ref}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-700 shadow-2xs dark:text-emerald-300"
                    title={`Referenced Context: @${ref}`}
                  >
                    <FileCode className="size-3 text-emerald-600 dark:text-emerald-400" />
                    <span className="max-w-[14rem] truncate">@{ref}</span>
                    <button
                      type="button"
                      onClick={() => removeSummonedRef(ref)}
                      className="ml-0.5 rounded-full p-0.5 text-emerald-500/70 hover:bg-emerald-500/25 hover:text-emerald-800 dark:hover:text-emerald-100"
                      aria-label={`Remove reference @${ref}`}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                {summonedCards.map((cid) => (
                  <span
                    key={cid}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-500/35 bg-blue-500/12 px-2.5 py-0.5 font-mono text-xs font-medium text-blue-700 shadow-2xs dark:text-blue-300"
                    title={`Referenced Task Card: #${cid}`}
                  >
                    <Layers className="size-3 text-blue-600 dark:text-blue-400" />
                    <span>#{cid}</span>
                    <button
                      type="button"
                      onClick={() => removeSummonedCard(cid)}
                      className="ml-0.5 rounded-full p-0.5 text-blue-500/70 hover:bg-blue-500/25 hover:text-blue-800 dark:hover:text-blue-100"
                      aria-label={`Remove card #${cid}`}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {issuesForField(issues, "body").map((i) => (
              <FieldIssue key={i.code + i.message} issue={i} />
            ))}

            <div className="mt-3">
              <Label className="block text-xs text-ink-3" htmlFor="task-workspace">
                Workspace
              </Label>
              <SearchSelect
                id="task-workspace"
                value={ws || "__scratch"}
                onValueChange={(v) => {
                  setWsUserEdited(true)
                  setWs(v === "__scratch" ? "" : v)
                }}
                options={workspaceSearchOptions}
                placeholder="Select workspace…"
                searchPlaceholder="Search workspaces by name, path, label…"
                emptyMessage="No matching workspaces"
                showTriggerBadge
                className="mt-1"
                triggerClassName={selCls}
              />
              {isWorkWorkspace && (
                <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-2xs text-purple-300">
                  <BookOpen className="size-3.5 shrink-0 text-purple-400" />
                  <span>
                    <strong className="font-semibold text-purple-200">Fast-8 SAAS Rules Active:</strong> Internal DOCS.md & AGENTS.md rules automatically attached (view versioning, module SCSS, minification).
                  </span>
                </div>
              )}
            </div>

            {/* Compact inline bar: shows the fast default (dsh · DeepSeek Flash v4.1 · Write)
                plus a 1-click pen.dev toggle chip on a single row, expanding full
                Execution or pen.dev overrides inline only when clicked. */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  aria-expanded={execOverrideOpen}
                  onClick={() => setExecOverrideOpen((v) => !v)}
                  className={cn(
                    "glass-flat inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink transition-[color,background-color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)] active:scale-[0.97]",
                    execOverrideOpen && "border-[var(--c-accent)]/50 bg-accent-tint text-accent",
                  )}
                  title="Click to customize executor or execution mode"
                >
                  <SlidersHorizontal className="size-3 text-ink-3" />
                  <span>
                    {executor === "dsh"
                      ? `dsh · ${dynamicModels.find((m) => m.value === dshModel)?.label ?? dshModel}`
                      : executor === "commandcode"
                        ? `cmd · ${dynamicModels.find((m) => m.value === cmdModel)?.label ?? cmdModel}`
                        : (EXECUTOR_LABELS[executor] ?? executor)}
                  </span>
                  {(executor === "dsh" || executor === "commandcode") && effort !== "auto" && (
                    <>
                      <span className="text-ink-3">·</span>
                      <span className="font-mono text-[10px] uppercase text-accent">{effort}</span>
                    </>
                  )}
                  <span className="text-ink-3">·</span>
                  <span className="text-ink-2">
                    {executor === "commandcode" && commandCodeMode === "plan"
                      ? "Plan"
                      : executionMode === "agentic"
                        ? "Agentic"
                        : "Write"}
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={designTool !== "none"}
                  onClick={() => {
                    if (designTool === "none") {
                      setDesignTool("pen_cli")
                      setDesignScope("design_only")
                      setExecutor("shell")
                      setPenModel("deepseek:deepseek-flash")
                    } else {
                      setDesignTool("none")
                      if (executor === "shell") {
                        setExecutor("dsh")
                      }
                    }
                  }}
                  className={cn(
                    "glass-flat inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium transition-[color,background-color,box-shadow,transform] duration-150 ease-[var(--ease-out-expo)] active:scale-[0.97]",
                    designTool !== "none"
                      ? "border-[var(--c-accent)]/50 bg-accent-tint text-accent"
                      : "text-ink-3 hover:text-ink",
                  )}
                  title="Toggle pen.dev design workflow"
                >
                  <PenTool className="size-3" />
                  <span>pen.dev</span>
                  {designTool !== "none" && (
                    <span className="rounded bg-[var(--c-canvas)]/70 px-1 py-0.5 font-mono text-[10px] leading-none text-accent">
                      {designScope === "design_only" ? "Design Only" : "Design & Code"}
                    </span>
                  )}
                </button>

                {onOpenCanvas && (
                  <button
                    type="button"
                    onClick={() => onOpenCanvas({ workspacePath: ws || "scratchpad", title: title.trim(), brief: body.trim() })}
                    className="glass-flat inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink-3 transition-[color,transform] duration-150 ease-[var(--ease-out-expo)] hover:text-ink active:scale-[0.97]"
                    title={ws ? "Brainstorm this in Canvas Studio (live canvas in an isolated worktree)" : "Brainstorm visually in Global Scratchpad (pen.dev) without selecting a workspace"}
                  >
                    <Palette className="size-3 text-accent" />
                    <span>{ws ? "Canvas" : "Canvas (Scratchpad)"}</span>
                  </button>
                )}
              </div>

              <Segmented
                label="Start mode"
                value={startMode}
                onChange={setStartMode}
                options={[
                  { value: "manual", label: "Manual" },
                  { value: "now", label: "Now" },
                ]}
              />
            </div>

            {execOverrideOpen && (
              <div className="mt-2 grid grid-cols-2 gap-3 rounded-card border border-[var(--c-line)] bg-[var(--c-surface)]/50 p-3">
                <div className="min-w-0">
                  <Label className="block text-xs text-ink-3" htmlFor="task-executor">
                    Executor
                  </Label>
                  <Select value={executor} onValueChange={handleExecutorChange}>
                    <SelectTrigger id="task-executor" className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="">
                      {visibleExecutors.map((e) => (
                        <SelectItem key={e} value={e} className="text-sm">
                          {EXECUTOR_LABELS[e] ?? e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0">
                  <Label className="block text-xs text-ink-3" htmlFor="task-exec-mode-inline">
                    Execution mode
                  </Label>
                  <Select
                    value={executionMode}
                    onValueChange={(v) => setExecutionMode(v as "direct" | "agentic")}
                  >
                    <SelectTrigger id="task-exec-mode-inline" className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="">
                      <SelectItem value="direct" className="text-sm">
                        Direct (Write)
                      </SelectItem>
                      <SelectItem value="agentic" className="text-sm">
                        Agentic (plan and iterate)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(executor === "dsh" || executor === "commandcode") && (
                  <>
                    <div className="min-w-0">
                      <Label className="block text-xs text-ink-3" htmlFor="task-model-inline">
                        Model ({executor === "dsh" ? "DSH / 9Router" : "Command Code"})
                      </Label>
                      <SearchSelect
                        value={activeModel}
                        onValueChange={handleModelChange}
                        options={dynamicModels}
                        placeholder="Select model…"
                        searchPlaceholder="Search models…"
                        emptyMessage="No matching model"
                        className="mt-1"
                        triggerClassName={selCls}
                      />
                    </div>
                    <div className="min-w-0">
                      <Label className="block text-xs text-ink-3" htmlFor="task-effort-inline">
                        Reasoning effort
                      </Label>
                      <Select value={effort} onValueChange={setEffort}>
                        <SelectTrigger id="task-effort-inline" className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="">
                          {(executor === "dsh" ? DSH_EFFORT_OPTIONS : COMMANDCODE_EFFORT_OPTIONS).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value} className="text-sm">
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {executor === "commandcode" && (
                  <div className="col-span-2 min-w-0">
                    <Label className="block text-xs text-ink-3" htmlFor="task-cmd-mode-inline">
                      Command Code mode
                    </Label>
                    <Select value={commandCodeMode} onValueChange={setCommandCodeMode}>
                      <SelectTrigger id="task-cmd-mode-inline" className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="">
                        {COMMANDCODE_MODE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value} className="text-sm">
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {designTool !== "none" && (
              <div className="mt-2 space-y-3 rounded-card border border-[var(--c-accent)]/30 bg-[var(--c-surface)]/60 p-3">
                <div className="flex items-center justify-between border-b border-[var(--c-line)] pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
                    <PenTool className="size-3.5 text-accent" />
                    <span>pen.dev Design Workflow</span>
                  </div>
                  <Badge variant="outline" className="border-accent/30 text-[10px] font-normal text-accent">
                    {designScope === "design_only" ? "Design Only" : "Design + Implementation"}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <Label className="block text-xs text-ink-3" htmlFor="task-design-scope-inline">
                      Workflow scope
                    </Label>
                    <Select
                      value={designScope}
                      onValueChange={(v) => {
                        const next = v as "design_only" | "design_and_code"
                        setDesignScope(next)
                        // The direct pen CLI produces the mock only; a
                        // design_and_code card needs an agent harness to make
                        // the code edits that scope promises.
                        if (next === "design_and_code" && executor === "shell") {
                          setExecutor("dsh")
                        }
                      }}
                    >
                      <SelectTrigger
                        id="task-design-scope-inline"
                        className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="design_only" className="text-sm">
                          Design Only (.pen + PNG mock, 0 code edits)
                        </SelectItem>
                        <SelectItem value="design_and_code" className="text-sm">
                          Design &amp; Implement (Mockup then code)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {issuesForField(issues, "design_scope").map((i) => (
                      <FieldIssue key={i.code + i.message} issue={i} />
                    ))}
                  </div>

                  <div className="min-w-0">
                    <Label className="block text-xs text-ink-3" htmlFor="task-design-tool-inline">
                      Design tool
                    </Label>
                    <Select
                      value={designTool}
                      onValueChange={(v) => {
                        const next = v as "none" | "pen_cli" | "pencil_mcp"
                        setDesignTool(next)
                        if (next === "none" && executor === "shell") {
                          setExecutor("dsh")
                        }
                      }}
                    >
                      <SelectTrigger
                        id="task-design-tool-inline"
                        className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pen_cli" className="text-sm">
                          pen CLI — headless .pen + PNG
                        </SelectItem>
                        <SelectItem value="none" className="text-sm">
                          Off — disable pen.dev
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {issuesForField(issues, "design_tool").map((i) => (
                      <FieldIssue key={i.code + i.message} issue={i} />
                    ))}
                  </div>
                </div>

                {designTool === "pen_cli" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <Label className="block text-xs text-ink-3" htmlFor="task-design-harness-inline">
                        Execution harness
                      </Label>
                      <Select
                        value={executor}
                        onValueChange={(v) => setExecutor(v)}
                      >
                        <SelectTrigger
                          id="task-design-harness-inline"
                          className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {designScope === "design_only" && (
                            <SelectItem value="shell" className="text-sm">
                              Direct pen CLI (Fast shell — ~5s, 0 tokens) (Recommended)
                            </SelectItem>
                          )}
                          <SelectItem value="dsh" className="text-sm">
                            dsh (Agentic multi-turn harness)
                          </SelectItem>
                          <SelectItem value="commandcode" className="text-sm">
                            Command Code (Agentic harness)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="min-w-0">
                      <Label className="block text-xs text-ink-3">
                        pen.dev Model / Agent
                      </Label>
                      <div className="mt-1">
                        <SearchSelect
                          options={penDynamicModels}
                          value={penModel}
                          onValueChange={(v) => v && setPenModel(v)}
                          placeholder="Search pen models & agents..."
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-card border border-[var(--c-line)] bg-[var(--c-canvas)]/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-2">
                      <Sparkles className="size-3 text-accent" />
                      <span>Design skills auto-loaded</span>
                    </div>
                    <span className="font-mono text-[10px] text-ink-3">pen brief</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {AUTO_DESIGN_SKILLS.map((name) => {
                      // Until the registry answers, assume the install matches
                      // the code; only a loaded registry may say "missing".
                      const installed = skillsQuery.data ? installedSkills.has(name) : true
                      return (
                        <span
                          key={name}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px]",
                            installed
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "border-warning/40 bg-warning-tint text-warning",
                          )}
                          title={
                            installed
                              ? "Installed and injected into this card's pen brief"
                              : `Not installed on the control plane (${name})`
                          }
                        >
                          <span className={cn("size-1.5 rounded-full", installed ? "bg-emerald-500" : "bg-warning")} />
                          {name}
                        </span>
                      )
                    })}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--c-line)] pt-2">
                    <p className="min-w-0 flex-1 text-[10px] leading-4 text-ink-3">
                      The dispatcher injects these into the pen brief.{" "}
                      <code className="rounded bg-[var(--c-well)] px-1 py-0.5 font-mono text-[10px] text-ink-2">
                        {OPTIONAL_DESIGN_SKILL}
                      </code>{" "}
                      stays opt-in — it edits code, so a design-only card never loads it by accident.
                    </p>
                    {hasImplementSkill ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2 py-0.5 font-mono text-[10px] text-emerald-700 dark:text-emerald-300">
                        {OPTIONAL_DESIGN_SKILL}
                        <button
                          type="button"
                          onClick={() => removeSummonedSkill(OPTIONAL_DESIGN_SKILL)}
                          className="rounded-full p-0.5 text-emerald-600/70 hover:bg-emerald-500/25 hover:text-emerald-800 dark:hover:text-emerald-100"
                          aria-label={`Remove ${OPTIONAL_DESIGN_SKILL}`}
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 shrink-0 px-2 text-2xs"
                        onClick={addImplementationSkill}
                        title="Switches this card to Design & Implement, then loads implement-brand-system"
                      >
                        <Sparkles className="mr-1 size-2.5" />
                        Implement
                      </Button>
                    )}
                  </div>
                  {designScope === "design_only" && hasImplementSkill && (
                    <p className="mt-1.5 text-[10px] leading-4 text-warning">
                      This card is Design Only. Switch to Design &amp; Implement to let the implementation skill edit code.
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <Label className="block text-xs text-ink-3" htmlFor="task-design-source-inline">
                    Design source (.pen output path)
                  </Label>
                  <Input
                    id="task-design-source-inline"
                    value={designSource}
                    onChange={(e) => setDesignSource(e.target.value)}
                    placeholder="design/task-card.pen"
                    className="mt-1 h-9 border-[var(--c-line)] bg-[var(--c-canvas)] text-xs"
                  />
                  {issuesForField(issues, "design_source").map((i) => (
                    <FieldIssue key={i.code + i.message} issue={i} />
                  ))}
                </div>

                {executor === "shell" ? (
                  <div className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-2xs text-emerald-400">
                    <Zap className="size-3.5 shrink-0" />
                    <span>
                      <strong>Direct pen CLI:</strong> Generates mockup &amp; PNG export in ~20–30s directly on worker node with <strong>0 LLM harness tokens</strong>.
                    </span>
                  </div>
                ) : designScope === "design_only" ? (
                  <div className="flex items-center gap-2 rounded border border-purple-500/20 bg-purple-500/5 px-3 py-2 text-2xs text-purple-400">
                    <Palette className="size-3.5 shrink-0" />
                    <span>
                      <strong>Design Only:</strong> Agent harness is strictly mandated to commit mockup artifacts (.pen + PNG) and stop immediately without modifying app code.
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Branch lives with the workspace, not inside Scope & safety: it is a
                property of where the work runs, and burying it under a collapsed
                section behind a second "Worktree" switch is why the Pull button
                went unfound. Pull is live either way — the checkout has to be
                current before the card is dispatched — while choosing a branch
                only means something for a worktree, so the list locks itself
                under Workspace isolation rather than offering a choice that
                would be dropped from the payload. */}
            {selectedWorkspace && (
              <div className="mt-3">
                <Label className="block text-xs text-ink-3">Branch</Label>
                <BranchPicker
                  className="mt-1 w-full"
                  workspaceId={selectedWorkspace.id || selectedWorkspace.path}
                  mode={isolation === "worktree" ? "base" : "switch"}
                  value={baseBranch}
                  onChange={setBaseBranch}
                  selectDisabled={false}
                  triggerClassName={branchSelCls}
                />
                <p className="mt-1 text-[11px] text-ink-3">
                  {isolation === "worktree"
                    ? "The worktree is created from this branch. Current HEAD uses whatever is checked out now."
                    : "Pick a branch to switch the workspace checkout before running, or click Pull to fast-forward the current branch."}
                </p>
              </div>
            )}

            {executor === "shell" && (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning-tint p-3">
                <p className="text-xs font-medium text-warning">Autonomous shell access</p>
                <p className="mt-1 text-[11px] leading-4 text-ink-3">
                  The orchestrator will read the workspace, edit files, run tests and retry commands
                  until the task is ready for review.
                </p>
              </div>
            )}

          {/* Scope and safety: collapsed by default, because most tasks need
              none of it and eight controls in one scroll is how fields get
              filled in by accident. */}
          <CollapsibleSection
            title="Scope & safety"
            open={scopeOpen}
            onToggle={() => setScopeOpen((v) => !v)}
            badge={
              paths.length > 0 || deps.length > 0 || gateCommand ? (
                <span className="shrink-0 text-2xs tabular-nums text-ink-3">
                  {paths.length + deps.length + (gateCommand ? 1 : 0)}
                </span>
              ) : null
            }
          >
            <div>
              <Label className="block text-xs text-ink-3" htmlFor="task-paths">
                Paths
              </Label>
              <Input
                id="task-paths"
                value={pathsRaw}
                onChange={(e) => setPathsRaw(e.target.value)}
                placeholder="src/auth/**, internal/auth/**"
                aria-invalid={pathIssues.length > 0}
                aria-describedby="task-paths-help"
                className="mt-1 border-[var(--c-line)] bg-[var(--c-canvas)] text-sm"
              />
              <p id="task-paths-help" className="mt-1 text-[11px] text-ink-3">
                Globs relative to the workspace. Two running tasks whose paths
                overlap are held back so they cannot interleave edits.
              </p>
              {pathIssues.map((i) => (
                <FieldIssue key={i.code + i.message} issue={i} />
              ))}
            </div>

            <div>
              <Label className="block text-xs text-ink-3" htmlFor="task-deps">
                Depends on
              </Label>
              {deps.length > 0 && (
                <div className="mb-1 flex flex-wrap gap-1.5">
                  {deps.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--c-line)] bg-[var(--c-surface)] px-2 py-1 text-xs"
                    >
                      {candidates.find((c) => c.id === id)?.title ?? id}
                      <button
                        type="button"
                        aria-label={`Remove dependency ${id}`}
                        onClick={() => setDeps((prev) => prev.filter((x) => x !== id))}
                        className="text-ink-3 hover:text-ink"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <SearchSelect
                value=""
                onValueChange={(v) => v && setDeps((prev) => [...prev, v])}
                options={depSearchOptions}
                placeholder="Pick a card…"
                searchPlaceholder="Search cards by title…"
                emptyMessage={candidates.length === 0 ? "No other cards on this board" : "No matching cards"}
                className="mt-1"
                triggerClassName={selCls}
              />
              <p className="mt-1 text-[11px] text-ink-3">
                This card waits until each dependency reaches done — not merely
                review, so it never builds on uncommitted work.
              </p>
            </div>

            <div>
              <Label className="block text-xs text-ink-3" htmlFor="task-gate">
                Quality gate
              </Label>
              <Input
                id="task-gate"
                value={gateCommand}
                onChange={(e) => setGateCommand(e.target.value)}
                placeholder="go test ./..."
                aria-invalid={issuesForField(issues, "gate_command").length > 0}
                className="mt-1 border-[var(--c-line)] bg-[var(--c-canvas)] text-sm"
              />
              <p className="mt-1 text-[11px] text-ink-3">
                Runs on the worker after the agent finishes. A failure is shown
                beside the diff and blocks approval until overridden.
              </p>
              {issuesForField(issues, "gate_command").map((i) => (
                <FieldIssue key={i.code + i.message} issue={i} />
              ))}
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs text-ink-3">Isolation</Label>
                <Segmented
                  label="Isolation"
                  value={isolation}
                  onChange={(v) => setIsolation(v as "auto" | "workspace" | "worktree")}
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "workspace", label: "Workspace" },
                    { value: "worktree", label: "Worktree" },
                  ]}
                />
              </div>
              <p className="mt-1 text-[11px] text-ink-3">
                {isolation === "worktree" ? (
                  <>
                    Gives the task its own git worktree and branch on the worker,
                    so nothing it does can touch another task&apos;s changes.
                    Needs a git workspace, and the change is merged back into the
                    base branch when you approve.
                  </>
                ) : (
                  <>
                    Edits the shared checkout directly. Cheaper, but two tasks on
                    one repository can interleave changes.
                  </>
                )}
              </p>
              {issuesForField(issues, "isolation").map((i) => (
                <FieldIssue key={i.code + i.message} issue={i} />
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Advanced"
            open={advancedOpen}
            onToggle={() => setAdvancedOpen((v) => !v)}
          >
            <div>
              <Label className="block text-xs text-ink-3" htmlFor="task-assignee">
                Agent Profile
              </Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger id="task-assignee" className={`mt-1 ${selCls}`}>
                  <SelectValue placeholder="profile" />
                </SelectTrigger>
                <SelectContent className="">
                  {profiles.map((p) => (
                    <SelectItem key={p.name} value={p.name} disabled={!p.valid} className="text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar className="size-4 shrink-0">
                          {p.avatar_url && <AvatarImage src={p.avatar_url} alt={p.name} />}
                          <AvatarFallback className="bg-[var(--c-well)] text-[7px] text-[var(--c-accent)]">
                            {p.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 truncate">
                          {p.name}
                          {p.model ? ` — ${p.model}` : ""}
                          {p.active ? " (active)" : ""}
                          {!p.valid ? " (broken config)" : ""}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <Label className="block text-xs text-ink-3" htmlFor="task-exec-mode">
                  Execution mode
                </Label>
                <Select
                  value={executionMode}
                  onValueChange={(v) => setExecutionMode(v as "direct" | "agentic")}
                >
                  <SelectTrigger id="task-exec-mode" className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="">
                    <SelectItem value="direct" className="text-sm">
                      Direct
                    </SelectItem>
                    <SelectItem value="agentic" className="text-sm">
                      Agentic (plan and iterate)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <Label className="block text-xs text-ink-3" htmlFor="task-priority">
                  Priority
                </Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="task-priority" className={`mt-1 ${selCls}`}>
                    <SelectValue placeholder="priority" />
                  </SelectTrigger>
                  <SelectContent className="">
                    <SelectItem value="0" className="text-sm">
                      0 — normal
                    </SelectItem>
                    <SelectItem value="1" className="text-sm">
                      1
                    </SelectItem>
                    <SelectItem value="2" className="text-sm">
                      2 — high
                    </SelectItem>
                    <SelectItem value="3" className="text-sm">
                      3 — urgent
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {executionMode === "agentic" && (
              <div>
                <Label className="block text-xs text-ink-3" htmlFor="task-iterations">
                  Max iterations
                </Label>
                <Input
                  id="task-iterations"
                  type="number"
                  min="1"
                  max="24"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(e.target.value)}
                  className="mt-1 w-24 border-[var(--c-line)] bg-[var(--c-canvas)] text-xs"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-xs text-ink-3" htmlFor="task-verify-profile">
                  Verify profile
                </Label>
                <span className="text-[11px] text-ink-3">before you can approve</span>
              </div>
              <Select
                value={verifyProfile}
                onValueChange={(v) => setVerifyProfile(v as VerifyProfile | "auto")}
              >
                <SelectTrigger id="task-verify-profile" className={`mt-1 ${selCls}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="">
                  <SelectItem value="auto" className="text-sm">
                    Auto — route from the diff
                  </SelectItem>
                  <SelectItem value="none" className="text-sm">
                    None — no verification
                  </SelectItem>
                  <SelectItem value="fast" className="text-sm">
                    Fast — types, tests, tokens
                  </SelectItem>
                  <SelectItem value="ui" className="text-sm">
                    UI — plus screenshots and accessibility
                  </SelectItem>
                  <SelectItem value="e2e" className="text-sm">
                    E2E — plus flow tests
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-ink-3">
                {verifyProfile === "auto"
                  ? "Nothing needed setting. Auto escalates from the files the agent changed: a web/src change needs the UI rung, and a flow-owning path needs E2E. It never picks a weaker rung than a diff requires."
                  : "An explicit choice always wins over routing — use it to force a check Auto would skip, or to switch one off for a card you already know is safe."}
              </p>
              {issuesForField(issues, "verify_profile").map((i) => (
                <FieldIssue key={i.code + i.message} issue={i} />
              ))}
            </div>

            <div>
              <Label className="block text-xs text-ink-3" htmlFor="task-design-source">
                Design source
              </Label>
              <Input
                id="task-design-source"
                value={designSource}
                onChange={(e) => setDesignSource(e.target.value)}
                placeholder="design/task-card.pen"
                className="mt-1 border-[var(--c-line)] bg-[var(--c-canvas)] text-xs"
              />
              <p className="mt-1 text-[11px] text-ink-3">
                A committed pen.dev design this task must implement verbatim,
                repo-relative. Leave empty for everything else — a card with no
                design source never invokes pen and never spends an agent-day.
              </p>
              {issuesForField(issues, "design_source").map((i) => (
                <FieldIssue key={i.code + i.message} issue={i} />
              ))}
            </div>

            <div>
              <Label className="block text-xs text-ink-3" htmlFor="task-design-tool">
                Design tool
              </Label>
              <Select value={designTool} onValueChange={(v) => setDesignTool(v as "none" | "pen_cli" | "pencil_mcp")}>
                <SelectTrigger id="task-design-tool" className="mt-1 border-[var(--c-line)] bg-[var(--c-canvas)] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="">
                  <SelectItem value="none" className="text-sm">
                    None — no pen.dev design
                  </SelectItem>
                  <SelectItem value="pen_cli" className="text-sm">
                    pen CLI — generate the mock headlessly
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-ink-3">
                How this card's design is produced. The pen CLI writes a
                new .pen and its PNG export on the worker; the pencil MCP
                edits the document already open in the desktop app (it
                cannot save a new one). The choice rides the dispatch
                prompt structurally, so it cannot go stale the way body
                text can.
              </p>
              {issuesForField(issues, "design_tool").map((i) => (
                <FieldIssue key={i.code + i.message} issue={i} />
              ))}
            </div>

            <div>
              <Label className="block text-xs text-ink-3">Attachments (image / PDF)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => void handleFiles(e.target.files ?? [])}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Paperclip className="mr-1 size-3" /> {uploading ? "Uploading…" : "Attach file"}
              </Button>
              {pendingAtts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {pendingAtts.map((a) => (
                    <AttachmentChip
                      key={a.id}
                      att={a}
                      onRemove={() => setPendingAtts((prev) => prev.filter((x) => x.id !== a.id))}
                    />
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Advisory issues the server reported against the whole task rather
              than one field. */}
          {issues.filter((i) => !i.field).map((i) => (
            <p key={i.code + i.message} role="status" className="mt-2 text-xs text-warning">
              {i.message}
            </p>
          ))}
          {err && (
            <p role="alert" className="mt-3 text-xs text-danger-text">
              {err}
            </p>
          )}
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="signal"
              size="sm"
              loading={busy}
              disabled={uploading || !submitReady}
            >
              <span>Create</span>
              <kbd className="ml-1 rounded bg-black/15 px-1 py-0.5 font-mono text-[10px] leading-none opacity-80">
                ⌘↵
              </kbd>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FieldIssue({ issue }: { issue: ValidationIssue }) {
  return (
    <p role="alert" className="mt-1 text-[11px] text-danger-text">
      {issue.message}
    </p>
  )
}
