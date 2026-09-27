import { describe, expect, it } from "vitest"
import { taskCardPositions } from "./layout"

describe("taskCardPositions", () => {
  it("stacks badges below the node card (no overlap)", () => {
    const positions = taskCardPositions([
      { task_id: "t-1", title: "First" },
      { task_id: "t-2", title: "Second" },
      { task_id: "t-3", title: "Third" },
    ], { x: 400, y: 350 })

    expect(positions.map((p) => p.x)).toEqual([400, 400, 400])
    expect(positions.map((p) => p.y)).toEqual([390, 412, 434])
  })
})
