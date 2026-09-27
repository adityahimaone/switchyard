import { describe, expect, it } from "vitest"
import { visibleExecutorsFor } from "./TaskDialog"

const ALL = ["auto", "hermes", "codex", "commandcode", "dsh", "shell"]

describe("visibleExecutorsFor", () => {
  it("shows every executor when settings have not loaded yet", () => {
    expect(visibleExecutorsFor()).toEqual(ALL)
  })

  it("hides a disabled executor but keeps the rest", () => {
    const got = visibleExecutorsFor({ order: ALL, disabled: ["dsh"], default_execution_mode: "direct" })
    expect(got).not.toContain("dsh")
    expect(got).toContain("commandcode")
  })

  it("keeps auto selectable even if it is listed as disabled", () => {
    const got = visibleExecutorsFor({ order: ALL, disabled: ["auto"], default_execution_mode: "direct" })
    expect(got).toContain("auto")
  })

  it("follows the configured order", () => {
    const got = visibleExecutorsFor({
      order: ["dsh", "commandcode", "auto", "hermes", "codex", "shell"],
      disabled: [],
      default_execution_mode: "direct",
    })
    expect(got).toEqual(["dsh", "commandcode", "auto", "hermes", "codex", "shell"])
  })

  it("can leave auto as the only option", () => {
    const got = visibleExecutorsFor({
      order: ALL,
      disabled: ["hermes", "codex", "commandcode", "dsh", "shell"],
      default_execution_mode: "direct",
    })
    expect(got).toEqual(["auto"])
  })
})
