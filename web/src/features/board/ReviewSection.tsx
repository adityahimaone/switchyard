import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { api, toastGlobal, type Task } from "../../api"
import { Check, ChevronDown, Copy, FileCode2, Loader2, Minus, Plus } from "lucide-react"
import { ReviewGateBar } from "./ReviewGateBar"
import { VerificationBlock } from "./VerificationBlock"

type DiffLine = { type: "context" | "added" | "removed"; oldLine?: number; newLine?: number; content: string }
type DiffFile = { name: string; lines: DiffLine[] }
type ReviewMetadata = { provenance?: string[]; codegraph?: string }
type ReviewDiff = { stat: string; diff: string; files?: string[]; clean: boolean } & ReviewMetadata

export function parseDiffFiles(raw: string, authoritativeNames: string[] = []): DiffFile[] {
  const files: DiffFile[] = []
  let file: DiffFile | null = null
  let oldLine = 0
  let newLine = 0
  for (const source of raw.split("\n")) {
    if (source.startsWith("diff --git ")) {
      const match = source.match(/ b\/(.+)$/)
      file = { name: match?.[1] || "changed file", lines: [] }
      files.push(file)
      continue
    }
    if (!file) file = { name: "changed file", lines: [] }
    const header = source.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (header) {
      const numbers = source.match(/^@@ -(\d+)/)
      oldLine = Number(numbers?.[1] || 0)
      newLine = Number(header[1])
      continue
    }
    if (source.startsWith("--- ") || source.startsWith("+++ ") || source.startsWith("index ") || source.startsWith("new file")) continue
    const type = source.startsWith("+") ? "added" : source.startsWith("-") ? "removed" : "context"
    const content = type === "context" ? source : source.slice(1)
    if (type === "removed") file.lines.push({ type, oldLine: oldLine++, content })
    else if (type === "added") file.lines.push({ type, newLine: newLine++, content })
    else if (source && (oldLine || newLine)) file.lines.push({ type, oldLine: oldLine++, newLine: newLine++, content })
  }
  if (authoritativeNames.length) {
    const byName = new Map(files.map((entry) => [entry.name, entry]))
    return authoritativeNames.map((name) => byName.get(name) || { name, lines: [] })
  }
  return files.length
    ? files
    : [{ name: "workspace changes", lines: raw ? raw.split("\n").map((content) => ({ type: "context" as const, content })) : [] }]
}

