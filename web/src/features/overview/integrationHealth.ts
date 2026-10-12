import type { Integration } from "@/components/ui/integration-card"

/**
 * The Integration-health model: what a worker reports, what that means, and how
 * the catalog rolls up into role groups.
 *
 * Kept apart from `OverviewPage.tsx` for two reasons. It is pure — no React, no
 * motion, no fetch — so it can be reasoned about and tested on its own. And the
 * page is already long enough that the rules for "is this healthy" were the
 * hardest thing in it to find.
 */

// One registered worker device, as /api/nodes reports it.
export interface IntegrationDevice {
  node_id: string
  hostname?: string
  status: string
  versions?: Record<string, string>
}

// The node agent normalizes its hostname to "mac" or "windows"
// at startup, so a substring match resolves the device column
// even when NODE_AGENT_ID was overridden with a longer name.
export function integrationDevices(nodes: IntegrationDevice[] | undefined) {
  const list = nodes ?? []
  const find = (platform: "mac" | "windows") => list.find((node) => {
    const identity = `${node.node_id} ${node.hostname ?? ""}`.toLowerCase()
    return platform === "mac"
      ? identity.includes("mac") || identity.includes("darwin")
      : identity.includes("win")
  })
  return [
    { key: "mac", label: "mac", node: find("mac") },
    { key: "windows", label: "windows", node: find("windows") },
  ]
}

// What one integration reads as on one device: the verdict word the card
// prints, the release behind it when there is one, and whether the pair
// counts as healthy. Installed and reachable reads as "connected" with the
// version the agent probed at registration; anything else reads red with the
// reason beside it.
export interface IntegrationState {
  ok: boolean
  status: string
  version: string
}

export function integrationDeviceState(node: IntegrationDevice | undefined, integrationId: string): IntegrationState {
  if (!node) {
    return { ok: false, status: "worker not registered", version: "" }
  }
  if (node.status === "offline" || node.status === "down") {
    return { ok: false, status: "worker offline", version: "" }
  }
  const raw = (node.versions?.[integrationId] ?? "").trim()
  if (!raw) {
    return { ok: false, status: "not installed", version: "" }
  }
  // A tool that answers with prose instead of a release comes back as
  // `probe failed: <reason>`; the dot goes red and the reason is what the
  // tooltip explains, because "it printed something" is not health.
  if (raw === "probe failed") {
    return { ok: false, status: "probe failed", version: "" }
  }
  if (raw.startsWith("probe failed:")) {
    return { ok: false, status: "probe failed", version: raw.slice("probe failed:".length).trim() }
  }
  // `--version` output can span lines; the first is the release.
  const version = raw.split("\n").map((line) => line.trim()).find((line) => line !== "") ?? raw
  // tailscale's probe carries its tailnet state in parentheses;
  // only a Running backend means the node is actually on the
  // tailnet, so any other state reads as unhealthy even
  // though the binary is installed.
  if (integrationId === "tailscale" && !/\(running\)$/i.test(version)) {
    return { ok: false, status: "not connected", version }
  }
  return { ok: true, status: "connected", version }
}

// The catalog split into its role groups: `INTEGRATION_CATEGORIES` order for the
// groups, catalog order for the members inside each one. Empty groups are
// dropped, so a category that loses its last tool never leaves a bare heading
// behind — the table can never claim a group it has nothing to show for.
//
// The category list is passed in rather than imported so this module stays free
// of the brand assets in `integration-card.tsx` (motion, SVGs, raster logos) and
// can be exercised on its own.
export function integrationGroups<C extends { id: string }>(
  integrations: Integration[],
  categories: C[],
): { category: C; integrations: Integration[] }[] {
  return categories
    .map((category) => ({
      category,
      integrations: integrations.filter((integration) => integration.category === category.id),
    }))
    .filter((group) => group.integrations.length > 0)
}

// A group's verdict: how many of its tools are healthy on *every* registered
// worker.
//
// Strict on purpose. A per-device tally would let a category read green while
// one worker cannot run any of it — which is the exact failure the table exists
// to surface, and the one a reader scanning group headings would miss. With no
// worker registered there is nothing for a tool to be healthy on, so the count
// is zero rather than a misleading full house.
export function integrationGroupHealth(
  devices: { node?: IntegrationDevice }[],
  integrations: Integration[],
  agentDown = false,
): { healthy: number; total: number; workers: number } {
  const workers = devices.filter((device) => device.node)
  if (agentDown || workers.length === 0) {
    return { healthy: 0, total: integrations.length, workers: workers.length }
  }
  const healthy = integrations.filter((integration) =>
    workers.every((device) => integrationDeviceState(device.node, integration.id).ok),
  ).length
  return { healthy, total: integrations.length, workers: workers.length }
}

