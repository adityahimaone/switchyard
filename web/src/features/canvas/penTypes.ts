// Type definitions for pen.dev declarative .pen documents

export interface PenFillGradientColor {
  color: string
  position: number
}

export interface PenFillGradient {
  type: "gradient"
  gradientType?: "linear" | "radial"
  colors: PenFillGradientColor[]
  rotation?: number
  size?: { width: number; height: number }
  enabled?: boolean
}

export type PenFill = string | PenFillGradient

export interface PenPadding {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface PenEffectShadow {
  type: "shadow"
  shadowType?: "outer" | "inner"
  color: string
  offset?: { x: number; y: number }
  blur?: number
  spread?: number
}

export interface PenEffectBlur {
  type: "background_blur" | "layer_blur"
  radius: number
}

export type PenEffect = PenEffectShadow | PenEffectBlur

export interface PenVariable {
  type: "color" | "string" | "number"
  value: any
}

export interface PenNode {
  type: "frame" | "rectangle" | "text" | "group" | "path" | "vector" | "circle" | "ellipse" | "icon"
  id: string
  name?: string
  x?: number
  y?: number
  width?: number | "fill_container" | "hug_contents" | string
  height?: number | "fill_container" | "hug_contents" | string
  fill?: PenFill
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
  opacity?: number
  clip?: boolean
  rotation?: number
  fillWidth?: boolean
  fillHeight?: boolean
  effects?: string | PenEffect[]
  effect?: PenEffect[] | PenEffect
  layout?: "none" | "vertical" | "horizontal"
  gap?: number
  padding?: number | [number, number] | [number, number, number, number] | PenPadding
  alignItems?: "start" | "center" | "end" | "stretch" | string
  justifyContent?: "start" | "center" | "end" | "space-between" | "space_between" | "space-around" | "space_around" | string
  // Ellipse & Donut Arc properties
  innerRadius?: number
  startAngle?: number
  sweepAngle?: number
  // Text properties
  text?: string
  content?: string
  fontSize?: number
  fontWeight?: string | number
  fontStyle?: "normal" | "italic" | string
  fontFamily?: string
  textAlign?: "left" | "center" | "right" | "justify"
  lineHeight?: number | string
  letterSpacing?: number
  textGrowth?: "fixed-width" | "auto" | string
  // Icon properties
  icon?: string
  library?: string
  // Nested children
  children?: PenNode[]
}

export interface PenDocument {
  version: string
  name?: string
  variables?: Record<string, PenVariable>
  fileToken?: string
  children: PenNode[]
}

export function parsePenDocument(raw: string): PenDocument {
  try {
    const data = JSON.parse(raw)
    if (Array.isArray(data.children)) {
      return data as PenDocument
    }
    // If wrapped or top-level array
    if (Array.isArray(data)) {
      return { version: "2.20", children: data }
    }
    return { version: "2.20", children: [data] }
  } catch {
    return { version: "2.20", children: [] }
  }
}

export function createDefaultPenDocument(title: string): PenDocument {
  return {
    version: "2.20",
    name: title,
    children: [
      {
        type: "frame",
        id: "frame_main",
        name: title || "Component Frame",
        x: 80,
        y: 80,
        width: 480,
        height: 320,
        cornerRadius: 16,
        fill: "#121316",
        stroke: "rgba(255, 255, 255, 0.08)",
        strokeWidth: 1,
        layout: "vertical",
        gap: 16,
        padding: { top: 24, right: 24, bottom: 24, left: 24 },
        children: [
          {
            type: "text",
            id: "text_title",
            name: "Title",
            text: title || "New Component",
            fontSize: 20,
            fontWeight: "600",
            fill: "#ffffff",
          },
          {
            type: "text",
            id: "text_desc",
            name: "Description",
            text: "Brainstormed visually in pen.dev Canvas Studio without workspace binding.",
            fontSize: 14,
            fontWeight: "400",
            fill: "#9ca3af",
          },
          {
            type: "frame",
            id: "btn_action",
            name: "Action Button",
            width: 140,
            height: 38,
            cornerRadius: 8,
            fill: "#3b82f6",
            layout: "horizontal",
            alignItems: "center",
            justifyContent: "center",
            padding: { top: 8, right: 16, bottom: 8, left: 16 },
            children: [
              {
                type: "text",
                id: "btn_text",
                name: "Button Label",
                text: "Get Started",
                fontSize: 13,
                fontWeight: "500",
                fill: "#ffffff",
              },
            ],
          },
        ],
      },
    ],
  }
}

export function findNodeById(nodes: PenNode[], id: string): PenNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

export function updateNodeInTree(nodes: PenNode[], id: string, updated: PenNode): PenNode[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...updated }
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeInTree(node.children, id, updated),
      }
    }
    return node
  })
}

