import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

/**
 * The bar chart measures itself with visx `ParentSize`, so a static render sees
 * width 0 and draws nothing. Pin the size so the composition (BarChart + Bar +
 * Grid + BarXAxis + ChartTooltip) is actually exercised and its output asserted.
 */
vi.mock("@visx/responsive", () => ({
  ParentSize: ({ children }: { children: (s: { width: number; height: number }) => unknown }) =>
    children({ width: 600, height: 200 }),
}))

import { BarChart } from "@/components/charts/bar-chart"
import { Bar } from "@/components/charts/bar"
import { BarXAxis } from "@/components/charts/bar-x-axis"
import { Grid } from "@/components/charts/grid"
import { ChartTooltip } from "@/components/charts/tooltip"

const draw = [
  { bucket: "19:54", watts: 4.6, kwh: 0.0 },
  { bucket: "20:00", watts: 68.8, kwh: 0.007 },
  { bucket: "20:06", watts: 167.9, kwh: 0.017 },
  { bucket: "20:12", watts: 232.6, kwh: 0.0235 },
  { bucket: "22:56", watts: 207.3, kwh: 0.0187 },
]

function chart(data: Record<string, unknown>[] = draw) {
  return (
    <BarChart data={data} xDataKey="bucket" aspectRatio="3 / 1" margin={{ top: 8, right: 8, bottom: 24, left: 36 }} status="ready">
      <Grid horizontal />
      <Bar dataKey="watts" fill="var(--c-accent)" lineCap={2} />
      <BarXAxis maxLabels={6} />
      <ChartTooltip
        rows={(point) => [
          { color: "var(--c-accent)", label: "Avg draw", value: `${Number(point.watts).toFixed(0)} W` },
          { color: "var(--c-accent)", label: "Energy", value: `${Number(point.kwh).toFixed(3)} kWh` },
        ]}
      />
    </BarChart>
  )
}

/**
 * Axis labels are rendered through a portal into the chart container, so they
 * exist only in the browser and are deliberately not asserted here — a static
 * render can only prove the bars themselves and the grid.
 */
describe("energy bar chart", () => {
  it("lays out one bar per bucket, each with a real width", () => {
    const html = renderToStaticMarkup(chart())
    const bars = [...html.matchAll(/<rect fill="var\(--c-accent\)"[^>]*width="([\d.]+)px"/g)]
    expect(bars).toHaveLength(draw.length)
    for (const [, width] of bars) {
      expect(Number(width)).toBeGreaterThan(0)
    }
    // Rounded caps from lineCap={2}.
    expect(html).toContain('rx="2"')
  })

  it("draws the horizontal grid the series is read against", () => {
    const html = renderToStaticMarkup(chart())
    expect(html).toContain("chart-grid")
    expect(html).toContain("var(--chart-grid)")
  })

  it("does not throw on an empty series", () => {
    expect(() => renderToStaticMarkup(chart([]))).not.toThrow()
  })
})
