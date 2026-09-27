import { useEffect, useState, useMemo, Fragment, useRef } from "react"
import { ArrowDownToLine, BrainCircuit, Check, ChevronDown, Copy, CornerDownRight, FileCheck2, Layers3, Terminal, WrapText } from "lucide-react"
import { toastGlobal, workerLog, type Task, type TaskEvent } from "../../api"
import { AgentMarkdown } from "./AgentMarkdown"

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

function prettyJSONLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return null
  }
}

function prettyJSONText(text: string) {
  const whole = prettyJSONLine(text)
  if (whole) return whole
  return text.split("\n").flatMap((line) => prettyJSONLine(line)?.split("\n") ?? [line]).join("\n")
}

// heuristics when no ANSI
function workerHint(line: string) {
  const l = line.toLowerCase()
  if (/(^|\W)(error|fail|failed|exception|panic|fatal)(\W|$)/.test(l) || line.includes("✗") || line.includes("×")) return "text-danger-text"
  if (/(warn|warning)/.test(l)) return "text-warning"
  if (/(success|successful|completed|passed|pass|done|ok)\b/.test(l) || /[✓✔]/.test(line)) return "text-success"
  if (/^\s*(\$|>|›|→|•)/.test(line) || /^(npm|pnpm|go |cargo |hermes |git )/i.test(line.trim())) return "text-[var(--color-info)]"
  if (/\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}/.test(line)) return "text-ink-4"
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
            <span key={i} className="rounded border border-[var(--color-line)] bg-[var(--color-line)]/40 px-1 font-mono text-meta text-[var(--color-info)]">
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
                  <a
                    key={j}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-[var(--color-info)] underline decoration-[var(--color-line-strong)] underline-offset-2"
                  >
                    {u}
                  </a>
                )
              }
              // file paths: foo/bar.ts:12:3
              if (/^[\w./-]+\.[a-z]{1,5}(:\d+)?/.test(u.trim()) && u.includes(".")) {
                return (
                  <span key={j} className="text-violet-300">
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
  if (!t) return "text-ink-4"
  if (/^#{1,6}\s/.test(t)) return "font-semibold text-ink"
  if (/^(✔|✓|✅|🎉|✨)/.test(t) || (/success|completed|done/i.test(t) && /[✓✔]/.test(line))) return "text-success"
  if (/^(✗|×|❌|fail|error)/i.test(t) || /error:/i.test(line)) return "text-danger-text"
  if (/^warn/i.test(t)) return "text-warning"
  if (/^╭─.*HERMES/.test(t) || /─{3,}/.test(t)) return "text-[var(--color-info)]"
  if (/^[\+\-]{3}|^diff --/.test(t)) {
    return t.startsWith("+")
      ? "text-success"
      : t.startsWith("-")
        ? "text-danger-text"
        : "text-ink-4"
  }
  if (/^\s*[-*•]\s/.test(line)) return "text-ink-2"
  return "text-ink-2"
}

// ──────────────────────────────────────────────────────────────────────
// DSH log structured view
// ──────────────────────────────────────────────────────────────────────

interface ParsedDshLog {
  meta: {
    sessionId?: string
    cwd?: string
    workspace?: string
  }
  events: Array<{
    kind: "turn" | "step" | "thinking" | "text" | "final" | "raw"
    turn?: number
    step?: number
    text?: string
    usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; cacheReadTokens?: number }
    rawLine?: string
    collapsed?: boolean
  }>
  isDsh: boolean
}

export function parseHarnessLogEvents(raw: string): ParsedDshLog {
  const lines = raw.split("\n")
  const events: ParsedDshLog["events"] = []
  const meta: ParsedDshLog["meta"] = {}
  let isDsh = false
  let currentTurn: number | null = null
  let currentStep: number | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Check for provenance line
    if (trimmed.startsWith("provenance executor=dsh") || trimmed.startsWith("provenance executor=commandcode")) {
      isDsh = true
      const wsMatch = trimmed.match(/ws=([^\s]+)/)
      const sessionMatch = trimmed.match(/(?:dsh_session_id|commandcode_session_id)=([^\s]+)/)
      const cwdMatch = trimmed.match(/dsh_session_cwd=([^\s]+)/)
      if (wsMatch) meta.workspace = wsMatch[1]
      if (sessionMatch) meta.sessionId = sessionMatch[1]
      if (cwdMatch) meta.cwd = cwdMatch[1]
      continue
    }
    // Provenance proof markers (duplicate provenance, EXECUTOR_PROOF) — meta already captured
    if (trimmed.startsWith("provenance ") || trimmed.startsWith("EXECUTOR_PROOF=")) {
      if (isDsh) continue
    }

    // Try parse JSON
    let parsed: Record<string, unknown> | null = null
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        parsed = JSON.parse(trimmed) as Record<string, unknown>
      } catch {
        // not valid JSON
      }
    }

    if (!parsed) {
      events.push({ kind: "raw", rawLine: trimmed })
      continue
    }

    const type = parsed.type
    if (type === "session") {
      isDsh = true
      if (typeof parsed.sessionId === "string") meta.sessionId = parsed.sessionId
      if (typeof parsed.cwd === "string") meta.cwd = parsed.cwd
      continue
    }
    if (type === "status") {
      isDsh = true
      const phase = parsed.phase
      const turn = typeof parsed.turn === "number" ? parsed.turn : undefined
      const step = typeof parsed.step === "number" ? parsed.step : undefined
      // eslint-friendly usage narrowing
      const usageRaw = parsed.usage
      const usage = usageRaw && typeof usageRaw === "object" ? usageRaw as Record<string, unknown> : undefined
      const usageNum = (key: string) => {
        const v = usage?.[key]
        return typeof v === "number" ? v : undefined
      }
      if (phase === "turn_start") {
        currentTurn = turn ?? null
        events.push({ kind: "turn", turn: currentTurn ?? undefined })
      } else if (phase === "step_start") {
        currentStep = step ?? null
        events.push({ kind: "step", turn, step: currentStep ?? undefined })
      } else if (phase === "step_end") {
        events.push({
          kind: "text",
          turn,
          step,
          text: `✓ step ${step ?? "?"} · ${usageNum("inputTokens") ?? 0} in / ${usageNum("outputTokens") ?? 0} out / total ${usageNum("totalTokens") ?? 0}${usageNum("cacheReadTokens") ? ` (cache ${usageNum("cacheReadTokens")})` : ""}`,
        })
      } else if (phase === "turn_end") {
        events.push({ kind: "text", turn, text: "✓ turn complete" })
      }
      continue
    }
    if (type === "thinking") {
      isDsh = true
      events.push({
        kind: "thinking",
        turn: currentTurn ?? undefined,
        step: currentStep ?? undefined,
        text: typeof parsed.text === "string" ? parsed.text : "",
        collapsed: true,
      })
      continue
    }
    if (type === "text") {
      isDsh = true
      events.push({
        kind: "text",
        turn: currentTurn ?? undefined,
        step: currentStep ?? undefined,
        text: typeof parsed.text === "string" ? parsed.text : "",
      })
      continue
    }
    if (type === "final") {
      isDsh = true
      events.push({
        kind: "final",
        turn: currentTurn ?? undefined,
        text: typeof parsed.text === "string" ? parsed.text : "",
      })
      continue
    }
    // Command Code streams progress as {"type":"event","event":{…}} wrappers and
    // closes with a single {"type":"result"} frame.
    if (type === "event") {
      isDsh = true
      const inner = parsed.event
      const innerObj = inner && typeof inner === "object" ? inner as Record<string, unknown> : undefined
      const toolName = typeof innerObj?.toolName === "string" ? innerObj.toolName : undefined
      const description = typeof innerObj?.description === "string" ? innerObj.description : undefined
      const innerType = typeof innerObj?.type === "string" ? innerObj.type : undefined
      const label = [innerType, toolName, description].filter(Boolean).join(" · ") || "event"
      events.push({ kind: "text", turn: currentTurn ?? undefined, step: currentStep ?? undefined, text: `• ${label}` })
      continue
    }
    if (type === "result") {
      isDsh = true
      if (typeof parsed.sessionId === "string") meta.sessionId = parsed.sessionId
      const finalText = typeof parsed.finalText === "string" ? parsed.finalText : ""
      if (finalText) {
        events.push({ kind: "final", turn: currentTurn ?? undefined, text: finalText })
      }
      continue
    }
    if (typeof type === "string") {
      // unknown DSH event type
      isDsh = true
      events.push({ kind: "raw", rawLine: trimmed })
      continue
    }
    // Non-DSH line
    events.push({ kind: "raw", rawLine: trimmed })
  }

  return { meta, events, isDsh }
}

