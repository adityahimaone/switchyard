import { describe, expect, it } from "vitest"
import { orbStateForPhase } from "./thinking-orb"

describe("orbStateForPhase", () => {
  it("maps a search phase to the searching orb", () => {
    expect(orbStateForPhase("Reading files")).toBe("searching")
    expect(orbStateForPhase("Checking workspace structure")).toBe("searching")
  })

  it("maps a reasoning phase to solving", () => {
    expect(orbStateForPhase("Planning the change")).toBe("solving")
  })

  it("maps a generic work phase to working", () => {
    expect(orbStateForPhase("Working through request")).toBe("working")
    expect(orbStateForPhase("Applying edit")).toBe("working")
  })

  it("narrow verbs win over the broad work catch-all", () => {
    // "searching files" contains "files"; the search rule must come first or
    // every file operation would collapse to the generic working orbit.
    expect(orbStateForPhase("Searching files")).toBe("searching")
  })

  it("returns undefined when there is no phase to read", () => {
    expect(orbStateForPhase(undefined)).toBeUndefined()
    expect(orbStateForPhase("")).toBeUndefined()
    expect(orbStateForPhase("Frobnicating")).toBeUndefined()
  })
})
