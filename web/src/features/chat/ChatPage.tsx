import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowUp, ChevronDown, Plus, Search, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { BorderBeam } from "@/components/ui/border-beam"
import { StreamingResponse } from "@/components/ui/streaming-response"
import { AgentProgress } from "@/components/agents/loading-states"
import { api, createChatSession, getChatActiveRun, getChatRun, listChatMessages, listChatRunEvents, listChatSessions, listProviders, openEventStream, sendChatMessage, stopChatRun, type ChatAgent, type ChatMessage, type ChatRun, type ChatRunEvent, type ChatSession, type ChatState, type Profile, type Workspace } from "@/api"

type Props = { profiles: Profile[]; workspaces: Workspace[]; initialSessionID?: string; onSessionChange?: (sessionID: string) => void; sidebarOpen?: boolean }

function stateLabel(state?: ChatState) { return state ? state.toUpperCase() : "READY" }
function stateTone(state?: ChatState) { return state === "done" ? "text-emerald-400" : state === "error" || state === "cancelled" ? "text-red-400" : state === "running" || state === "loading" ? "text-amber-300" : "text-neutral-500" }

function elapsedLabel(startedAt?: number, endedAt?: number | null, now = Date.now()) {
  if (!startedAt) return "0.0s"
  const seconds = Math.max(0, ((endedAt ? endedAt * 1000 : now) - startedAt * 1000) / 1000)
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`
}

function MessageFooter({ run, messageCreatedAt, isStreaming }: { run?: ChatRun; messageCreatedAt?: number; isStreaming?: boolean }) {
  const active = !!isStreaming && (run?.state === "loading" || run?.state === "running")
  const isError = run?.state === "error" || run?.state === "cancelled"
  const modelLabel = run?.model || "default"
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || !run) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [active, run])
  const elapsed = run ? elapsedLabel(run.started_at, run.ended_at, now) : ""
  const clockTime = messageCreatedAt ? new Date(messageCreatedAt * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }) : ""
  return <span className="inline-flex items-center gap-1.5 text-[10px] leading-none text-neutral-500">
    <span className="font-mono text-[10px] text-neutral-400 truncate max-w-[110px]" title={modelLabel}>{modelLabel}</span>
    {run && elapsed && <><span className="text-neutral-600">·</span><span className="font-mono tabular-nums" title={active ? "elapsed" : "total time"}>{elapsed}</span></>}
    {!active && clockTime && <><span className="text-neutral-600">·</span><span className="font-mono tabular-nums">{clockTime}</span></>}
    {isError && run && <><span className="text-neutral-600">·</span><span className={stateTone(run.state)}>{stateLabel(run.state)}</span></>}
  </span>
}

type PlanStatus = "pending" | "in-progress" | "completed" | "cancelled"
function AgentTaskPlan({ events, defaultOpen = true }: { events: ChatRunEvent[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const items = events.filter((event) => event.kind !== "tool_output").map((event, index, all) => {
    const status: PlanStatus = event.kind === "completed" ? "completed" : event.kind === "cancelled" || event.kind === "error" ? "cancelled" : index === all.length - 1 ? "in-progress" : "completed"
    return { id: String(event.id), status, label: event.kind === "spawned" ? `Spawned Agent Hermes` : event.kind.replaceAll("_", " "), detail: new Date(event.created_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }
  })
  return <div className="agent-task-plan">
    <button type="button" className="agent-task-plan__trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="agent-task-plan__title">Activity</span><span className="agent-task-plan__count">{items.length} steps</span><ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <ol className="agent-task-plan__list">{items.length ? items.map((item) => <li key={item.id} className={`agent-task-plan__item is-${item.status}`}><span className="agent-task-plan__mark">{item.status === "completed" ? "✓" : item.status === "cancelled" ? "×" : item.status === "in-progress" ? "·" : "○"}</span><span className="min-w-0 flex-1 truncate">{item.label}</span><time className="shrink-0 text-[10px] text-neutral-600">{item.detail}</time></li>) : <li className="text-[11px] text-neutral-600">Waiting for agent activity</li>}</ol>}
  </div>
}

const EXAMPLE_PROMPTS = ["Summarize this workspace", "Inspect current task status", "Help me plan next step"]

type GroupKey = "today" | "yesterday" | "prev7" | "prev30" | "older"
const GROUP_LABEL: Record<GroupKey, string> = { today: "Today", yesterday: "Yesterday", prev7: "Previous 7 days", prev30: "Previous 30 days", older: "Older" }
const GROUP_ORDER: GroupKey[] = ["today", "yesterday", "prev7", "prev30", "older"]

function groupKeyFor(ts: number): GroupKey {
  const d = new Date(ts * 1000)
  const now = new Date()
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()
  const dMs = d.getTime()
  const day = 86400000
  if (dMs >= startMs) return "today"
  if (dMs >= startMs - day) return "yesterday"
  if (dMs >= startMs - 7 * day) return "prev7"
  if (dMs >= startMs - 30 * day) return "prev30"
  return "older"
}

function isSshWorkspace(w: Workspace): boolean { return !!w.host && w.host !== "localhost" && w.host !== "127.0.0.1" }
function isLive(w: Workspace): boolean { return w.status === "connected" || w.status === "local" }

function Markdown({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g)
  return <div className="space-y-2 whitespace-pre-wrap break-words">{blocks.map((part, index) => {
    if (part.startsWith("```")) return <pre key={index} className="overflow-auto rounded-lg border border-white/10 bg-black/30 p-3 text-xs">{part.replace(/^```[a-z]*\n?/, "").replace(/```$/, "")}</pre>
    const inline = part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((chunk, j) => {
      if (chunk.startsWith("`") && chunk.endsWith("`")) return <code key={j} className="rounded bg-white/10 px-1 py-0.5 text-xs">{chunk.slice(1, -1)}</code>
      if (chunk.startsWith("**") && chunk.endsWith("**")) return <strong key={j}>{chunk.slice(2, -2)}</strong>
      return <span key={j}>{chunk}</span>
    })
    return <div key={index}>{inline}</div>
  })}</div>
}

