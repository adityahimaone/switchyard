import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowUp, ChevronDown, ChevronRight, Copy, Plus, Search, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, createChatSession, getChatRun, listChatMessages, listChatRunEvents, listChatSessions, listProviders, openEventStream, sendChatMessage, stopChatRun, type ChatAgent, type ChatMessage, type ChatRun, type ChatSession, type ChatState, type Profile, type Workspace } from "@/api"

type Props = { profiles: Profile[]; workspaces: Workspace[] }
const agents: ChatAgent[] = ["hermes"]
const states: ChatState[] = ["loading", "running", "done", "error", "cancelled"]
const periods = ["all", "today", "yesterday", "7d", "month"] as const
type Period = typeof periods[number]

function stateLabel(state?: ChatState) { return state ? state.toUpperCase() : "READY" }
function stateTone(state?: ChatState) { return state === "done" ? "text-emerald-400" : state === "error" || state === "cancelled" ? "text-red-400" : state === "running" || state === "loading" ? "text-amber-300" : "text-neutral-500" }

function elapsedLabel(startedAt?: number, endedAt?: number | null, now = Date.now()) {
  if (!startedAt) return "0.0s"
  const seconds = Math.max(0, ((endedAt ? endedAt * 1000 : now) - startedAt * 1000) / 1000)
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(1)}s`
}

function escalationLabel(startedAt?: number, endedAt?: number | null, now = Date.now()) {
  if (!startedAt) return "queued"
  const seconds = Math.max(0, ((endedAt ? endedAt * 1000 : now) - startedAt * 1000) / 1000)
  if (seconds >= 60) return "taking longer"
  if (seconds >= 20) return "still working"
  if (seconds >= 5) return "processing"
  return "starting"
}

function RunTimer({ run }: { run: ChatRun }) {
  const active = run.state === "loading" || run.state === "running"
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(timer)
  }, [active])
  return <span className="inline-flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-neutral-400"><span className={active ? "chat-running-dot" : "size-1.5 rounded-full bg-emerald-400"} />{elapsedLabel(run.started_at, run.ended_at, now)}{active && <span className="font-sans text-neutral-500">· {escalationLabel(run.started_at, run.ended_at, now)}</span>}</span>
}

const EXAMPLE_PROMPTS = ["Summarize this workspace", "Inspect current task status", "Help me plan next step"]

function inPeriod(ts: number, period: Period) {
  if (period === "all") return true
  const d = new Date(ts * 1000); const now = new Date(); const start = new Date(now); start.setHours(0, 0, 0, 0)
  if (period === "today") return d >= start
  if (period === "yesterday") { const y0 = new Date(start); y0.setDate(y0.getDate() - 1); const y1 = new Date(start); return d >= y0 && d < y1 }
  if (period === "7d") { const c = new Date(start); c.setDate(c.getDate() - 7); return d >= c }
  if (period === "month") { const c = new Date(start); c.setDate(c.getDate() - 30); return d >= c }
  return true
}

function Markdown({ text }: { text: string }) {
  const blocks = text.split(/(```[\s\S]*?```)/g)
  return <div className="space-y-2 whitespace-pre-wrap break-words">{blocks.map((part, index) => {
    if (part.startsWith("```")) return <pre key={index} className="overflow-auto rounded bg-black/30 p-3 text-xs">{part.replace(/^```[a-z]*\n?/, "").replace(/```$/, "")}</pre>
    const inline = part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((chunk, j) => {
      if (chunk.startsWith("`") && chunk.endsWith("`")) return <code key={j} className="rounded bg-white/10 px-1 py-0.5 text-xs">{chunk.slice(1, -1)}</code>
      if (chunk.startsWith("**") && chunk.endsWith("**")) return <strong key={j}>{chunk.slice(2, -2)}</strong>
      return <span key={j}>{chunk}</span>
    })
    return <div key={index}>{inline}</div>
  })}</div>
}

