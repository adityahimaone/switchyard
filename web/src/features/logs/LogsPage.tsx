import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { RefreshCw } from "lucide-react"
import LoadingState from "@/components/feedback/loading-state"

interface LogTail {
  file: string
  tail: number
  lines: string[]
  truncated: boolean
  total_bytes: number
  mtime: number | null
  hint?: string
}

const LOG_FILES = [
  { value: "agent", label: "agent.log" },
  { value: "errors", label: "errors.log" },
  { value: "gateway", label: "gateway.log" },
  { value: "gui", label: "gui.log" },
  { value: "mcp", label: "mcp-stderr.log" },
  { value: "update", label: "update.log" },
]

const TAILS = ["100", "200", "500", "1000"]

// crude severity classifier for left-edge color
function lineTone(l: string): string {
  const low = l.toLowerCase()
  if (low.includes("error") || low.includes("traceback") || low.includes("failed") || low.includes("fatal")) return "border-l-red-500/70 text-red-200/90"
  if (low.includes("warn")) return "border-l-amber-500/70 text-amber-100/90"
  return "border-l-transparent text-ink-2"
}

export default function LogsPage() {
  const [file, setFile] = useState("agent")
  const [tail, setTail] = useState("200")
  const [filter, setFilter] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  const logs = useQuery({
    queryKey: ["logs", file, tail, filter],
    queryFn: () => {
      const p = new URLSearchParams({ file, tail })
      if (filter.trim()) p.set("q", filter.trim())
      return api<LogTail>(`/api/logs?${p.toString()}`)
    },
    refetchInterval: autoRefresh ? 5000 : false,
  })

  useEffect(() => {
    if (autoRefresh && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [logs.data, autoRefresh])

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Runtime</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Logs</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">Live runtime output dari <code className="text-ink-3">~/.hermes/logs</code>.</p>
        </div>
        <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-ink-3">~/.hermes/logs</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={file} onValueChange={setFile}>
            <SelectTrigger size="sm" className="w-44 border-[var(--color-line)] bg-[var(--color-bg)] text-xs">
              <SelectValue placeholder="file" />
            </SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
              {LOG_FILES.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tail} onValueChange={setTail}>
            <SelectTrigger size="sm" className="w-28 border-[var(--color-line)] bg-[var(--color-bg)] text-xs">
              <SelectValue placeholder="tail" />
            </SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
              {TAILS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">last {t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={autoRefresh ? "default" : "outline"} size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            className={autoRefresh ? "bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90" : ""}
          >
            <RefreshCw className={`size-3.5 ${autoRefresh ? "animate-spin" : ""}`} /> Live
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-xs text-ink-3">Filter (case-insensitive, server-side)</Label>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="misal: dispatch, t_0b6b086c, error, workspace"
          className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)] font-mono text-xs"
        />
      </div>

      <Separator className="my-3" />

      {logs.isLoading ? (
        <LoadingState label="Memuat logs" />
      ) : logs.isError ? (
        <p className="text-sm text-red-400">Gagal load logs: {(logs.error as Error).message}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[11px] text-ink-4">
            <span>{logs.data?.lines.length ?? 0} lines</span>
            <span>·</span>
            <span>total {Math.round((logs.data?.total_bytes ?? 0) / 1024)} KB</span>
            {logs.data?.truncated && <span className="text-amber-400">· truncated to 4MB window</span>}
            {logs.data?.hint && <span className="text-ink-3">· {logs.data.hint}</span>}
          </div>
          <pre
            ref={preRef}
            className="mt-2 min-h-0 flex-1 overflow-auto rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-3 font-mono text-[11px] leading-relaxed"
          >
            {logs.data?.lines.length
              ? logs.data.lines.map((l, i) => (
                  <div key={i} className={`border-l-2 pl-2 ${lineTone(l)} break-all`}>{l || " "}</div>
                ))
              : <span className="text-ink-4">No lines matched.</span>}
          </pre>
        </>
      )}
    </div>
  )
}
