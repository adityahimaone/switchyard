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
