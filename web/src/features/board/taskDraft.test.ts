import { describe, expect, it } from "vitest"
import {
  buildCreatePayload,
  canSubmit,
  isSubmitKey,
  issuesForField,
  splitPathInput,
  type CreateTaskDraft,
  type ValidationIssue,
} from "./taskDraft"

const base: CreateTaskDraft = {
  title: "Add OAuth module",
  body: "Implement the token flow",
  workspacePath: "/Users/me/saas",
  assignee: "default",
  executor: "auto",
  executionMode: "direct",
  maxIterations: "6",
  priority: "0",
  paths: [],
  deps: [],
  gateCommand: "",
  startMode: "manual",
  isolation: "workspace",
  verifyProfile: "auto",
  designSource: "",
  designTool: "",
}

describe("buildCreatePayload", () => {
  it("sends the trimmed essentials and nothing else for a plain task", () => {
    const payload = buildCreatePayload({ ...base, title: "  Add OAuth  ", body: "  prompt  " })
    expect(payload.title).toBe("Add OAuth")
    expect(payload.body).toBe("prompt")
    expect(payload.workspace_path).toBe("/Users/me/saas")
    expect(payload.executor).toBe("auto")
    expect(payload.status).toBe("todo")
    expect(payload.start_mode).toBe("manual")
  })

  it("omits the optional fields when they are empty", () => {
    // An empty array or empty string would otherwise round-trip through the
    // API as an explicit "clear it" instruction.
    const payload = buildCreatePayload(base)
    expect("paths" in payload).toBe(false)
    expect("depends_on" in payload).toBe(false)
    expect("gate_command" in payload).toBe(false)
  })

  it("sends declared scope, dependencies and the gate when present", () => {
    const payload = buildCreatePayload({
      ...base,
      paths: ["src/auth/**"],
      deps: ["t_abc"],
      gateCommand: "  go test ./...  ",
    })
    expect(payload.paths).toEqual(["src/auth/**"])
    expect(payload.depends_on).toEqual(["t_abc"])
    // Trimmed: a trailing space in a shell command is harmless but noisy.
    expect(payload.gate_command).toBe("go test ./...")
  })

  it("sends max_iterations only for an agentic run", () => {
    const direct = buildCreatePayload(base)
    expect(direct.execution_mode).toBe("direct")
    expect("max_iterations" in direct).toBe(false)

    const agentic = buildCreatePayload({ ...base, executionMode: "agentic", maxIterations: "12" })
    expect(agentic.execution_mode).toBe("agentic")
    expect(agentic.max_iterations).toBe(12)
  })

  it("forces a shell task to agentic, since the dialog has no command field", () => {
    // The server rejects a direct shell task with no command, so sending
    // execution_mode: "direct" here would be a guaranteed create failure.
    const payload = buildCreatePayload({ ...base, executor: "shell", executionMode: "direct" })
    expect(payload.execution_mode).toBe("agentic")
    expect(payload.executor).toBe("shell")
  })

  it("falls back to the default iteration count on a non-numeric value", () => {
    const payload = buildCreatePayload({
      ...base,
      executionMode: "agentic",
      maxIterations: "not a number",
    })
    expect(payload.max_iterations).toBe(6)
  })

  it("sends a numeric priority and defaults a bad one to 0", () => {
    expect(buildCreatePayload({ ...base, priority: "3" }).priority).toBe(3)
    expect(buildCreatePayload({ ...base, priority: "" }).priority).toBe(0)
  })

  it("carries start_mode through verbatim", () => {
    expect(buildCreatePayload({ ...base, startMode: "now" }).start_mode).toBe("now")
  })

  it("always sends the isolation mode, even the default", () => {
    // Being explicit means the stored value records what was chosen rather
    // than what the server happened to default to.
    expect(buildCreatePayload(base).isolation).toBe("workspace")
    expect(buildCreatePayload({ ...base, isolation: "worktree" }).isolation).toBe("worktree")
  })

  it("always sends the verify profile, including the auto default", () => {
    // Empty is a real choice here, not an absent field: it is how a card asks
    // to be routed from its diff. Omitting it would make a card that wants
    // auto indistinguishable from one whose author never heard of verify.
    expect(buildCreatePayload(base).verify_profile).toBe("")
    expect(buildCreatePayload({ ...base, verifyProfile: "ui" }).verify_profile).toBe("ui")
  })

  it("omits an empty design source but sends a real one", () => {
    // The opposite of verify_profile: an empty design source is the absence of
    // a requirement, so it should not round-trip as "no design".
    expect("design_source" in buildCreatePayload(base)).toBe(false)
    expect(buildCreatePayload({ ...base, designSource: "  " }).design_source).toBeUndefined()
    expect(buildCreatePayload({ ...base, designSource: " design/task-card.pen " }).design_source).toBe(
      "design/task-card.pen",
    )
  })

  it("sends the design tool only when one is chosen", () => {
    // The switch is what makes the dispatcher render the pen CLI
    // mandate into the prompt, so off must mean absent — not an
    // empty string the server would have to interpret.
    expect("design_tool" in buildCreatePayload(base)).toBe(false)
    expect(buildCreatePayload({ ...base, designTool: "pen_cli" }).design_tool).toBe("pen_cli")
    expect(buildCreatePayload({ ...base, designTool: "pencil_mcp" }).design_tool).toBe("pencil_mcp")
  })
})

