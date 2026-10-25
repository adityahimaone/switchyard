import { useState, useMemo, useRef } from "react"
import {
  Smartphone,
  Globe,
  Layout,
  Plus,
  ArrowUp,
  FileCode2,
  Clock,
  Layers,
  ArrowUpRight,
  GitFork,
  Trash2,
  LayoutGrid,
  List as ListIcon,
  Search,
  Upload,
  Sparkles,
} from "lucide-react"
import type { CanvasSession } from "./CanvasPage"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface CanvasHubProps {
  sessions: CanvasSession[]
  onSelectSession: (id: string) => void
  onCreateSession: (params: { title: string; brief: string; category?: string; model?: string; initialPenJson?: string }) => void
  onImportPenFile: (file: File) => void
  onForkSession?: (id: string) => void
  onDiscardSession?: (id: string) => void
  onPromoteSession?: (session: CanvasSession) => void
  activeModel?: string
  models?: { value: string; label: string }[]
}

const TEMPLATE_PRESETS = [
  {
    id: "scratchpad",
    label: "Blank Scratchpad",
    description: "Instant global canvas without repository binding",
    icon: Sparkles,
    badge: "0 Token",
    width: 600,
    height: 400,
  },
  {
    id: "mobile",
    label: "Mobile Screen",
    description: "390 × 844 iPhone frame with iOS navigation bar",
    icon: Smartphone,
    badge: "390 × 844",
    width: 390,
    height: 844,
  },
  {
    id: "web",
    label: "Web Component",
    description: "Responsive dashboard card with header & stats",
    icon: Globe,
    badge: "800 × 500",
    width: 800,
    height: 500,
  },
  {
    id: "card",
    label: "Dialog / Bento Card",
    description: "480 × 320 interactive modal with action buttons",
    icon: Layout,
    badge: "480 × 320",
    width: 480,
    height: 320,
  },
]

