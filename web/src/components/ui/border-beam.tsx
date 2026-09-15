import * as React from "react"
import { cn } from "@/lib/utils"

type BeamSize = "md" | "sm" | "line" | "pulse-inner" | "pulse-outside"
type BeamColor = "colorful" | "mono" | "ocean" | "sunset"

type Props = {
  children: React.ReactNode
  size?: BeamSize
  colorVariant?: BeamColor
  strength?: number
  active?: boolean
  className?: string
}

const sizePad: Record<BeamSize, string> = {
  md: "p-[1.5px]",
  sm: "p-[1px]",
  line: "p-[1px]",
  "pulse-inner": "p-[1.5px]",
  "pulse-outside": "p-[1.5px]",
}

const gradients: Record<BeamColor, string> = {
  colorful: "conic-gradient(from var(--beam-angle, 0deg), #58A9FF, #42D392, #FF7185, #F6B44A, #9b8cff, #58A9FF)",
  mono: "conic-gradient(from var(--beam-angle, 0deg), #fff, #94A0B5, #fff)",
  ocean: "conic-gradient(from var(--beam-angle, 0deg), #58A9FF, #78C2FF, #38d9ff, #58A9FF)",
  sunset: "conic-gradient(from var(--beam-angle, 0deg), #F6B44A, #FF7185, #f6b44a, #FF7185)",
}

export function BorderBeam({ children, size = "md", colorVariant = "colorful", strength = 0.7, active = true, className }: Props) {
  return (
    <div className={cn("border-beam-wrap relative rounded-2xl", sizePad[size], className)} style={{ ["--beam-strength" as string]: String(strength) } as React.CSSProperties}>
      <div
        aria-hidden
        className={cn("border-beam absolute inset-0 rounded-[inherit]", !active && "border-beam-paused")}
        style={{ background: gradients[colorVariant] } as React.CSSProperties}
      />
      <div className="relative rounded-[inherit] bg-[var(--color-surface)]">{children}</div>
    </div>
  )
}
