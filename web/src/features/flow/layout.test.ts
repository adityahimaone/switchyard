import { describe, expect, it } from "vitest"
import { taskCardPositions } from "./layout"

describe("taskCardPositions", () => {
  it("centers open tasks and separates stacked cards", () => {
    const positions = taskCardPositions([
      { task_id: "t-1", title: "First" },
      { task_id: "t-2", title: "Second" },
      { task_id: "t-3", title: "Third" },
    ], { x: 400, y: 350 })

    expect(positions.map((position) => position.x)).toEqual([400, 400, 400])
    expect(positions.map((position) => position.y)).toEqual([282, 350, 418])
  })
})
