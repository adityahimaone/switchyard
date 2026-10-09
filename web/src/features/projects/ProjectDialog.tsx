import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createChatProject, updateChatProject, type ChatAgent, type ChatProject, type Workspace } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { EXECUTORS, defaultOptions, executorDef, optionValue, withOption } from "./executors"

/* One dialog, two mounts: the Projects grid (create/edit) and the chat rail's
   inline "New project" so a project can be added without leaving chat. It owns
   its own save mutation and invalidates the shared `chat-projects` key, so
   neither caller has to wire the create/update plumbing. */

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

function isLive(w: Workspace): boolean { return w.status === "connected" || w.status === "local" }

export function ProjectDialog({
  workspaces, project, onClose, onSaved,
}: {
  workspaces: Workspace[]
  project?: ChatProject
  onClose: () => void
  onSaved?: (p: ChatProject) => void
}) {
  const qc = useQueryClient()
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
    onSuccess: (p) => { void qc.invalidateQueries({ queryKey: ["chat-projects"] }); onSaved?.(p) },
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
