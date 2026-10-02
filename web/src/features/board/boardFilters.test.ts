import { describe, expect, it } from "vitest"
import {
  ALL,
  applyFilters,
  fieldOptions,
  fieldsFor,
  firstValuePerField,
  matchesOperator,
  toFilters,
} from "./boardFilters"
import type { Task } from "@/api"

const profiles = [
  { name: "worker", model: "m", provider: "p", active: true, valid: true },
  { name: "reviewer", model: "m", provider: "p", active: false, valid: true },
]
const workspaces = [
  { path: "/Users/me/saas", name: "saas" },
  { path: "/Users/me/blog", name: "blog" },
]

const fields = fieldsFor({ profiles, workspaces })

describe("fieldsFor", () => {
  it("offers the four filterable fields", () => {
    expect(fields.map((f) => f.id)).toEqual(["status", "agent", "workspace", "priority"])
  })

  it("includes unassigned and scratch as real values", () => {
    // Both are distinct from "any": a card with no assignee is not a card with
    // any assignee, and dropping these makes those cards unfindable.
    const agent = fieldOptions(fields, "agent")
    expect(agent.map((o) => o.value)).toContain("")
    const workspace = fieldOptions(fields, "workspace")
    expect(workspace.map((o) => o.value)).toContain("")
  })

  it("derives options from live data rather than a fixed list", () => {
    expect(fieldOptions(fields, "agent").map((o) => o.value)).toEqual([
      "worker",
      "reviewer",
      "",
    ])
    expect(fieldOptions(fields, "workspace").map((o) => o.value)).toEqual([
      "/Users/me/saas",
      "/Users/me/blog",
      "",
    ])
  })

  it("labels priorities the way the old dropdown did", () => {
    expect(fieldOptions(fields, "priority").map((o) => o.label)).toEqual([
      "P0 normal",
      "P1",
      "P2 high",
      "P3 urgent",
    ])
  })

  it("exposes only the statuses the board shows", () => {
    const subset = fieldsFor({ profiles, workspaces, presentStatuses: ["todo", "done"] })
    expect(fieldOptions(subset, "status").map((o) => o.value)).toEqual(["todo", "done"])
  })
})

const base = { q: "", fStatus: ALL, fAgent: ALL, fWorkspace: ALL, fPriority: ALL }

describe("toFilters", () => {
  it("produces no tokens when nothing is filtered", () => {
    // Four permanent "is __all" tokens would bury the ones that matter.
    expect(toFilters(base)).toEqual([])
  })

  it("produces one token per active field", () => {
    const filters = toFilters({ ...base, fStatus: "todo", fPriority: "2" })
    expect(filters).toHaveLength(2)
    expect(filters.map((f) => f.field).sort()).toEqual(["priority", "status"])
  })

  it("keeps the empty string, which is a real value", () => {
    // "" means unassigned, so it must survive the round trip. Only "__all" is
    // the unset sentinel.
    const filters = toFilters({ ...base, fAgent: "" })
    expect(filters).toHaveLength(1)
    expect(filters[0].values).toEqual([""])
  })
})

describe("matchesOperator", () => {
  it("is requires an exact single value", () => {
    expect(matchesOperator("todo", "is", ["todo"])).toBe(true)
    expect(matchesOperator("done", "is", ["todo"])).toBe(false)
    // Two values with "is" is a contradiction, so nothing matches rather than
    // silently matching one of them.
    expect(matchesOperator("todo", "is", ["todo", "done"])).toBe(false)
  })

  it("is_not excludes the listed values", () => {
    expect(matchesOperator("todo", "is_not", ["done"])).toBe(true)
    expect(matchesOperator("done", "is_not", ["done"])).toBe(false)
  })

  it("is_any matches any listed value", () => {
    expect(matchesOperator("todo", "is_any", ["todo", "done"])).toBe(true)
    expect(matchesOperator("done", "is_any", ["todo", "done"])).toBe(true)
    expect(matchesOperator("review", "is_any", ["todo", "done"])).toBe(false)
  })

  it("is_none is the negation of is_any", () => {
    expect(matchesOperator("review", "is_none", ["todo", "done"])).toBe(true)
    expect(matchesOperator("todo", "is_none", ["todo", "done"])).toBe(false)
  })
})

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "a task",
  body: "",
  status: "todo",
  priority: 0,
  assignee: "worker",
  executor: "auto",
  workspace_kind: "dir",
  workspace_path: "/Users/me/saas",
  result: "",
  created_by: "board-ui",
  created_at: 0,
  started_at: null,
  completed_at: null,
  consecutive_failures: 0,
  last_failure_error: "",
  ...over,
})