function DiffDisclosure({
  file, complete, copyText, selected, onToggle,
}: {
  file: DiffFile
  complete: boolean
  copyText: string
  selected: boolean
  onToggle: () => void
}) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const added = file.lines.filter((l) => l.type === "added").length
  const removed = file.lines.filter((l) => l.type === "removed").length

  async function copy() {
    await navigator.clipboard.writeText(copyText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <section
      className={
        selected
          ? "overflow-hidden rounded-control border border-accent/40 bg-accent-tint/30"
          : "overflow-hidden rounded-control border border-line"
      }
    >
      <div className="flex items-center gap-2 border-b border-line bg-well px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="size-3.5 accent-[var(--c-accent)]"
          aria-label={`Select ${file.name}`}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-focus/40"
        >
          <ChevronDown
            className={`size-3.5 shrink-0 text-ink-3 transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <FileCode2 className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span className="truncate font-mono" title={file.name}>{file.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-2xs tabular">
            {/* The gutter glyph repeats this, so colour is never the only signal.
                -text tokens: this row sits on `well`, where the solid success
                value measures 2.5:1. */}
            <span className="text-success-text">+{added}</span>
            <span className="text-danger-text">−{removed}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-control p-1 text-ink-3 outline-none transition-colors hover:bg-raised hover:text-ink focus-visible:ring-[3px] focus-visible:ring-focus/40"
          aria-label={`Copy the diff for ${file.name}`}
        >
          {copied ? <Check className="size-3.5 text-success-text" /> : <Copy className="size-3.5" />}
        </button>
      </div>

      {open && (
        <div className="max-h-72 overflow-auto py-1 font-mono text-2xs leading-5">
          {file.lines.map((line, index) => (
            <div
              key={`${file.name}-${index}`}
              className={
                line.type === "added"
                  ? "grid grid-cols-[2.5rem_2.5rem_1.25rem_minmax(0,1fr)] bg-success-tint text-ink"
                  : line.type === "removed"
                    ? "grid grid-cols-[2.5rem_2.5rem_1.25rem_minmax(0,1fr)] bg-danger-tint text-ink"
                    : "grid grid-cols-[2.5rem_2.5rem_1.25rem_minmax(0,1fr)] text-ink-3"
              }
            >
              <span className="select-none pr-2 text-right text-ink-3">{line.oldLine ?? ""}</span>
              <span className="select-none pr-2 text-right text-ink-3">{line.newLine ?? ""}</span>
              <span
                className={
                  line.type === "added"
                    ? "select-none text-center text-success-text"
                    : line.type === "removed"
                      ? "select-none text-center text-danger-text"
                      : "select-none text-center"
                }
              >
                {line.type === "added" ? (
                  <Plus className="mx-auto size-3" aria-label="added" />
                ) : line.type === "removed" ? (
                  <Minus className="mx-auto size-3" aria-label="removed" />
                ) : (
                  " "
                )}
              </span>
              <span className="pr-3 break-words whitespace-pre-wrap">{line.content || " "}</span>
            </div>
          ))}
          {!file.lines.length && <p className="px-3 py-4 text-ink-3">No textual lines returned.</p>}
        </div>
      )}
      {!open && complete && (
        <div className="px-3 py-1.5 text-2xs text-ink-3">Collapsed. Select the file to expand it.</div>
      )}
    </section>
  )
}

export function ReviewSection({ slug, task, onDone }: { slug: string; task: Task; onDone: () => void }) {
  const qc = useQueryClient()
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Set only after a 409 from a failing check, so the override is always a
  // response to a refusal rather than a way to skip a check silently.
  const [overriding, setOverriding] = useState(false)

  const diff = useQuery({
    queryKey: ["diff", slug, task.id],
    queryFn: () => api<ReviewDiff>(`/api/boards/${slug}/tasks/${task.id}/diff`),
    enabled: task.status === "review",
    retry: false,
  })

  const files = useMemo(
    () => parseDiffFiles(diff.data?.diff || "", diff.data?.files || []),
    [diff.data?.diff, diff.data?.files],
  )
  const allLines = files.flatMap((f) => f.lines)
  const additions = allLines.filter((l) => l.type === "added").length
  const removals = allLines.filter((l) => l.type === "removed").length
  const allNames = files.map((f) => f.name)
  const selectedCount = selected.size
  const allSelected = selectedCount === files.length && files.length > 0

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Default to selecting everything once the diff first arrives, so the common
  // case is one click rather than a select-all first.
  useEffect(() => {
    if (diff.data && !diff.data.clean && files.length && selected.size === 0) {
      setSelected(new Set(allNames))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diff.data, files.length, allNames.join("|")])

  const approve = useMutation({
    mutationFn: (action: "done" | "commit" | "commit_push") => {
      const body: Record<string, unknown> = { action }
      // When everything is selected, omit the file list so the backend can do a
      // plain `git add -A`, which is both cheaper and less error-prone.
      if (action !== "done" && selectedCount > 0 && selectedCount < files.length) {
        body.files = [...selected]
      }
      // A red gate or a red verification is refused unless the reviewer says so
      // explicitly. The override is recorded server-side, so "it shipped past a
      // failing check" stays answerable after the fact.
      if (overriding) body.force = true
      return api<{ status: string }>(`/api/boards/${slug}/tasks/${task.id}/approve`, {
        method: "POST",
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      toastGlobal("Review action completed", "success")
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      qc.invalidateQueries({ queryKey: ["verify", slug, task.id] })
      onDone()
    },
    // A 409 is the server refusing because a check is red. Offer the recorded
    // override rather than leaving the card stuck.
    onError: (e: Error) => {
      setErr(e.message)
      if ((e as Error & { status?: number }).status === 409) setOverriding(true)
    },
  })

  if (task.status !== "review") return null

  return (
    /* `glass-strong`, not `glass`/`glass-card`. This is the one surface in the
       app that holds dense text — a diff, at 13px mono, where a line of code has
       to stay exactly as legible as it would be on an opaque panel. Principle 2
       in the design system: legibility beats effect, and text-dense surfaces
       take the strongest tier because there is the most to read *through* it.

       The diff rows inside keep their solid `--success-tint` / `--danger-tint`
       gutters — no transparency stacking inside the code area, which is what
       the spec calls for and what stops a red row on a red card from going
       muddy. */
    <section className="glass-strong flex flex-col overflow-hidden rounded-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-focus/40"
        >
          <ChevronDown
            className={`size-4 shrink-0 text-ink-3 transition-transform ${open ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-ink">Review changes</h3>
            <p className="mt-0.5 truncate font-mono text-2xs text-ink-3">
              {diff.data?.stat.split("\n")[0] || "workspace diff"}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2 text-2xs text-ink-3 tabular">
          {diff.isLoading && <Loader2 className="size-3 animate-spin" aria-label="Loading" />}
          <span>{files.length} files</span>
          <span className="text-success-text">+{additions}</span>
          <span className="text-danger-text">−{removals}</span>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-2 p-3">
          {/* Verification sits above the diff, not beside it: it is the answer
              to "may I approve this", and a reviewer should meet it before
              reading 8000 lines of patch. */}
          <VerificationBlock slug={slug} taskId={task.id} />

          {(diff.data?.codegraph || (diff.data?.provenance?.length ?? 0) > 0) && (
            <details className="rounded-control border border-line bg-well px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-ink-2">
                Execution provenance
              </summary>
              <div className="mt-2 flex flex-col gap-1 font-mono text-2xs text-ink-3">
                <p>
                  <span className="text-ink-3">CodeGraph:</span>{" "}
                  {diff.data?.codegraph || "skipped or unavailable"}
                </p>
                {(diff.data?.provenance ?? []).map((line, index) => (
                  <p key={`${line}-${index}`} className="break-all">
                    <span className="text-ink-3">Worker:</span> {line}
                  </p>
                ))}
              </div>
            </details>
          )}

          {!diff.data?.clean && !diff.isLoading && files.length > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setSelected(new Set(allNames))}
                disabled={allSelected}
              >
                Select all
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  setSelected(new Set(allNames.filter((n) => !selected.has(n))))
                }
              >
                Invert
              </Button>
              <span className="ml-auto text-2xs text-ink-3 tabular">
                {selectedCount} of {files.length} selected
              </span>
            </div>
          )}

          {diff.error && (
            <p role="alert" className="rounded-control border border-danger/30 bg-danger-tint px-2 py-1.5 text-xs text-danger-text">
              Could not load the diff: {(diff.error as Error).message}
            </p>
          )}

          {diff.isLoading ? (
            <p className="flex items-center gap-2 px-2 py-8 text-xs text-ink-3">
              <Loader2 className="size-3 animate-spin" /> Loading file changes…
            </p>
          ) : diff.data?.clean ? (
            <p className="px-2 py-6 text-center text-xs text-ink-3">
              No workspace changes.
            </p>
          ) : (
            files.map((file) => (
              <DiffDisclosure
                key={file.name}
                file={file}
                complete={!diff.isLoading}
                copyText={file.lines.map((l) => l.content).join("\n")}
                selected={selected.has(file.name)}
                onToggle={() => toggle(file.name)}
              />
            ))
          )}
        </div>
      )}

      <ReviewGateBar
        files={files.length}
        added={additions}
        removed={removals}
        selectedCount={selectedCount}
        clean={!!diff.data?.clean}
        busy={approve.isPending}
        error={err}
        overriding={overriding}
        onOverride={() => { setErr(null); approve.mutate("commit_push") }}
        onMarkDone={() => { setErr(null); setOverriding(false); approve.mutate("done") }}
        onCommit={() => { setErr(null); approve.mutate("commit") }}
        onCommitPush={() => { setErr(null); approve.mutate("commit_push") }}
      />
    </section>
  )
}
