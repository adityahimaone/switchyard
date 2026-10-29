import { describe, expect, it } from "vitest"
import { formatDuration, pushState } from "./CompletionSummary"

const git = (over: Partial<Parameters<typeof pushState>[0]> = {}) => ({
  available: true, files: 0, insertions: 0, deletions: 0, ahead: 0, behind: 0, dirty: 0, ...over,
})

describe("formatDuration", () => {
  it("reads wall time the way a reviewer says it", () => {
    expect(formatDuration(0)).toBe("—")
    expect(formatDuration(45)).toBe("45s")
    expect(formatDuration(211)).toBe("3m 31s")
    expect(formatDuration(3 * 3600 + 5 * 60)).toBe("3h 5m")
  })
})

describe("pushState", () => {
  it("never claims pushed without an upstream", () => {
    expect(pushState(git({ upstream: "origin/main" })).label).toBe("pushed")
    expect(pushState(git()).label).toBe("no upstream")
    expect(pushState(git({ upstream: "origin/main", ahead: 2 }))).toEqual({ label: "2 unpushed", tone: "warn" })
    expect(pushState(git({ available: false })).label).toBe("unknown")
  })
})
