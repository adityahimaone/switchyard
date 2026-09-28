import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Cable, Puzzle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import LoadingState from "@/components/feedback/loading-state"
import { Separator } from "@/components/ui/separator"
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

const emptyMCP: Omit<MCPServer, "created_at"> = { id: "", name: "", transport: "http", endpoint: "", command: "", enabled: true, capabilities: [] }
const emptyExtension = { id: "", name: "", version: "", description: "", capabilities: ["read_tasks"] }

const healthTone: Record<string, string> = {
  ok: "border-emerald-500/40 text-emerald-200",
  failed: "border-red-500/40 text-red-200",
  disabled: "border-[var(--color-line)] text-[var(--color-ink-3)]",
  unknown: "border-[var(--color-line)] text-[var(--color-ink-3)]",
}

function TransportBadge({ transport }: { transport: string }) {
  return <span className="rounded border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-ink-3)]">{transport}</span>
}

export default function EcosystemPage() {
  const qc = useQueryClient()
  const [mcp, setMcp] = useState(emptyMCP)
  const [ext, setExt] = useState(emptyExtension)
  const [health, setHealth] = useState<Record<string, MCPServerHealth>>({})

  const servers = useQuery({ queryKey: ["ecosystem-mcp"], queryFn: () => listMCPServers() })
  const extensions = useQuery({ queryKey: ["ecosystem-extensions"], queryFn: () => listExtensions() })
  const gateway = useQuery({ queryKey: ["ecosystem-gateway"], queryFn: gatewayStatus })
  const liveServers = useQuery({ queryKey: ["hermes-mcp-servers"], queryFn: () => listHermesMCPServers(), refetchInterval: 30_000 })
  const toolsets = useQuery({ queryKey: ["hermes-mcp-toolsets"], queryFn: () => listMCPToolsets() })

  const onFail = (e: Error) => toastGlobal(e.message, "error")

  const saveM = useMutation({
    mutationFn: () => saveMCPServer(mcp),
    onSuccess: () => { setMcp(emptyMCP); void qc.invalidateQueries({ queryKey: ["ecosystem-mcp"] }) },
    onError: onFail,
  })
  const saveE = useMutation({
    mutationFn: () => saveExtension(ext),
    onSuccess: () => { setExt(emptyExtension); void qc.invalidateQueries({ queryKey: ["ecosystem-extensions"] }) },
    onError: onFail,
  })
  const removeM = useMutation({
    mutationFn: (id: string) => deleteMCPServer(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ecosystem-mcp"] }),
    onError: onFail,
  })
  const removeE = useMutation({
    mutationFn: (id: string) => deleteExtension(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ecosystem-extensions"] }),
    onError: onFail,
  })
  const probe = useMutation({
    mutationFn: (name: string) => testMCPServer(name),
    onSuccess: (result) => {
      setHealth((prev) => ({ ...prev, [result.name]: result }))
      if (result.state === "ok") toastGlobal(`${result.name}: ${result.tools} tool(s) available`, "success")
      else toastGlobal(`${result.name}: ${result.error ?? result.state}`, "error")
    },
    onError: onFail,
  })

  const liveItems: HermesMCPServer[] = liveServers.data ?? []
  const mcpItems: MCPServer[] = servers.data ?? []
  const extItems: ExtensionManifest[] = extensions.data ?? []

  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[.18em] text-[var(--color-accent)]">Hermes Registry</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Ecosystem</h1>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">MCP servers configured by the hermes agent, plus the declarative extension registry.</p>
          <Separator className="my-3" />
        </div>

        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-2">
            <Cable className="size-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold">Gateway</h2>
            <span className="ml-auto rounded-full border px-2 py-0.5 font-mono text-[10px]">{gateway.data?.state ?? "loading"}</span>
          </div>
          {gateway.data?.error && <p className="mt-2 text-xs text-red-400">{gateway.data.error}</p>}
          <p className="mt-2 text-xs text-[var(--color-ink-3)]">Session creation remains disabled until transport and auth contract exists.</p>
        </div>

        <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold">Agent MCP servers</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">
            Read from the hermes agent&apos;s own <code className="font-mono">config.yaml</code>. Edit them with{" "}
            <code className="font-mono">hermes mcp add</code> — the agent is the source of truth.
          </p>
          {liveServers.isError && <p className="mt-3 text-sm text-red-400">Gagal load MCP servers: {(liveServers.error as Error).message}</p>}
          {liveServers.isLoading && <LoadingState variant="detail" label="Memuat MCP servers" />}
          {liveServers.isSuccess && liveItems.length === 0 && <p className="mt-3 text-xs text-[var(--color-ink-3)]">No MCP servers configured.</p>}
          <div className="mt-3 space-y-2">
            {liveItems.map((item) => {
              const status = health[item.name]
              return (
                <div key={item.name} className="rounded-lg border border-[var(--color-line)] p-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {item.name} <TransportBadge transport={item.transport} />{" "}
                        {item.enabled ? null : <span className="text-[var(--color-ink-3)]">(disabled)</span>}
                      </p>
                      <p className="truncate font-mono text-[10px] text-[var(--color-ink-3)]">
                        {item.transport === "stdio"
                          ? [item.command, ...(item.args ?? [])].filter(Boolean).join(" ")
                          : item.url}
                      </p>
                    </div>
                    {status && (
                      <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${healthTone[status.state] ?? healthTone.unknown}`}>
                        {status.state}{status.state === "ok" ? ` · ${status.tools} tools` : ""}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={probe.isPending || !item.enabled}
                      onClick={() => probe.mutate(item.name)}
                    >
                      Test
                    </Button>
                  </div>
                  {status?.tool_names && status.tool_names.length > 0 && (
                    <p className="mt-2 font-mono text-[10px] text-[var(--color-ink-2)]">{status.tool_names.join(", ")}</p>
                  )}
                  {status?.error && <p className="mt-2 text-xs text-red-400">{status.error}</p>}
                  {item.secret_set && (
                    <p className="mt-2 text-[10px] text-[var(--color-ink-3)]">
                      credentials configured{item.env_keys?.length ? `: ${item.env_keys.join(", ")}` : ""}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          {toolsets.isSuccess && Object.keys(toolsets.data ?? {}).length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-[10px] uppercase tracking-[.18em] text-[var(--color-ink-3)]">Toolset bindings</p>
              {Object.entries(toolsets.data ?? {}).map(([platform, list]) => (
                <p key={platform} className="font-mono text-[10px] text-[var(--color-ink-3)]">
                  {platform}: {list.join(", ")}
                </p>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-semibold">MCP registry</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">Declarative entries stored by the board. The hermes agent does not read these.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Input placeholder="id" value={mcp.id} onChange={e => setMcp({ ...mcp, id: e.target.value })} />
            <Input placeholder="name" value={mcp.name} onChange={e => setMcp({ ...mcp, name: e.target.value })} />
            <div className="flex gap-1 sm:col-span-2">
              <Button
                size="sm"
                variant={mcp.transport === "stdio" ? "default" : "outline"}
                onClick={() => setMcp({ ...mcp, transport: "stdio" })}
              >
                stdio
              </Button>
              <Button
                size="sm"
                variant={mcp.transport === "http" ? "default" : "outline"}
                onClick={() => setMcp({ ...mcp, transport: "http" })}
              >
                http
              </Button>
            </div>
            {mcp.transport === "stdio" ? (
              <Input className="sm:col-span-2" placeholder="command (e.g. codegraph serve --mcp)" value={mcp.command} onChange={e => setMcp({ ...mcp, command: e.target.value })} />
            ) : (
              <Input className="sm:col-span-2" placeholder="HTTPS endpoint or loopback HTTP" value={mcp.endpoint} onChange={e => setMcp({ ...mcp, endpoint: e.target.value })} />
            )}
            <Button disabled={saveM.isPending} onClick={() => saveM.mutate()}>Add MCP server</Button>
          </div>
          {servers.isError && <p className="mt-3 text-sm text-red-400">Gagal load registry: {(servers.error as Error).message}</p>}
          <div className="mt-4 space-y-2">
            {mcpItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {item.name} <span className="font-mono text-[10px] text-[var(--color-ink-3)]">({item.id})</span>
                  </p>
                  <p className="truncate font-mono text-[10px] text-[var(--color-ink-3)]">
                    {item.transport === "http" ? item.endpoint : item.command}
                  </p>
                </div>
                <Button size="icon" variant="ghost" aria-label={`Delete ${item.id}`} onClick={() => removeM.mutate(item.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center gap-2">
            <Puzzle className="size-4 text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold">Extensions</h2>
          </div>
          <p className="mt-1 text-xs text-[var(--color-ink-3)]">Declarative manifests. No plugin execution.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Input placeholder="id" value={ext.id} onChange={e => setExt({ ...ext, id: e.target.value })} />
            <Input placeholder="name" value={ext.name} onChange={e => setExt({ ...ext, name: e.target.value })} />
            <Input placeholder="version" value={ext.version} onChange={e => setExt({ ...ext, version: e.target.value })} />
            <Input placeholder="description" value={ext.description} onChange={e => setExt({ ...ext, description: e.target.value })} />
            <Button className="sm:col-span-2" disabled={saveE.isPending} onClick={() => saveE.mutate()}>Add extension</Button>
          </div>
          {extensions.isError && <p className="mt-3 text-sm text-red-400">Gagal load extensions: {(extensions.error as Error).message}</p>}
          <div className="mt-4 space-y-2">
            {extItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {item.name} <span className="font-mono text-[10px] text-[var(--color-ink-3)]">v{item.version}</span>
                  </p>
                  <p className="truncate text-[10px] text-[var(--color-ink-3)]">{item.capabilities.join(", ")}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label={`Delete ${item.id}`} onClick={() => removeE.mutate(item.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
