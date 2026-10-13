import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

/**
 * The card renders a visx bar chart, which measures itself with `ParentSize`.
 * A static render therefore sees width 0 and draws nothing, so pin the size.
 */
vi.mock("@visx/responsive", () => ({
  ParentSize: ({ children }: { children: (s: { width: number; height: number }) => unknown }) =>
    children({ width: 600, height: 200 }),
}))

import type { PowerMetrics, PowerRemote } from "@/api"
import { PowerEnergyCard, remoteAccessState } from "./OverviewPage"

const metrics: PowerMetrics = {
  live: { switch: true, power_w: 175.6, voltage_v: 220.3, current_a: 0.868, add_ele_raw: 101 },
  window_days: 7,
  total_kwh: 0.671,
  today_kwh: 0.671,
  daily: [{ date: "2026-10-12", kwh: 0.671 }],
  series: [
    { t: 1760283 - 1200, w: 4.6, kwh: 0 },
    { t: 1760283 - 600, w: 68.8, kwh: 0.007 },
    { t: 1760283, w: 232.6, kwh: 0.0235 },
  ],
  bucket_seconds: 364,
  samples: 67,
  peak_w: 358.7,
}

const render = (props: Partial<Parameters<typeof PowerEnergyCard>[0]> = {}) =>
  renderToStaticMarkup(
    <PowerEnergyCard data={metrics} loading={false} unavailable={false} label="Windows PC" {...props} />,
  )

/**
 * Regression: a transient metrics failure must not blank the chart. React Query
 * keeps `data` cached through an error, so the parent passes the same props and
 * the card has to keep drawing — the chart disappearing was the reported bug.
 */
describe("PowerEnergyCard", () => {
  it("draws the chart while it has data, even as the parent re-renders", () => {
    const html = render()
    expect(html).toContain("Windows PC")
    // One bar per series bucket, plus the live stat readout.
    const bars = html.match(/fill="var\(--c-accent\)"/g) ?? []
    expect(bars.length).toBeGreaterThanOrEqual(metrics.series.length)
    expect(html).toContain("175.6")
  })

  it("shows the skeleton only for the first read, not on a refresh", () => {
    expect(render({ loading: true })).toContain("Reading plug")
    expect(render({ loading: false })).not.toContain("Reading plug")
  })

  it("renders nothing only when there is no target at all", () => {
    expect(render({ unavailable: true })).toBe("")
  })

  it("does not throw when a poll comes back with no usable buckets", () => {
    const empty = { ...metrics, series: [], samples: 0 }
    const html = render({ data: empty })
    expect(html).toContain("Not enough readings yet")
  })
})

/**
 * Remote-access badge: the card is the Windows PC's, so it doubles as the
 * "can I connect right now" readout. Reachable + RDP open is the green path;
 * a host that answers but has no RDP is the amber one; silence is just off.
 */
describe("remote access badge", () => {
  const remote = (over: Partial<PowerRemote> = {}): PowerRemote =>
    ({ reachable: true, rdp: true, tailscale: true, ...over })

  it("renders no badge when no remote check is configured", () => {
    const html = render({ remote: undefined })
    expect(html).not.toContain("RDP ready")
    expect(html).not.toContain("PC off")
    expect(html).not.toContain("RDP closed")
  })

  it("reads ready when the host answers and RDP is open", () => {
    expect(render({ remote: remote() })).toContain("RDP ready")
  })

  it("reads closed when the host answers but RDP is not open", () => {
    expect(render({ remote: remote({ rdp: false }) })).toContain("RDP closed")
  })

  it("reads off when the host does not answer", () => {
    const html = render({ remote: remote({ reachable: false, rdp: false }) })
    expect(html).toContain("PC off")
  })

  it("maps each state to its own tone", () => {
    expect(remoteAccessState(remote())).toMatchObject({ label: "RDP ready", tone: "bg-success" })
    expect(remoteAccessState(remote({ rdp: false }))).toMatchObject({ label: "RDP closed", tone: "bg-warning" })
    expect(remoteAccessState(remote({ reachable: false }))).toMatchObject({ label: "PC off", tone: "bg-ink-3" })
    expect(remoteAccessState(undefined)).toBeNull()
  })
})
