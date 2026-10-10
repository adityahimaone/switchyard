import type { ChatAgent } from "@/api"

/**
 * Executor metadata for chat-to-code Projects, in one place so the create/edit
 * dialog and the chat composer can never disagree about what an executor offers.
 *
 * `modelSelectable` is the load-bearing flag: hermes picks a model from the
 * provider roster, while dsh and commandcode are harnesses whose model is fixed
 * by their own profile — offering a model dropdown there would be a lie.
 */
export type ExecutorDef = {
  id: ChatAgent
  label: string
  /** Model is chosen from the roster (hermes) vs fixed by the harness. */
  modelSelectable: boolean
  /** The per-executor knob the user picks, if any. */
  option?: {
    key: "permission_mode" | "mode"
    label: string
    choices: { value: string; label: string }[]
  }
}

export const EXECUTORS: ExecutorDef[] = [
  { id: "hermes", label: "Hermes", modelSelectable: true },
  {
    id: "dsh",
    label: "DeepSeek Harness",
    modelSelectable: false,
    option: {
      key: "permission_mode",
      label: "Decision",
      choices: [
        // danger-full-access maps dsh approval to 'never'; the headless bundle
        // ships no approval answerer, so 'ask' presets fail closed. Default here.
        { value: "danger-full-access", label: "Full access (auto-approve)" },
        { value: "workspace-write", label: "Workspace write" },
        { value: "read-only", label: "Read only" },
      ],
    },
  },
  {
    id: "commandcode",
    label: "Command Code",
    modelSelectable: false,
    option: {
      key: "mode",
      label: "Mode",
      choices: [
        { value: "yolo", label: "Bypass (yolo)" },
        { value: "plan", label: "Plan mode" },
        { value: "accept-edits", label: "Accept edits" },
        { value: "standard", label: "Standard" },
      ],
    },
  },
]

export function executorDef(id: string): ExecutorDef {
  return EXECUTORS.find((e) => e.id === id) ?? EXECUTORS[0]
}

/** The default options blob for an executor, as the string the API stores. */
export function defaultOptions(id: ChatAgent): string {
  const def = executorDef(id)
  if (!def.option) return "{}"
  return JSON.stringify({ [def.option.key]: def.option.choices[0].value })
}

/** Parse an options blob to the selected value for an executor's knob. */
export function optionValue(options: string | undefined, id: ChatAgent): string {
  const def = executorDef(id)
  if (!def.option) return ""
  try {
    const parsed = JSON.parse(options || "{}") as Record<string, string>
    return parsed[def.option.key] ?? def.option.choices[0].value
  } catch {
    return def.option.choices[0].value
  }
}

/** Merge a knob value into an options blob, preserving other keys. */
export function withOption(options: string | undefined, id: ChatAgent, value: string): string {
  const def = executorDef(id)
  if (!def.option) return options || "{}"
  let parsed: Record<string, string> = {}
  try {
    parsed = JSON.parse(options || "{}") as Record<string, string>
  } catch {
    parsed = {}
  }
  parsed[def.option.key] = value
  return JSON.stringify(parsed)
}