export function CanvasHub({
  sessions,
  onSelectSession,
  onCreateSession,
  onImportPenFile,
  onForkSession,
  onDiscardSession,
  onPromoteSession,
  activeModel = "DeepSeek V4.1 Flash",
  models = [],
}: CanvasHubProps) {
  const [promptText, setPromptText] = useState("")
  const [selectedModel, setSelectedModel] = useState(activeModel)
  const [activeTab, setActiveTab] = useState<"all" | "scratchpad" | "tasks">("all")
  const [viewMode, setViewMode] = useState<"list" | "grid">("list")
  const [searchQuery, setSearchQuery] = useState("")
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      if (activeTab === "tasks") {
        return s.workspace_id !== "scratchpad"
      }
      return true
    })
  }, [sessions, activeTab, searchQuery])

  const handleCreate = (overrideTitle?: string, overrideBrief?: string, category = "custom") => {
    const title = overrideTitle || promptText.trim() || "New Design Canvas"
    const brief = overrideBrief || promptText.trim()
    onCreateSession({
      title,
      brief,
      category,
      model: selectedModel,
    })
    setPromptText("")
  }

  // File drop handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      if (file.name.endsWith(".pen") || file.name.endsWith(".json")) {
        onImportPenFile(file)
      }
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      onImportPenFile(file)
      e.target.value = ""
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex h-full w-full flex-col overflow-y-auto bg-background font-sans text-foreground select-none relative"
    >
      {/* Hidden File Input for .pen file import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pen,.json"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md border-2 border-dashed border-accent-text pointer-events-none">
          <Upload className="size-12 text-accent-text animate-bounce mb-3" />
          <h3 className="text-base font-semibold text-foreground">Drop .pen file here to import</h3>
          <p className="text-xs text-muted-foreground mt-1">Directly opens in 0-token Canvas Studio</p>
        </div>
      )}

      {/* Standard App Header matching Design System */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/60 px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent-text/10 text-accent-text border border-accent-text/20">
            <Sparkles className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-sm text-foreground">Canvas Studio</h1>
              <span className="rounded-md bg-accent-text/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-accent-text border border-accent-text/20">
                0-Token Native
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">Visual design workspace powered by pen.dev</p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 gap-1.5 text-xs border-border hover:bg-muted active:scale-[0.98]"
          >
            <Upload className="size-3.5 text-muted-foreground" />
            <span>Import .pen</span>
          </Button>

          <Button
            size="sm"
            onClick={() => handleCreate("New Canvas", "", "scratchpad")}
            className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground font-semibold hover:opacity-90 active:scale-[0.98]"
          >
            <Plus className="size-3.5" />
            <span>New Canvas</span>
          </Button>
        </div>
      </header>

      {/* Main Hub Body */}
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-6 space-y-6">
        {/* Quick Start Presets */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Start Presets
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TEMPLATE_PRESETS.map((tmpl) => {
              const Icon = tmpl.icon
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleCreate(tmpl.label, "", tmpl.id)}
                  className="flex flex-col text-left rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-foreground/20 hover:bg-muted/50 active:scale-[0.98] shadow-xs group"
                >
                  <div className="flex items-center justify-between w-full mb-3">
                    <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-accent-text/10 group-hover:text-accent-text transition-colors">
                      <Icon className="size-4" />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground group-hover:text-foreground">
                      {tmpl.badge}
                    </span>
                  </div>
                  <h3 className="font-semibold text-xs text-foreground group-hover:text-accent-text transition-colors">
                    {tmpl.label}
                  </h3>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {tmpl.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* AI Brief Prompt Capsule */}
        <div className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-accent-text" />
              <span>Prompt AI Designer (Optional)</span>
            </span>
            {models.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-7 rounded-lg border border-border bg-muted/60 px-2 font-mono text-[11px] text-foreground outline-none"
              >
                {models.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && promptText.trim()) {
                  handleCreate()
                }
              }}
              placeholder="Describe what to design (e.g., Settings dialog with dark mode toggle, Pricing cards)..."
              className="w-full rounded-xl border border-border bg-muted/40 py-2.5 pl-3.5 pr-11 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-accent-text focus:ring-1 focus:ring-accent-text"
            />
            <button
              type="button"
              onClick={() => handleCreate()}
              disabled={!promptText.trim()}
              className="absolute right-1.5 flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all shadow-xs"
              title="Generate Canvas"
            >
              <ArrowUp className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Documents Section Header */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
            {/* Tabs Filter */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("all")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.98]",
                  activeTab === "all"
                    ? "bg-muted text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                All Canvases ({sessions.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("scratchpad")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.98]",
                  activeTab === "scratchpad"
                    ? "bg-muted text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                Global Scratchpad
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("tasks")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.98]",
                  activeTab === "tasks"
                    ? "bg-muted text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                Task Canvases
              </button>
            </div>

            {/* Search & View Switcher */}
            <div className="flex items-center gap-2">
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter canvases..."
                  className="h-8 w-44 rounded-lg border border-border bg-muted/40 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-accent-text"
                />
              </div>

              <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-all",
                    viewMode === "list" && "bg-background text-foreground shadow-xs font-semibold"
                  )}
                  title="List view"
                >
                  <ListIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-all",
                    viewMode === "grid" && "bg-background text-foreground shadow-xs font-semibold"
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Canvas Documents List / Grid */}
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-12 text-center">
              <FileCode2 className="size-10 text-muted-foreground/60 mb-3" />
              <h4 className="text-sm font-semibold text-foreground">No design canvases found</h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Create a new canvas from a preset above, or drag and drop a <code>.pen</code> file to start editing.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCreate("Blank Canvas")}
                className="mt-4 h-8 gap-1.5 text-xs border-border"
              >
                <Plus className="size-3.5" />
                <span>Create Blank Canvas</span>
              </Button>
            </div>
          ) : viewMode === "list" ? (
            <div className="overflow-hidden rounded-xl border border-border bg-card divide-y divide-border">
              {filteredSessions.map((s) => {
                const isScratchpad = s.workspace_id === "scratchpad"
                const lastActive = new Date(s.last_active_at || s.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })

                return (
                  <div
                    key={s.id}
                    onClick={() => onSelectSession(s.id)}
                    className="flex items-center justify-between p-3.5 hover:bg-muted/40 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground group-hover:text-accent-text group-hover:border-accent-text/30 transition-colors">
                        <Layers className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-foreground truncate group-hover:text-accent-text transition-colors">
                            {s.title}
                          </span>
                          {isScratchpad ? (
                            <span className="rounded bg-accent-text/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-accent-text border border-accent-text/20">
                              Scratchpad
                            </span>
                          ) : (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground border border-border">
                              {s.branch}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 font-mono">
                          <span>{s.workspace_id}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {lastActive}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      {onPromoteSession && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPromoteSession(s)
                          }}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent-text/10 hover:text-accent-text transition-colors"
                          title="Promote to Task Card"
                        >
                          <ArrowUpRight className="size-3.5" />
                        </button>
                      )}

                      {onForkSession && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onForkSession(s.id)
                          }}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Fork / Duplicate"
                        >
                          <GitFork className="size-3.5" />
                        </button>
                      )}

                      {onDiscardSession && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm(`Discard canvas "${s.title}"?`)) {
                              onDiscardSession(s.id)
                            }
                          }}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Discard Canvas"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSessions.map((s) => {
                const isScratchpad = s.workspace_id === "scratchpad"
                const lastActive = new Date(s.last_active_at || s.created_at).toLocaleDateString()

                return (
                  <div
                    key={s.id}
                    onClick={() => onSelectSession(s.id)}
                    className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-foreground/20 hover:bg-muted/40 cursor-pointer group shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-muted/60 text-muted-foreground group-hover:text-accent-text transition-colors">
                          <Layers className="size-4" />
                        </div>
                        {isScratchpad ? (
                          <span className="rounded bg-accent-text/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-accent-text">
                            Scratchpad
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-muted-foreground truncate max-w-32">
                            {s.branch}
                          </span>
                        )}
                      </div>
                      <h4 className="font-semibold text-xs text-foreground group-hover:text-accent-text transition-colors truncate">
                        {s.title}
                      </h4>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {s.workspace_id} • {lastActive}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-1 border-t border-border/50 pt-2">
                      {onPromoteSession && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onPromoteSession(s)
                          }}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent-text/10 hover:text-accent-text transition-colors"
                          title="Promote to Task Card"
                        >
                          <ArrowUpRight className="size-3.5" />
                        </button>
                      )}
                      {onDiscardSession && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm(`Discard canvas "${s.title}"?`)) {
                              onDiscardSession(s.id)
                            }
                          }}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                          title="Discard Canvas"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
