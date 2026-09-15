import { useEffect, useState, useMemo, Fragment, useRef } from "react"
import { ArrowDownToLine, Check, ChevronDown, Copy, FileCheck2, Terminal } from "lucide-react"
import { toastGlobal, workerLog, type Task, type TaskEvent } from "../../api"

function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toastGlobal("Copied", "success")
      setTimeout(() => setCopied(false), 1400)
    } catch {
      toastGlobal("Copy failed", "error")
    }
  }
  return { copied, copy }
}

// ── ANSI → tailwind ──────────────────────────────────────────────
const FG: Record<string, string> = {
  "30": "text-zinc-600",
  "31": "text-red-400",
  "32": "text-emerald-400",
  "33": "text-amber-400",
  "34": "text-sky-400",
  "35": "text-fuchsia-400",
  "36": "text-cyan-400",
  "37": "text-zinc-200",
  "90": "text-zinc-500",
  "91": "text-red-300",
  "92": "text-emerald-300",
  "93": "text-amber-300",
  "94": "text-sky-300",
  "95": "text-fuchsia-300",
  "96": "text-cyan-300",
  "97": "text-white",
}
const BG: Record<string, string> = {
  "40": "bg-zinc-800",
  "41": "bg-red-500/20",
  "42": "bg-emerald-500/20",
  "43": "bg-amber-500/20",
  "44": "bg-sky-500/20",
  "45": "bg-fuchsia-500/20",
  "46": "bg-cyan-500/20",
  "47": "bg-white/10",
}

function ansiSpans(input: string) {
  const re = /\x1b\[([0-9;]*)m/g
  let last = 0
  let m: RegExpExecArray | null
  let fg = ""
  let bg = ""
  let bold = false
  let dim = false
  let ul = false
  const out: { text: string; cls: string }[] = []
  const push = (txt: string) => {
    if (!txt) return
    const cls = [fg, bg, bold ? "font-bold" : "", dim ? "opacity-65" : "", ul ? "underline decoration-dotted underline-offset-2" : ""]
      .filter(Boolean)
      .join(" ")
    out.push({ text: txt, cls })
  }
  while ((m = re.exec(input)) !== null) {
    push(input.slice(last, m.index))
    last = m.index + m[0].length
    const codes = (m[1] || "0").split(";")
    for (const c of codes) {
      if (c === "0" || c === "") {
        fg = ""
        bg = ""
        bold = false
        dim = false
        ul = false
      } else if (c === "1") bold = true
      else if (c === "2") dim = true
      else if (c === "4") ul = true
      else if (c === "22") {
        bold = false
        dim = false
      } else if (c === "24") ul = false
      else if (FG[c]) fg = FG[c]
      else if (BG[c]) bg = BG[c]
      else if (c === "39") fg = ""
      else if (c === "49") bg = ""
    }
  }
  push(input.slice(last))
  if (out.length === 0) out.push({ text: input, cls: "" })
  return out
}

function hasAnsi(s: string) {
  return s.includes("\x1b[")
}

// heuristics when no ANSI
function workerHint(line: string) {
  const l = line.toLowerCase()
  if (/(^|\W)(error|fail|failed|exception|panic|fatal)(\W|$)/.test(l) || line.includes("✗") || line.includes("×")) return "text-red-300"
  if (/(warn|warning)/.test(l)) return "text-amber-300"
  if (/(success|successful|completed|passed|pass|done|ok)\b/.test(l) || /[✓✔]/.test(line)) return "text-emerald-300"
  if (/^\s*(\$|>|›|→|•)/.test(line) || /^(npm|pnpm|go |cargo |hermes |git )/i.test(line.trim())) return "text-sky-300"
  if (/\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}/.test(line)) return "text-cyan-300/90"
  return ""
}

