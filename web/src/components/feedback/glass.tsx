import type { CSSProperties, ReactNode } from "react"
import { cn } from "@/lib/utils"

/* Switchyard glass primitives — thin layer over shadcn tokens.
   Blue glass system per redesign.md; no layout ownership. */

export function GlassPanel({
  children,
  className,
  raised = false,
  glow = false,
  texture = false,
  style,
}: {
  children: ReactNode
  className?: string
  raised?: boolean
  glow?: boolean
  texture?: boolean
  style?: CSSProperties
}) {
  return (
    <div
      className={cn(
        raised ? "glass-panel-raised" : "glass-panel",
        "rounded-xl",
        glow && "blue-glow",
        texture && "surface-texture",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  )
}

export function GlassToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("glass-toolbar flex items-center gap-2 px-3 py-2", className)}>{children}</div>
}

export function GlassIconButton({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn("glass-icon-button inline-flex size-7 items-center justify-center rounded-md text-ink-3", className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function StatusPill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "accent"; className?: string }) {
  const map = {
    neutral: "text-ink-3",
    success: "text-success border-success/30 bg-success/10",
    warning: "text-warning border-warning/30 bg-warning/10",
    danger: "text-danger border-danger/30 bg-danger/10",
    accent: "text-accent border-accent/30 bg-accent/10",
  } as const
  return <span className={cn("status-pill", map[tone], className)}>{children}</span>
}

export function BlueGlow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("blue-glow", className)}>{children}</div>
}

export function SurfaceTexture({ className }: { className?: string }) {
  return <div aria-hidden className={cn("surface-texture pointer-events-none absolute inset-0", className)} />
}
