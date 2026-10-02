import { FilterBar, type Filter, type FilterFieldDef } from "@/components/ui/filter-token-bar"
import { COLUMNS, type Profile, type Status, type Task, type Workspace } from "@/api"
import { STATUS_LABEL } from "@/components/ui/status-lamp"

/**
 * The board's filter state, as it is stored in a saved view.
 *
 * The token bar is a view over exactly this state rather than a replacement for
 * it. Saved views serialise these four strings, and the filtering predicate reads
 * them, so swapping in a different shape would break every view a user has
 * already saved. Mapping in both directions keeps that contract intact.
 */
export interface BoardFilterState {
  q: string
  fStatus: string
  fAgent: string
  fWorkspace: string
  fPriority: string
}

/** The sentinel the existing state uses for "no filter on this field". */
export const ALL = "__all"

export const PRIORITY_LABELS: Record<string, string> = {
  "0": "P0 normal",
  "1": "P1",
  "2": "P2 high",
  "3": "P3 urgent",
}

/**
 * fieldsFor builds the token bar's field definitions from live data.
 *
 * Options are derived from what the board actually contains rather than a fixed
 * list, so a status or workspace that no longer exists cannot be offered as a
 * filter — a chip that filters to nothing is worse than no chip.
 */
export function fieldsFor(input: {
  profiles: Profile[]
  workspaces: Workspace[]
  presentStatuses?: Status[]
}): FilterFieldDef[] {
  const statuses = input.presentStatuses ?? COLUMNS
  return [
    {
      id: "status",
      label: "Status",
      operators: [
        { value: "is", label: "is" },
        { value: "is_not", label: "is not" },
        { value: "is_any", label: "is any of", multi: true },
      ],
      options: statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s })),
    },
    {
      id: "agent",
      label: "Agent",
      operators: [
        { value: "is", label: "is" },
        { value: "is_not", label: "is not" },
        { value: "is_any", label: "is any of", multi: true },
      ],
      // The empty string is a real value here: it means "no assignee", which is
      // distinct from "any assignee". Dropping it would make unassigned cards
      // unfindable.
      options: [
        ...input.profiles.map((p) => ({ value: p.name, label: p.name })),
        { value: "", label: "Unassigned" },
      ],
    },
    {
      id: "workspace",
      label: "Workspace",
      operators: [
        { value: "is", label: "is" },
        { value: "is_not", label: "is not" },
        { value: "is_any", label: "is any of", multi: true },
      ],
      options: [
        ...input.workspaces.map((w) => ({ value: w.path, label: w.name })),
        { value: "", label: "Scratch (no path)" },
      ],
    },
    {
      id: "priority",
      label: "Priority",
      operators: [
        { value: "is", label: "is" },
        { value: "is_not", label: "is not" },
        { value: "is_any", label: "is any of", multi: true },
      ],
      options: Object.entries(PRIORITY_LABELS).map(([value, label]) => ({ value, label })),
    },
  ]
}

/**
 * FIELD_TO_STATE maps a token-bar field onto the saved-view string that holds
 * it. `q` is deliberately absent: the search box is a separate control that the
 * token bar does not own.
 */
const FIELD_TO_STATE: Record<string, "fStatus" | "fAgent" | "fWorkspace" | "fPriority"> = {
  status: "fStatus",
  agent: "fAgent",
  workspace: "fWorkspace",
  priority: "fPriority",
}

/**
 * extractValue reads a task's value for a field, as the string the filters
 * compare against.
 *
 * The empty string is meaningful for two fields: a task with no assignee, and
 * one with no workspace. It must not be coerced to "__all" or those cards
 * disappear from an "Unassigned" filter.
 */
function extractValue(task: Task, field: string): string {
  switch (field) {
    case "status":
      return task.status
    case "agent":
      return task.assignee || ""
    case "workspace":
      return task.workspace_path || ""
    case "priority":
      return String(task.priority ?? 0)
    default:
      return ""
  }
}

/**
 * matchesOperator reports whether a task's value satisfies one operator.
 *
 * This is the operator semantics the token bar offers. The board's original
 * predicate only knew `===`, so every other operator was unreachable; putting
 * the logic here means a token can never claim something the filter does not do.
 */
export function matchesOperator(value: string, operator: string, wanted: string[]): boolean {
  switch (operator) {
    case "is_not":
      return !wanted.includes(value)
    case "is_any":
      return wanted.includes(value)
    case "is_none":
      return !wanted.includes(value)
    case "is":
    default:
      return wanted.length === 1 && wanted[0] === value
  }
}

/**
 * applyFilters reduces a task list by the active filters.
 *
 * Exported as a pure function so the operator semantics can be tested without
 * rendering, and so the toolbar and any future server-side filtering agree.
 */
export function applyFilters(tasks: Task[], filters: Filter[]): Task[] {
  if (filters.length === 0) return tasks
  return tasks.filter((task) =>
    filters.every((f) => matchesOperator(extractValue(task, f.field), f.operator, f.values)),
  )
}

/**
 * toFilters projects the saved state into token-bar filters.
 *
 * Only fields actually set to something become tokens. Rendering a
 * "Status is __all" token for an unset filter would put four permanent tokens on
 * screen and make the active ones invisible among them.
 *
 * The unset sentinel is `ALL` only. The empty string is a *real* value for agent
 * and workspace — it means unassigned / scratch — so it must survive as a token,
 * or those cards become unfindable.
 */
export function toFilters(state: BoardFilterState): Filter[] {
  const out: Filter[] = []
  const add = (field: string, raw: string | undefined) => {
    if (raw === undefined || raw === ALL) return
    out.push({ id: field, field, operator: "is", values: [raw] })
  }
  add("status", state.fStatus)
  add("agent", state.fAgent)
  add("workspace", state.fWorkspace)
  add("priority", state.fPriority)
  return out
}

/**
 * firstValuePerField projects tokens back onto the four saved-view strings.
 *
 * A view is written twice: `tokens` for the token bar, and these four strings
 * for a build that predates it. Where a field has several tokens, the first
 * value is the one recorded — a view that predates the bar can only express one
 * value per field anyway, and the token list is what actually drives filtering.
 */
export function firstValuePerField(filters: Filter[]): {
  fStatus: string
  fAgent: string
  fWorkspace: string
  fPriority: string
} {
  const out = { fStatus: ALL, fAgent: ALL, fWorkspace: ALL, fPriority: ALL }
  for (const f of filters) {
    const key = FIELD_TO_STATE[f.field]
    if (!key) continue
    if (out[key] === ALL && f.values.length > 0) out[key] = f.values[0]
  }
  return out
}

/**
 * fieldOptions returns one field's options, for the dropdown fallback.
 *
 * The token bar and the dropdowns read from the same definitions, so the two
 * cannot drift into offering different statuses or priorities.
 */
export function fieldOptions(
  fields: FilterFieldDef[],
  fieldId: string,
): { value: string; label: string }[] {
  return (fields.find((f) => f.id === fieldId)?.options ?? []).map((o) => ({
    value: o.value,
    label: o.label,
  }))
}

/** Re-exported so BoardPage imports one symbol for the whole control. */
export { FilterBar }
export type { Filter, FilterFieldDef }