export function deleteNodeFromTree(nodes: PenNode[], id: string): PenNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => {
      if (node.children) {
        return {
          ...node,
          children: deleteNodeFromTree(node.children, id),
        }
      }
      return node
    })
}

function cloneNodeWithNewIds(node: PenNode): PenNode {
  const newId = `node_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  return {
    ...node,
    id: newId,
    name: node.name ? `${node.name} Copy` : undefined,
    x: node.x !== undefined ? node.x + 24 : undefined,
    y: node.y !== undefined ? node.y + 24 : undefined,
    children: node.children ? node.children.map(cloneNodeWithNewIds) : undefined,
  }
}

export function duplicateNodeInTree(nodes: PenNode[], id: string): { nodes: PenNode[]; newId: string | null } {
  let createdId: string | null = null

  function traverse(list: PenNode[]): PenNode[] {
    const result: PenNode[] = []
    for (const item of list) {
      if (item.id === id) {
        result.push(item)
        const cloned = cloneNodeWithNewIds(item)
        createdId = cloned.id
        result.push(cloned)
      } else if (item.children) {
        result.push({
          ...item,
          children: traverse(item.children),
        })
      } else {
        result.push(item)
      }
    }
    return result
  }

  const nextNodes = traverse(nodes)
  return { nodes: nextNodes, newId: createdId }
}

/**
 * Resolves a token (e.g. "$bg", "$jade") from the document variables table.
 */
export function resolveTokenValue(
  val: any,
  variables?: Record<string, PenVariable>
): any {
  if (typeof val !== "string") return val
  if (val.startsWith("$")) {
    const key = val.slice(1)
    if (variables && key in variables) {
      const v = variables[key]?.value
      return resolveTokenValue(v, variables)
    }
  }
  return val
}

/**
 * Resolves pen.dev fill (solid color string, token reference, or linear/radial gradient)
 */
export function resolveFillStyle(
  fill?: PenFill,
  variables?: Record<string, PenVariable>
): { background?: string; backgroundColor?: string } {
  if (!fill || fill === "transparent") return {}

  if (typeof fill === "string") {
    const resolved = resolveTokenValue(fill, variables)
    return { backgroundColor: resolved }
  }

  const grad = fill as PenFillGradient
  if (grad.colors && grad.colors.length) {
    const stops = grad.colors
      .map((c) => {
        const resolvedColor = resolveTokenValue(c.color, variables)
        return `${resolvedColor} ${Math.round(c.position * 100)}%`
      })
      .join(", ")

    const bgString =
      grad.gradientType === "radial"
        ? `radial-gradient(circle at center, ${stops})`
        : `linear-gradient(${grad.rotation ?? 180}deg, ${stops})`
    return { background: bgString }
  }

  return {}
}

/**
 * Resolves pen.dev padding (number, [v, h], [t, r, b, l], or PenPadding object)
 */
export function resolvePaddingStyle(padding?: any): {
  padding?: string
  paddingTop?: string
  paddingRight?: string
  paddingBottom?: string
  paddingLeft?: string
} {
  if (!padding) return {}
  if (typeof padding === "number") {
    return { padding: `${padding}px` }
  }
  if (Array.isArray(padding)) {
    if (padding.length === 2) {
      return { padding: `${padding[0]}px ${padding[1]}px` }
    }
    if (padding.length === 4) {
      return { padding: `${padding[0]}px ${padding[1]}px ${padding[2]}px ${padding[3]}px` }
    }
    if (padding.length === 1) {
      return { padding: `${padding[0]}px` }
    }
  }
  if (typeof padding === "object") {
    return {
      paddingTop: padding.top !== undefined ? `${padding.top}px` : undefined,
      paddingRight: padding.right !== undefined ? `${padding.right}px` : undefined,
      paddingBottom: padding.bottom !== undefined ? `${padding.bottom}px` : undefined,
      paddingLeft: padding.left !== undefined ? `${padding.left}px` : undefined,
    }
  }
  return {}
}

/**
 * Resolves pen.dev effect arrays:
 * - background_blur -> backdropFilter: blur(Npx)
 * - shadow -> boxShadow: Xpx Ypx Blurpx Spreadpx Color
 */
export function resolveEffects(
  effectData?: any,
  variables?: Record<string, PenVariable>
): { backdropFilter?: string; WebkitBackdropFilter?: string; boxShadow?: string } {
  if (!effectData) return {}
  const effectsList = Array.isArray(effectData) ? effectData : [effectData]
  let backdropFilter: string | undefined
  const shadows: string[] = []

  for (const eff of effectsList) {
    if (!eff || typeof eff !== "object") continue
    if (eff.type === "background_blur" && eff.radius) {
      backdropFilter = `blur(${eff.radius}px)`
    } else if (eff.type === "shadow") {
      const offsetX = eff.offset?.x ?? 0
      const offsetY = eff.offset?.y ?? 0
      const blur = eff.blur ?? 0
      const spread = eff.spread ?? 0
      const color = resolveTokenValue(eff.color || "rgba(0,0,0,0.25)", variables)
      const inset = eff.shadowType === "inner" ? "inset " : ""
      shadows.push(`${inset}${offsetX}px ${offsetY}px ${blur}px ${spread}px ${color}`)
    }
  }

  return {
    backdropFilter,
    WebkitBackdropFilter: backdropFilter,
    boxShadow: shadows.length ? shadows.join(", ") : undefined,
  }
}

/**
 * Normalizes flex alignment values from pen.dev (space_between -> space-between, start -> flex-start)
 */
export function normalizeFlexAlign(val?: string): string | undefined {
  if (!val) return undefined
  const v = val.replace(/_/g, "-")
  if (v === "start") return "flex-start"
  if (v === "end") return "flex-end"
  return v
}

/**
 * Ensures Google Fonts referenced in variables or nodes are loaded into the page
 */
export function ensureGoogleFontsLoaded(fonts: string[]) {
  const cleanFonts = Array.from(
    new Set(
      fonts
        .map((f) => f.trim().replace(/^['"]|['"]$/g, ""))
        .filter((f) => f && !["inherit", "sans-serif", "serif", "monospace", "system-ui"].includes(f.toLowerCase()))
    )
  )
  if (!cleanFonts.length || typeof document === "undefined") return

  const fontParams = cleanFonts.map((f) => `family=${encodeURIComponent(f)}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600;1,700`).join("&")
  const href = `https://fonts.googleapis.com/css2?${fontParams}&display=swap`
  const existing = document.querySelector(`link[href*="fonts.googleapis.com"][data-pen-fonts="true"]`)
  if (existing) {
    if (existing.getAttribute("href") === href) return
    existing.setAttribute("href", href)
  } else {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = href
    link.setAttribute("data-pen-fonts", "true")
    document.head.appendChild(link)
  }
}


