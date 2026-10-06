import type { Task, VerifyProfile } from "../../api"

/**
 * The fields the Create Task dialog collects, kept as a plain object so the
 * payload builder can be a pure function. That is what makes it unit-testable
 * without a DOM: the test setup has no jsdom, so anything reachable only by
 * clicking cannot be asserted on.
 */
export interface CreateTaskDraft {
  title: string
  body: string
  workspacePath: string
  assignee: string
  executor: string
  executionMode: "direct" | "agentic"
  maxIterations: string
  priority: string
  paths: string[]
  deps: string[]
  gateCommand: string
  startMode: "manual" | "now"
  /**
   * "workspace" edits the shared checkout, which is cheaper but means two tasks
   * on one repo can interleave edits. "worktree" gives the task its own git
   * worktree and branch.
   */
  isolation: "workspace" | "worktree"
  /**
   * Which verification rung applies. "auto" means routed from the diff —
   * and is the right choice unless a human knows something the diff will
   * not show. The API spells it as an empty string; the form keeps the
   * sentinel because Radix Select items need non-empty values.
   */
  verifyProfile: VerifyProfile | "auto"
  /**
   * A committed .pen design this task implements verbatim, repo-relative.
   * Empty for everything that is not a design task, and then pen is never
   * invoked and no agent-day is spent.
   */
  designSource: string
  /**
   * The pen.dev surface that produces this card's design. "pen_cli"
   * generates a new .pen headlessly (the only surface that can create
   * one on a worker); "pencil_mcp" edits the document open in the
   * desktop app. "" means no pen.dev design — the right choice for
   * every card that is not a design task.
   */
  designTool: "" | "pen_cli" | "pencil_mcp"
}

/** One validation problem, as returned by POST /tasks/validate. */
export interface ValidationIssue {
  code: string
  message: string
  field?: string
}

/**
 * buildCreatePayload turns the draft into the request body.
 *
 * Two decisions live here rather than inline in the component, because both are
 * easy to get wrong and neither is visible in the JSX:
 *
 * - Max iterations only mean something for a bounded agentic run, so they are
 *   omitted for a direct one rather than sent and ignored.
 * - A shell task cannot satisfy the backend's "direct shell requires a command"
 *   rule, because this dialog has no command field. It is forced to agentic
 *   rather than failing at create.
 */
export function buildCreatePayload(draft: CreateTaskDraft): Record<string, unknown> {
  const effectiveMode = draft.executor === "shell" ? "agentic" : draft.executionMode
  return {
    title: draft.title.trim(),
    body: draft.body.trim(),
    ...(effectiveMode === "agentic"
      ? { execution_mode: "agentic", max_iterations: Number(draft.maxIterations) || 6 }
      : { execution_mode: "direct" }),
    workspace_path: draft.workspacePath,
    assignee: draft.assignee,
    executor: draft.executor,
    priority: Number(draft.priority) || 0,
    status: "todo",
    start_mode: draft.startMode,
    // Only sent when non-empty, so a card with no declared scope stays a plain
    // card rather than carrying an empty array through the API.
    ...(draft.paths.length > 0 ? { paths: draft.paths } : {}),
    ...(draft.deps.length > 0 ? { depends_on: draft.deps } : {}),
    ...(draft.gateCommand.trim() ? { gate_command: draft.gateCommand.trim() } : {}),
    // Always sent: the server defaults to "workspace", but being explicit means
    // the stored value says what was chosen rather than what was assumed.
    isolation: draft.isolation,
    // Always sent for the same reason as isolation: "" is a real choice — it is
    // how a card asks to be routed from its diff — and the stored value should
    // say the card asked, rather than leaving it indistinguishable from a card
    // whose author never heard of verification.
    verify_profile: draft.verifyProfile === "auto" ? "" : draft.verifyProfile,
    // Omitted when empty, unlike verify_profile: an empty design source is the
    // absence of a requirement, not a declaration of "no design".
    ...(draft.designSource.trim() ? { design_source: draft.designSource.trim() } : {}),
    // The design-tool switch: omitted when off. The server renders the
    // tool's mandate into the dispatch prompt from this field, so the
    // agent's instructions cannot go stale the way body text can.
    ...(draft.designTool ? { design_tool: draft.designTool } : {}),
  }
}

/**
 * The prompt textarea's key handling: Enter submits, Shift+Enter is a newline.
 *
 * Without this the form is keyboard-hostile — a multi-line prompt is a natural
 * thing to want, and a plain textarea turns every Enter into a submit.
 */
export function isSubmitKey(e: { key: string; shiftKey: boolean }): boolean {
  return e.key === "Enter" && !e.shiftKey
}

/**
 * splitPathInput turns a typed path list into globs.
 *
 * The separators are newlines and semicolons only. A comma is NOT a separator,
 * because it is meaningful inside a brace glob: `src/{a,b}/**` is one glob, and
 * splitting on the comma would corrupt the only construct that means "these two
 * directories". Newline and semicolon cover the multi-entry case, and a single
 * line can hold any number of globs.
 */
export function splitPathInput(raw: string): string[] {
  return raw
    .split(/[\n;]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * issuesForField picks the issues attached to one input, so a form can show the
 * message next to the control it concerns rather than in one undifferentiated
 * list at the bottom.
 */
export function issuesForField(issues: ValidationIssue[], field: string): ValidationIssue[] {
  return issues.filter((i) => i.field === field)
}

/**
 * canSubmit decides whether the Create button is enabled.
 *
 * Only issues the server flagged against a field the draft actually populates
 * block submission. A validation response is debounced and can therefore be
 * stale, so a leftover issue against a field the user has since emptied must not
 * keep the button disabled. Advisory issues — an unavailable executor, a board
 * that does not exist — never block, because the server is the authority and
 * refusing locally on a stale response would be worse than letting it through.
 */
export function canSubmit(
  issues: ValidationIssue[],
  draft: Pick<CreateTaskDraft, "title" | "body" | "paths" | "gateCommand">,
): boolean {
  if (!draft.title.trim()) return false
  if (draft.title && issuesForField(issues, "title").length > 0) return false
  if (draft.body.trim() && issuesForField(issues, "body").length > 0) return false
  if (draft.paths.length > 0 && issuesForField(issues, "paths").length > 0) return false
  if (draft.gateCommand.trim() && issuesForField(issues, "gate_command").length > 0) return false
  return true
}

/** The minimal task shape the dependency picker needs from the board. */
export type DependencyCandidate = Pick<Task, "id" | "title" | "status">
