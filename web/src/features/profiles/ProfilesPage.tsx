import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, setProfileAvatarUrl, uploadProfileAvatar, type Profile, type ProfileDetail } from "@/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { EntryCard, Metric } from "@/components/app/entry-card"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EmptyState } from "@/components/app/empty-state"
import { FilterBar } from "@/components/app/filter-bar"
import { PageHeader } from "@/components/app/page-header"
import { StatusLamp } from "@/components/ui/status-lamp"
import {
  AlertCircle, Bot, ImagePlus, Link2, Loader2, MoreHorizontal, Pencil, Plus,
  ShieldAlert, ShieldCheck, Trash2, X,
} from "lucide-react"
import LoadingState from "@/components/feedback/loading-state"

const FALLBACK_PROVIDERS = [
  "custom", "auto", "anthropic", "openai", "openrouter", "google",
  "groq", "deepseek", "mistral", "xai", "ollama",
]

const NAME_RE = /^[a-z0-9_-]{1,32}$/

function FieldError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-danger-text" role="alert">
      <AlertCircle className="mt-px size-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

function ProfileForm({
  initial,
  onClose,
  onSave,
}: {
  initial?: ProfileDetail | null
  onClose: () => void
  onSave: (data: Record<string, unknown>) => Promise<unknown>
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name ?? "")
  const [model, setModel] = useState(initial?.model?.trim() ?? "")
  const [provider, setProvider] = useState(initial?.provider || "custom")
  const [prompt, setPrompt] = useState(initial?.system_prompt ?? "")
  const [selectedSkills, setSelectedSkills] = useState<string[]>(initial?.skills ?? [])
  const [skillQ, setSkillQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [nameErr, setNameErr] = useState<string | null>(null)
  const [modelQ, setModelQ] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [avatarPreview, setAvatarPreview] = useState(initial?.avatar_url ?? "")
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarErr, setAvatarErr] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const profileQueries = useQueryClient()
  const skillsQ = useQuery({
    queryKey: ["skills"],
    queryFn: () => api<{ name: string; description: string }[]>("/api/skills"),
  })
  const providersQ = useQuery({
    queryKey: ["providers"],
    queryFn: () => api<{ name: string; base_url: string; default_model: string; models: string[] }[]>("/api/providers"),
  })
  // Provider select: registry allowlist only — custom_providers names are
  // endpoints, not valid `provider:` values (hermes rejects them at boot).
  const providerNames = FALLBACK_PROVIDERS
  const providerRoster = providersQ.data ?? []
  // Model picker: roster of the endpoint matching this profile's base_url.
  // Fallback: roster whose default_model == current model, else the
  // default endpoint (first roster) so "New profile" still shows models.
  const activeProvider =
    providerRoster.find((p) => p.base_url && p.base_url === initial?.base_url) ??
    providerRoster.find((p) => p.default_model === model) ??
    providerRoster.find((p) => p.base_url === "https://9router.adityahimaone.space/v1") ??
    providerRoster[0]
  const modelOptions: string[] = Array.from(new Set([...(activeProvider?.models ?? []), ...(model ? [model] : [])])).sort()
  const filteredModels = modelQ ? modelOptions.filter((m) => m.toLowerCase().includes(modelQ.toLowerCase())).slice(0, 80) : modelOptions.slice(0, 80)
  const canSubmit = !busy && (editing || NAME_RE.test(name.trim()))

  function addSkill(skill: string) {
    setSelectedSkills((items) => (items.includes(skill) ? items : [...items, skill].sort()))
    setSkillQ("")
  }
  function removeSkill(skill: string) {
    setSelectedSkills((items) => items.filter((item) => item !== skill))
  }

  async function onAvatarPicked(f: File) {
    if (!initial) return
    setAvatarBusy(true); setAvatarErr(null)
    try {
      await uploadProfileAvatar(initial.name, f)
      profileQueries.invalidateQueries({ queryKey: ["profiles-full"] })
      profileQueries.invalidateQueries({ queryKey: ["profiles"] })
      setAvatarPreview(`/api/profiles/${initial.name}/avatar?ts=${Date.now()}`)
    } catch (e) {
      setAvatarErr((e as Error).message)
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onAvatarUrlSaved() {
    if (!initial) return
    setAvatarBusy(true); setAvatarErr(null)
    try {
      const saved = await setProfileAvatarUrl(initial.name, avatarUrl)
      profileQueries.invalidateQueries({ queryKey: ["profiles-full"] })
      profileQueries.invalidateQueries({ queryKey: ["profiles"] })
      setAvatarPreview(saved.avatar_url ?? avatarUrl)
      setAvatarUrl("")
    } catch (e) {
      setAvatarErr((e as Error).message)
    } finally {
      setAvatarBusy(false)
    }
  }

  async function onAvatarRemoved() {
    if (!initial) return
    setAvatarBusy(true); setAvatarErr(null)
    try {
      await api(`/api/profiles/${initial.name}/avatar`, { method: "DELETE" })
      profileQueries.invalidateQueries({ queryKey: ["profiles-full"] })
      profileQueries.invalidateQueries({ queryKey: ["profiles"] })
      setAvatarPreview("")
    } catch (e) {
      setAvatarErr((e as Error).message)
    } finally {
      setAvatarBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) {
      const trimmed = name.trim()
      if (!NAME_RE.test(trimmed)) {
        setNameErr("Lowercase letters, digits, - or _ (max 32)")
        return
      }
    }
    setBusy(true); setErr(null); setNameErr(null)
    try {
      const skills = [...new Set(selectedSkills.map((skill) => skill.trim()).filter(Boolean))].sort()
      const saved = editing
        ? await onSave({ model: model.trim(), provider, system_prompt: prompt, skills })
        : await onSave({ name: name.trim(), model: model.trim(), provider, system_prompt: prompt, skills })
      if (saved && typeof saved === "object" && "skills" in saved) {
        const returnedSkills = (saved as { skills?: unknown }).skills
        if (JSON.stringify(returnedSkills) !== JSON.stringify([...selectedSkills].sort())) {
          throw new Error("Profile saved with different skills; reload and try again")
        }
      }
      onClose()
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  const skillMatches = skillQ.trim()
    ? (skillsQ.data ?? []).filter((skill) => !selectedSkills.includes(skill.name) && skill.name.toLowerCase().includes(skillQ.trim().toLowerCase())).slice(0, 20)
    : []

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-xl sm:max-w-xl">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit profile · ${initial?.name}` : "New agent profile"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Saved to ~/.hermes/profiles/ on the control plane. The name is fixed after creation."
                : "Creates ~/.hermes/profiles/<name>/ with config.yaml, SOUL.md, and skills/."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {editing && (
              <section className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="size-14 shrink-0 rounded-lg">
                    {avatarPreview ? <AvatarImage src={avatarPreview} alt={initial?.name ?? ""} /> : null}
                    <AvatarFallback className="rounded-lg bg-[var(--color-inset)] text-sm text-[var(--color-accent)]">
                      {initial?.name.slice(0, 2).toUpperCase() ?? "AG"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <Label className="text-xs text-ink-2">Avatar</Label>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Button type="button" variant="outline" size="sm" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                        {avatarBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                        Upload
                      </Button>
                      {!!avatarPreview && (
                        <Button type="button" variant="outline" size="sm" disabled={avatarBusy} onClick={onAvatarRemoved}>
                          <Trash2 className="size-3.5" /> Remove
                        </Button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[10px] leading-snug text-ink-3">PNG / JPEG / GIF (animated) / WebP, max 2 MB</p>
                  </div>
                </div>
                <div className="mt-3 flex items-end gap-1.5">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="avatar-url" className="text-[11px] text-ink-3">Or paste an image URL</Label>
                    <Input
                      id="avatar-url"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://…/avatar.png"
                      className="mt-1 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={avatarBusy || !avatarUrl.trim()}
                    onClick={onAvatarUrlSaved}
                    className="h-8 shrink-0"
                  >
                    <Link2 className="size-3.5" /> Set
                  </Button>
                </div>
                <FieldError>{avatarErr}</FieldError>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onAvatarPicked(f)
                    e.currentTarget.value = ""
                  }}
                />
              </section>
            )}

            {!editing && (
              <div>
                <Label htmlFor="profile-name" className="text-xs text-ink-2">
                  Name
                </Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (nameErr) setNameErr(null) }}
                  placeholder="karina"
                  autoFocus
                  aria-invalid={!!nameErr}
                  aria-describedby={nameErr ? "profile-name-error" : "profile-name-help"}
                  className="mt-1.5 border-line bg-well font-mono"
                />
                <p id="profile-name-help" className="mt-1.5 text-[11px] text-ink-3">
                  Lowercase letters, digits, <code className="font-mono">-</code>, and <code className="font-mono">_</code>. Max 32 characters. Used as the folder name.
                </p>
                {nameErr && <span id="profile-name-error"><FieldError>{nameErr}</FieldError></span>}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs text-ink-2">Provider</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger className="mt-1.5 w-full border-line bg-well">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {providerNames.map((p) => <SelectItem key={p} value={p} className="text-sm">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-ink-2">Model</Label>
                <Select value={model || "__default"} onValueChange={(value) => setModel(value === "__default" ? "" : value)}>
                  <SelectTrigger size="sm" className="mt-1.5 w-full border-line bg-well">
                    <SelectValue>{model || "model default"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" className="h-[300px] max-h-[300px] w-72 min-w-72 max-w-72 border-[var(--color-line)] bg-[var(--color-surface)]">
                    <div className="sticky top-0 z-10 bg-[var(--color-surface)] p-1" onKeyDown={(event) => event.stopPropagation()}>
                      <Input value={modelQ} onChange={(event) => setModelQ(event.target.value)} placeholder="Search model…" aria-label="Search models" className="border-line bg-well text-xs" />
                    </div>
                    <SelectItem value="__default">model default</SelectItem>
                    {filteredModels.length === 0 && <p className="px-2 py-1.5 text-xs text-ink-3">No model found</p>}
                    {filteredModels.map((value) => <SelectItem key={value} value={value} className="max-w-72 truncate text-sm" title={value}>{value}</SelectItem>)}
                  </SelectContent>
                </Select>
                {activeProvider && (
                  <p className="mt-1.5 truncate text-[10px] text-ink-3" title={activeProvider.base_url}>
                    {modelOptions.length} model{modelOptions.length === 1 ? "" : "s"} from {activeProvider.name}
                  </p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs text-ink-2">Skills</Label>
                {selectedSkills.length > 0 && (
                  <span className="text-[11px] tabular-nums text-ink-3">{selectedSkills.length} selected</span>
                )}
              </div>
              <div className="mt-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-2">
                {selectedSkills.length > 0 && (
                  <div
                    className="max-h-28 overflow-y-auto"
                    role="list"
                    aria-label={`Selected skills, ${selectedSkills.length}`}
                  >
                    <div className="flex flex-wrap gap-1.5 pr-1">
                      {selectedSkills.map((skill) => (
                        <Badge key={skill} variant="secondary" className="gap-1 pr-1 text-[11px]" role="listitem">
                          {skill}
                          <button
                            type="button"
                            aria-label={`Remove ${skill}`}
                            onClick={() => removeSkill(skill)}
                            className="flex size-3.5 items-center justify-center rounded-sm outline-none hover:bg-[var(--color-line)] focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]"
                          >
                            <X className="size-2.5" aria-hidden="true" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selectedSkills.length === 0 && (
                  <p className="py-1 text-[11px] text-ink-3">No skills selected. The agent runs with its own defaults.</p>
                )}
                <Input
                  value={skillQ}
                  onChange={(e) => setSkillQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      const first = skillMatches[0]?.name ?? (skillQ.trim() ? skillQ.trim() : null)
                      if (first) addSkill(first)
                    }
                  }}
                  placeholder="Add a skill, then press Enter"
                  aria-label="Add skill"
                  className="mt-2 text-xs"
                />
                {skillMatches.length > 0 && (
                  <div className="mt-1 max-h-28 overflow-y-auto">
                    {skillMatches.map((skill) => (
                      <button
                        key={skill.name}
                        type="button"
                        onClick={() => addSkill(skill.name)}
                        className="block w-full rounded-sm px-2 py-1.5 text-left text-xs text-ink-2 outline-none hover:bg-[var(--color-line)] focus-visible:bg-[var(--color-accent-tint)]"
                      >
                        {skill.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-prompt" className="text-xs text-ink-2">
                  System prompt <span className="font-mono text-[11px] text-ink-3">SOUL.md</span>
                </Label>
                <span className="text-[11px] tabular-nums text-ink-3">
                  {prompt.length > 0 ? `${prompt.length} chars` : "empty"}
                </span>
              </div>
              <Textarea
                id="profile-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={12}
                placeholder="You are an expert full-stack developer…"
                className="mt-1.5 max-h-64 min-h-40 shrink-0 resize-y overflow-y-auto border-[var(--color-line)] bg-[var(--color-bg)] font-mono text-xs leading-relaxed field-sizing-fixed"
              />
              <p className="mt-1.5 text-[11px] text-ink-3">
                Prepended to every run for this agent. Leave empty to inherit the executor default.
              </p>
            </div>

            <FieldError>{err}</FieldError>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              size="sm"
              disabled={!canSubmit}
              className="bg-[var(--color-accent)] text-[var(--color-accent-foreground)] hover:bg-[var(--color-accent)]/90"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {editing ? "Save changes" : "Create profile"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ProfilesPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<{ open: boolean; edit: ProfileDetail | null }>({ open: false, edit: null })
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [q, setQ] = useState("")

  const profiles = useQuery({
    queryKey: ["profiles-full"],
    queryFn: () => api<(Profile & Partial<ProfileDetail>)[]>("/api/profiles-full"),
  })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["profiles-full"] })
    qc.invalidateQueries({ queryKey: ["profiles"] })
  }

  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      form.edit
        ? api(`/api/profiles/${form.edit.name}`, { method: "PUT", body: JSON.stringify(data) })
        : api("/api/profiles", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
  const del = useMutation({
    mutationFn: (name: string) => api(`/api/profiles/${name}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); setPendingDelete(null) },
  })
  const activate = useMutation({
    mutationFn: (name: string) => api(`/api/profiles/${name}/activate`, { method: "POST" }),
    onSuccess: invalidate,
  })

  async function openEdit(name: string) {
    const detail = await api<ProfileDetail>(`/api/profiles/${name}`)
    setForm({ open: true, edit: detail })
  }

  const list = profiles.data ?? []
  const loading = profiles.isLoading
  const failed = profiles.isError

  const needle = q.trim().toLowerCase()
  const filtered = needle === ""
    ? list
    : list.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.model ?? "").toLowerCase().includes(needle) ||
          (p.provider ?? "").toLowerCase().includes(needle),
      )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Profiles"
        description="Agent profiles. Each one owns a model, a system prompt and a skill set."
        actions={
          <Button variant="signal" size="sm" onClick={() => setForm({ open: true, edit: null })}>
            <Plus className="size-3.5" /> New profile
          </Button>
        }
      >
        <FilterBar
          query={q}
          onQueryChange={setQ}
          placeholder="Search profiles"
          shown={filtered.length}
          total={list.length}
        />
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <LoadingState label="Loading profiles" />
        ) : failed ? (
          <EmptyState
            title="Couldn't load profiles"
            hint={(profiles.error as Error).message}
            action={<Button variant="secondary" onClick={() => void profiles.refetch()}>Retry</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={list.length ? `No profiles match "${q}"` : "No profiles yet"}
            hint={list.length ? undefined : "A profile binds a model, a system prompt and a set of skills."}
            action={
              list.length ? undefined : (
                <Button variant="signal" onClick={() => setForm({ open: true, edit: null })}>
                  New profile
                </Button>
              )
            }
          />
        ) : (
          <div className="mx-auto grid w-full max-w-[1680px] grid-cols-1 gap-3 p-4 md:grid-cols-2 md:p-6 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((p) => (
              <EntryCard
                key={p.name}
                density="identity"
                selected={p.active}
                lead={
                  p.avatar_url ? (
                    <Avatar className="size-7">
                      <AvatarImage src={p.avatar_url} alt="" />
                      <AvatarFallback className="bg-well text-2xs text-ink-2">
                        {p.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <span className="flex size-7 items-center justify-center rounded-full bg-well">
                      <Bot className="size-4 text-ink-3" aria-hidden />
                    </span>
                  )
                }
                title={p.name}
                state={
                  p.active ? (
                    <StatusLamp status="running" label="Active" size="sm" />
                  ) : undefined
                }
                subtitle={`${p.model || "No model"} · ${p.provider || "No provider"}`}
                mono
                metrics={
                  <>
                    {"skills" in p && <Metric value={p.skills?.length ?? 0} label="skills" />}
                    {p.valid === false ? (
                      <span className="inline-flex items-center gap-1 text-danger-text">
                        <ShieldAlert className="size-3" aria-hidden /> Broken config
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-ink-3">
                        <ShieldCheck className="size-3" aria-hidden /> Valid
                      </span>
                    )}
                  </>
                }
                primary={
                  <Button variant="secondary" size="sm" onClick={() => void openEdit(p.name)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                }
                overflow={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`More actions for ${p.name}`}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={p.active} onSelect={() => activate.mutate(p.name)}>
                        Set as active
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={p.active}
                        onSelect={() => setPendingDelete(p.name)}
                        className="text-danger-text focus:text-danger-text"
                      >
                        Delete profile
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete profile"
        description={
          pendingDelete
            ? `Delete "${pendingDelete}"? Its skills, model and system prompt are removed. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete profile"
        busy={del.isPending}
        onConfirm={() => pendingDelete && del.mutate(pendingDelete)}
      />

      {form.open && (
        <ProfileForm
          initial={form.edit}
          onClose={() => setForm({ open: false, edit: null })}
          onSave={save.mutateAsync}
        />
      )}
    </div>
  )
}
