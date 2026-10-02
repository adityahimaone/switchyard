import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageHeader } from "@/components/app/page-header"
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
  if (low.includes("error") || low.includes("traceback") || low.includes("failed") || low.includes("fatal")) return "border-l-red-500/70 text-danger-text"
  if (low.includes("warn")) return "border-l-warning text-warning-text"
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
    <div className="flex h-full min-w-0 flex-col">
      <PageHeader
        title="Logs"
        description="Live runtime output from ~/.hermes/logs."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={file} onValueChange={setFile}>
              <SelectTrigger size="sm" className="w-44 text-xs">
              <SelectValue placeholder="file" />
            </SelectTrigger>
            <SelectContent className="">
              {LOG_FILES.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tail} onValueChange={setTail}>
            <SelectTrigger size="sm" className="w-28 text-xs">
              <SelectValue placeholder="tail" />
            </SelectTrigger>
            <SelectContent className="">
              {TAILS.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">last {t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={autoRefresh ? "signal" : "outline"} size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <RefreshCw className={`size-3.5 ${autoRefresh ? "animate-spin" : ""}`} /> Live
          </Button>
          </div>
        }
      >
        <div>
          <Label className="text-xs text-ink-3">Filter (case-insensitive, server-side)</Label>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="misal: dispatch, t_0b6b086c, error, workspace"
            className="mt-1 border-line bg-raised font-mono text-xs"
          />
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 md:px-6">
        {logs.isLoading ? (
          <LoadingState label="Loading logs" />
        ) : logs.isError ? (
          <p className="text-sm text-danger-text">Could not load logs: {(logs.error as Error).message}</p>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[11px] text-ink-3">
              <span>{logs.data?.lines.length ?? 0} lines</span>
              <span>·</span>
              <span>total {Math.round((logs.data?.total_bytes ?? 0) / 1024)} KB</span>
              {logs.data?.truncated && <span className="text-warning-text">· truncated to 4MB window</span>}
              {logs.data?.hint && <span className="text-ink-3">· {logs.data.hint}</span>}
            </div>
            <pre
              ref={preRef}
              className="mt-2 min-h-0 min-w-0 flex-1 overflow-auto rounded-control border border-line bg-well p-3 font-mono text-[11px] leading-relaxed"
            >
              {logs.data?.lines.length
                ? logs.data.lines.map((l, i) => (
                    <div key={i} className={`border-l-2 pl-2 ${lineTone(l)} break-all`}>{l || " "}</div>
                  ))
                : <span className="text-ink-3">No lines matched.</span>}
            </pre>
          </>
        )}
      </div>
    </div>
  )
}