describe("applyFilters", () => {
  const list = [
    task({ id: "a", status: "todo", assignee: "worker", priority: 0 }),
    task({ id: "b", status: "done", assignee: "", priority: 2, workspace_path: "" }),
    task({ id: "c", status: "review", assignee: "reviewer", priority: 3 }),
  ]

  it("returns everything when no filter is active", () => {
    expect(applyFilters(list, [])).toHaveLength(3)
  })

  it("filters by status", () => {
    const got = applyFilters(list, [{ id: "1", field: "status", operator: "is", values: ["todo"] }])
    expect(got.map((t) => t.id)).toEqual(["a"])
  })

  it("filters by unassigned agent, which is the empty string", () => {
    const got = applyFilters(list, [{ id: "1", field: "agent", operator: "is", values: [""] }])
    expect(got.map((t) => t.id)).toEqual(["b"])
  })

  it("filters by scratch workspace, also the empty string", () => {
    const got = applyFilters(list, [{ id: "1", field: "workspace", operator: "is", values: [""] }])
    expect(got.map((t) => t.id)).toEqual(["b"])
  })

  it("honours a negated operator", () => {
    const got = applyFilters(list, [{ id: "1", field: "status", operator: "is_not", values: ["done"] }])
    expect(got.map((t) => t.id)).toEqual(["a", "c"])
  })

  it("honours a multi-value operator", () => {
    const got = applyFilters(list, [
      { id: "1", field: "status", operator: "is_any", values: ["todo", "done"] },
    ])
    expect(got.map((t) => t.id)).toEqual(["a", "b"])
  })

  it("combines several tokens with AND", () => {
    const got = applyFilters(list, [
      { id: "1", field: "status", operator: "is_any", values: ["todo", "done"] },
      { id: "2", field: "priority", operator: "is", values: ["2"] },
    ])
    expect(got.map((t) => t.id)).toEqual(["b"])
  })

  it("supports two tokens on the same field, combined with AND", () => {
    // This is the case the four-string state could not express at all: two
    // tokens naming the same field. They intersect, so a task must satisfy
    // both. Here "status is done" and "status is not done" cannot both hold, so
    // the result is empty — which is the correct answer, not a bug.
    const contradictory = applyFilters(list, [
      { id: "1", field: "status", operator: "is", values: ["done"] },
      { id: "2", field: "status", operator: "is_not", values: ["done"] },
    ])
    expect(contradictory).toHaveLength(0)

    // Two same-field tokens that are not contradictory still intersect.
    const narrowed = applyFilters(list, [
      { id: "1", field: "status", operator: "is_not", values: ["done"] },
      { id: "2", field: "status", operator: "is_not", values: ["review"] },
    ])
    expect(narrowed.map((t) => t.id)).toEqual(["a"])
  })

  it("compares priority as a string, matching the saved-view format", () => {
    const got = applyFilters(list, [{ id: "1", field: "priority", operator: "is", values: ["3"] }])
    expect(got.map((t) => t.id)).toEqual(["c"])
  })
})

describe("firstValuePerField", () => {
  it("records the first value when a field has several tokens", () => {
    const got = firstValuePerField([
      { id: "1", field: "status", operator: "is_any", values: ["todo", "done"] },
      { id: "2", field: "agent", operator: "is", values: ["worker"] },
    ])
    expect(got).toEqual({
      fStatus: "todo",
      fAgent: "worker",
      fWorkspace: ALL,
      fPriority: ALL,
    })
  })

  it("leaves an untouched field unset", () => {
    expect(firstValuePerField([])).toEqual({
      fStatus: ALL,
      fAgent: ALL,
      fWorkspace: ALL,
      fPriority: ALL,
    })
  })

  it("round-trips through toFilters for a single-value field", () => {
    // toFilters assigns each token the id of its field, so the round trip is
    // compared on the filter content rather than on the id.
    const tokens = [
      { id: "status", field: "status", operator: "is" as const, values: ["review"] },
    ]
    const state = { q: "", ...firstValuePerField(tokens) }
    expect(toFilters(state)).toEqual(tokens)
  })
})
