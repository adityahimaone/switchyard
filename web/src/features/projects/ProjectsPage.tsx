import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { deleteChatProject, listChatProjects, type ChatProject, type Workspace } from "@/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader } from "@/components/app/page-header"
import { EmptyState } from "@/components/app/empty-state"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import LoadingState from "@/components/feedback/loading-state"
import { executorDef } from "./executors"
import { ProjectDialog } from "./ProjectDialog"

type Props = {
  workspaces: Workspace[]
  onOpenProject: (project: ChatProject) => void
}

function isLive(w: Workspace): boolean {
  return w.status === "connected" || w.status === "local"
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

