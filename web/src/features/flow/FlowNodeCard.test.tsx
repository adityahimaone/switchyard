import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Kanban } from "lucide-react"
import { FlowNodeCard } from "./FlowNodeCard"
import { NodeDetailPanel } from "./NodeDetailPanel"
import type { FlowTask } from "./useFlowTasks"

const node = (props: Partial<Parameters<typeof FlowNodeCard>[0]> = {}) => (
  <FlowNodeCard
    label="Kanban State"
    sub="SQLite · task lifecycle"
    icon={Kanban}
    color="var(--c-review)"
    onSelect={() => {}}
    onDragStart={() => {}}
    onDragMove={() => {}}
    onDragCancel={() => {}}
    {...props}
  />
)

const task: FlowTask = {
  task_id: "task_142",
  title: "Wire the workspace identity resolution",
  board: "main",
  node_id: "node-agent-server",
  executor: "mac",
  stage: "running",
  updated_at: "2026-10-02T09:41:00Z",
}

describe("FlowNodeCard", () => {
  it("is opaque: no glass material and no blur on the card itself", () => {
    const out = renderToStaticMarkup(node())
    expect(out).toContain("bg-surface")
    // The whole point of this change — `glass-card` resolves to a 40%-opaque
    // tint in dark mode and washed the nodes out against the canvas.
    expect(out).not.toContain("glass")
    expect(out).not.toContain("backdrop")
  })

  it("uses the system type scale rather than ad-hoc sizes", () => {
    const out = renderToStaticMarkup(node())
    expect(out).toContain("text-sm")
    expect(out).toMatch(/text-xs[^"]*"[^>]*>SQLite/)
    expect(out).not.toContain("text-[11px]")
    expect(out).not.toContain("text-[9px]")
  })

  it("marks the selected node with a border, not a floating ring", () => {
    const selected = renderToStaticMarkup(node({ selected: true }))
    expect(selected).toContain("border-accent")
    expect(selected).not.toContain("ring-[1.5px]")
    expect(renderToStaticMarkup(node({ selected: false }))).not.toContain("border-accent")
  })

  it("shows a live task id in mono and falls back to the sub line", () => {
    const live = renderToStaticMarkup(node({ meta: "task_142" }))
    expect(live).toContain("font-mono")
    expect(live).toContain("task_142")
    expect(renderToStaticMarkup(node())).toContain("SQLite · task lifecycle")
  })

  it("hides the count pill at zero and shows it above", () => {
    expect(renderToStaticMarkup(node({ count: 0 }))).not.toContain("rounded-full border border-line bg-well")
    expect(renderToStaticMarkup(node({ count: 3 }))).toContain(">3<")
  })

  it("exposes selection state to assistive tech", () => {
    expect(renderToStaticMarkup(node({ selected: true }))).toContain('aria-pressed="true"')
  })
})

describe("NodeDetailPanel", () => {
  const panel = (props: Partial<Parameters<typeof NodeDetailPanel>[0]> = {}) =>
    renderToStaticMarkup(
      <NodeDetailPanel
        label="Kanban State"
        group="TASK STATE"
        sub="SQLite · task lifecycle"
        color="var(--c-review)"
        onClose={() => {}}
        {...props}
      />,
    )

  it("docks as a bordered sibling rather than a floating overlay", () => {
    const out = panel()
    expect(out).toContain("border-l")
    // A docked column does not cast a float shadow — nothing is beneath it.
    expect(out).not.toContain("shadow-2xl")
    expect(out).not.toContain("absolute")
  })

  it("lays the task out as labelled rows rather than loose stacked lines", () => {
    const out = panel({ task, stageColor: "var(--c-success-text)" })
    expect(out).toContain("<dl")
    expect(out).toContain("Executor")
    expect(out).toContain("mac")
    expect(out).toContain("task_142")
  })

  it("explains an empty route instead of rendering a blank panel", () => {
    expect(panel()).toContain("No matching task currently routed")
  })
})
