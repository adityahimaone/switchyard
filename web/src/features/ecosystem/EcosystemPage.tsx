import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EntryCard, Metric } from "@/components/app/entry-card"
import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { DetailSheet } from "@/components/app/detail-sheet"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader, SectionHeader } from "@/components/app/page-header"
import { HealthLamp } from "@/components/ui/status-lamp"
import LoadingState from "@/components/feedback/loading-state"
import {
  deleteExtension,
  deleteMCPServer,
  gatewayStatus,
  listExtensions,
  listHermesMCPServers,
  listMCPToolsets,
  listMCPServers,
  saveExtension,
  saveMCPServer,
  testMCPServer,
  toastGlobal,
  type ExtensionManifest,
  type HermesMCPServer,
  type MCPServer,
  type MCPServerHealth,
} from "@/api"

const emptyMCP: Omit<MCPServer, "created_at"> = {
  id: "", name: "", transport: "http", endpoint: "", command: "", enabled: true, capabilities: [],
}
const emptyExtension = { id: "", name: "", version: "", description: "", capabilities: ["read_tasks"] }

/** Probe state is a lamp plus a label, never colour alone. */
const healthTone: Record<string, string> = {
  ok: "text-success-text",
  failed: "text-danger-text",
  disabled: "text-ink-3",
  unknown: "text-ink-3",
}

