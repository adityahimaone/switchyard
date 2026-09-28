import * as React from "react"

export function HtLoader({ size = 96, label = "Loading" }: { size?: number; label?: string }) {
  const rawId = React.useId()
  const id = rawId.replace(/:/g, "")
  const disc = `ht-disc-${id}`
  const grid = `ht-grid-${id}`
  const ringA = `ht-ring-a-${id}`
  const ringB = `ht-ring-b-${id}`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="ht"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label={label}
      style={{ color: "var(--color-ink)" } as React.CSSProperties}
    >
      <defs>
        <clipPath id={disc}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
        <pattern id={grid} width="6.4" height="6.4" patternUnits="userSpaceOnUse">
          <circle cx="3.2" cy="3.2" r="1.15" fill="currentColor" />
        </pattern>
        <mask id={ringA}>
          <circle className="ht-wave" cx="32" cy="32" r="0" fill="none" stroke="#fff" strokeWidth="7" />
        </mask>
        <mask id={ringB}>
          <circle className="ht-wave ht-late" cx="32" cy="32" r="0" fill="none" stroke="#fff" strokeWidth="7" />
        </mask>
      </defs>
      <g clipPath={`url(#${disc})`}>
        <rect className="ht-base" x="0" y="0" width="64" height="64" fill={`url(#${grid})`} />
        <rect x="0" y="0" width="64" height="64" fill={`url(#${grid})`} mask={`url(#${ringA})`} />
        <rect x="0" y="0" width="64" height="64" fill={`url(#${grid})`} mask={`url(#${ringB})`} />
      </g>
      <circle className="ht-rim" cx="32" cy="32" r="31.5" />
    </svg>
  )
}