function ResultSpans({ line }: { line: string }) {
  // split keeping `code` and urls as tokens for coloring
  const parts = line.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (/^`[^`]+`$/.test(p)) {
          return (
            <span key={i} className="rounded bg-emerald-500/10 px-1 py-0.5 font-mono text-[12px] text-sky-700 ring-1 ring-sky-500/15 dark:bg-white/10 dark:text-sky-200">
              {p.slice(1, -1)}
            </span>
          )
        }
        // inside each part, highlight urls
        const urlParts = p.split(/(https?:\/\/\S+)/g)
        return (
          <Fragment key={i}>
            {urlParts.map((u, j) => {
              if (/^https?:\/\//.test(u)) {
                return (
                  <span key={j} className="text-sky-600 underline decoration-sky-500/30 underline-offset-2 dark:text-sky-300">
                    {u}
                  </span>
                )
              }
              // highlight file paths and numbers subtly
              // file paths: foo/bar.ts:12:3
              if (/^[\w./-]+\.[a-z]{1,5}(:\d+)?/.test(u.trim()) && u.includes(".")) {
                return (
                  <span key={j} className="text-violet-600 dark:text-violet-300">
                    {u}
                  </span>
                )
              }
              return <Fragment key={j}>{u}</Fragment>
            })}
          </Fragment>
        )
      })}
    </>
  )
}

function resultLineClass(line: string) {
  const t = line.trim()
  if (!t) return "text-[var(--color-ink-3)]"
  if (/^#{1,6}\s/.test(t)) return "text-emerald-700 dark:text-emerald-300 font-semibold"
  if (/^(✔|✓|✅|🎉|✨)/.test(t) || /success|completed|done/i.test(t) && /[✓✔]/.test(line)) return "text-emerald-600 dark:text-emerald-300"
  if (/^(✗|×|❌|fail|error)/i.test(t) || /error:/i.test(line)) return "text-red-600 dark:text-red-300"
  if (/^warn/i.test(t)) return "text-amber-600 dark:text-amber-300"
  if (/^╭─.*HERMES/.test(t) || /─{3,}/.test(t)) return "text-sky-600 dark:text-sky-300"
  if (/^[+\-]{3}|^diff --/.test(t)) return t.startsWith("+") ? "text-emerald-600 dark:text-emerald-300" : t.startsWith("-") ? "text-red-500 dark:text-red-300" : "text-zinc-500"
  if (/^\s*[-*•]\s/.test(line)) return "text-[var(--color-ink-2)]"
  return "text-[var(--color-ink)]"
}

export function WorkerLogPanel({ text, running, slug, taskId }: { text: string; running?: boolean; slug?: string; taskId?: string }) {
  const [open, setOpen] = useState(true)
  const [wrap, setWrap] = useState(true)
  const [liveText, setLiveText] = useState(text)
  const [follow, setFollow] = useState(false)
  const logViewportRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const initializedRef = useRef(false)
  const { copied, copy } = useCopy(liveText)

  useEffect(() => {
    if (!running) {
      setLiveText(text)
      offsetRef.current = 0
      initializedRef.current = false
    }
  }, [running, text])

  useEffect(() => {
    if (!follow) return
    const viewport = logViewportRef.current
    if (!viewport) return
    requestAnimationFrame(() => { viewport.scrollTop = viewport.scrollHeight })
  }, [follow, liveText])

  function toggleFollow() {
    const next = !follow
    setFollow(next)
    if (next) requestAnimationFrame(() => {
      const viewport = logViewportRef.current
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    })
  }

  useEffect(() => {
    initializedRef.current = false
    offsetRef.current = 0
  }, [slug, taskId])

  useEffect(() => {
    if (!running || !slug || !taskId) return
    let cancelled = false
    const read = async () => {
      try {
        const chunk = await workerLog(slug, taskId, offsetRef.current)
        if (cancelled) return
        if (!initializedRef.current) {
          setLiveText(chunk.text || text)
          initializedRef.current = true
        } else if (chunk.offset < offsetRef.current) {
          offsetRef.current = 0
          initializedRef.current = false
          setLiveText(chunk.text)
        } else if (chunk.text) {
          setLiveText((current) => current + chunk.text)
        }
        offsetRef.current = chunk.offset
      } catch { /* task status polling remains fallback */ }
    }
    void read()
    const timer = window.setInterval(read, 1200)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [running, slug, taskId, text])


  const lines = useMemo(() => liveText.split("\n"), [liveText])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/40 bg-[#0d1426] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2.5">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.35)]" />
          <span className="size-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]" />
          <span className="size-3 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]" />
        </span>
        <span className="ml-2 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">
          <Terminal className="size-3.5" /> Worker log
        </span>
        <span
          className={`ml-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${running ? "border-sky-400/30 bg-sky-500/15 text-sky-200" : "border-white/10 bg-white/5 text-zinc-400"}`}
        >
          <span className={`size-1.5 rounded-full ${running ? "bg-sky-400 animate-pulse" : "bg-zinc-500"}`} />
          {running ? "live" : "exited"}
        </span>
        <button
          type="button"
          onClick={toggleFollow}
          aria-pressed={follow}
          aria-label={follow ? "Stop following worker log" : "Follow worker log"}
          title={follow ? "Stop following worker log" : "Follow worker log to bottom"}
          className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-[10px] font-semibold uppercase tracking-wider transition-colors ${follow ? "border-sky-400/40 bg-sky-400/15 text-sky-200" : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"}`}
        >
          <ArrowDownToLine className={`size-3.5 ${follow ? "animate-pulse" : ""}`} />
          <span className="hidden sm:inline">{follow ? "following" : "follow"}</span>
        </button>
        <span className="ml-auto hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => setWrap((v) => !v)}
            className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
            title={wrap ? "wrap on" : "wrap off"}
          >
            {wrap ? "wrap" : "no-wrap"}
          </button>
          <button
            type="button"
            onClick={() => copy()}
            aria-label="Copy worker log"
            className="inline-flex size-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </span>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="ml-1 inline-flex h-7 items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-sky-200 hover:bg-sky-500/15"
        >
          <span className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}>▸</span>
          {open ? "hide" : "show"}
        </button>
      </div>

      {open ? (
        <div className="relative bg-[#090f1e]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/20 to-transparent" />
          <div
            ref={logViewportRef}
            onScroll={(event) => {
              const viewport = event.currentTarget
              const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
              if (distance > 48 && follow) setFollow(false)
            }}
            className={`overflow-auto ${wrap ? "" : "overflow-x-auto"} scroll-smooth`}
            style={{ maxHeight: "28rem" }}
          >
            <div className="flex min-w-0">
              <div
                aria-hidden
                className="sticky left-0 select-none border-r border-white/5 bg-[#0a1120] px-2 py-3 text-right font-mono text-[11px] leading-6 text-zinc-500"
              >
                {lines.map((_, i) => (
                  <div key={i} className="tabular-nums">
                    {i + 1}
                  </div>
                ))}
              </div>
              <pre
                className={`flex-1 p-3 font-mono text-[13px] leading-6 selection:bg-sky-500/30 selection:text-white ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
              >
                {lines.map((line, idx) => {
                  const ansi = hasAnsi(line)
                  const hint = !ansi ? workerHint(line) : ""
                  const segs = ansiSpans(line)
                  return (
                    <div key={idx} className={hint || "text-zinc-100"}>
                      {segs.map((s, k) => (
                        <span key={k} className={s.cls}>
                          {s.text}
                        </span>
                      ))}
                      {idx < lines.length - 1 ? "\n" : ""}
                    </div>
                  )
                })}
              </pre>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-white/5 bg-white/[0.02] px-3 py-2 sm:hidden">
            <button
              type="button"
              onClick={() => setWrap((v) => !v)}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[10px] text-zinc-300"
            >
              {wrap ? "wrap on" : "wrap off"}
            </button>
            <button
              type="button"
              onClick={() => copy()}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 font-mono text-[10px] text-zinc-300"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} copy
            </button>
          </div>
        </div>
      ) : (
        <p className="px-3 py-2.5 font-mono text-[11px] leading-relaxed text-zinc-400">Hidden — tap show.</p>
      )}
    </div>
  )
}

export function ResultPanel({ text, hasWorking, title, defaultOpen }: { text: string; hasWorking: boolean; title?: string; defaultOpen?: boolean }) {
  const [wrap, setWrap] = useState(true)
  const [open, setOpen] = useState(defaultOpen !== false)
  const { copied, copy } = useCopy(text)
  const lines = useMemo(() => text.split("\n"), [text])

  return (
    <div className="overflow-hidden rounded-xl border border-emerald-500/25 bg-[var(--color-surface-raised)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-2 border-b border-emerald-500/15 bg-emerald-500/[0.07] px-3 py-2.5">
        <button type="button" onClick={() => setOpen(v => !v)} className="flex min-w-0 items-center gap-1.5 text-left">
          <ChevronDown className={`size-3.5 shrink-0 text-emerald-500 transition-transform ${open ? "" : "-rotate-90"}`} />
          <span className="flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
            <FileCheck2 className="size-3.5" />
          </span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">{title || "Result"}</span>
        </button>
        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-200">
          pure output
        </span>
        <span className="ml-auto hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => setWrap((v) => !v)}
            className="rounded-full border border-emerald-500/15 bg-white px-2.5 py-1 font-mono text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 dark:bg-white/5 dark:text-emerald-200 dark:hover:bg-white/10"
          >
            {wrap ? "wrap" : "no-wrap"}
          </button>
          <button
            type="button"
            onClick={() => copy()}
            aria-label="Copy result"
            className="inline-flex size-7 items-center justify-center rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </span>
        <button
          type="button"
          onClick={() => copy()}
          aria-label="Copy result mobile"
          className="inline-flex size-7 items-center justify-center rounded-md border border-emerald-500/20 bg-white text-emerald-700 hover:bg-emerald-50 dark:bg-white/5 dark:text-emerald-200 sm:hidden"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      {open && (
        <div className="relative bg-[var(--color-bg)]/50 dark:bg-[#0a1410]/40">
          <div className="absolute bottom-0 left-0 top-0 w-[3px] bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]" />
          <pre
            className={`max-h-[30rem] overflow-auto p-4 pl-5 font-mono text-[13px] leading-6 tracking-[-0.01em] selection:bg-emerald-500/25 ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}
          >
            {lines.map((line, idx) => (
              <div key={idx} className={resultLineClass(line)}>
                <ResultSpans line={line} />
                {idx < lines.length - 1 ? "" : ""}
              </div>
            ))}
          </pre>
        </div>
      )}
      {!open && <p className="px-3 py-2 font-mono text-[11px] text-emerald-700/60 dark:text-emerald-200/60">Collapsed</p>}
      {!hasWorking && open && (
        <p className="border-t border-emerald-500/10 bg-emerald-500/[0.04] px-3 py-2 font-mono text-[11px] leading-relaxed text-emerald-700/60 dark:text-emerald-200/60">
          Single-block output — no separate working log detected for this task.
        </p>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-emerald-500/10 px-3 py-2 sm:hidden">
        <button
          type="button"
          onClick={() => setWrap((v) => !v)}
          className="rounded-full border border-emerald-500/15 bg-white px-2.5 py-1 font-mono text-[10px] text-emerald-700 dark:bg-white/5 dark:text-emerald-200"
        >
          {wrap ? "wrap on" : "wrap off"}
        </button>
      </div>
    </div>
  )
}

