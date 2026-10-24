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
import { Sparkles, Loader2, Paperclip, ChevronRight, PenTool, SlidersHorizontal, X, Puzzle } from "lucide-react"
import { AttachmentChip } from "@/components/feedback/attachment-chip"
import { uploadAttachment, type Attachment } from "../../api"
import { cn } from "@/lib/utils"
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
}: {
  slug: string
  workspaces: Workspace[]
  profiles: Profile[]
  /** Board tasks offered as dependencies. */
  candidates?: DependencyCandidate[]
  onClose: () => void
  onCreate: (p: Record<string, unknown>) => Promise<unknown>
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
  const [isolation, setIsolation] = useState<"workspace" | "worktree">("workspace")
  const [baseBranch, setBaseBranch] = useState("")
  const [verifyProfile, setVerifyProfile] = useState<VerifyProfile | "auto">("auto")
  const [designSource, setDesignSource] = useState("")
  // "none" is the form's sentinel for "no pen.dev design" — Radix
  // Select items need non-empty values, the API wants the absence.
  const [designTool, setDesignTool] = useState<"none" | "pen_cli" | "pencil_mcp">("none")
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

  // Skills query and autocomplete for prompt/body ($ trigger)
  const skillsQuery = useQuery({ queryKey: ["task-skills"], queryFn: () => listSkills() })
  const [skillDismissed, setSkillDismissed] = useState(false)
  const [skillActiveIndex, setSkillActiveIndex] = useState(0)
  const [cursorPos, setCursorPos] = useState(0)
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

  function handleBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
  const { data: boardTasks } = useQuery({
    queryKey: ["tasks", slug],
    queryFn: () => api<Task[]>(`/api/boards/${slug}/tasks`),
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

  // Find the workspace ID from the selected path so we can list branches.
  const selectedWorkspace = useMemo(() => workspaces.find((w) => w.path === ws), [workspaces, ws])

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
  }, [slug, title, body, ws, executor, executionMode, maxIterations, priority, pathsRaw, gateCommand, isolation, baseBranch, verifyProfile, designSource, designTool, dshModel, cmdModel, effort, commandCodeMode, deps.join(",")])

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
              <Label className="text-xs text-ink-3" htmlFor="task-body">
                Prompt
              </Label>
              <div className="flex items-center gap-1">
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
            </div>
            {issuesForField(issues, "body").map((i) => (
              <FieldIssue key={i.code + i.message} issue={i} />
            ))}

            <div className="mt-3">
              <Label className="block text-xs text-ink-3" htmlFor="task-workspace">
                Workspace
              </Label>
              <Select
                value={ws || "__scratch"}
                onValueChange={(v) => {
                  setWsUserEdited(true)
                  setWs(v === "__scratch" ? "" : v)
                }}
              >
                <SelectTrigger id="task-workspace" className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                  <SelectValue placeholder="workspace" />
                </SelectTrigger>
                <SelectContent className="max-w-[22rem]">
                  {workspaces.map((w) => {
                    const ssh = isSshWorkspace(w)
                    const live = isLive(w)
                    const os = (w.os || "").toLowerCase()
                    const osLabel =
                      os === "mac" ? "mac" : os === "windows" ? "win" : os === "linux" ? "linux" : ""
                    return (
                      <SelectItem
                        key={w.id}
                        value={w.path}
                        className="text-sm"
                        title={`${w.name} — ${w.path}${w.host ? ` (${w.host})` : ""}${w.status ? ` · ${w.status}` : ""}`}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {live && (
                            <span
                              className="size-1.5 shrink-0 animate-pulse rounded-full bg-success"
                              title={
                                w.status === "local"
                                  ? "local"
                                  : `connected ${w.ping_ms != null ? Math.round(w.ping_ms) + "ms" : ""}`
                              }
                            />
                          )}
                          <span className="min-w-0 flex-1 truncate">{w.name}</span>
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
                        </span>
                      </SelectItem>
                    )
                  })}
                  <SelectItem value="__scratch" className="text-sm">
                    (no workspace — scratch)
                  </SelectItem>
                </SelectContent>
              </Select>
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
                  onClick={() =>
                    setDesignTool((prev) => (prev === "none" ? "pen_cli" : "none"))
                  }
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
                      {designTool === "pen_cli" ? "CLI" : "MCP"}
                    </span>
                  )}
                </button>
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
              <div className="mt-2 grid grid-cols-2 gap-3 rounded-card border border-[var(--c-line)] bg-[var(--c-surface)]/50 p-3">
                <div className="min-w-0">
                  <Label className="block text-xs text-ink-3" htmlFor="task-design-tool-inline">
                    Design tool
                  </Label>
                  <Select
                    value={designTool}
                    onValueChange={(v) => setDesignTool(v as "none" | "pen_cli" | "pencil_mcp")}
                  >
                    <SelectTrigger
                      id="task-design-tool-inline"
                      className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="">
                      <SelectItem value="pen_cli" className="text-sm">
                        pen CLI — headless .pen + PNG
                      </SelectItem>
                      <SelectItem value="pencil_mcp" className="text-sm">
                        pencil MCP — live canvas
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
                <div className="min-w-0">
                  <Label className="block text-xs text-ink-3" htmlFor="task-design-source-inline">
                    Design source (.pen)
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
                  onChange={setIsolation}
                  options={[
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
                  <SelectItem value="pencil_mcp" className="text-sm">
                    pencil MCP — edit the open document
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