export default function ChatPage({ profiles, workspaces }: Props) {
  const qc = useQueryClient()
  const [sessionID, setSessionID] = useState<string>()
  const [query, setQuery] = useState("")
  const [period, setPeriod] = useState<Period>("all")
  const [stateFilter, setStateFilter] = useState("all")
  const [agentFilter, setAgentFilter] = useState("all")
  const [profileFilter, setProfileFilter] = useState("all")
  const [workspaceFilter, setWorkspaceFilter] = useState("all")
  const [modelFilter, setModelFilter] = useState("all")
  const [agent, setAgent] = useState<ChatAgent>("hermes")
  const [profile, setProfile] = useState("default")
  const [workspace, setWorkspace] = useState("")
  const [model, setModel] = useState("")
  const [prompt, setPrompt] = useState("")
  const [run, setRun] = useState<ChatRun>()
  const [expanded, setExpanded] = useState(false)
  const initialCreate = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)  // ponytail: browser-owned file input, no upload API yet.
  const sessions = useQuery({ queryKey: ["chat-sessions"], queryFn: listChatSessions })
  const current = useQuery({ queryKey: ["chat-session", sessionID], queryFn: () => api<ChatSession>(`/api/chat/sessions/${sessionID}`), enabled: !!sessionID })
  const messages = useQuery({ queryKey: ["chat-messages", sessionID], queryFn: () => listChatMessages(sessionID!), enabled: !!sessionID })
  const providers = useQuery({ queryKey: ["providers"], queryFn: listProviders })
  const events = useQuery({ queryKey: ["chat-run-events", run?.id], queryFn: () => listChatRunEvents(run!.id), enabled: !!run?.id })

  const modelOptions = useMemo(() => {
    const set = new Set<string>()
    profiles.forEach((p) => { if (p.model) set.add(p.model) })
    providers.data?.forEach((p) => p.models.forEach((m) => set.add(m)))
    return Array.from(set).sort()
  }, [profiles, providers.data])

  useEffect(() => {
    if (sessions.isSuccess && sessions.data?.length === 0 && !initialCreate.current) {
      initialCreate.current = true
      void createChatSession({ title: "New chat", agent: "hermes", profile: "default", workspace: "", model: "" }).then((created) => {
        setSessionID(created.id)
        void qc.invalidateQueries({ queryKey: ["chat-sessions"] })
      }).catch(() => { initialCreate.current = false })
      return
    }
    if (!sessionID && sessions.data?.[0]) setSessionID(sessions.data[0].id)
  }, [qc, sessionID, sessions.data, sessions.isSuccess])
  useEffect(() => openEventStream((event) => {
    const runId = run?.id
    if ((event.kind === "chat_run" || event.kind === "chat_run_event") && event.data?.run_id && runId && event.data.run_id === runId) { void getChatRun(runId).then(setRun).catch(() => undefined); void qc.invalidateQueries({ queryKey: ["chat-run-events", runId] }); void qc.invalidateQueries({ queryKey: ["chat-messages", sessionID] }) }
    if (event.kind.startsWith("chat_")) void qc.invalidateQueries({ queryKey: ["chat-sessions"] })
  }), [qc, run?.id, sessionID])

  const filteredSessions = useMemo(() => (sessions.data ?? []).filter((item) => {
    const text = `${item.title} ${item.agent} ${item.profile} ${item.workspace} ${item.model}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) &&
      inPeriod(item.updated_at, period) &&
      (stateFilter === "all" || (run?.session_id === item.id && run.state === stateFilter)) &&
      (agentFilter === "all" || item.agent === agentFilter) &&
      (profileFilter === "all" || item.profile === profileFilter) &&
      (workspaceFilter === "all" || item.workspace === workspaceFilter) &&
      (modelFilter === "all" || item.model === modelFilter)
  }), [agentFilter, modelFilter, profileFilter, period, query, sessions.data, stateFilter, workspaceFilter, run])

  const send = useMutation({
    mutationFn: () => {
      if (model && modelOptions.length > 0 && !modelOptions.includes(model)) throw new Error(`model ${model} not in provider roster`)
      return sendChatMessage(sessionID!, { content: prompt, agent, profile, workspace, model })
    },
    onSuccess: (data) => { setPrompt(""); setRun(data.run); setExpanded(true); void qc.invalidateQueries({ queryKey: ["chat-messages", sessionID] }); void qc.invalidateQueries({ queryKey: ["chat-sessions"] }) },
  })

  async function newChat() { const created = await createChatSession({ title: "New chat", agent, profile, workspace, model }); setSessionID(created.id); setRun(undefined); await qc.invalidateQueries({ queryKey: ["chat-sessions"] }) }
  async function selectSession(item: ChatSession) { setSessionID(item.id); setRun(undefined); setAgent(item.agent); setProfile(item.profile); setWorkspace(item.workspace); setModel(item.model) }
  const activeMessages: ChatMessage[] = messages.data ?? []
  const isRunning = run?.state === "loading" || run?.state === "running"

  return <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--color-bg)]">
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] p-3"><span className="font-semibold">Agent Chat</span><Button size="icon" variant="ghost" onClick={() => void newChat()}><Plus className="size-4" /></Button></div>
      <div className="space-y-2 border-b border-[var(--color-line)] p-3">
        <div className="relative"><Search className="absolute left-2 top-2.5 size-3.5 text-neutral-500" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="h-8 pl-7 text-xs" /></div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger size="sm" className="w-full border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue placeholder="Period" /></SelectTrigger>
          <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="all">All time</SelectItem><SelectItem value="today">Today</SelectItem><SelectItem value="yesterday">Yesterday</SelectItem><SelectItem value="7d">Last 7 days</SelectItem><SelectItem value="month">Last month</SelectItem></SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-1">
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger size="sm" className="border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="all">State</SelectItem>{states.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger size="sm" className="border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue placeholder="Agent" /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="all">Agent</SelectItem>{agents.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger size="sm" className="border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue placeholder="Profile" /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="all">Profile</SelectItem>{profiles.map((v) => <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={workspaceFilter} onValueChange={setWorkspaceFilter}>
            <SelectTrigger size="sm" className="border-[var(--color-line)] bg-[var(--color-bg)] text-xs"><SelectValue placeholder="Workspace" /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="all">Workspace</SelectItem>{workspaces.map((v) => <SelectItem key={v.id} value={v.path}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Input value={modelFilter === "all" ? "" : modelFilter} onChange={(event) => setModelFilter(event.target.value || "all")} placeholder="Model filter" className="h-8 text-xs" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{filteredSessions.map((item) => <button key={item.id} onClick={() => void selectSession(item)} className={`mb-1 w-full rounded-md p-2 text-left text-xs hover:bg-white/5 ${item.id === sessionID ? "bg-white/10" : ""}`}><div className="truncate font-medium">{item.title}</div><div className="mt-1 truncate text-[10px] text-neutral-500">{item.agent} · {item.profile} · {item.workspace || "local"}</div></button>)}</div>
    </aside>
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--color-line)] px-4"><div className="min-w-0"><div className="truncate text-sm font-semibold">{current.data?.title ?? "New chat"}</div><div className="flex items-center gap-2 text-[10px] font-medium"><span className={stateTone(run?.state)}>{stateLabel(run?.state)}</span><span className="text-neutral-500">· {run ? `${run.agent} · ${run.profile}` : `${agent} · ${profile}`}</span>{run && <RunTimer run={run} />}</div></div>{run && isRunning && <Button size="sm" variant="outline" onClick={() => void stopChatRun(run.id).then(() => getChatRun(run.id).then(setRun))}><Square className="mr-1 size-3" /> Stop</Button>}</header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="mx-auto max-w-3xl space-y-5">
        {activeMessages.length === 0 && !run ? (
          <div className="rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-6">
            <div className="text-sm font-medium">Start a conversation</div>
            <div className="mt-1 text-xs text-neutral-500">Pick a prompt or type your own. Agent runs show escalating timer and task-style live state.</div>
            <div className="mt-4 flex flex-wrap gap-1.5">{EXAMPLE_PROMPTS.map((example) => <button key={example} type="button" onClick={() => setPrompt(example)} className="rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-xs hover:border-[var(--color-line-strong)]">{example}</button>)}</div>
          </div>
        ) : activeMessages.map((message) => <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}><div className={message.role === "user" ? "max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm" : "w-full text-sm leading-6"}>{message.role === "user" ? message.content : <Markdown text={message.content} />}</div></div>)}
        {run && <div className={`relative overflow-hidden rounded-lg border bg-black/10 ${isRunning ? "border-sky-500/30 running-loader" : "border-[var(--color-line)]"}`}>{isRunning && <span aria-hidden className="signal-loading__line" /> }<button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs" onClick={() => setExpanded((value) => !value)}>{expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}<span className={stateTone(run.state)}>{stateLabel(run.state)}</span><span className="text-neutral-500">{run.agent} · {run.profile} · {run.workspace || "local"}</span><span className="ml-auto"><RunTimer run={run} /></span></button>{expanded && <div className="space-y-3 border-t border-[var(--color-line)] p-3 text-xs"><div className="rounded bg-blue-950/40 p-3 font-mono text-blue-200">Worker Log{(events.data?.length ?? 0) > 0 ? ` · ${events.data?.length} events` : ""}<div className="mt-2 max-h-40 space-y-1 overflow-auto whitespace-pre-wrap text-[11px] text-blue-100">{events.data?.length ? events.data.map((e) => <div key={e.id} className="opacity-80">[{e.kind}] {e.payload.slice(0, 220)}</div>) : <div className="opacity-60">spawned · running · completed</div>}</div></div>{run.output && <div className="rounded bg-emerald-950/40 p-3 text-emerald-200"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium">Result</span><Button variant="ghost" size="icon" className="size-6" onClick={() => void navigator.clipboard.writeText(run.output)}><Copy className="size-3" /></Button></div><Markdown text={run.output} /></div>}{run.error && <div className="text-red-300">{run.error}</div>}</div>}</div>}</div></div>
      <div className="border-t border-[var(--color-line)] p-3"><div className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2"><Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (prompt.trim() && sessionID && !send.isPending) send.mutate() } }} placeholder="Message agent..." className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0" />
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={agent} onValueChange={(v) => setAgent(v as ChatAgent)}>
            <SelectTrigger size="sm" className="h-8 rounded-full border-[var(--color-line)] bg-transparent px-3 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">{agents.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={profile} onValueChange={setProfile}>
            <SelectTrigger size="sm" className="h-8 max-w-32 rounded-full border-[var(--color-line)] bg-transparent px-3 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">{(profiles.length ? profiles : [{ name: "default", model: "", provider: "", active: true, valid: true }]).map((v) => <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={workspace || "__local"} onValueChange={(v) => setWorkspace(v === "__local" ? "" : v)}>
            <SelectTrigger size="sm" className="h-8 max-w-40 rounded-full border-[var(--color-line)] bg-transparent px-3 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="__local">local</SelectItem>{workspaces.map((v) => <SelectItem key={v.id} value={v.path}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={model || "__default"} onValueChange={(v) => setModel(v === "__default" ? "" : v)}>
            <SelectTrigger size="sm" className="h-8 w-32 rounded-full border-[var(--color-line)] bg-transparent px-3 text-xs"><SelectValue placeholder="model default" /></SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]"><SelectItem value="__default">model default</SelectItem>{modelOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
          </Select>
          <input ref={fileRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setPrompt((prev) => `${prev}${prev ? "\n" : ""}[attach: ${file.name}]`); if (fileRef.current) fileRef.current.value = "" }} />
          <Button size="sm" variant="outline" className="ml-auto h-8 rounded-full" onClick={() => fileRef.current?.click()}><Plus className="mr-1 size-3" /> Attach</Button>
          <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setPrompt((prev) => `${prev}${prev && !prev.endsWith(" ") ? " " : ""}/`)} >Command</Button>
          <Button size="icon" className="size-8 rounded-full" disabled={!prompt.trim() || !sessionID || send.isPending} onClick={() => send.mutate()}>{send.isPending ? <X className="size-4" /> : <ArrowUp className="size-4" />}</Button>
        </div>
        {send.isError && <div className="pt-2 text-xs text-red-400">{(send.error as Error).message}</div>}</div></div>
    </main>
  </div>
}
