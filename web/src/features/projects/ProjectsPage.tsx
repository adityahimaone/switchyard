import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import {
  createChatProject, deleteChatProject, listChatProjects, updateChatProject,
  type ChatAgent, type ChatProject, type Workspace,
} from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader } from "@/components/app/page-header"
import { EmptyState } from "@/components/app/empty-state"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { cn } from "@/lib/utils"
import LoadingState from "@/components/feedback/loading-state"
import { EXECUTORS, defaultOptions, executorDef, optionValue, withOption } from "./executors"

type Props = {
  workspaces: Workspace[]
  onOpenProject: (project: ChatProject) => void
}

function isLive(w: Workspace): boolean {
  return w.status === "connected" || w.status === "local"
}

type Form = {
  name: string
  description: string
  color: string
  workspace: string
  executor: ChatAgent
  options: string
}

const emptyForm: Form = { name: "", description: "", color: "", workspace: "", executor: "hermes", options: "{}" }

function formFrom(p: ChatProject): Form {
  return {
    name: p.name, description: p.description ?? "", color: p.color ?? "",
    workspace: p.workspace, executor: p.executor || "hermes", options: p.options || "{}",
  }
}

export default function ProjectsPage({ workspaces, onOpenProject }: Props) {
  const qc = useQueryClient()
  const projects = useQuery({ queryKey: ["chat-projects"], queryFn: listChatProjects })
  const [editing, setEditing] = useState<ChatProject | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<ChatProject | null>(null)

  const items = projects.data ?? []

  const remove = useMutation({
    mutationFn: (id: string) => deleteChatProject(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["chat-projects"] }); setDeleting(null) },
  })

  if (projects.isLoading) return <LoadingState label="Loading projects" />

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-line px-6 py-4">
        <PageHeader
          title="Projects"
          description="Chat that codes directly in a workspace — no board, no cards."
          actions={
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New project
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {items.length === 0 ? (
          <EmptyState
            title="No projects yet"
            hint="A project binds one workspace and one executor. Open it to code straight from chat."
            action={<Button size="sm" onClick={() => setCreating(true)}><Plus className="size-4" /> New project</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => {
              const def = executorDef(p.executor)
              const ws = workspaces.find((w) => w.path === p.workspace)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpenProject(p)}
                  className="group flex flex-col gap-2 rounded-card border border-line bg-surface p-4 text-left outline-none transition-colors hover:border-line-strong hover:bg-raised focus-visible:ring-[3px] focus-visible:ring-focus/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color || "var(--c-accent)" }}
                      />
                      <span className="truncate text-sm font-medium text-ink">{p.name}</span>
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`${p.name} actions`}
                          className="shrink-0 rounded-control p-1 text-ink-3 opacity-0 outline-none hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-focus/40"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onSelect={() => setEditing(p)}><Pencil className="size-3.5" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(p)}><Trash2 className="size-3.5" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {p.description && <p className="line-clamp-2 text-xs text-ink-3">{p.description}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-3">
                    <span className="inline-flex items-center gap-1 rounded-control border border-line px-1.5 py-0.5 text-ink-2">
                      {def.label}
                    </span>
                    <span className="truncate" title={p.workspace}>
                      {ws ? ws.name : p.workspace.split("/").filter(Boolean).pop() || p.workspace}
                    </span>
                    {ws && !isLive(ws) && <span className="text-danger-text">offline</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {(creating || editing) && (
        <ProjectDialog
          workspaces={workspaces}
          project={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { void qc.invalidateQueries({ queryKey: ["chat-projects"] }); setCreating(false); setEditing(null) }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setDeleting(null) }}
          title={`Delete ${deleting.name}?`}
          description="The project is removed. Its chat sessions stay but lose the project binding."
          confirmLabel="Delete"
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deleting.id)}
        />
      )}
    </div>
  )
}

function ProjectDialog({
  workspaces, project, onClose, onSaved,
}: {
  workspaces: Workspace[]
  project?: ChatProject
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Form>(project ? formFrom(project) : { ...emptyForm })
  const [error, setError] = useState("")
  const def = executorDef(form.executor)
  const selectedWs = workspaces.find((w) => w.path === form.workspace)

  function setExecutor(executor: ChatAgent) {
    // Reset the knob blob to that executor's default so a stale dsh key never
    // rides along on a commandcode project.
    setForm((f) => ({ ...f, executor, options: defaultOptions(executor) }))
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        workspace: form.workspace,
        executor: form.executor,
        options: form.options,
        description: form.description,
      }
      return project ? updateChatProject(project.id, payload) : createChatProject(payload)
    },
    onSuccess: () => onSaved(),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
  })

  function submit() {
    setError("")
    if (!form.name.trim()) { setError("Name is required"); return }
    if (!form.workspace) { setError("Pick a workspace"); return }
    save.mutate()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>Bind a workspace and an executor. Chat in this project codes directly.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Name</Label>
            <Input id="proj-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="My project" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea id="proj-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>Workspace</Label>
            <Select value={form.workspace || undefined} onValueChange={(v) => setForm({ ...form, workspace: v })}>
              <SelectTrigger aria-label="Workspace"><SelectValue placeholder="Pick a registered workspace" /></SelectTrigger>
              <SelectContent className="max-w-80">
                {workspaces.length === 0 && <p className="px-2 py-1.5 text-xs text-ink-3">No workspaces registered</p>}
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.path} title={w.path}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      {isLive(w) && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-success" />}
                      <span className="min-w-0 flex-1 truncate">{w.name}</span>
                      <span className="shrink-0 text-2xs text-ink-3">{w.os || ""}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedWs && !isLive(selectedWs) && (
              <p className="text-2xs text-danger-text">This workspace is offline; remote executors need it reachable.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Executor</Label>
            <Select value={form.executor} onValueChange={(v) => setExecutor(v as ChatAgent)}>
              <SelectTrigger aria-label="Executor"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXECUTORS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-2xs text-ink-3">
              {def.modelSelectable
                ? "Model is selectable per chat from the provider roster."
                : "Model is fixed by the harness; pick its " + (def.option?.label ?? "option") + " below."}
            </p>
          </div>

          {def.option && (
            <div className="space-y-1.5">
              <Label>{def.option.label}</Label>
              <Select
                value={optionValue(form.options, form.executor)}
                onValueChange={(v) => setForm((f) => ({ ...f, options: withOption(f.options, f.executor, v) }))}
              >
                <SelectTrigger aria-label={def.option.label}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {def.option.choices.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.executor === "dsh" && optionValue(form.options, "dsh") !== "danger-full-access" && (
                <p className="text-2xs text-danger-text">
                  Non-full-access presets ask for approval, which the headless harness cannot answer — runs may fail closed.
                </p>
              )}
            </div>
          )}

          {error && <p className={cn("text-xs text-danger-text")}>{error}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : project ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
