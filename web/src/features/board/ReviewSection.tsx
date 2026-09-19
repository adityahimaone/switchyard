import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { api, toastGlobal, type Task } from "../../api"
import { Check, ChevronDown, Copy, FileCode2, Loader2, Minus, Plus } from "lucide-react"

type DiffLine = { type: "context" | "added" | "removed"; oldLine?: number; newLine?: number; content: string }
type DiffFile = { name: string; lines: DiffLine[] }
type ReviewMetadata = { provenance?: string[]; codegraph?: string }

export function parseDiffFiles(raw: string): DiffFile[] {
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
  return files.length ? files : [{ name: "workspace changes", lines: raw ? raw.split("\n").map((content) => ({ type: "context" as const, content })) : [] }]
}

function DiffDisclosure({ file, complete, copyText, selected, onToggle }: { file: DiffFile; complete: boolean; copyText: string; selected: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const added = file.lines.filter((line) => line.type === "added").length
  const removed = file.lines.filter((line) => line.type === "removed").length
  async function copy() {
    await navigator.clipboard.writeText(copyText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }
  return (
    <section className={`overflow-hidden rounded-lg border bg-black/10 ${selected ? "border-emerald-500/30" : "border-[var(--color-line)]"}`}>
      <div className={`flex items-center gap-2 border-b px-3 py-2 ${selected ? "border-emerald-500/20 bg-emerald-500/5" : "border-[var(--color-line)] bg-white/[0.025]"}`}>
        <input type="checkbox" checked={selected} onChange={onToggle} className="size-3.5 accent-violet-500" aria-label={`Select ${file.name}`} />
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs text-neutral-200">
          <ChevronDown className={`size-3.5 shrink-0 text-neutral-500 transition-transform ${open ? "" : "-rotate-90"}`} />
          <FileCode2 className="size-3.5 shrink-0 text-violet-300" />
          <span className="truncate font-mono" title={file.name}>{file.name}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
            <span className="text-emerald-300">+{added}</span><span className="text-rose-300">-{removed}</span>
          </span>
        </button>
        <button type="button" onClick={copy} className="rounded p-1 text-neutral-500 hover:bg-white/10 hover:text-neutral-200" title="Copy diff">
          {copied ? <Check className="size-3.5 text-emerald-300" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      {open && <div className="max-h-72 overflow-auto py-1 font-mono text-[11px] leading-5">
        {file.lines.map((line, index) => (
          <div key={`${file.name}-${index}`} className={`grid grid-cols-[2.5rem_2.5rem_1.25rem_minmax(0,1fr)] ${line.type === "added" ? "bg-emerald-500/10 text-emerald-100" : line.type === "removed" ? "bg-rose-500/10 text-rose-100" : "text-neutral-400"}`}>
            <span className="select-none pr-2 text-right text-neutral-600">{line.oldLine ?? ""}</span>
            <span className="select-none pr-2 text-right text-neutral-600">{line.newLine ?? ""}</span>
            <span className={`select-none text-center ${line.type === "added" ? "text-emerald-300" : line.type === "removed" ? "text-rose-300" : "text-neutral-600"}`}>{line.type === "added" ? <Plus className="mx-auto size-3" /> : line.type === "removed" ? <Minus className="mx-auto size-3" /> : " "}</span>
            <span className="whitespace-pre-wrap break-words pr-3">{line.content || " "}</span>
          </div>
        ))}
        {!file.lines.length && <p className="px-3 py-4 text-neutral-600">No textual lines returned.</p>}
      </div>}
      {!open && complete && <div className="px-3 py-1.5 text-[10px] text-neutral-600">Diff collapsed · click file to expand</div>}
    </section>
  )
}

export function ReviewSection({ slug, task, onDone }: { slug: string; task: Task; onDone: () => void }) {
  const qc = useQueryClient()
  const [action, setAction] = useState<"done" | "commit" | "commit_push" | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const diff = useQuery({
    queryKey: ["diff", slug, task.id],
    queryFn: () => api<{ stat: string; diff: string; clean: boolean } & ReviewMetadata>(`/api/boards/${slug}/tasks/${task.id}/diff`),
    enabled: task.status === "review",
    retry: false,
  })

  const files = useMemo(() => parseDiffFiles(diff.data?.diff || ""), [diff.data?.diff])
  const complete = !diff.isLoading
  const additions = files.flatMap((file) => file.lines).filter((line) => line.type === "added").length
  const removals = files.flatMap((file) => file.lines).filter((line) => line.type === "removed").length

  // init select all on load
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
  function selectAll() { setSelected(new Set(allNames)) }
  function invert() {
    setSelected((prev) => {
      const next = new Set<string>()
      for (const n of allNames) if (!prev.has(n)) next.add(n)
      return next
    })
  }

  // when files first arrive, default select all once
  useEffect(() => {
    if (diff.data && !diff.data.clean && files.length && selected.size === 0) {
      setSelected(new Set(allNames))
    }
  }, [diff.data, files.length, allNames.join("|")])

  const approve = useMutation({
    mutationFn: (a: "done" | "commit" | "commit_push") => {
      const body: Record<string, unknown> = { action: a }
      if (a !== "done" && selectedCount > 0 && selectedCount < files.length) body.files = [...selected]
      // when all selected, omit files => backend does git add -A (same result, cheaper)
      return api<{ status: string }>(`/api/boards/${slug}/tasks/${task.id}/approve`, {
        method: "POST",
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      toastGlobal("Review action completed", "success")
      qc.invalidateQueries({ queryKey: ["tasks", slug] })
      qc.invalidateQueries({ queryKey: ["events", slug, task.id] })
      onDone()
    },
    onError: (e: Error) => setErr(e.message),
  })

  if (task.status !== "review") return null

  return (
    <div className="glass-inset-card overflow-hidden rounded-xl border border-violet-500/30">
      <div className="border-b border-violet-500/15 bg-violet-500/[0.06] px-3 py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronDown className={`size-4 shrink-0 text-violet-300 transition-transform ${open ? "" : "-rotate-90"}`} />
            <div className="min-w-0"><h3 className="text-xs font-semibold text-violet-200">Review changes</h3><p className="mt-0.5 truncate font-mono text-[10px] text-neutral-500">{diff.data?.stat.split("\n")[0] || "workspace diff"}</p></div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
            {diff.isLoading && <Loader2 className="size-3 animate-spin text-violet-300" />}
            <span className="text-neutral-500">{files.length} files</span>
            <span className="text-emerald-300">+{additions}</span>
            <span className="text-rose-300">-{removals}</span>
          </div>
        </div>
      </div>
      {open && <div className="space-y-2 p-2">
        {(diff.data?.codegraph || (diff.data?.provenance?.length ?? 0) > 0) && (
          <details className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] px-3 py-2">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-sky-200">Execution provenance</summary>
            <div className="mt-2 space-y-1 font-mono text-[10px] text-neutral-400">
              <p><span className="text-neutral-600">CodeGraph:</span> {diff.data?.codegraph || "skipped or unavailable"}</p>
              {(diff.data?.provenance ?? []).map((line, index) => <p key={`${line}-${index}`} className="break-all"><span className="text-neutral-600">Worker:</span> {line}</p>)}
            </div>
          </details>
        )}
        {!diff.data?.clean && !diff.isLoading && files.length > 1 && (
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={selectAll} disabled={allSelected} className="h-6 px-2 text-[10px]">Select all</Button>
            <Button variant="outline" size="sm" onClick={invert} className="h-6 px-2 text-[10px]">Invert</Button>
            <span className="ml-auto font-mono text-[10px] text-neutral-500">{selectedCount} selected → {selectedCount === files.length ? "all files" : `${selectedCount} files`} will be committed</span>
          </div>
        )}
        {!diff.data?.clean && !diff.isLoading && <p className="font-mono text-[10px] text-neutral-600">Commit adds only checked files: git add -- &lt;checked&gt; && git commit</p>}
        {err && <p className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">{err}</p>}
        {diff.error && <p className="rounded border border-red-500/20 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">Gagal load diff: {(diff.error as Error).message}</p>}
        {diff.isLoading ? <div className="flex items-center gap-2 px-2 py-8 font-mono text-[11px] text-neutral-500"><Loader2 className="size-3 animate-spin" /> Loading file changes…</div> : diff.data?.clean ? <p className="px-2 py-6 text-center text-[11px] text-neutral-500">No workspace changes.</p> : files.map((file) => <DiffDisclosure key={file.name} file={file} complete={complete} copyText={file.lines.map((line) => line.content).join("\n")} selected={selected.has(file.name)} onToggle={() => toggle(file.name)} />)}
      </div>}
      {/* approve bar at card bottom — matches /prototype foot */}
      <div className="flex items-center gap-1.5 border-t border-violet-500/15 bg-violet-500/[0.04] px-3 py-2.5">
        {diff.data?.clean ? (
          <>
            <span className="font-mono text-[10px] text-neutral-500">No workspace changes — ready to close.</span>
            <Button size="sm" disabled={approve.isPending || diff.isLoading} onClick={() => { setErr(null); approve.mutate("done") }} className="ml-auto h-8 gap-1 bg-violet-500 text-white hover:bg-violet-400">{approve.isPending ? <Loader2 className="size-3 animate-spin" /> : null} Mark done</Button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <Select value={action ?? ""} onValueChange={(v) => setAction(v as "commit" | "commit_push")}>
                <SelectTrigger className="h-8 w-full border-[var(--color-line)] bg-[var(--color-surface)] text-[11px]"><SelectValue placeholder="Pilih aksi…" /></SelectTrigger>
                <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="commit" className="text-xs">Commit</SelectItem><SelectItem value="commit_push" className="text-xs">Commit & Push</SelectItem></SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!action || approve.isPending || selectedCount === 0 || diff.isLoading}
              onClick={() => { setErr(null); approve.mutate(action!) }}
              className="h-8 shrink-0 gap-1 bg-violet-500 text-white hover:bg-violet-400"
            >
              {approve.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
              {selectedCount > 0 && selectedCount < files.length ? `Commit (${selectedCount})` : "Approve"}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
