import { useState, useMemo } from "react"
import {
  Sparkles,
  Smartphone,
  Globe,
  Sliders,
  Layout,
  Presentation,
  Gauge,
  Plus,
  ArrowUp,
  FileCode,
  Clock,
  MoreHorizontal,
  Folder,
  Layers,
  ArrowUpRight,
  GitFork,
  Trash2,
  ExternalLink,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  Search,
} from "lucide-react"
import type { CanvasSession } from "./CanvasPage"
import { cn } from "@/lib/utils"

interface CanvasHubProps {
  sessions: CanvasSession[]
  onSelectSession: (id: string) => void
  onCreateSession: (params: { title: string; brief: string; category?: string; model?: string }) => void
  onForkSession?: (id: string) => void
  onDiscardSession?: (id: string) => void
  onPromoteSession?: (session: CanvasSession) => void
  activeModel?: string
  models?: { value: string; label: string }[]
}

const TEMPLATE_CATEGORIES = [
  { id: "landing", label: "Landing page", icon: Layout },
  { id: "mobile", label: "Mobile app", icon: Smartphone },
  { id: "web", label: "Web app", icon: Globe },
  { id: "slides", label: "Slides", icon: Presentation },
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "custom", label: "Something else…", icon: Sliders },
]

export function CanvasHub({
  sessions,
  onSelectSession,
  onCreateSession,
  onForkSession,
  onDiscardSession,
  onPromoteSession,
  activeModel = "DeepSeek V4.1 Flash",
}: CanvasHubProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("landing")
  const [promptText, setPromptText] = useState("")
  const [activeTab, setActiveTab] = useState<"recents" | "drafts" | "scratchpad">("recents")
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        if (!s.title.toLowerCase().includes(q) && !s.branch.toLowerCase().includes(q)) {
          return false
        }
      }
      if (activeTab === "scratchpad") {
        return s.workspace_id === "scratchpad"
      }
      return true
    })
  }, [sessions, activeTab, searchQuery])

  const handleCreate = (overrideTitle?: string, overrideBrief?: string) => {
    const title = overrideTitle || promptText.trim() || `New ${TEMPLATE_CATEGORIES.find((c) => c.id === selectedCategory)?.label || "Design"}`
    const brief = overrideBrief || promptText.trim()
    onCreateSession({
      title,
      brief,
      category: selectedCategory,
      model: activeModel,
    })
    setPromptText("")
  }

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-[#0d0e12] font-sans text-neutral-200">
      {/* Top Pen.dev Navigation Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-[rgba(255,255,255,0.06)] bg-[#0f1015]/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {/* macOS window traffic lights */}
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-[#ff5f56]" />
            <span className="size-3 rounded-full bg-[#ffbd2e]" />
            <span className="size-3 rounded-full bg-[#27c93f]" />
          </div>

          <div className="flex items-center gap-2 font-semibold text-xs text-neutral-100">
            <div className="flex size-6 items-center justify-center rounded-md bg-[#10e0dd]/15 text-[#10e0dd]">
              <Sparkles className="size-3.5" />
            </div>
            <span className="tracking-tight text-sm font-bold">pen.dev</span>
          </div>

          {/* Active Tab Breadcrumb */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#14151c] px-2.5 py-1 text-xs text-neutral-300">
            <Folder className="size-3 text-neutral-400" />
            <span className="max-w-44 truncate">Canvas Hub</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-[rgba(255,255,255,0.08)] bg-[#14151c] px-2 py-0.5 font-mono text-[11px] text-neutral-400">
            <span>Free</span>
          </div>
          <div className="flex size-7 items-center justify-center rounded-full bg-neutral-800 font-mono text-xs font-semibold text-neutral-200">
            A
          </div>
        </div>
      </header>

      {/* Main Hub Body */}
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
        {/* Category Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {TEMPLATE_CATEGORIES.map((cat) => {
            const Icon = cat.icon
            const isSelected = selectedCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-150 active:scale-[0.97]",
                  isSelected
                    ? "border border-[rgba(255,255,255,0.2)] bg-[#1a1b23] text-white shadow-sm"
                    : "border border-transparent text-neutral-400 hover:border-[rgba(255,255,255,0.08)] hover:bg-[#14151c] hover:text-neutral-200"
                )}
              >
                <Icon className={cn("size-3.5", isSelected ? "text-accent-text" : "opacity-60")} />
                <span>{cat.label}</span>
              </button>
            )
          })}
        </div>

        {/* Hero AI Prompt Box (Glowing Box matching pen.dev Image 2) */}
        <div className="relative mt-6 rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[#121319]/90 p-4 shadow-2xl transition-all duration-200 hover:border-[#10b981]/40 hover:shadow-[0_0_35px_rgba(16,185,129,0.12)] focus-within:border-[#10b981]/60 focus-within:shadow-[0_0_40px_rgba(16,185,129,0.18)]">
          <textarea
            rows={3}
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleCreate()
              }
            }}
            placeholder="Design anything…"
            className="w-full resize-none bg-transparent text-sm text-neutral-100 placeholder:text-neutral-500 outline-none leading-relaxed"
          />

          {/* Bottom Toolbar inside Prompt Box */}
          <div className="mt-3 flex items-center justify-between border-t border-[rgba(255,255,255,0.06)] pt-3">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <button
                type="button"
                title="Add attachment"
                className="flex size-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-neutral-200 active:scale-[0.97] transition-all"
              >
                <Plus className="size-4" />
              </button>

              <span className="flex items-center gap-1 rounded-md bg-[rgba(255,255,255,0.05)] px-2 py-0.5 font-mono text-[11px] text-amber-400/90">
                <span>⚡ 1x</span>
              </span>

              <span className="flex items-center gap-1 rounded-md bg-[rgba(255,255,255,0.05)] px-2 py-0.5 font-mono text-[11px] text-neutral-400">
                <span>⚅ 1x</span>
              </span>

              <div className="flex items-center gap-1 rounded-md bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-xs text-neutral-300">
                <span>{activeModel}</span>
                <ChevronDown className="size-3 text-neutral-500" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCreate()}
              disabled={!promptText.trim()}
              className="flex size-8 items-center justify-center rounded-full bg-neutral-200 text-black hover:bg-white active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all shadow"
            >
              <ArrowUp className="size-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* 3 Quick Start Action Cards */}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => handleCreate("Mobile App Prototype", "Create a modern iOS mobile habit tracker screen")}
            className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#13141b]/60 p-5 text-center transition-all duration-150 hover:border-[rgba(255,255,255,0.18)] hover:bg-[#181922] active:scale-[0.98]"
          >
            <Smartphone className="size-5 text-accent-text opacity-80" />
            <span className="text-xs font-medium text-neutral-300">New Mobile Frame</span>
          </button>

          <button
            type="button"
            onClick={() => handleCreate("Landing Page Hero", "Design a clean high-converting landing page hero section")}
            className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#13141b]/60 p-5 text-center transition-all duration-150 hover:border-[rgba(255,255,255,0.18)] hover:bg-[#181922] active:scale-[0.98]"
          >
            <Globe className="size-5 text-blue-400 opacity-80" />
            <span className="text-xs font-medium text-neutral-300">Landing Page Hero</span>
          </button>

          <button
            type="button"
            onClick={() => handleCreate("Blank Scratchpad", "Start with an empty blank frame in Global Scratchpad")}
            className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#13141b]/60 p-5 text-center transition-all duration-150 hover:border-[rgba(255,255,255,0.18)] hover:bg-[#181922] active:scale-[0.98]"
          >
            <Layers className="size-5 text-emerald-400 opacity-80" />
            <span className="text-xs font-medium text-neutral-300">Blank Scratchpad</span>
          </button>
        </div>

        {/* Canvases / Documents Section */}
        <div className="mt-12 flex flex-col">
          {/* Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.06)] pb-3">
            {/* Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("recents")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === "recents"
                    ? "bg-[#1f202a] text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                Recents
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("drafts")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === "drafts"
                    ? "bg-[#1f202a] text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                Drafts
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("scratchpad")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === "scratchpad"
                    ? "bg-[#1f202a] text-white"
                    : "text-neutral-400 hover:text-neutral-200"
                )}
              >
                Global Scratchpad
              </button>
            </div>

            {/* Right: Search & View Mode */}
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
                <input
                  type="text"
                  placeholder="Filter canvases…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#14151c] pl-8 pr-3 text-xs text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-accent-text/60"
                />
              </div>

              <div className="flex items-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#14151c] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    viewMode === "grid" ? "bg-[#252632] text-white" : "text-neutral-400 hover:text-neutral-200"
                  )}
                  title="Grid View"
                >
                  <LayoutGrid className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    viewMode === "list" ? "bg-[#252632] text-white" : "text-neutral-400 hover:text-neutral-200"
                  )}
                  title="List View"
                >
                  <ListIcon className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Table / List View */}
          <div className="mt-4">
            {filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] p-12 text-center text-neutral-500">
                <FileCode className="size-8 opacity-40 mb-2" />
                <p className="text-sm font-medium text-neutral-400">No canvases found</p>
                <p className="mt-1 text-xs text-neutral-500 max-w-sm">
                  Type an idea in the prompt box above or click a quick-start card to create your first visual canvas.
                </p>
              </div>
            ) : viewMode === "list" ? (
              <div className="divide-y divide-[rgba(255,255,255,0.04)] rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111218]/80 overflow-hidden">
                {/* Column header */}
                <div className="grid grid-cols-12 px-4 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-neutral-500 bg-[#14151d]">
                  <div className="col-span-6">NAME</div>
                  <div className="col-span-3">LAST USED</div>
                  <div className="col-span-2">CREATED</div>
                  <div className="col-span-1 text-right">ACTIONS</div>
                </div>

                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className="group grid grid-cols-12 items-center px-4 py-3 text-xs transition-colors hover:bg-[#181923] cursor-pointer"
                  >
                    {/* Name + Thumbnail */}
                    <div className="col-span-6 flex items-center gap-3 pr-4">
                      {/* Thumbnail Placeholder */}
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-gradient-to-br from-[#1c1d27] to-[#12131a] text-neutral-400 shadow-sm group-hover:border-accent-text/40 transition-colors">
                        <FileCode className="size-5 text-accent-text opacity-70" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-200 truncate group-hover:text-white transition-colors">
                            {session.title}
                          </span>
                          {session.workspace_id === "scratchpad" && (
                            <span className="rounded bg-accent-text/10 px-1.5 py-0.2 font-mono text-[10px] text-accent-text">
                              scratchpad
                            </span>
                          )}
                        </div>
                        <div className="truncate font-mono text-[11px] text-neutral-500">
                          design / {session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pen
                        </div>
                      </div>
                    </div>

                    {/* Last Used */}
                    <div className="col-span-3 text-neutral-400 text-xs flex items-center gap-1.5">
                      <Clock className="size-3 text-neutral-500" />
                      <span>{new Date(session.last_active_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>

                    {/* Created */}
                    <div className="col-span-2 text-neutral-500 text-xs font-mono">
                      {new Date(session.created_at * 1000).toLocaleDateString()}
                    </div>

                    {/* Actions Context Menu */}
                    <div className="col-span-1 flex justify-end relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setContextMenuId(contextMenuId === session.id ? null : session.id)
                        }}
                        className="flex size-7 items-center justify-center rounded-md text-neutral-400 hover:bg-[rgba(255,255,255,0.08)] hover:text-white transition-colors"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>

                      {contextMenuId === session.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-8 z-50 w-44 rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#181922] p-1 shadow-2xl backdrop-blur-md animate-in fade-in duration-100"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setContextMenuId(null)
                              onSelectSession(session.id)
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-[rgba(255,255,255,0.08)]"
                          >
                            <ExternalLink className="size-3.5 text-accent-text" />
                            <span>Open Canvas</span>
                          </button>

                          {onForkSession && (
                            <button
                              type="button"
                              onClick={() => {
                                setContextMenuId(null)
                                onForkSession(session.id)
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-[rgba(255,255,255,0.08)]"
                            >
                              <GitFork className="size-3.5 text-neutral-400" />
                              <span>Duplicate / Fork</span>
                            </button>
                          )}

                          {onPromoteSession && (
                            <button
                              type="button"
                              onClick={() => {
                                setContextMenuId(null)
                                onPromoteSession(session)
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-[rgba(255,255,255,0.08)]"
                            >
                              <ArrowUpRight className="size-3.5 text-emerald-400" />
                              <span>Promote to Task</span>
                            </button>
                          )}

                          {onDiscardSession && (
                            <button
                              type="button"
                              onClick={() => {
                                setContextMenuId(null)
                                if (window.confirm("Discard this canvas?")) {
                                  onDiscardSession(session.id)
                                }
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="size-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Grid view */
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className="group flex flex-col rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111218]/80 p-4 transition-all duration-150 hover:border-accent-text/40 hover:bg-[#181923] cursor-pointer shadow-sm hover:shadow-lg"
                  >
                    <div className="flex h-36 w-full items-center justify-center rounded-lg border border-[rgba(255,255,255,0.06)] bg-gradient-to-br from-[#1a1b26] to-[#0f1016] text-neutral-500">
                      <FileCode className="size-8 text-accent-text opacity-60 group-hover:scale-105 transition-transform" />
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-medium text-xs text-neutral-200 truncate group-hover:text-white transition-colors">
                          {session.title}
                        </h4>
                        <p className="mt-0.5 font-mono text-[10px] text-neutral-500 truncate">
                          design / {session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pen
                        </p>
                      </div>
                      {session.workspace_id === "scratchpad" && (
                        <span className="rounded bg-accent-text/10 px-1.5 py-0.2 font-mono text-[9px] text-accent-text shrink-0">
                          scratchpad
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
