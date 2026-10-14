import type { ReactElement } from "react"

/**
 * Brand marks for the hardware named in a power target's `spec`.
 *
 * Inline paths rather than an icon package: lucide dropped brand glyphs, and
 * pulling a whole brand-icon dependency in for two marks is not worth it. Path
 * data is verbatim from simple-icons (CC0 for the files; the marks themselves
 * stay the property of AMD and NVIDIA and are used here only to label the
 * machine's own parts).
 *
 * Both draw at `0 0 24 24` and inherit `fill-current`, so a caller sizes and
 * tints them like any other icon.
 */

type MarkProps = { className?: string }

export function AmdMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path d="M18.324 9.137l1.559 1.56h2.556v2.557L24 14.814V9.137zM2 9.52l-2 4.96h1.309l.37-.982H3.9l.408.982h1.338L3.432 9.52zm4.209 0v4.955h1.238v-3.092l1.338 1.562h.188l1.338-1.556v3.091h1.238V9.52H10.47l-1.592 1.845L7.287 9.52zm6.283 0v4.96h2.057c1.979 0 2.88-1.046 2.88-2.472 0-1.36-.937-2.488-2.747-2.488zm1.237.91h.792c1.17 0 1.63.711 1.63 1.57 0 .728-.372 1.572-1.616 1.572h-.806zm-10.985.273l.791 1.932H2.008zm17.137.307l-1.604 1.603v2.25h2.246l1.604-1.607h-2.246z" />
    </svg>
  )
}

export function NvidiaMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z" />
    </svg>
  )
}

/**
 * The mark for a spec line, matched on the words a part name actually carries
 * rather than on a field in the config: `Ryzen 5 7500F` and `RTX 4070 Super`
 * never spell out their vendor, so the model line is what identifies them.
 * Returns `null` for anything unrecognised (memory, storage, a case), which
 * renders as plain text.
 */
export function brandMark(item: string): ((props: MarkProps) => ReactElement) | null {
  if (/\b(amd|ryzen|radeon|threadripper)\b/i.test(item)) return AmdMark
  if (/\b(nvidia|geforce|rtx|gtx|quadro)\b/i.test(item)) return NvidiaMark
  return null
}