function DshLogTimeline({ events, meta }: { events: ParsedDshLog["events"]; meta: ParsedDshLog["meta"] }) {
  return (
    <div className="space-y-1">
      {meta.sessionId && (
        <dl className="mb-2 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-[var(--color-line)] bg-[var(--color-line)]/20 px-2.5 py-1.5">
          {[
            ["Session", meta.sessionId, "max-w-[14rem]"],
            ["Workspace", meta.workspace?.split("/").pop(), "max-w-[10rem]"],
            ["CWD", meta.cwd, "max-w-[14rem]"],
          ].filter(([, value]) => value).map(([label, value, maxW]) => (
            <div key={label as string} className="flex min-w-0 items-baseline gap-1.5">
              <dt className="shrink-0 text-2xs text-ink-4">{label}</dt>
              <dd className={`truncate font-mono text-meta text-ink-2 ${maxW}`} title={value as string}>{value as string}</dd>
            </div>
          ))}
        </dl>
      )}
      {events.map((event, idx) => {
        switch (event.kind) {
          case "turn":
            return (
              <div key={idx} className="mt-3 mb-1 flex items-center gap-2 first:mt-0">
                <span className="rounded border border-[var(--color-line)] bg-[var(--color-line)]/30 px-1.5 py-0.5 font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">
                  Turn {event.turn}
                </span>
                <span className="h-px flex-1 bg-[var(--color-line)]" aria-hidden />
              </div>
            )
          case "step":
            return (
              <div key={idx} className="flex items-center gap-1.5 py-0.5 pl-1 text-meta text-ink-4">
                <CornerDownRight className="size-3 shrink-0" aria-hidden />
                Step {event.step}
              </div>
            )
          case "thinking":
            return (
              <div key={idx} className="pl-4">
                <CollapsibleThinking text={event.text ?? ""} defaultCollapsed={event.collapsed ?? true} />
              </div>
            )
          case "text": {
            const isTick = event.text?.startsWith("✓")
            return (
              <div key={idx} className={isTick ? "pl-4 font-mono text-meta text-success" : "pl-4"}>
                <LogLine line={event.text ?? ""} />
              </div>
            )
          }
          case "final":
            return (
              <div key={idx} className="mt-2 mb-1 rounded-md border border-[var(--color-line-strong)] bg-[var(--color-accent-tint)] px-2.5 py-2">
                <p className="mb-1 text-2xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent)]">Answer</p>
                <p className="whitespace-pre-wrap break-words text-body leading-relaxed text-ink-2">{event.text}</p>
              </div>
            )
          case "raw":
            return <LogLine key={idx} line={event.rawLine ?? ""} />
        }
      })}
    </div>
  )
}