export function ResultStack({ task, events }: { task: Task; events: TaskEvent[] }) {
  const completedEvents = useMemo(() =>
    events.filter((e) => e.kind === "completed" && e.payload).reverse(),
    [events]
  )
  const results = useMemo(() => {
    const out: { index: number; text: string; outcome: string }[] = []
    const seen = new Set<string>()
    for (const ev of completedEvents) {
      try {
        const p = JSON.parse(ev.payload)
        const text = p.output || p.text || ""
        if (!text || seen.has(text)) continue
        seen.add(text)
        out.push({ index: out.length + 1, text, outcome: p.outcome || "success" })
      } catch { /* skip malformed */ }
    }
    if (task.result && !seen.has(task.result)) {
      out.push({ index: out.length + 1, text: task.result, outcome: "latest" })
    }
    return out
  }, [completedEvents, task.result])

  if (!results.length) return null

  return (
    <div className="space-y-2">
      <h4 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-emerald-300">Results · {results.length}</h4>
      {results.map((r, i) => (
        <ResultPanel key={i} text={r.text} hasWorking={false} title={`Result ${r.index} · ${r.outcome}`} defaultOpen={i === results.length - 1} />
      ))}
    </div>
  )
}

export function ResultEmpty({ running }: { running?: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-3">
      <p className="flex items-center gap-1.5 font-mono text-[12px] leading-relaxed text-emerald-700/70 dark:text-emerald-200/60">
        <FileCheck2 className="size-3.5" />
        {running ? "Worker still running — pure result will appear here when the HERMES block completes." : "No result yet."}
      </p>
    </div>
  )
}
