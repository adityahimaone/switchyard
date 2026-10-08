import { describe, expect, it } from "vitest"
import { executorIsEnabled } from "./ExecutorSettings"
import type { ExecutorSettings } from "@/api"

const settings: ExecutorSettings = {
  order: ["auto", "hermes", "codex", "commandcode", "claude", "dsh", "omp", "shell"],
  disabled: [],
  default_execution_mode: "direct",
}

describe("Claude executor settings", () => {
  it("keeps Claude explicitly selectable without changing auto behavior", () => {
    expect(settings.order).toContain("claude")
    expect(settings.order[0]).toBe("auto")
    expect(executorIsEnabled("claude", settings)).toBe(true)
  })

  it("hides Claude only when explicitly disabled", () => {
    expect(executorIsEnabled("claude", { ...settings, disabled: ["claude"] })).toBe(false)
    expect(executorIsEnabled("auto", { ...settings, disabled: ["auto", "claude"] })).toBe(true)
  })
})
