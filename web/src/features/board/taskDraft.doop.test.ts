import { describe, expect, it } from "vitest"
import { buildCreatePayload, type CreateTaskDraft } from "./taskDraft"

const base: CreateTaskDraft = {
  title: "Implement pricing frame",
  body: "Build to the attached Doop frame",
  workspacePath: "/Users/me/saas",
  assignee: "default",
  executor: "dsh",
  executionMode: "direct",
  maxIterations: "6",
  priority: "0",
  paths: [],
  deps: [],
  gateCommand: "",
  startMode: "now",
  isolation: "workspace",
  baseBranch: "",
  verifyProfile: "auto",
  designSource: "",
  designTool: "",
}

describe("Doop design provenance in the create payload", () => {
  it("sends nothing design-related for a plain card", () => {
    const payload = buildCreatePayload(base)
    expect("design_source" in payload).toBe(false)
    expect("design_provider" in payload).toBe(false)
    expect("design_ref" in payload).toBe(false)
    expect("design_tool" in payload).toBe(false)
  })

  it("sends the immutable ref, source and provider for an attached slice", () => {
    const payload = buildCreatePayload({
      ...base,
      designSource: "design/doop/abc123",
      designProvider: "doop",
      designRef: "doop://canvas-1/frame-9@v7",
    })
    expect(payload.design_source).toBe("design/doop/abc123")
    expect(payload.design_provider).toBe("doop")
    expect(payload.design_ref).toBe("doop://canvas-1/frame-9@v7")
    // A Doop card must not accidentally activate the legacy pen.dev generator.
    expect("design_tool" in payload).toBe(false)
  })

  it("trims the ref but never sends a provider without a ref", () => {
    const trimmed = buildCreatePayload({
      ...base,
      designProvider: "doop",
      designRef: "  doop://c/f@v1  ",
    })
    expect(trimmed.design_ref).toBe("doop://c/f@v1")

    const orphan = buildCreatePayload({ ...base, designProvider: "doop", designRef: "   " })
    expect(orphan.design_provider).toBe("doop")
    expect("design_ref" in orphan).toBe(false)
  })

  it("keeps a legacy design_source card free of Doop provenance", () => {
    const payload = buildCreatePayload({ ...base, designSource: "design/task-card.pen" })
    expect(payload.design_source).toBe("design/task-card.pen")
    expect("design_provider" in payload).toBe(false)
    expect("design_ref" in payload).toBe(false)
  })
})
