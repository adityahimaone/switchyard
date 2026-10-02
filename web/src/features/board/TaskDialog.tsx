import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { ExecutorSettings, Profile, Workspace } from "../../api"
import { api, getExecutorSettings, startTask, validateTask } from "../../api"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Segmented } from "@/components/ui/segmented"
import { Sparkles, Loader2, Paperclip, ChevronDown, ChevronRight, X } from "lucide-react"
import { AttachmentChip } from "@/components/feedback/attachment-chip"
import { uploadAttachment, type Attachment } from "../../api"
import {
  buildCreatePayload,
  canSubmit,
  issuesForField,
  isSubmitKey,
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
  dsh: "DeepSeek Harness",
  omp: "omp (oh-my-pi)",
  shell: "Shell agent (workspace access)",
}

const FALLBACK_EXECUTORS: ExecutorSettings = {
  order: ["auto", "hermes", "codex", "commandcode", "dsh", "omp", "shell"],
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

function defaultWorkspacePath(workspaces: Workspace[]): string {
  if (workspaces.length === 0) return ""
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
        className="group/head -mx-1 flex w-full items-center gap-1.5 rounded px-1 py-1 text-left"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-ink-3" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-ink-3" />
        )}
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
  const [ws, setWs] = useState(() => defaultWorkspacePath(workspaces))
  const [assignee, setAssignee] = useState(profiles[0]?.name ?? "default")
  const [executor, setExecutor] = useState("auto")
  const [executionMode, setExecutionMode] = useState<"direct" | "agentic">("direct")
  const [maxIterations, setMaxIterations] = useState("6")
  const [priority, setPriority] = useState("0")
  const [pathsRaw, setPathsRaw] = useState("")
  const [deps, setDeps] = useState<string[]>([])
  const [gateCommand, setGateCommand] = useState("")
  const [startMode, setStartMode] = useState<"manual" | "now">("manual")
  const [isolation, setIsolation] = useState<"workspace" | "worktree">("workspace")
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMode, setAiMode] = useState<"fast" | "deep" | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const improveCache = useRef(new Map<string, string>())

  const paths = useMemo(() => splitPathInput(pathsRaw), [pathsRaw])

  const { data: executorSettings } = useQuery({
    queryKey: ["executor-settings"],
    queryFn: getExecutorSettings,
  })
  const visibleExecutors = useMemo(() => visibleExecutorsFor(executorSettings), [executorSettings])

  // Seed the default mode once, without stomping a user change on re-render.
  const seededMode = useRef(false)
  useEffect(() => {
    if (seededMode.current || !executorSettings) return
    setExecutionMode(executorSettings.default_execution_mode)
    seededMode.current = true
  }, [executorSettings])

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
  }, [slug, title, body, ws, executor, executionMode, maxIterations, priority, pathsRaw, gateCommand, isolation, deps.join(",")])

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

    // "Start now" claims the card immediately rather than leaving it for the
    // next poll. A refusal is a legitimate outcome — a lease held by another
    // task, or an unmet dependency — so it is reported rather than blocking the
    // close: the card exists and is queued either way.
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
    "w-full border-[var(--c-line)] bg-[var(--c-canvas)] text-sm data-[size=default]:h-9"
  const pathIssues = issuesForField(issues, "paths")
  const depOptions = candidates.filter((c) => !deps.includes(c.id))
  const submitReady = canSubmit(issues, { title, body, paths, gateCommand })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-dialog-title"
        className="glass-strong max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="task-dialog-title" className="text-sm font-semibold">
          New Task
        </h2>

        <form
          onSubmit={submit}
          className="flex flex-col"
        >
          <Label className="mt-3 block text-xs text-ink-3" htmlFor="task-title">
            Title
          </Label>
          <Input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
          <Textarea
            id="task-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (isSubmitKey(e)) {
                e.preventDefault()
                void submit()
              }
            }}
            rows={5}
            placeholder="What should the agent do? Enter creates the task, Shift+Enter adds a line."
            className="mt-1 border-[var(--c-line)] bg-[var(--c-canvas)] text-sm"
          />
          {issuesForField(issues, "body").map((i) => (
            <FieldIssue key={i.code + i.message} issue={i} />
          ))}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label className="block text-xs text-ink-3" htmlFor="task-workspace">
                Workspace
              </Label>
              <Select value={ws || "__scratch"} onValueChange={(v) => setWs(v === "__scratch" ? "" : v)}>
                <SelectTrigger id="task-workspace" className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                  <SelectValue placeholder="workspace" />
                </SelectTrigger>
                <SelectContent className="max-w-[22rem] border-[var(--c-line)] bg-[var(--c-surface)]">
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
            <div className="min-w-0">
              <Label className="block text-xs text-ink-3" htmlFor="task-executor">
                Executor
              </Label>
              <Select value={executor} onValueChange={setExecutor}>
                <SelectTrigger id="task-executor" className={`mt-1 ${selCls} min-w-0 [&>span]:truncate`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[var(--c-line)] bg-[var(--c-surface)]">
                  {visibleExecutors.map((e) => (
                    <SelectItem key={e} value={e} className="text-sm">
                      {EXECUTOR_LABELS[e] ?? e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {executor === "shell" && (
            <div className="mt-3 rounded-lg border border-warning/30 bg-warning-tint p-3">
              <p className="text-xs font-medium text-warning">Autonomous shell access</p>
              <p className="mt-1 text-[11px] leading-4 text-ink-3">
                The orchestrator will read the workspace, edit files, run tests and retry commands
                until the task is ready for review.
              </p>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <Label className="text-xs text-ink-3">Start</Label>
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
          <p className="mt-1 text-[11px] text-ink-3">
            {startMode === "now"
              ? "Claims the task immediately instead of waiting for the next dispatcher poll."
              : "Queues the task; the dispatcher picks it up within 30 seconds."}
          </p>

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
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1 text-xs"
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
              <Select value="" onValueChange={(v) => v && setDeps((prev) => [...prev, v])}>
                <SelectTrigger id="task-deps" className={`${selCls} min-w-0 [&>span]:truncate`}>
                  <SelectValue placeholder="Pick a card…" />
                </SelectTrigger>
                <SelectContent className="max-w-[22rem] border-[var(--c-line)] bg-[var(--c-surface)]">
                  {depOptions.length === 0 ? (
                    <SelectItem value="__none" disabled className="text-sm">
                      No other cards
                    </SelectItem>
                  ) : (
                    depOptions.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                          <span className="shrink-0 text-ink-3">{c.status}</span>
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
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
                <SelectContent className="border-[var(--c-line)] bg-[var(--c-surface)]">
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
                  <SelectContent className="border-[var(--c-line)] bg-[var(--c-surface)]">
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
                  <SelectContent className="border-[var(--c-line)] bg-[var(--c-surface)]">
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

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || uploading || !submitReady}
              className="bg-[var(--c-accent)] text-black hover:bg-[var(--c-accent)]/90"
            >
              {busy ? "…" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function FieldIssue({ issue }: { issue: ValidationIssue }) {
  return (
    <p role="alert" className="mt-1 text-[11px] text-danger-text">
      {issue.message}
    </p>
  )
}
