import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, setProfileAvatarUrl, uploadProfileAvatar, type Profile, type ProfileDetail } from "@/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Bot, Plus, Trash2, Pencil, ShieldAlert, ShieldCheck, Activity } from "lucide-react"
import LoadingState from "@/components/LoadingState"

const FALLBACK_PROVIDERS = [
  "custom", "auto", "anthropic", "openai", "openrouter", "google",
  "groq", "deepseek", "mistral", "xai", "ollama",
]

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

  async function submit() {
    if (!editing && !/^[a-z0-9_-]{1,32}$/.test(name.trim())) {
      setErr("Name: lowercase, angka, - atau _ (max 32)")
      return
    }
    setBusy(true); setErr(null)
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold">{editing ? `Edit profile ${initial?.name}` : "New agent profile"}</h2>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {editing && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
              <Avatar className="size-14 shrink-0 rounded-lg">
                {avatarPreview ? (
                  <AvatarImage src={avatarPreview} alt={initial?.name ?? ""} />
                ) : null}
                <AvatarFallback className="rounded-lg bg-[var(--color-inset)] text-sm text-[var(--color-accent)]">
                  {initial?.name.slice(0, 2).toUpperCase() ?? "AG"}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                    {avatarBusy ? "…" : "Upload avatar"}
                  </Button>
                  {!!avatarPreview && (
                    <Button type="button" variant="outline" size="sm" disabled={avatarBusy} onClick={onAvatarRemoved}>
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-[10px] leading-snug text-neutral-500">PNG / JPEG / GIF (animated) / WebP — max 2 MB</p>
                <div className="flex gap-1.5">
                  <Input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://…/avatar.png"
                    className="h-7 flex-1 border-[var(--color-line)] bg-[var(--color-bg)] text-xs"
                  />
                  <Button type="button" variant="outline" size="sm" disabled={avatarBusy || !avatarUrl.trim()} onClick={onAvatarUrlSaved}>
                    URL
                  </Button>
                </div>
                {avatarErr && <p className="text-[11px] text-red-400">{avatarErr}</p>}
              </div>
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
            </div>
          )}
          {!editing && (
            <>
              <Label className="mt-3 block text-xs text-neutral-400">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="karina" className="mt-1 border-[var(--color-line)] bg-[var(--color-bg)]" />
            </>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <Label className="block text-xs text-neutral-400">Provider</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger className="mt-1 w-full border-[var(--color-line)] bg-[var(--color-bg)] text-sm data-[size=default]:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)] max-h-72">
                  {providerNames.map((p) => <SelectItem key={p} value={p} className="text-sm">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="block text-xs text-neutral-400">Model</Label>
              <Select value={model || "__default"} onValueChange={(value) => setModel(value === "__default" ? "" : value)}>
                <SelectTrigger size="sm" className="mt-1 w-full border-[var(--color-line)] bg-[var(--color-bg)] text-sm data-[size=default]:h-9"><SelectValue>{model || "model default"}</SelectValue></SelectTrigger>
                <SelectContent position="popper" align="start" className="h-[300px] max-h-[300px] w-72 min-w-72 max-w-72 border-[var(--color-line)] bg-[var(--color-surface)]">
                  <div className="sticky top-0 z-10 bg-[var(--color-surface)] p-1" onKeyDown={(event) => event.stopPropagation()}>
                    <Input value={modelQ} onChange={(event) => setModelQ(event.target.value)} placeholder="Search model…" aria-label="Search models" className="h-7 border-[var(--color-line)] bg-[var(--color-bg)] text-xs" />
                  </div>
                  <SelectItem value="__default">model default</SelectItem>
                  {filteredModels.length === 0 && <p className="px-2 py-1.5 text-xs text-neutral-500">No model found</p>}
                  {filteredModels.map((value) => <SelectItem key={value} value={value} className="max-w-72 truncate text-sm" title={value}>{value}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Label className="mt-3 block text-xs text-neutral-400">Skills</Label>
          <div className="mt-1 rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] p-2">
            <div className="flex flex-wrap gap-1.5">
              {selectedSkills.map((skill) => (
                <Badge key={skill} variant="secondary" className="gap-1 text-[11px]">
                  {skill}
                  <button type="button" aria-label={`Remove ${skill}`} onClick={() => setSelectedSkills((items) => items.filter((item) => item !== skill))}>×</button>
                </Badge>
              ))}
              {!selectedSkills.length && <span className="text-[11px] text-neutral-600">No skills selected</span>}
            </div>
            <Input value={skillQ} onChange={(e) => setSkillQ(e.target.value)} placeholder="Add global skill…" className="mt-2 h-8 border-[var(--color-line)] bg-[var(--color-surface)] text-xs" />
            {skillQ.trim() && (
              <div className="mt-1 max-h-28 overflow-y-auto">
                {(skillsQ.data ?? []).filter((skill) => !selectedSkills.includes(skill.name) && skill.name.toLowerCase().includes(skillQ.trim().toLowerCase())).slice(0, 20).map((skill) => (
                  <button key={skill.name} type="button" className="block w-full px-2 py-1 text-left text-xs text-neutral-300 hover:bg-[var(--color-line)]" onClick={() => { setSelectedSkills((items) => [...items, skill.name].sort()); setSkillQ("") }}>
                    {skill.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Label className="mt-3 block text-xs text-neutral-400">
            System prompt <span className="text-neutral-600">(SOUL.md)</span>
          </Label>
          <Textarea
            value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={12}
            placeholder="You are an expert full-stack developer…"
            className="mt-1 h-64 min-h-40 resize-y overflow-y-auto border-[var(--color-line)] bg-[var(--color-bg)] font-mono text-xs leading-relaxed"
          />
          {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
        </div>
        <Separator className="my-3" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy} onClick={submit} className="bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
            {busy ? "…" : editing ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ProfilesPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<{ open: boolean; edit: ProfileDetail | null }>({ open: false, edit: null })

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
    onSuccess: invalidate,
  })

  async function openEdit(name: string) {
    const detail = await api<ProfileDetail>(`/api/profiles/${name}`)
    setForm({ open: true, edit: detail })
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Profiles</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Agent Profiles</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">
            Sumber: <code className="text-neutral-400">~/.hermes/profiles/&lt;name&gt;/</code> — config.yaml (model), SOUL.md (system prompt), skills/.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-neutral-400">
            {profiles.data?.length ?? 0}
          </span>
          <Button size="sm" onClick={() => setForm({ open: true, edit: null })}
            className="ml-auto bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent)]/90">
            <Plus className="size-3.5" /> New profile
          </Button>
        </div>
      </div>

      {profiles.isLoading ? (
        <LoadingState label="Memuat agent profiles" />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {(profiles.data ?? []).map((p) => (
            <Card key={p.name} className={`decorative-card border-[var(--color-line)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-accent)]/35 ${p.active ? "border-[var(--color-accent)]/55" : ""}`}>
              <CardContent className="p-4">
                <div className="flex min-w-0 items-start gap-3">
                  {p.avatar_url ? (
                    <Avatar className="size-9 shrink-0 rounded-lg">
                      <AvatarImage src={p.avatar_url} alt={p.name} />
                      <AvatarFallback className="rounded-lg bg-[var(--color-inset)] text-[10px] text-[var(--color-accent)]">{p.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[var(--color-accent)]/15 bg-[var(--color-inset)]">
                      <Bot className="size-4 text-[var(--color-accent)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-semibold leading-5" title={p.name}>{p.name}</h3>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-400" title={`${p.model || "—"} · ${p.provider || "—"}`}>
                          {p.model || "—"} · {p.provider || "—"}
                        </p>
                      </div>
                      {p.active && (
                        <Badge className="shrink-0 gap-1 bg-[var(--color-accent)]/15 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/15">
                          <Activity className="size-3" /> active
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  {"skills" in p ? (
                    <div title={p.skills?.join(", ") || undefined}>
                      <p className="font-mono text-xl font-semibold leading-none text-neutral-100">{p.skills?.length ?? 0}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-neutral-500">skills</p>
                    </div>
                  ) : <span />}
                  {p.valid === false ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-red-300"><ShieldAlert className="size-3.5" /> broken config</span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-emerald-300"><ShieldCheck className="size-3.5" /> valid</span>
                  )}
                </div>
                <Separator className="my-3" />
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => openEdit(p.name)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline" size="sm" disabled={p.active} aria-label={`Delete profile ${p.name}`} title={p.active ? "Active profile cannot be deleted" : `Delete ${p.name}`}
                    className="ml-auto border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    onClick={() => { if (confirm(`Delete profile "${p.name}"?`)) del.mutate(p.name) }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
