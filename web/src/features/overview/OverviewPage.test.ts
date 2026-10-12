import { describe, expect, it } from "vitest"
import { INTEGRATIONS as KNOWLEDGE_INTEGRATIONS, INTEGRATION_CATEGORIES } from "@/components/ui/integration-card"
import type { IntegrationDevice } from "./integrationHealth"
import { integrationDeviceState, integrationDevices, integrationGroupHealth, integrationGroups } from "./integrationHealth"
import { filterHeatmapTicksByLabelWidth } from "@/components/charts/heatmap"
import { formatHeatmapYAxisLabel, getHeatmapDayLabels } from "@/components/charts/heatmap"

function device(partial: Partial<IntegrationDevice> & { node_id: string }): IntegrationDevice {
  return { status: "idle", ...partial }
}

describe("integrationDevices", () => {
  it("uses the complete eleven-entry Knowledge integration catalog", () => {
    expect(KNOWLEDGE_INTEGRATIONS.map(({ id }) => id)).toEqual([
      "commandcode",
      "pen-dev",
      "codegraph",
      "node-agent",
      "e2e",
      "hermes",
      "git",
      "deepseek",
      "codex",
      "omp",
      "tailscale",
    ])
  })

  it("resolves the mac and windows columns from the fleet", () => {
    const devices = integrationDevices([
      device({ node_id: "mac", versions: { commandcode: "cmd/1.0.0" } }),
      device({ node_id: "windows" }),
    ])
    expect(devices.map((d) => d.key)).toEqual(["mac", "windows"])
    expect(devices[0].node?.node_id).toBe("mac")
    expect(devices[1].node?.node_id).toBe("windows")
  })

  it("matches a device through its hostname when the ID is generic", () => {
    const devices = integrationDevices([device({ node_id: "worker-01", hostname: "Adityas-MacBook-Pro" })])
    expect(devices[0].node?.node_id).toBe("worker-01")
    expect(devices[1].node).toBeUndefined()
  })

  it("matches macOS aliases case-insensitively", () => {
    const devices = integrationDevices([device({ node_id: "worker", hostname: "dev-Darwin" })])
    expect(devices[0].node?.node_id).toBe("worker")
  })

  it("leaves a device without a worker undefined", () => {
    const devices = integrationDevices([device({ node_id: "mac" })])
    expect(devices[0].node?.node_id).toBe("mac")
    expect(devices[1].node).toBeUndefined()
  })

  it("returns both devices when no worker has registered", () => {
    expect(integrationDevices(undefined).map((d) => d.node)).toEqual([undefined, undefined])
  })
})

