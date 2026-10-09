import { describe, expect, it } from "vitest"
import { parseRoute } from "./routes"

describe("parseRoute projects", () => {
  it("treats /projects as the landing view", () => {
    expect(parseRoute("/projects")).toMatchObject({ page: "projects" })
    expect(parseRoute("/projects").projectID).toBeUndefined()
  })

  it("reads a project id and its session", () => {
    expect(parseRoute("/projects/cp_1")).toMatchObject({ page: "projects", projectID: "cp_1" })
    expect(parseRoute("/projects/cp_1/cs_9")).toMatchObject({ page: "projects", projectID: "cp_1", chatSessionID: "cs_9" })
  })

  it("keeps a landing-view session out of projectID via the `-` sentinel", () => {
    // Without the sentinel `cs_9` would be read as a project id and the
    // landing view would try to open a project that does not exist.
    const r = parseRoute("/projects/-/cs_9")
    expect(r.projectID).toBeUndefined()
    expect(r.chatSessionID).toBe("cs_9")
  })
})