function CollapsibleThinking({ text, defaultCollapsed }: { text: string; defaultCollapsed: boolean }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  const preview = text.length > 80 ? `${text.slice(0, 80).trimEnd()}…` : text.trim()
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-mx-1.5 flex h-7 w-[calc(100%+0.75rem)] items-center gap-1.5 rounded px-1.5 text-left transition-colors hover:bg-[var(--color-line)]/40"
      >
        <BrainCircuit className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        <span className="shrink-0 text-2xs italic text-ink-4">thinking</span>
        {!open && preview && <span className="min-w-0 flex-1 truncate text-2xs text-ink-4/80">{preview}</span>}
      </button>
      {open && (
        <p className="whitespace-pre-wrap break-words border-l-2 border-[var(--color-line)] py-1 pl-3 text-meta italic leading-relaxed text-ink-3">
          {text}
        </p>
      )}
    </div>
  )
}

function LogLine({ line }: { line: string }) {
  const ansi = hasAnsi(line)
  const hint = !ansi ? workerHint(line) : ""
  const segs = ansiSpans(line)
  return (
    <div className={`font-mono text-meta leading-5 ${hint || "text-ink-2"}`}>
      {segs.map((s, k) => (
        <span key={k} className={s.cls}>
          {s.text}
        </span>
      ))}
    </div>
  )
}