export default function EcosystemPage() {
  const qc = useQueryClient()
  const [mcpDraft, setMcpDraft] = useState<Omit<MCPServer, "created_at"> | null>(null)
  const [extDraft, setExtDraft] = useState<typeof emptyExtension | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "mcp" | "extension"; id: string; name: string } | null
  >(null)
  const [health, setHealth] = useState<Record<string, MCPServerHealth>>({})

  const servers = useQuery({ queryKey: ["ecosystem-mcp"], queryFn: () => listMCPServers() })
  const extensions = useQuery({ queryKey: ["ecosystem-extensions"], queryFn: () => listExtensions() })
  const gateway = useQuery({ queryKey: ["ecosystem-gateway"], queryFn: gatewayStatus })
  const liveServers = useQuery({
    queryKey: ["hermes-mcp-servers"],
    queryFn: () => listHermesMCPServers(),
    refetchInterval: 30_000,
  })
  const toolsets = useQuery({ queryKey: ["hermes-mcp-toolsets"], queryFn: () => listMCPToolsets() })

  const onFail = (e: Error) => toastGlobal(e.message, "error")

  const saveM = useMutation({
    mutationFn: (data: Omit<MCPServer, "created_at">) => saveMCPServer(data),
    onSuccess: () => {
      setMcpDraft(null)
      void qc.invalidateQueries({ queryKey: ["ecosystem-mcp"] })
      toastGlobal("MCP server added", "success")
    },
    onError: onFail,
  })
  const saveE = useMutation({
    mutationFn: (data: typeof emptyExtension) => saveExtension(data),
    onSuccess: () => {
      setExtDraft(null)
      void qc.invalidateQueries({ queryKey: ["ecosystem-extensions"] })
      toastGlobal("Extension added", "success")
    },
    onError: onFail,
  })
  const remove = useMutation({
    // The two delete endpoints return different shapes, so the result is
    // normalised rather than letting the union leak into the mutation type.
    mutationFn: async (target: { kind: "mcp" | "extension"; id: string }): Promise<void> => {
      if (target.kind === "mcp") await deleteMCPServer(target.id)
      else await deleteExtension(target.id)
    },
    onSuccess: () => {
      setPendingDelete(null)
      void qc.invalidateQueries({ queryKey: ["ecosystem-mcp"] })
      void qc.invalidateQueries({ queryKey: ["ecosystem-extensions"] })
      toastGlobal("Deleted", "success")
    },
    onError: onFail,
  })
  const probe = useMutation({
    mutationFn: (name: string) => testMCPServer(name),
    onSuccess: (result) => {
      setHealth((prev) => ({ ...prev, [result.name]: result }))
      if (result.state === "ok") toastGlobal(`${result.name}: ${result.tools} tools available`, "success")
      else toastGlobal(`${result.name}: ${result.error ?? result.state}`, "error")
    },
    onError: onFail,
  })

  const liveItems: HermesMCPServer[] = liveServers.data ?? []
  const mcpItems: MCPServer[] = servers.data ?? []
  const extItems: ExtensionManifest[] = extensions.data ?? []
  const gatewayState = gateway.data?.state ?? "unknown"

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Ecosystem"
        description="MCP servers the hermes agent can reach, plus the declarative extension registry."
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 p-4 md:p-6">
          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Gateway"
              description="Session creation stays disabled until a transport and auth contract exists."
            />
            <EntryCard
              density="infrastructure"
              title="Gateway"
              state={<Lamp state={gatewayState} label={gatewayState} />}
            >
              {gateway.data?.error && (
                <p className="text-xs text-danger-text">{gateway.data.error}</p>
              )}
            </EntryCard>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Agent MCP servers"
              description="Read from the hermes agent's own config.yaml, which stays the source of truth. Edit them with `hermes mcp add`."
            />
            {liveServers.isLoading ? (
              <LoadingState variant="detail" label="Loading MCP servers" />
            ) : liveServers.isError ? (
              <EmptyState
                title="Couldn't load MCP servers"
                hint={(liveServers.error as Error).message}
                action={<Button variant="secondary" onClick={() => void liveServers.refetch()}>Retry</Button>}
              />
            ) : liveItems.length === 0 ? (
              <EmptyState
                title="No MCP servers configured"
                hint="Add one on the agent host with `hermes mcp add`."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {liveItems.map((item) => {
                  const status = health[item.name]
                  const endpoint =
                    item.transport === "stdio"
                      ? [item.command, ...(item.args ?? [])].filter(Boolean).join(" ")
                      : item.url
                  return (
                    <EntryCard
                      key={item.name}
                      density="infrastructure"
                      title={item.name}
                      state={
                        !item.enabled ? (
                          <span className="text-xs text-ink-3">Disabled</span>
                        ) : status ? (
                          <Lamp
                            state={status.state}
                            label={status.state === "ok" ? `${status.tools} tools` : status.state}
                          />
                        ) : undefined
                      }
                      subtitle={endpoint || "No endpoint"}
                      mono
                      metrics={
                        <span className="text-xs text-ink-3">
                          {item.transport}
                          {item.secret_set && " · credentials configured"}
                        </span>
                      }
                      primary={
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={probe.isPending && probe.variables === item.name}
                          disabled={!item.enabled}
                          onClick={() => probe.mutate(item.name)}
                        >
                          Test
                        </Button>
                      }
                    >
                      {status?.tool_names && status.tool_names.length > 0 && (
                        <p
                          className="truncate font-mono text-2xs text-ink-2"
                          title={status.tool_names.join(", ")}
                        >
                          {status.tool_names.join(", ")}
                        </p>
                      )}
                      {status?.error && <p className="text-xs text-danger-text">{status.error}</p>}
                    </EntryCard>
                  )
                })}
              </div>
            )}

            {toolsets.isSuccess && Object.keys(toolsets.data ?? {}).length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-ink-3">Toolset bindings</p>
                {Object.entries(toolsets.data ?? {}).map(([platform, list]) => (
                  <p key={platform} className="font-mono text-2xs text-ink-3">
                    {platform}: {list.join(", ")}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="MCP registry"
              description="Declarative entries stored by the board. The hermes agent does not read these."
              actions={
                <Button variant="signal" size="sm" onClick={() => setMcpDraft({ ...emptyMCP })}>
                  <Plus className="size-3.5" /> Add MCP server
                </Button>
              }
            />
            {servers.isError ? (
              <EmptyState
                title="Couldn't load the registry"
                hint={(servers.error as Error).message}
                action={<Button variant="secondary" onClick={() => void servers.refetch()}>Retry</Button>}
              />
            ) : mcpItems.length === 0 ? (
              <EmptyState
                title="No registry entries"
                hint="Board-side declarations, separate from the agent's own config."
                action={<Button variant="signal" onClick={() => setMcpDraft({ ...emptyMCP })}>Add MCP server</Button>}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {mcpItems.map((item) => (
                  <EntryCard
                    key={item.id}
                    density="infrastructure"
                    title={item.name}
                    subtitle={item.transport === "http" ? item.endpoint : item.command}
                    mono
                    metrics={
                      <>
                        <span className="text-xs text-ink-3">{item.transport}</span>
                        {!item.enabled && <span className="text-xs text-ink-3">disabled</span>}
                      </>
                    }
                    overflow={
                      <DeleteMenu
                        name={item.name}
                        onDelete={() => setPendingDelete({ kind: "mcp", id: item.id, name: item.name })}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader
              title="Extensions"
              description="Declarative manifests. No plugin execution."
              actions={
                <Button variant="signal" size="sm" onClick={() => setExtDraft({ ...emptyExtension })}>
                  <Plus className="size-3.5" /> Add extension
                </Button>
              }
            />
            {extensions.isError ? (
              <EmptyState
                title="Couldn't load extensions"
                hint={(extensions.error as Error).message}
                action={<Button variant="secondary" onClick={() => void extensions.refetch()}>Retry</Button>}
              />
            ) : extItems.length === 0 ? (
              <EmptyState
                title="No extensions"
                hint="Extensions declare what they may do; nothing executes."
                action={<Button variant="signal" onClick={() => setExtDraft({ ...emptyExtension })}>Add extension</Button>}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {extItems.map((item) => (
                  <EntryCard
                    key={item.id}
                    density="registry"
                    title={item.name}
                    subtitle={item.description || undefined}
                    metrics={
                      <>
                        <span className="font-mono text-2xs text-ink-3">v{item.version}</span>
                        <Metric value={item.capabilities.length} label="capabilities" />
                      </>
                    }
                    overflow={
                      <DeleteMenu
                        name={item.name}
                        onDelete={() => setPendingDelete({ kind: "extension", id: item.id, name: item.name })}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <DetailSheet
        open={mcpDraft !== null}
        onOpenChange={(o) => !o && setMcpDraft(null)}
        title="Add MCP server"
        description="A board-side declaration. The hermes agent reads its own config instead."
      >
        {mcpDraft && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); saveM.mutate(mcpDraft) }}
          >
            <Field label="ID" htmlFor="mcp-id">
              <Input
                id="mcp-id" value={mcpDraft.id} autoFocus required
                onChange={(e) => setMcpDraft({ ...mcpDraft, id: e.target.value })}
              />
            </Field>
            <Field label="Name" htmlFor="mcp-name">
              <Input
                id="mcp-name" value={mcpDraft.name} required
                onChange={(e) => setMcpDraft({ ...mcpDraft, name: e.target.value })}
              />
            </Field>
            <Field label="Transport" htmlFor="mcp-transport">
              <Select
                value={mcpDraft.transport}
                onValueChange={(v) => setMcpDraft({ ...mcpDraft, transport: v as "http" | "stdio" })}
              >
                <SelectTrigger id="mcp-transport" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="stdio">stdio</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {mcpDraft.transport === "stdio" ? (
              <Field label="Command" htmlFor="mcp-command">
                <Input
                  id="mcp-command" value={mcpDraft.command} className="font-mono text-xs"
                  placeholder="codegraph serve --mcp"
                  onChange={(e) => setMcpDraft({ ...mcpDraft, command: e.target.value })}
                />
              </Field>
            ) : (
              <Field label="Endpoint" htmlFor="mcp-endpoint">
                <Input
                  id="mcp-endpoint" value={mcpDraft.endpoint} className="font-mono text-xs"
                  placeholder="https://example.com/mcp"
                  onChange={(e) => setMcpDraft({ ...mcpDraft, endpoint: e.target.value })}
                />
              </Field>
            )}
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-ink">Enabled</span>
              <Switch
                checked={mcpDraft.enabled}
                onCheckedChange={(v) => setMcpDraft({ ...mcpDraft, enabled: v })}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setMcpDraft(null)}>Cancel</Button>
              <Button type="submit" variant="signal" loading={saveM.isPending}>Add server</Button>
            </div>
          </form>
        )}
      </DetailSheet>

      <DetailSheet
        open={extDraft !== null}
        onOpenChange={(o) => !o && setExtDraft(null)}
        title="Add extension"
        description="A declarative manifest describing what the extension may do."
      >
        {extDraft && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => { e.preventDefault(); saveE.mutate(extDraft) }}
          >
            <Field label="ID" htmlFor="ext-id">
              <Input
                id="ext-id" value={extDraft.id} autoFocus required
                onChange={(e) => setExtDraft({ ...extDraft, id: e.target.value })}
              />
            </Field>
            <Field label="Name" htmlFor="ext-name">
              <Input
                id="ext-name" value={extDraft.name} required
                onChange={(e) => setExtDraft({ ...extDraft, name: e.target.value })}
              />
            </Field>
            <Field label="Version" htmlFor="ext-version">
              <Input
                id="ext-version" value={extDraft.version} className="font-mono text-xs"
                onChange={(e) => setExtDraft({ ...extDraft, version: e.target.value })}
              />
            </Field>
            <Field label="Description" htmlFor="ext-desc">
              <Input
                id="ext-desc" value={extDraft.description}
                onChange={(e) => setExtDraft({ ...extDraft, description: e.target.value })}
              />
            </Field>
            <Field label="Capabilities" htmlFor="ext-caps">
              <Input
                id="ext-caps" value={extDraft.capabilities.join(", ")} className="font-mono text-xs"
                onChange={(e) =>
                  setExtDraft({
                    ...extDraft,
                    capabilities: e.target.value.split(",").map((c) => c.trim()).filter(Boolean),
                  })
                }
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setExtDraft(null)}>Cancel</Button>
              <Button type="submit" variant="signal" loading={saveE.isPending}>Add extension</Button>
            </div>
          </form>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={pendingDelete?.kind === "extension" ? "Delete extension" : "Delete MCP server"}
        description={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? Anything referring to it by id will stop resolving.`
            : ""
        }
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate({ kind: pendingDelete.kind, id: pendingDelete.id })}
      />
    </div>
  )
}

/** Filled lamp for a confirmed state, hollow otherwise. */
function Lamp({ state, label }: { state: string; label: string }) {
  return (
    <HealthLamp
      tone={healthTone[state] ?? healthTone.unknown}
      live={state === "ok"}
      label={label}
    />
  )
}

function DeleteMenu({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${name}`}>
          <MoreHorizontal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDelete} className="text-danger-text focus:text-danger-text">
          <Trash2 className="size-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Field({
  label, htmlFor, children,
}: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
