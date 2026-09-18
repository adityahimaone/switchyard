import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, createProvider, deleteProvider, discoverProviderModels, type ProfileDetail } from "@/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Server, Search, X, KeyRound } from "lucide-react"
import LoadingState from "@/components/LoadingState"

export default function ProvidersPage({ onUseInProfile }: { onUseInProfile?: (name: string, model: string) => void }) {
  const [q, setQ] = useState("")
  const [active, setActive] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [baseURL, setBaseURL] = useState("")
  const [apiKey, setAPIKey] = useState("")
  const [defaultModel, setDefaultModel] = useState("")
  const [actionError, setActionError] = useState("")
  const [busy, setBusy] = useState(false)
  const queryClient = useQueryClient()

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => api<{ name: string; base_url: string; default_model: string; models: string[]; api_key_set: boolean }[]>("/api/providers"),
  })
  const profiles = useQuery({
    queryKey: ["profiles-full"],
    queryFn: () => api<ProfileDetail[]>("/api/profiles-full"),
  })

  const list = (providers.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.base_url.toLowerCase().includes(q.toLowerCase()))
  const selected = (providers.data ?? []).find((p) => p.name === active)

  async function refreshProviders() {
    await queryClient.invalidateQueries({ queryKey: ["providers"] })
  }

  async function handleCreate() {
    setBusy(true)
    setActionError("")
    try {
      await createProvider({ name, base_url: baseURL, api_key: apiKey || undefined, default_model: defaultModel || undefined })
      setName(""); setBaseURL(""); setAPIKey(""); setDefaultModel("")
      await refreshProviders()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Provider save failed")
    } finally { setBusy(false) }
  }

  async function handleDiscover(providerName: string) {
    setBusy(true)
    setActionError("")
    try {
      const result = await discoverProviderModels(providerName)
      await refreshProviders()
      setActionError(`${result.models.length} models discovered for ${providerName}`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Model discovery failed")
    } finally { setBusy(false) }
  }

  async function handleDelete(providerName: string) {
    if (!window.confirm(`Delete provider ${providerName}?`)) return
    setBusy(true)
    setActionError("")
    try {
      await deleteProvider(providerName)
      if (active === providerName) setActive(null)
      await refreshProviders()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Provider delete failed")
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Registry</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Providers</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">
            Roster model dari <code className="text-neutral-400">~/.hermes/config.yaml</code> custom_providers. Pakai di profile lewat dropdown bawah.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 text-[10px] text-neutral-400">
            {providers.data?.length ?? 0}
          </span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari provider…"
              className="w-44 rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] py-1.5 pl-8 pr-2 text-xs outline-none focus:border-[var(--color-accent)]/50"
            />
          </div>
        </div>
      </div>
      <Card className="mt-4 border-[var(--color-line)] bg-[var(--color-surface)]">
        <CardHeader className="p-3.5 pb-1"><CardTitle className="text-xs uppercase tracking-wider text-neutral-400">Add provider</CardTitle></CardHeader>
        <CardContent className="grid gap-2 p-3.5 pt-2 md:grid-cols-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="name" className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1.5 text-xs" />
          <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.example.com/v1" className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1.5 text-xs" />
          <input value={apiKey} onChange={(e) => setAPIKey(e.target.value)} placeholder="API key (server-side)" type="password" className="rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1.5 text-xs" />
          <div className="flex gap-2"><input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="default model" className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1.5 text-xs" /><Button size="sm" disabled={busy || !name.trim() || !baseURL.trim()} onClick={handleCreate}>Save</Button></div>
        </CardContent>
      </Card>
      {actionError && <p className="mt-2 text-xs text-[var(--color-accent)]">{actionError}</p>}
      {providers.isLoading ? (
        <LoadingState label="Memuat providers" />
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((p) => (
            <Card key={p.name} className={`provider-card decorative-card relative cursor-pointer overflow-hidden border-[var(--color-line)] bg-[var(--color-surface)] transition-colors hover:border-[var(--color-accent)]/40 ${active === p.name ? "border-[var(--color-accent)]/60" : ""}`}
              onClick={() => setActive(active === p.name ? null : p.name)}>
              <span className="provider-card-grid pointer-events-none absolute inset-0" />
              <span className="provider-card-scan pointer-events-none absolute right-[-20%] top-1/2 h-px w-2/3" />
              <CardHeader className="relative p-3.5 pb-2">
                <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-accent)]/15 bg-[var(--color-inset)]">
                    <Server className="size-3.5 text-[var(--color-accent)]" />
                  </div>
                  <span className="min-w-0 flex-1 truncate" title={p.name}>{p.name}</span>
                  {p.api_key_set ? (
                    <Badge variant="outline" className="ml-auto shrink-0 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
                      <KeyRound className="size-2.5" /> key set
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="ml-auto shrink-0 border-red-500/30 bg-red-500/10 text-[10px] text-red-300">
                      key missing
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="relative p-3.5 pt-0">
                <p className="truncate font-mono text-[11px] text-neutral-500" title={p.base_url}>{p.base_url || "—"}</p>
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="border-[var(--color-line)] text-[10px] text-neutral-300">
                    {p.models.length} models
                  </Badge>
                  {p.default_model && (
                    <Badge variant="outline" className="max-w-full border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 text-[10px] text-[var(--color-accent)]">
                      <span className="truncate">default: {p.default_model}</span>
                    </Badge>
                  )}
                </div>
                {active === p.name && p.models.length > 0 && (
                  <>
                    <Separator className="my-2.5" />
                    <div className="max-h-40 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {p.models.slice(0, 60).map((m) => (
                          <span key={m} className="rounded bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">{m}</span>
                        ))}
                        {p.models.length > 60 && (
                          <span className="px-1 py-0.5 text-[10px] text-neutral-600">+{p.models.length - 60} more</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {active === p.name && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handleDiscover(p.name)}>Discover models</Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handleDelete(p.name)} className="text-red-300">Delete</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!list.length && <p className="text-sm text-neutral-500">No provider matched.</p>}
        </div>
      )}

      {/* link providers -> profiles */}
      <Card className="decorative-card mt-6 border-[var(--color-line)] bg-[var(--color-surface)]">
        <CardHeader className="p-3.5 pb-1">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Pakai provider di agent profile
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3 p-3.5 pt-1">
          <Select
            onValueChange={(profileName) => {
              if (!selected) return
              // PATCH profile model (default model of provider) — provider stays "custom"
              fetch(`/api/profiles/${profileName}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: selected.default_model, provider: "custom" }),
              }).then(() => profiles.refetch())
            }}
          >
            <SelectTrigger className="w-56 border-[var(--color-line)] bg-[var(--color-bg)] text-xs">
              <SelectValue placeholder={selected ? `Set ${selected.name} → profile…` : "Pilih provider dulu di atas"} />
            </SelectTrigger>
            <SelectContent className="border-[var(--color-line)] bg-[var(--color-surface)]">
              {(profiles.data ?? []).filter((p) => p.name !== "default").map((p) => (
                <SelectItem key={p.name} value={p.name} className="text-xs">{p.name} (model: {p.model || "—"})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected && (
            <span className="flex items-center gap-1.5 text-xs text-neutral-400">
              <X className="size-3" /> clear: klik kartu lagi
            </span>
          )}
          {selected ? (
            <span className="text-xs text-neutral-500">
              akan set model=<span className="font-mono text-neutral-300">{selected.default_model || "?"}</span> provider=<span className="font-mono text-neutral-300">custom</span>
            </span>
          ) : (
            <span className="text-xs text-neutral-500">klik satu provider card, lalu pilih profile target</span>
          )}
          {onUseInProfile && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => selected && onUseInProfile(selected.name, selected.default_model)}>
              Edit profiles page
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