describe("isSubmitKey", () => {
  it("submits on a bare Enter", () => {
    expect(isSubmitKey({ key: "Enter", shiftKey: false })).toBe(true)
  })
  it("leaves Shift+Enter as a newline", () => {
    // A prompt is naturally multi-line, so a plain textarea that submits on
    // every Enter is unusable for writing one.
    expect(isSubmitKey({ key: "Enter", shiftKey: true })).toBe(false)
  })
  it("ignores other keys", () => {
    expect(isSubmitKey({ key: "a", shiftKey: false })).toBe(false)
    expect(isSubmitKey({ key: "Tab", shiftKey: false })).toBe(false)
    expect(isSubmitKey({ key: "Escape", shiftKey: true })).toBe(false)
  })
})

describe("splitPathInput", () => {
  it("splits on newlines and semicolons", () => {
    expect(splitPathInput("src/auth/**\ninternal/api/**")).toEqual([
      "src/auth/**",
      "internal/api/**",
    ])
    expect(splitPathInput("a/**; b/**")).toEqual(["a/**", "b/**"])
  })
  it("trims each entry and drops blanks", () => {
    expect(splitPathInput("  a/**  \n\n b/** ")).toEqual(["a/**", "b/**"])
  })
  it("returns an empty list for empty input", () => {
    expect(splitPathInput("")).toEqual([])
    expect(splitPathInput("   \n  ")).toEqual([])
  })
  it("keeps a brace glob intact rather than splitting inside it", () => {
    // `src/{a,b}/**` is one glob. A comma separator would corrupt the only
    // construct that means "these two directories", so it is not one.
    expect(splitPathInput("src/{a,b}/**")).toEqual(["src/{a,b}/**"])
    expect(splitPathInput("src/{a,b}/**\nother/**")).toEqual(["src/{a,b}/**", "other/**"])
  })
})

const issues: ValidationIssue[] = [
  { code: "path_limit", field: "paths", message: "path must be relative" },
  { code: "bad_request", field: "title", message: "title too long" },
  { code: "executor_unavailable", message: "executor dsh is unavailable" },
]

describe("issuesForField", () => {
  it("returns only the issues attached to that field", () => {
    expect(issuesForField(issues, "paths")).toHaveLength(1)
    expect(issuesForField(issues, "paths")[0].code).toBe("path_limit")
  })
  it("returns an empty list for a field with no issues", () => {
    expect(issuesForField(issues, "body")).toEqual([])
  })
  it("excludes field-less issues from every field", () => {
    // An advisory issue is shown once at the bottom, not repeated per control.
    const fieldScoped = issues.filter((i) => i.field)
    expect(fieldScoped).toHaveLength(2)
  })
})

describe("canSubmit", () => {
  const draft = { title: "valid", body: "prompt", paths: ["src/a"], gateCommand: "" }

  it("requires a title", () => {
    expect(canSubmit([], { ...draft, title: "" })).toBe(false)
    expect(canSubmit([], { ...draft, title: "   " })).toBe(false)
  })

  it("allows a clean draft", () => {
    expect(canSubmit([], draft)).toBe(true)
  })

  it("blocks when a declared path is rejected", () => {
    expect(canSubmit(issues, draft)).toBe(false)
  })

  it("does not block on a stale issue for a field the user has since cleared", () => {
    // The validate response is debounced, so it can describe a previous state of
    // the form. A leftover issue against a field that is now empty must not keep
    // the button disabled.
    expect(canSubmit([{ code: "path_limit", field: "paths", message: "x" }], {
      ...draft,
      paths: [],
    })).toBe(true)
    expect(canSubmit([{ code: "bad_request", field: "gate_command", message: "x" }], draft)).toBe(
      true,
    )
  })

  it("blocks on a rejected title, body or gate that is still populated", () => {
    expect(canSubmit([{ code: "bad_request", field: "title", message: "x" }], draft)).toBe(false)
    expect(canSubmit([{ code: "bad_request", field: "body", message: "x" }], draft)).toBe(false)
    expect(
      canSubmit([{ code: "bad_request", field: "gate_command", message: "x" }], {
        ...draft,
        gateCommand: "go test",
      }),
    ).toBe(false)
  })

  it("does not block on an advisory issue with no field", () => {
    // The server is the authority on those; refusing locally on a stale
    // response would be worse than letting the create through.
    expect(canSubmit([{ code: "executor_unavailable", message: "x" }], draft)).toBe(true)
    expect(canSubmit([{ code: "workspace_not_found", message: "x" }], draft)).toBe(true)
  })
})
