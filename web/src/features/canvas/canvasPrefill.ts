/** A Create Task → Canvas Studio handoff, stashed in sessionStorage by the dialog. */
export interface CanvasPrefill {
  workspacePath?: string
  title?: string
  brief?: string
}

export const CANVAS_PREFILL_KEY = "canvas-prefill"