// ── persisted-snapshot fallback ────────────────────────────────────────────
//
// The live fleet is one source and the database is another. A worker that is
// not registered right now — because node-agent restarted, the agent is
// unreachable, or the host is asleep — must not blank its column: the version
// it last reported is stored, and the grid keeps showing it until the next
// "ping all versions" writes a new one.
//
// The database already stores the rendered verdict per device/integration
// (`integrationRowState` in internal/kanban/integrations.go is kept in parity
// with `integrationDeviceState` above), so the fallback reads ok/status/version
// straight back instead of re-deriving them from a raw probe string.

// One stored device/integration verdict, as /api/nodes/integrations returns it.
export interface SavedIntegrationItem {
  node_id: string
  integration_id: string
  version: string
  status: string
  ok: boolean
  checked_at: number
}

export interface SavedIntegrationNode {
  node_id: string
  hostname: string
  status: string
  last_seen: string
  connected: number
  total: number
}

export interface SavedSnapshot {
  saved_at: number
  nodes: SavedIntegrationNode[]
  items: SavedIntegrationItem[]
}

// The same two device columns as `integrationDevices`, resolved from the
// stored snapshot. The node is narrowed to the fields a column renders, so the
// live and stored columns share one shape.
export function savedIntegrationDevices(snapshot: SavedSnapshot | undefined) {
  const list = snapshot?.nodes ?? []
  const find = (platform: "mac" | "windows") => list.find((node) => {
    const identity = `${node.node_id} ${node.hostname ?? ""}`.toLowerCase()
    return platform === "mac"
      ? identity.includes("mac") || identity.includes("darwin")
      : identity.includes("win")
  })
  const toDevice = (node?: SavedIntegrationNode): IntegrationDevice | undefined =>
    node ? { node_id: node.node_id, hostname: node.hostname, status: node.status } : undefined
  return [
    { key: "mac", label: "mac", node: toDevice(find("mac")) },
    { key: "windows", label: "windows", node: toDevice(find("windows")) },
  ]
}

// One stored verdict. A missing worker reads as unregistered and a missing row
// as not installed — the same words the live column would have shown.
export function savedIntegrationState(
  snapshot: SavedSnapshot | undefined,
  nodeId: string | undefined,
  integrationId: string,
): IntegrationState {
  if (!nodeId) {
    return { ok: false, status: "worker not registered", version: "" }
  }
  const item = snapshot?.items.find((i) => i.node_id === nodeId && i.integration_id === integrationId)
  if (!item) {
    return { ok: false, status: "not installed", version: "" }
  }
  return { ok: item.ok, status: item.status, version: item.version }
}

// A device column with the source its verdict comes from. Live wins when the
// worker is registered; otherwise the column falls back to the stored snapshot;
// with neither, there is nothing to show.
export interface IntegrationColumn {
  key: string
  label: string
  node?: IntegrationDevice
  source: "live" | "saved" | "none"
}

export function integrationColumns(
  live: IntegrationDevice[] | undefined,
  saved: SavedSnapshot | undefined,
): IntegrationColumn[] {
  const liveDevices = integrationDevices(live)
  const savedDevices = savedIntegrationDevices(saved)
  return liveDevices.map((device, i) => {
    if (device.node) {
      return { key: device.key, label: device.label, node: device.node, source: "live" as const }
    }
    const stored = savedDevices[i].node
    if (stored) {
      return { key: device.key, label: device.label, node: stored, source: "saved" as const }
    }
    return { key: device.key, label: device.label, source: "none" as const }
  })
}

// The verdict for one column, read from whichever source it resolved to.
export function integrationColumnState(
  column: IntegrationColumn,
  saved: SavedSnapshot | undefined,
  integrationId: string,
  agentDown: boolean,
): IntegrationState {
  switch (column.source) {
    case "live":
      return integrationDeviceState(column.node, integrationId)
    case "saved":
      return savedIntegrationState(saved, column.node?.node_id, integrationId)
    default:
      return { ok: false, status: agentDown ? "agent unavailable" : "worker not registered", version: "" }
  }
}

// A group's verdict across the resolved columns: the same strict "healthy on
// every worker" rule, applied to live and stored columns alike.
export function integrationGroupHealthFromColumns(
  columns: IntegrationColumn[],
  saved: SavedSnapshot | undefined,
  integrations: Integration[],
  agentDown: boolean,
): { healthy: number; total: number; workers: number } {
  const workers = columns.filter((column) => column.source !== "none")
  if (workers.length === 0) {
    return { healthy: 0, total: integrations.length, workers: 0 }
  }
  const healthy = integrations.filter((integration) =>
    workers.every((column) => integrationColumnState(column, saved, integration.id, agentDown).ok),
  ).length
  return { healthy, total: integrations.length, workers: workers.length }
}
