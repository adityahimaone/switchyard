import { useCallback, useRef } from "react"

/**
 * Cursor spotlight: a radial highlight that follows the pointer inside a glass
 * surface, so the panel reads as lit rather than as a flat translucent fill.
 *
 * Two ways to use it, and the difference is a performance one.
 *
 * **Per-element** (`useSpotlight`) is right for a handful of surfaces — a
 * dialog, a chart panel, a column. Each instance gets its own handler.
 *
 * **Delegated** (`useDelegatedSpotlight`) is right for the board, where a
 * hundred cards would otherwise mean a hundred `onPointerMove` handlers and a
 * hundred style writes on every mouse move across the scroller. Instead there
 * is one handler on the root, and it tracks a single "last lit element" so each
 * pointer move costs at most two writes regardless of how many cards are on
 * screen.
 *
 * The write is a CSS custom property rather than a React state update on
 * purpose: `--mx` / `--my` feed a `radial-gradient` inside a pseudo-element,
 * so the browser can repaint it on the compositor without React re-rendering
 * the card (and, on the board, without re-rendering its whole subtree).
 */

function writeSpotlight(el: HTMLElement, clientX: number, clientY: number) {
  const rect = el.getBoundingClientRect()
  el.style.setProperty("--mx", `${clientX - rect.left}px`)
  el.style.setProperty("--my", `${clientY - rect.top}px`)
}

/** Per-element spotlight. Attach to a surface that should track the pointer. */
export function useSpotlight<T extends HTMLElement>() {
  return useCallback((e: React.PointerEvent<T>) => {
    writeSpotlight(e.currentTarget, e.clientX, e.clientY)
  }, [])
}

/**
 * Delegated spotlight. One handler on a container; any descendant carrying
 * `data-spotlight` lights up as the pointer crosses it.
 *
 * `clear` on pointer-leave is what stops the highlight sticking when the
 * pointer leaves a card by moving fast enough that the browser coalesced the
 * transition — without it the last card keeps its spotlight indefinitely.
 */
export function useDelegatedSpotlight() {
  const last = useRef<HTMLElement | null>(null)

  return {
    onPointerMove: useCallback((e: React.PointerEvent<HTMLElement>) => {
      const target = (e.target as HTMLElement | null)?.closest?.("[data-spotlight]") as
        | HTMLElement
        | null
      if (target === last.current) return
      last.current?.removeAttribute("data-spotlit")
      if (target) {
        writeSpotlight(target, e.clientX, e.clientY)
        target.setAttribute("data-spotlit", "")
      }
      last.current = target
    }, []),
    onPointerLeave: useCallback(() => {
      last.current?.removeAttribute("data-spotlit")
      last.current = null
    }, []),
  }
}
