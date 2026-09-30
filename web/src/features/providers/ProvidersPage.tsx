import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, createProvider, deleteProvider, discoverProviderModels, type ProfileDetail } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EntryCard, Metric } from "@/components/app/entry-card"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { DetailSheet } from "@/components/app/detail-sheet"
import { EmptyState } from "@/components/app/empty-state"
import { FilterBar } from "@/components/app/filter-bar"
import { PageHeader, SectionHeader } from "@/components/app/page-header"
import { KeyRound, MoreHorizontal, Plus, Server, Trash2 } from "lucide-react"
import LoadingState from "@/components/feedback/loading-state"

type Provider = {
  name: string
  base_url: string
  default_model: string
  models: string[]
  api_key_set: boolean
}

export default function ProvidersPage({ onUseInProfile }: { onUseInProfile?: (name: string, model: string) => void }) {
  const [q, setQ] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => api<Provider[]>("/api/providers"),
  })
  const profiles = useQuery({
    queryKey: ["profiles-full"],
    queryFn: () => api<ProfileDetail[]>("/api/profiles-full"),
  })

  const all = providers.data ?? []
  const needle = q.trim().toLowerCase()
  const list = all.filter(
    (p) =>
      needle === "" ||
      p.name.toLowerCase().includes(needle) ||
      p.base_url.toLowerCase().includes(needle),
  )
  const current = all.find((p) => p.name === selected) ?? null

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["providers"] })
  }

  async function run(fn: () => Promise<void>, ok?: string) {
    setBusy(true)
    setNote("")
    try {
      await fn()
      await refresh()
      if (ok) setNote(ok)
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That action failed.")
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(name: string) {
    await run(async () => {
      await deleteProvider(name)
      if (selected === name) setSelected(null)
      setPendingDelete(null)
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Providers"
        description="Model endpoints. A profile points at one of these to pick up its models."
        actions={
          <Button variant="signal" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" /> Add provider
          </Button>
        }
      >
        <FilterBar
          query={q}
          onQueryChange={setQ}
          placeholder="Search providers"
          shown={list.length}
          total={all.length}
        />
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {note && (
          <p role="status" className="mx-auto w-full max-w-[1680px] px-4 pt-4 text-sm text-ink-2 md:px-6">
            {note}
          </p>
        )}

        {providers.isLoading ? (
          <LoadingState label="Loading providers" />
        ) : providers.isError ? (
          <EmptyState
            title="Couldn't load providers"
            hint={(providers.error as Error).message}
            action={<Button variant="secondary" onClick={() => void providers.refetch()}>Retry</Button>}
          />
        ) : list.length === 0 ? (
          <EmptyState
            title={all.length ? `No providers match "${q}"` : "No providers yet"}
            hint={all.length ? undefined : "Add an endpoint so profiles can select a model from it."}
            action={
              all.length ? undefined : (
                <Button variant="signal" onClick={() => setAddOpen(true)}>Add provider</Button>
              )
            }
          />
        ) : (
          <div className="mx-auto grid w-full max-w-[1680px] grid-cols-1 gap-3 p-4 md:grid-cols-2 md:p-6 xl:grid-cols-3 2xl:grid-cols-4">
            {list.map((p) => (
              <EntryCard
                key={p.name}
                density="infrastructure"
                selected={selected === p.name}
                lead={
                  <span className="flex size-7 items-center justify-center rounded-full bg-well">
                    <Server className="size-4 text-ink-3" aria-hidden />
                  </span>
                }
                title={p.name}
                state={
                  <StatusKey set={p.api_key_set} />
                }
                subtitle={p.base_url || "No endpoint"}
                mono
                metrics={
                  <>
                    <Metric value={p.models.length} label="models" />
                    {p.default_model && (
                      <span className="truncate text-xs text-ink-3" title={p.default_model}>
                        default: <span className="font-mono text-ink-2">{p.default_model}</span>
                      </span>
                    )}
                  </>
                }
                primary={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelected(selected === p.name ? null : p.name)}
                    aria-expanded={selected === p.name}
                  >
                    {selected === p.name ? "Hide models" : "Show models"}
                  </Button>
                }
                overflow={
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${p.name}`}>
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={busy}
                        onSelect={() => void run(() => discoverProviderModels(p.name).then((r) => { setNote(`${r.models.length} models discovered for ${p.name}.`) }))}
                      >
                        Discover models
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setPendingDelete(p.name)}
                        className="text-danger-text focus:text-danger-text"
                      >
                        <Trash2 className="size-3.5" /> Delete provider
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                }
              >
                {/* Expanded roster stays inside the card, bounded, behind a divider. */}
                {selected === p.name && p.models.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border-t border-line pt-2">
                    <div className="flex flex-wrap gap-1">
                      {p.models.slice(0, 60).map((m) => (
                        <span
                          key={m}
                          className={cnChip(m === p.default_model)}
                          title={m}
                        >
                          {m}
                        </span>
                      ))}
                      {p.models.length > 60 && (
                        <span className="px-1.5 py-0.5 text-2xs text-ink-3">
                          +{p.models.length - 60} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </EntryCard>
            ))}
          </div>
        )}

        {/* Link providers to profiles. */}
        {all.length > 0 && (
          <div className="mx-auto w-full max-w-[1680px] px-4 pb-6 md:px-6">
            <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
              <SectionHeader
                title="Use a provider in a profile"
                description={
                  current
                    ? `Sets model to ${current.default_model || "unset"} and provider to custom.`
                    : "Select a provider above, then pick the profile to update."
                }
              />
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value=""
                  disabled={!current}
                  onValueChange={(profileName) => {
                    if (!current) return
                    void run(async () => {
                      await api(`/api/profiles/${profileName}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ model: current.default_model, provider: "custom" }),
                      });
                      await profiles.refetch();
                    }, `Updated ${profileName} to ${current.default_model || "unset"}.`);
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-64"
                    aria-label="Choose a profile to update"
                  >
                    <SelectValue placeholder={current ? "Choose a profile" : "Select a provider first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(profiles.data ?? [])
                      .filter((p) => p.name !== "default")
                      .map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name} (model: {p.model || "unset"})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {onUseInProfile && current && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUseInProfile(current.name, current.default_model)}
                  >
                    Edit on Profiles
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <AddProviderSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        busy={busy}
        onCreate={async (data) => {
          await run(async () => {
            await createProvider(data);
            setAddOpen(false);
          }, `Added ${data.name}.`);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete provider"
        description={
          pendingDelete
            ? `Delete "${pendingDelete}"? Profiles pointing at it lose their model reference. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete provider"
        busy={busy}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete)}
      />
    </div>
  )
}

/** Key state reads as connection health: a lamp plus a label, never colour alone. */
function StatusKey({ set }: { set: boolean }) {
  return (
    <span
      className={
        set
          ? "inline-flex items-center gap-1 text-xs font-medium text-success-text"
          : "inline-flex items-center gap-1 text-xs font-medium text-danger-text"
      }
    >
      <KeyRound className="size-3" aria-hidden />
      {set ? "Key set" : "Key missing"}
    </span>
  )
}

function cnChip(isDefault: boolean) {
  return [
    "max-w-full truncate rounded-control border px-1.5 py-0.5 font-mono text-2xs",
    isDefault
      ? "border-accent/30 bg-accent-tint text-accent-text"
      : "border-line bg-well text-ink-3",
  ].join(" ")
}

function AddProviderSheet({
  open,
  onOpenChange,
  busy,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  busy: boolean
  onCreate: (data: { name: string; base_url: string; api_key?: string; default_model?: string }) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [apiKey, setAPIKey] = useState("")
  const [defaultModel, setDefaultModel] = useState("")
  const [err, setErr] = useState("")

  const canSubmit = name.trim() !== "" && baseURL.trim() !== ""

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) {
      setErr("Name and endpoint are required.")
      return
    }
    setErr("")
    await onCreate({
      name: name.trim(),
      base_url: baseURL.trim(),
      api_key: apiKey || undefined,
      default_model: defaultModel || undefined,
    })
    setName(""); setBaseURL(""); setAPIKey(""); setDefaultModel("")
  }

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add provider"
      description="An OpenAI-compatible endpoint. The key is stored server-side."
    >
      <form id="add-provider" onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ap-name">Name</Label>
          <Input
            id="ap-name" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="9router" autoFocus aria-invalid={!!err}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ap-url">Endpoint</Label>
          <Input
            id="ap-url" value={baseURL} onChange={(e) => setBaseURL(e.target.value)}
            placeholder="https://api.example.com/v1" className="font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ap-key">API key</Label>
          <Input
            id="ap-key" type="password" value={apiKey} onChange={(e) => setAPIKey(e.target.value)}
            placeholder="Optional" autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ap-model">Default model</Label>
          <Input
            id="ap-model" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="Optional" className="font-mono text-xs"
          />
        </div>
        {err && <p className="text-sm text-danger-text" role="alert">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="signal" loading={busy} disabled={!canSubmit}>
            Add provider
          </Button>
        </div>
      </form>
    </DetailSheet>
  )
}