export function WorkerLogPanel({ text, running, slug, taskId }: { text: string; running?: boolean; slug?: string; taskId?: string }) {
  const [open, setOpen] = useState(true)
  const [wrap, setWrap] = useState(true)
  const [dshView, setDshView] = useState<"structured" | "raw">("structured")
  const [liveText, setLiveText] = useState(text)
  const [follow, setFollow] = useState(false)
  const logViewportRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const initializedRef = useRef(false)
  const { copied, copy } = useCopy(liveText)

  const dshLog = useMemo(() => parseHarnessLogEvents(liveText), [liveText])
  const isDsh = dshLog.isDsh && dshLog.events.some((e) => e.kind !== "raw")
  const effectiveView = isDsh ? dshView : "raw"

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


  const lines = useMemo(() => liveText.split("\n").flatMap((line) => prettyJSONLine(line)?.split("\n") ?? [line]), [liveText])

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-line)] bg-[var(--color-line)]/30 px-3 py-2">
        <Terminal className="size-3.5 shrink-0 text-ink-4" aria-hidden />
        <h4 className="text-meta font-semibold text-ink">Worker log</h4>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs ${
            running
              ? "border-[var(--color-line-strong)] bg-[var(--color-accent-tint)] text-[var(--color-accent)]"
              : "border-[var(--color-line)] text-ink-4"
          }`}
        >
          <span className={`size-1.5 rounded-full ${running ? "bg-[var(--color-accent)]" : "bg-ink-4"}`} aria-hidden />
          {running ? "live" : "exited"}
        </span>
        <span className="text-2xs tabular-nums text-ink-4">{lines.length} lines</span>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {isDsh && (
            <button
              type="button"
              aria-pressed={effectiveView === "structured"}
              onClick={() => setDshView((v) => (v === "structured" ? "raw" : "structured"))}
              title={effectiveView === "structured" ? "Switch to raw JSONL" : "Switch to structured view"}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs transition-colors ${
                effectiveView === "structured"
                  ? "bg-[var(--color-accent-tint)] text-[var(--color-accent)]"
                  : "text-ink-4 hover:bg-[var(--color-line)]/50 hover:text-ink-2"
              }`}
            >
              <Layers3 className="size-3.5" />
              <span className="hidden sm:inline">{effectiveView === "structured" ? "structured" : "raw"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={toggleFollow}
            aria-pressed={follow}
            aria-label={follow ? "Stop following worker log" : "Follow worker log"}
            title={follow ? "Stop following worker log" : "Follow worker log to the bottom"}
            className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs transition-colors ${
              follow
                ? "bg-[var(--color-accent-tint)] text-[var(--color-accent)]"
                : "text-ink-4 hover:bg-[var(--color-line)]/50 hover:text-ink-2"
            }`}
          >
            <ArrowDownToLine className="size-3.5" />
            <span className="hidden sm:inline">follow</span>
          </button>
          <button
            type="button"
            aria-pressed={wrap}
            onClick={() => setWrap((v) => !v)}
            aria-label={wrap ? "Disable line wrap" : "Enable line wrap"}
            title={wrap ? "Disable line wrap" : "Enable line wrap"}
            className={`inline-flex size-7 items-center justify-center rounded-md transition-colors ${
              wrap
                ? "bg-[var(--color-accent-tint)] text-[var(--color-accent)]"
                : "text-ink-4 hover:bg-[var(--color-line)]/50 hover:text-ink-2"
            }`}
          >
            <WrapText className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => copy()}
            aria-label="Copy worker log"
            title="Copy worker log"
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-[var(--color-line)]/50 hover:text-ink-2"
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </button>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse worker log" : "Expand worker log"}
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-[var(--color-line)]/50 hover:text-ink-2"
          >
            <ChevronDown className={`size-3.5 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="bg-[var(--color-void)]">
          <div
            ref={logViewportRef}
            onScroll={(event) => {
              const viewport = event.currentTarget
              const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight
              if (distance > 48 && follow) setFollow(false)
            }}
            className="overflow-auto"
            style={{ maxHeight: "28rem" }}
          >
            {effectiveView === "structured" ? (
              <div className="p-3">
                <DshLogTimeline events={dshLog.events} meta={dshLog.meta} />
              </div>
            ) : (
              <div className="flex min-w-0">
                <div
                  aria-hidden
                  className="sticky left-0 shrink-0 select-none border-r border-[var(--color-line)] bg-[var(--color-void)] px-2 py-3 text-right font-mono text-2xs leading-5 text-ink-4"
                >
                  {lines.map((_, i) => (
                    <div key={i} className="tabular-nums">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <pre
                  className={`min-w-0 flex-1 p-3 font-mono text-meta leading-5 ${
                    wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                  }`}
                >
                  {lines.map((line, idx) => {
                    const ansi = hasAnsi(line)
                    const hint = !ansi ? workerHint(line) : ""
                    const segs = ansiSpans(line)
                    return (
                      <div key={idx} className={hint || "text-ink-2"}>
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
            )}
          </div>
        </div>
      ) : (
        <p className="px-3 py-2.5 text-meta text-ink-4">Log collapsed. {lines.length} lines available.</p>
      )}
    </div>
  )
}

type DshResult = {
  provenance?: { workspace?: string; sessionId?: string; cwd?: string; bin?: string; args?: string }
  answer: string
  events: { type: string; text?: string; phase?: string; label?: string }[]
}

// parseHarnessResult handles both continuity harnesses. dsh emits flat
// {type,text} events; Command Code emits {"type":"event"} progress wrappers plus a
// single terminal {"type":"result"} frame carrying finalText and sessionId.
export function parseHarnessResult(raw: string, executor: Task["executor"]): DshResult {
  const provenancePrefix = executor === "commandcode" ? "provenance executor=commandcode" : "provenance executor=dsh"
  const lines = raw.split("\n")
  const provenanceLine = lines.find((line) => line.startsWith(provenancePrefix)) ?? ""
  const field = (name: string) => provenanceLine.match(new RegExp(`${name}=([^\\s]+)`))?.[1]
  const events: DshResult["events"] = []
  const answer: string[] = []
  const finals: string[] = []
  let resultSessionId: string | undefined
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as DshResult["events"][number]
      if (!event || typeof event.type !== "string") continue
      events.push(event)
      if (event.type === "result") {
        // Command Code's terminal frame carries the answer and the session id.
        const frame = event as unknown as { sessionId?: string; finalText?: string }
        if (typeof frame.sessionId === "string" && frame.sessionId) resultSessionId = frame.sessionId
        if (typeof frame.finalText === "string" && frame.finalText) finals.push(frame.finalText)
        continue
      }
      if (event.type === "event") continue // progress wrapper, never part of the answer
      if (event.type === "final" && event.text) finals.push(event.text)
      else if (event.type === "text" && event.text) answer.push(event.text)
    } catch { /* provenance and proof lines are intentionally not JSON */ }
  }
  return {
      provenance: provenanceLine ? {
        workspace: field("ws"),
        sessionId: field("commandcode_session_id") ?? field("dsh_session_id") ?? resultSessionId,
        cwd: field("dsh_session_cwd"),
        bin: field("bin"),
        args: provenanceLine.match(/args=(\[.*?\])\s+ws=/)?.[1],
      } : undefined,
      answer: (finals.length ? finals[finals.length - 1] : answer.join("\n\n").trim()) || "No final answer text returned. Open raw trace to inspect the run.",
      events,
    }
}

function DshResultPanel({ text, hasWorking, title, defaultOpen, executor }: { text: string; hasWorking: boolean; title?: string; defaultOpen?: boolean; executor?: Task["executor"] }) {
  const [open, setOpen] = useState(defaultOpen !== false)
  const [traceOpen, setTraceOpen] = useState(false)
  const { copied, copy } = useCopy(text)
  const parsed = useMemo(() => parseHarnessResult(text, executor ?? "dsh"), [text, executor])
  const harnessName = executor === "commandcode" ? "Command Code" : "DeepSeek Harness"
  const trace = parsed.events.filter((event) => event.type !== "text")
  const answer = parsed.answer || "No final answer text returned. Open raw trace to inspect the run."
  const panelId = `result-panel-${title || harnessName}`

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-line)]/30 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 items-center gap-1.5 rounded text-left"
        >
          <ChevronDown className={`size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          <span className="flex size-6 items-center justify-center rounded-md bg-[var(--color-accent-tint)] text-[var(--color-accent)]">
            <BrainCircuit className="size-3.5" />
          </span>
          <span className="truncate text-meta font-semibold text-ink">{title || `${harnessName} answer`}</span>
        </button>
        <span className="rounded-full border border-[var(--color-line)] px-2 py-0.5 text-2xs text-ink-4">{harnessName}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <span className="hidden text-2xs tabular-nums text-ink-4 sm:inline">{trace.length} trace events</span>
          <button
            type="button"
            onClick={() => copy()}
            aria-label="Copy raw result"
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-[var(--color-line)]/50 hover:text-ink-2"
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id={panelId} className="p-3">
          {parsed.provenance && (
            <dl className="mb-3 grid gap-x-4 gap-y-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-line)]/20 p-2.5 sm:grid-cols-2">
              {[
                ["Session", parsed.provenance.sessionId],
                ["Workspace", parsed.provenance.workspace],
                ["CWD", parsed.provenance.cwd],
                ["Binary", parsed.provenance.bin],
              ].filter(([, value]) => value).map(([label, value]) => (
                <div key={label as string} className="min-w-0">
                  <dt className="text-2xs text-ink-4">{label}</dt>
                  <dd className="truncate font-mono text-meta text-ink-2" title={value as string}>{value as string}</dd>
                </div>
              ))}
            </dl>
          )}

          <AgentMarkdown text={answer} />

          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-line)] pt-2.5">
            <button
              type="button"
              aria-expanded={traceOpen}
              onClick={() => setTraceOpen((value) => !value)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-2xs text-ink-4 transition-colors hover:bg-[var(--color-line)]/50 hover:text-ink-2"
            >
              <Layers3 className="size-3.5" />
              {traceOpen ? "Hide raw trace" : "Show raw trace"}
            </button>
            {hasWorking && <span className="text-2xs text-ink-4">Working trace is in the worker log above.</span>}
          </div>
          {traceOpen && (
            <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-[var(--color-line)] bg-[var(--color-void)] p-3 font-mono text-meta leading-relaxed text-ink-2">
              {text}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export function ResultPanel({ text, hasWorking, title, defaultOpen, executor }: { text: string; hasWorking: boolean; title?: string; defaultOpen?: boolean; executor?: Task["executor"] }) {
  if (executor === "dsh" || executor === "commandcode") return <DshResultPanel text={text} hasWorking={hasWorking} title={title} defaultOpen={defaultOpen} executor={executor} />
  const [wrap, setWrap] = useState(true)
  const [open, setOpen] = useState(defaultOpen !== false)
  const formattedText = useMemo(() => prettyJSONText(text), [text])
  const { copied, copy } = useCopy(formattedText)
  const lines = useMemo(() => formattedText.split("\n"), [formattedText])
  const panelId = `result-panel-${title || "result"}`

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-line)]/30 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 items-center gap-1.5 rounded text-left"
        >
          <ChevronDown className={`size-3.5 shrink-0 text-ink-4 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          <span className="flex size-6 items-center justify-center rounded-md bg-[var(--color-accent-tint)] text-[var(--color-accent)]">
            <FileCheck2 className="size-3.5" />
          </span>
          <span className="truncate text-meta font-semibold text-ink">{title || "Result"}</span>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-pressed={wrap}
            onClick={() => setWrap((v) => !v)}
            className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-2xs transition-colors ${
              wrap
                ? "bg-[var(--color-accent-tint)] text-[var(--color-accent)]"
                : "text-ink-4 hover:bg-[var(--color-line)]/50 hover:text-ink-2"
            }`}
          >
            <WrapText className="size-3.5" />
            <span className="hidden sm:inline">wrap</span>
          </button>
          <button
            type="button"
            onClick={() => copy()}
            aria-label="Copy result"
            className="inline-flex size-7 items-center justify-center rounded-md text-ink-4 transition-colors hover:bg-[var(--color-line)]/50 hover:text-ink-2"
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </div>
      {open ? (
        <div id={panelId} className="relative bg-[var(--color-void)]">
          <div className="absolute inset-y-0 left-0 w-0.5 bg-[var(--color-accent)]/50" aria-hidden />
          <pre
            className={`max-h-[30rem] overflow-auto py-3 pl-4 pr-3 font-mono text-body leading-relaxed ${
              wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
            }`}
          >
            {lines.map((line, idx) => (
              <div key={idx} className={resultLineClass(line)}>
                <ResultSpans line={line} />
              </div>
            ))}
          </pre>
        </div>
      ) : (
        <p className="px-3 py-2.5 text-meta text-ink-4">Collapsed</p>
      )}
      {!hasWorking && open && (
        <p className="border-t border-[var(--color-line)] bg-[var(--color-line)]/20 px-3 py-2 text-2xs text-ink-4">
          Single-block output. No separate working log was detected for this task.
        </p>
      )}
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
      <div className="flex items-baseline gap-2">
        <h4 className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-3">Results</h4>
        <span className="text-2xs tabular-nums text-ink-4">{results.length}</span>
      </div>
      {results.map((r, i) => (
        <ResultPanel key={i} text={r.text} hasWorking={false} title={`Result ${r.index} · ${r.outcome}`} defaultOpen={i === results.length - 1} executor={task.executor} />
      ))}
    </div>
  )
}

export function ResultEmpty({ running }: { running?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-line)] px-3 py-6 text-center">
      <FileCheck2 className="size-5 text-ink-4" aria-hidden />
      <p className="text-meta text-ink-3">
        {running ? "Worker still running" : "No result yet"}
      </p>
      <p className="max-w-[36ch] text-2xs leading-relaxed text-ink-4">
        {running
          ? "The answer appears here once the worker finishes its run."
          : "Run the task to produce an answer. Output from each run is kept separately."}
      </p>
    </div>
  )
}

/* Log and answer as peers in one column: the log streams while running, the
   answer settles beneath it. Both stay reachable without a sub-tab, so the
   same component backs the drawer and the page. */
export function TaskOutput({ task, events, working, running, slug, compact = false }: {
  task: Task
  events: TaskEvent[]
  working: string
  running: boolean
  slug: string
  compact?: boolean
}) {
  const showLog = running || !!working
  const showResult = !!task.result

  if (!showLog && !showResult) {
    return <ResultEmpty running={running} />
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {showLog && (
        <WorkerLogPanel text={working} running={running} slug={slug} taskId={task.id} />
      )}
      {showResult && <ResultStack task={task} events={events} />}
    </div>
  )
}
