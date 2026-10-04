import { createContext, useContext, useEffect } from "react"

/**
 * The breadcrumb's sub-page label, published from inside a page rather than
 * threaded down from `App`.
 *
 * Chat is the only consumer today. It used to carry its own title bar, which cost
 * a third 56px row of chrome above the transcript and duplicated the session
 * title the rail already lists; the title now lives in the shell header's
 * breadcrumb instead.
 *
 * The session title comes from a query inside `ChatPage`, so the alternatives are
 * both bad: lifting that query into `App` would make the whole shell re-render on
 * every chat message and streaming event, and passing it down as a prop would
 * mean `App` still owns a value it cannot compute. The context keeps the
 * subscription local to the header, which only needs the string.
 *
 * The provider deliberately holds no state of its own — only the setter. The
 * value lives wherever the page computes it, and the effect clears it on unmount
 * so navigating away from chat cannot leave a stale title in the header.
 */
const HeaderTrailContext = createContext<((trail: string | undefined) => void) | null>(null)

/** Publish a header sub-title for as long as the calling component is mounted. */
export function useHeaderTrail(trail: string | undefined) {
	const set = useContext(HeaderTrailContext)
	useEffect(() => {
		set?.(trail)
		return () => set?.(undefined)
	}, [set, trail])
}

export const HeaderTrailProvider = HeaderTrailContext.Provider