export default function ChatPage({ profiles, workspaces, initialSessionID, onSessionChange, sidebarOpen = true }: Props) {
  const qc = useQueryClient()
  const [sessionID, setSessionID] = useState<string | undefined>(() => initialSessionID)
  const [query, setQuery] = useState("")
  const [profile, setProfile] = useState("default")
  const [workspace, setWorkspace] = useState("")
  const [model, setModel] = useState("")
  const [prompt, setPrompt] = useState("")
  const [selectedRun, setSelectedRun] = useState<ChatRun>()
  const [streamBuffer, setStreamBuffer] = useState<Record<string, string>>({})
  const streamBufferRef = useRef<Record<string, string>>({})
  // sync ref for use in event handlers without re-binding effect
  useEffect(() => { streamBufferRef.current = streamBuffer }, [streamBuffer])

  const agent: ChatAgent = "hermes"
  const initialCreate = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)  // ponytail: browser-owned file input, no upload API yet.
  const sessions = useQuery({ queryKey: ["chat-sessions"], queryFn: listChatSessions })
  const current = useQuery({ queryKey: ["chat-session", sessionID], queryFn: () => api<ChatSession>(`/api/chat/sessions/${sessionID}`), enabled: !!sessionID })
  const messages = useQuery({ queryKey: ["chat-messages", sessionID], queryFn: () => listChatMessages(sessionID!), enabled: !!sessionID })
  const providers = useQuery({ queryKey: ["providers"], queryFn: listProviders })
  const activeRunQuery = useQuery({ queryKey: ["chat-active-run", sessionID], queryFn: () => getChatActiveRun(sessionID!), enabled: !!sessionID })
  const persistedActive = activeRunQuery.data ?? undefined
  const run = selectedRun && selectedRun.session_id === sessionID ? selectedRun : persistedActive
  const events = useQuery({ queryKey: ["chat-run-events", run?.id], queryFn: () => listChatRunEvents(run!.id), enabled: !!run?.id })

  const modelOptions = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((p) => { if (p.model) set.add(p.model) })
    providers.data?.forEach((p) => p.models.forEach((m) => set.add(m)))
    return Array.from(set).sort()
  }, [profiles, providers.data])

  function setActive(id: string) {
    setSessionID(id)
    setSelectedRun(undefined)
    if (onSessionChange) onSessionChange(id)
  }


  useEffect(() => {
    if (initialSessionID && initialSessionID !== sessionID) setSessionID(initialSessionID)
  }, [initialSessionID]) // ponytail: prop drives initial active session; internal setActive updates caller via onSessionChange

  useEffect(() => {
    if (sessions.isSuccess && sessions.data?.length === 0 && !initialCreate.current) {
      initialCreate.current = true
      void createChatSession({ title: "New chat", agent: "hermes", profile: "default", workspace: "", model: "" }).then((created) => {
        setActive(created.id)
        void qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      }).catch(() => { initialCreate.current = false })
      return
    }
    if (!sessionID && sessions.data?.[0]) setActive(sessions.data[0].id)
  }, [qc, sessionID, sessions.data, sessions.isSuccess])

  useEffect(() => openEventStream((event) => {
    const runId = run?.id
    // accumulate tool_output lines into stream buffer for progressive rendering
    if (event.kind === "chat_run_event" && event.data?.run_id && event.data.run_id === runId) {
      try {
        const payload = typeof event.data.payload === "string" ? JSON.parse(event.data.payload) : event.data.payload
        if (payload?.kind === "tool_output" && typeof payload.text === "string") {
          const rid = event.data.run_id
          setStreamBuffer((prev) => ({ ...prev, [rid]: (prev[rid] ?? "") + payload.text + "\n" }))
          return // don't double-invalidate queries for every line
        }
      } catch { /* parse error, fall through to standard handling */ }
    }
    if ((event.kind === "chat_run" || event.kind === "chat_run_event") && event.data?.run_id && runId && event.data.run_id === runId) {
      void getChatRun(runId).then((fresh) => {
        setSelectedRun(fresh)
        // on terminal state, clear stream buffer (final output replaces it)
        if (fresh.state === "done" || fresh.state === "error" || fresh.state === "cancelled") {
          setStreamBuffer((prev) => { const n = { ...prev }; delete n[fresh.id]; return n })
          void qc.invalidateQueries({ queryKey: ["chat-messages", sessionID] })
          void qc.invalidateQueries({ queryKey: ["chat-active-run", sessionID] })
        }
      }).catch(() => undefined)
      void qc.invalidateQueries({ queryKey: ["chat-run-events", runId] })
    }
    if (event.kind.startsWith("chat_")) { void qc.invalidateQueries({ queryKey: ["chat-sessions"] }); if (event.data?.session_id) void qc.invalidateQueries({ queryKey: ["chat-active-run", event.data.session_id] }); if (event.data?.session_id === sessionID) void qc.invalidateQueries({ queryKey: ["chat-session", sessionID] }) }
  }), [qc, run?.id, sessionID])


  const filteredSessions = useMemo(() => (sessions.data ?? []).filter((item) => {
    const text = `${item.title} ${item.agent} ${item.profile} ${item.workspace} ${item.model}`.toLowerCase()
    return !query || text.includes(query.toLowerCase())
  }), [query, sessions.data])

  const grouped = useMemo(() => {
    const map: Record<GroupKey, ChatSession[]> = { today: [], yesterday: [], prev7: [], prev30: [], older: [] }
    for (const s of filteredSessions) map[groupKeyFor(s.updated_at)].push(s)
    return map
  }, [filteredSessions])

  const send = useMutation({
    mutationFn: () => {
      if (model && modelOptions.length > 0 && !modelOptions.includes(model)) throw new Error(`model ${model} not in provider roster`)
      return sendChatMessage(sessionID!, { content: prompt, agent, profile, workspace, model })
    },
    onSuccess: (data) => { setPrompt(""); setSelectedRun(data.run); void qc.invalidateQueries({ queryKey: ["chat-messages", sessionID] }); void qc.invalidateQueries({ queryKey: ["chat-session", sessionID] }); void qc.invalidateQueries({ queryKey: ["chat-active-run", sessionID] }); void qc.invalidateQueries({ queryKey: ["chat-sessions"] }) },
  })

  async function newChat() { const created = await createChatSession({ title: "New chat", agent, profile, workspace, model }); setActive(created.id); await qc.invalidateQueries({ queryKey: ["chat-sessions"] }) }
  async function selectSession(item: ChatSession) { setActive(item.id); setProfile(item.profile); setWorkspace(item.workspace); setModel(item.model); void getChatActiveRun(item.id).then((next) => setSelectedRun(next ?? undefined)).catch(() => undefined) }
  const activeMessages: ChatMessage[] = messages.data ?? []
  const isRunning = run?.state === "loading" || run?.state === "running"

  // ponytail: fetch historical runs per-message so footer shows original model/time, not current selector state. add batch endpoint when >50 messages.
  const messageRunIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of activeMessages) { if (m.role === "assistant" && m.run_id) ids.add(m.run_id) }
    if (run?.id) ids.add(run.id)
    return Array.from(ids)
  }, [activeMessages, run?.id])
  const messageRuns = useQuery({
    queryKey: ["chat-runs-batch", messageRunIds],
    queryFn: async () => {
      const map: Record<string, ChatRun> = {}
      await Promise.all(messageRunIds.map(async (rid) => {
        try { map[rid] = await getChatRun(rid) } catch {}
      }))
      return map
    },
    enabled: messageRunIds.length > 0,
  })
  const runMap = messageRuns.data ?? {}

  return <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--color-bg)]">
    {sidebarOpen && <aside className="flex w-[280px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-line)] px-2">
        <span className="px-1 text-sm font-semibold tracking-tight">Chats</span>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => void newChat()} title="New chat"><Plus className="size-4" /></Button>
      </div>
      <div className="border-b border-[var(--color-line)] p-2">
        <div className="relative"><Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="h-8 pl-7 text-xs" /></div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {filteredSessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-line)] p-4 text-center text-xs text-muted-foreground">No chat for this filter</div>
        ) : (
          GROUP_ORDER.map((key) => {
            const items = grouped[key]
            if (items.length === 0) return null
            return (
              <div key={key} className="mb-3">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{GROUP_LABEL[key]} <span className="font-normal normal-case tracking-normal text-neutral-600">· {items.length}</span></div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <button key={item.id} onClick={() => void selectSession(item)} title={item.title} className={`flex w-full flex-col rounded-lg border px-2.5 py-2 text-left transition-colors ${item.id === sessionID ? "border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10" : "border-transparent bg-transparent hover:bg-white/[0.04]"}`}>
                      <div className="max-w-full truncate text-xs font-medium leading-none">{item.title}</div>
                      <div className="mt-1 flex max-w-full items-center gap-1 truncate text-[10px] text-neutral-500">
                        <span className="truncate">{item.workspace || "local"}</span>
                        {item.model && <><span className="text-neutral-600">·</span><span className="truncate font-mono text-[9px]">{item.model.split("/").pop()}</span></>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>
      <div className="border-t border-[var(--color-line)] px-2 py-1.5 text-[10px] text-neutral-600">{filteredSessions.length} chats</div>
    </aside>}
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-surface)]/60 px-4 backdrop-blur">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{current.data?.title ?? "New chat"}</div>
        </div>
        {run && isRunning && <Button size="sm" variant="outline" onClick={() => void stopChatRun(run.id).then(() => getChatRun(run.id).then(setSelectedRun))}><Square className="mr-1 size-3" /> Stop</Button>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><div className="mx-auto max-w-3xl space-y-5">
        {activeMessages.length === 0 && !run ? (
          <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-6">
            <div className="text-sm font-medium">Start a conversation</div>
            <div className="mt-1 text-xs text-neutral-500">Pick a prompt or type your own. Agent runs show escalating timer and task-style live state.</div>
            <div className="mt-4 flex flex-wrap gap-1.5">{EXAMPLE_PROMPTS.map((example) => <button key={example} type="button" onClick={() => setPrompt(example)} className="rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-xs hover:border-[var(--color-line-strong)]">{example}</button>)}</div>
          </div>
        ) : activeMessages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            {message.role === "user" ? (
              <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-sm">{message.content}</div>
            ) : (
              <div className="w-full min-w-0">
                {(() => {
                  const messageStreaming = isRunning && message.id === activeMessages[activeMessages.length - 1]?.id
                  const visibleText = messageStreaming && run?.id && streamBuffer[run.id] ? streamBuffer[run.id] : message.content
                  const msgRun = messageStreaming ? run : (message.run_id ? runMap[message.run_id] : undefined)
                  return <StreamingResponse status={messageStreaming ? "streaming" : "complete"} copyText={visibleText} footer={<MessageFooter run={msgRun} isStreaming={messageStreaming} messageCreatedAt={message.created_at} />}><Markdown text={visibleText} /></StreamingResponse>
                })()}
              </div>
            )}
          </div>
        ))}
        {run && isRunning && <div className="chat-agent-progress"><AgentProgress label={run.state === "loading" ? "Loading" : "Running"} initialSeconds={Math.max(0, (Date.now() - run.started_at * 1000) / 1000)} /><AgentTaskPlan events={events.data ?? []} defaultOpen={false} /></div>}
      </div></div>
      <div className="border-t border-[var(--color-line)] bg-[var(--color-surface)]/40 p-3 backdrop-blur">
        <BorderBeam size="md" colorVariant="colorful" strength={0.7} className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-[var(--color-surface)] p-2">
          <div>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (prompt.trim() && sessionID && !send.isPending) send.mutate() } }}
              placeholder="Message agent..."
              rows={1}
              className="field-sizing-content max-h-40 min-h-[44px] resize-none border-0 bg-transparent py-2.5 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Select value={workspace || "__local"} onValueChange={(v) => setWorkspace(v === "__local" ? "" : v)}>
              <SelectTrigger size="sm" className="h-7 max-w-36 truncate rounded-full border-[var(--color-line)] bg-transparent px-2.5 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent className="max-w-80 border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="__local">local</SelectItem>{workspaces.map((v) => { const live = isLive(v); const ssh = isSshWorkspace(v); const os = (v.os || "").toLowerCase(); const osLabel = os === "mac" ? "mac" : os === "windows" ? "win" : os === "linux" ? "linux" : ""; return <SelectItem key={v.id} value={v.path} className="min-w-0 text-sm" title={v.path}><span className="flex min-w-0 items-center gap-1.5">{live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" /> }<span className="min-w-0 flex-1 truncate">{v.name}</span>{ssh && <Badge variant="outline" className="shrink-0 border-violet-500/30 bg-violet-500/10 px-1 py-0 text-[9px] leading-none text-violet-300">ssh</Badge>}{osLabel && <Badge variant="outline" className="shrink-0 border-[var(--color-line)] bg-[var(--color-bg)] px-1 py-0 text-[9px] leading-none text-neutral-400">{osLabel}</Badge>}{live && <span className="size-1.5 shrink-0 rounded-full bg-emerald-400/60" />}</span></SelectItem> })}</SelectContent>
            </Select>
            <Select value={model || "__default"} onValueChange={(v) => setModel(v === "__default" ? "" : v)}>
              <SelectTrigger size="sm" className="h-7 w-32 truncate rounded-full border-[var(--color-line)] bg-transparent px-2.5 text-[11px]"><SelectValue placeholder="model default" /></SelectTrigger>
              <SelectContent className="max-w-80 border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="__default">model default</SelectItem>{modelOptions.map((v) => <SelectItem key={v} value={v} className="max-w-72 truncate text-sm" title={v}>{v}</SelectItem>)}</SelectContent>
            </Select>
            <input ref={fileRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPrompt((prev) => `${prev}${prev ? "\n" : ""}[attach: ${file.name}]`); if (fileRef.current) fileRef.current.value = "" }} />
            <Button size="sm" variant="outline" className="ml-auto h-8 rounded-full" onClick={() => fileRef.current?.click()}><Plus className="mr-1 size-3" /> Attach</Button>
            <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setPrompt((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}/`)} >Command</Button>
            <Button size="icon" className="size-8 rounded-full" disabled={!prompt.trim() || !sessionID || send.isPending} onClick={() => send.mutate()}>{send.isPending ? <X className="size-4" /> : <ArrowUp className="size-4" />}</Button>
          </div>
          {send.isError && <div className="pt-2 text-xs text-red-400">{(send.error as Error).message}</div>}
          </div>
        </BorderBeam>
        <div className="mx-auto mt-1.5 flex max-w-3xl items-center justify-between px-1 text-[10px] text-neutral-600"><span>Enter send · Shift+Enter newline</span><span>{prompt.length} chars</span></div>
      </div>
    </main>
  </div>
}