describe("Activity heatmap weekday labels", () => {
  it("uses compact Monday-first labels for the Overview axis", () => {
    const labels = getHeatmapDayLabels(1)
    expect(labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    expect(labels.map((label) => formatHeatmapYAxisLabel(label, "abbreviated"))).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
  })
})

describe("filterHeatmapTicksByLabelWidth", () => {
  it("suppresses labels that would overlap by rendered width", () => {
    const ticks = [
      { x: 0, width: 30, label: "Jan" },
      { x: 28, width: 40, label: "February" },
      { x: 35, width: 20, label: "Mar" },
      { x: 43, width: 22, label: "Apr" },
      { x: 72, width: 24, label: "May" },
    ]
    expect(filterHeatmapTicksByLabelWidth(ticks)).toEqual([
      { x: 0, width: 30, label: "Jan" },
      { x: 43, width: 22, label: "Apr" },
      { x: 72, width: 24, label: "May" },
    ])
  })
})

describe("integrationDeviceState", () => {
  it("reports the first line of the probed version when installed", () => {
    const node = device({ node_id: "mac", versions: { codegraph: "codegraph 1.6.0\nbuilt from source" } })
    expect(integrationDeviceState(node, "codegraph")).toEqual({ ok: true, status: "connected", version: "codegraph 1.6.0" })
  })

  it("reports not installed when the worker has no version result", () => {
    expect(integrationDeviceState(device({ node_id: "windows" }), "omp")).toEqual({ ok: false, status: "not installed", version: "" })
  })

  it("reports probe failed when an installed binary did not return a version", () => {
    expect(integrationDeviceState(device({ node_id: "mac", versions: { hermes: "probe failed" } }), "hermes")).toEqual({ ok: false, status: "probe failed", version: "" })
  })

  it("keeps the reason a strict probe rejected, so the tooltip can explain the red dot", () => {
    const node = device({
      node_id: "windows",
      versions: { commandcode: "probe failed: Command Code needs Node.js 22 or newer — you're on v14.15.1." },
    })
    expect(integrationDeviceState(node, "commandcode")).toEqual({
      ok: false,
      status: "probe failed",
      version: "Command Code needs Node.js 22 or newer — you're on v14.15.1.",
    })
  })

  it("reports not installed for a blank version string", () => {
    expect(integrationDeviceState(device({ node_id: "mac", versions: { hermes: "   " } }), "hermes")).toEqual({ ok: false, status: "not installed", version: "" })
  })

  it("reports offline for a stale worker even with versions", () => {
    const node = device({ node_id: "mac", status: "offline", versions: { dsh: "0.1.6-alpha.2" } })
    expect(integrationDeviceState(node, "dsh")).toEqual({ ok: false, status: "worker offline", version: "" })
  })

  it("reports worker not registered when the device has no matching worker", () => {
    expect(integrationDeviceState(undefined, "codex")).toEqual({ ok: false, status: "worker not registered", version: "" })
  })

  it("treats an empty reachable agent registry as unregistered workers", () => {
    const devices = integrationDevices([])
    expect(devices.map((device) => integrationDeviceState(device.node, "codex").status)).toEqual([
      "worker not registered",
      "worker not registered",
    ])
  })

  it("reports worker offline only for a registered stale worker", () => {
    expect(integrationDeviceState(device({ node_id: "mac", status: "offline" }), "codex")).toEqual({ ok: false, status: "worker offline", version: "" })
  })

  it("treats idle and busy workers as connected", () => {
    for (const status of ["idle", "busy"]) {
      const node = device({ node_id: "mac", status, versions: { commandcode: "cmd/1.0.0" } })
      expect(integrationDeviceState(node, "commandcode").ok).toBe(true)
    }
  })

  it("reports tailscale connected only when its tailnet backend is running", () => {
    const connected = device({ node_id: "mac", versions: { tailscale: "1.102.2 (Running)" } })
    expect(integrationDeviceState(connected, "tailscale")).toEqual({ ok: true, status: "connected", version: "1.102.2 (Running)" })

    for (const state of ["NeedsLogin", "Stopped", "Degraded"]) {
      const node = device({ node_id: "windows", versions: { tailscale: `1.80.0 (${state})` } })
      expect(integrationDeviceState(node, "tailscale")).toEqual({ ok: false, status: "not connected", version: `1.80.0 (${state})` })
    }
  })
})

describe("integrationGroups", () => {
  const groups = integrationGroups(KNOWLEDGE_INTEGRATIONS, INTEGRATION_CATEGORIES)

  it("groups the catalog by role, in the order the categories declare", () => {
    expect(groups.map(({ category }) => category.id)).toEqual(INTEGRATION_CATEGORIES.map(({ id }) => id))
    expect(groups.map(({ category }) => category.label)).toEqual([
      "Execution & models",
      "Design",
      "Context",
      "Verification",
      "Source control",
      "Transport & workers",
    ])
  })

  it("files the five harnesses under execution and pen.dev under design", () => {
    const members = (id: string) => groups.find(({ category }) => category.id === id)?.integrations.map(({ id: i }) => i)
    expect(members("execution")).toEqual(["commandcode", "hermes", "deepseek", "codex", "omp"])
    expect(members("design")).toEqual(["pen-dev"])
    expect(members("verification")).toEqual(["e2e"])
    expect(members("context")).toEqual(["codegraph"])
    expect(members("source-control")).toEqual(["git"])
    expect(members("transport")).toEqual(["node-agent", "tailscale"])
  })

  it("places every integration in exactly one group", () => {
    const grouped = groups.flatMap(({ integrations }) => integrations.map(({ id }) => id))
    expect(grouped.slice().sort()).toEqual(KNOWLEDGE_INTEGRATIONS.map(({ id }) => id).slice().sort())
    expect(grouped).toHaveLength(KNOWLEDGE_INTEGRATIONS.length)
  })

  it("drops a group that has no members rather than leaving a bare heading", () => {
    const onlyDesign = KNOWLEDGE_INTEGRATIONS.filter(({ category }) => category === "design")
    expect(integrationGroups(onlyDesign, INTEGRATION_CATEGORIES).map(({ category }) => category.id)).toEqual(["design"])
  })
})

describe("integrationGroupHealth", () => {
  const execution = KNOWLEDGE_INTEGRATIONS.filter(({ category }) => category === "execution")
  const devices = (...nodes: IntegrationDevice[]) => integrationDevices(nodes)

  it("counts a tool only when every registered worker reports it", () => {
    // mac has all five; windows is missing omp, so the group cannot be green.
    const allFive = { commandcode: "1.0.0", hermes: "1.0.0", deepseek: "1.0.0", codex: "1.0.0", omp: "1.0.0" }
    const health = integrationGroupHealth(
      devices(
        device({ node_id: "mac", versions: allFive }),
        device({ node_id: "windows", versions: { ...allFive, omp: "" } }),
      ),
      execution,
    )
    expect(health).toEqual({ healthy: 4, total: 5, workers: 2 })
  })

  it("is green only when the tool is present on every worker", () => {
    const allFive = { commandcode: "1.0.0", hermes: "1.0.0", deepseek: "1.0.0", codex: "1.0.0", omp: "1.0.0" }
    expect(
      integrationGroupHealth(devices(device({ node_id: "mac", versions: allFive })), execution),
    ).toEqual({ healthy: 5, total: 5, workers: 1 })
  })

  it("scores zero when no worker has registered", () => {
    expect(integrationGroupHealth(devices(), execution)).toEqual({ healthy: 0, total: 5, workers: 0 })
    expect(integrationGroupHealth(devices(device({ node_id: "mac" })), execution, false)).toEqual({ healthy: 0, total: 5, workers: 1 })
  })

  it("scores zero for every group while the agent is unavailable", () => {
    const allFive = { commandcode: "1.0.0", hermes: "1.0.0", deepseek: "1.0.0", codex: "1.0.0", omp: "1.0.0" }
    expect(
      integrationGroupHealth(devices(device({ node_id: "mac", versions: allFive })), execution, true),
    ).toEqual({ healthy: 0, total: 5, workers: 1 })
  })
})
