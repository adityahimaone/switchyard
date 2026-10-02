import { prefersReducedMotion } from "@/hooks/useSettings"

/**
 * The glow field: the thing that makes the glass real.
 *
 * Frosted glass is `backdrop-filter`, and `backdrop-filter` diffuses whatever is
 * *behind* the element. Over a flat colour there is nothing behind it, so a
 * glass panel renders as a plain rectangle no matter how high its tint — which
 * is exactly what was happening before this existed: `glow-ground` was defined
 * in `index.css` and referenced by no component, so the whole app sat on a flat
 * `body` background and the material had nothing to work with.
 *
 * Three orbs, placed so the sidebar, the column strip and the composer each
 * have coloured light behind them. Blurred at 90px, so none of them has an edge
 * you can find.
 *
 * Two deliberate restraint calls:
 *
 * - **Drift is opt-in.** `design.md` §8 records that this app runs no ambient
 *   animation, because a loop that runs forever is a loop the user cannot stop.
 *   Three permanently drifting orbs are precisely that. So the drift class is
 *   applied only when motion is not reduced — and the orbs still *paint* when
 *   it is, because removing the motion must not remove the backdrop the entire
 *   material depends on.
 * - **`aria-hidden` and `pointer-events-none`.** It is pure decoration; it must
 *   never appear in the accessibility tree or intercept a click.
 */
export function GlowField() {
  const drift = prefersReducedMotion() ? "" : "glow-drift"

  return (
    <div className="glow-field" aria-hidden>
      <div className="glow-grid" />
      <div className={`glow-orb glow-orb-a ${drift}`} />
      <div className="glow-orb glow-orb-b" />
      <div className="glow-orb glow-orb-c" />
    </div>
  )
}
