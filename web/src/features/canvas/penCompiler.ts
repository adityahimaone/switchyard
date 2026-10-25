import type { PenDocument, PenFill, PenFillGradient, PenNode, PenVariable } from "./penTypes"
import { resolveTokenValue, resolveEffects } from "./penTypes"

/**
 * Deterministic (0 Token) Compiler: .pen Document -> React Component with Tailwind CSS.
 * Runs 100% in-browser in <1ms without LLM API tokens.
 */

function fillToStylesOrClasses(
  fill?: PenFill,
  isText?: boolean,
  variables?: Record<string, PenVariable>
): { className: string; style?: React.CSSProperties } {
  if (!fill || fill === "transparent") return { className: "" }

  if (typeof fill === "string") {
    const resolved = resolveTokenValue(fill, variables)
    if (isText) {
      if (resolved === "#ffffff" || resolved === "#fff") return { className: "text-white" }
      if (resolved === "#000000" || resolved === "#000") return { className: "text-black" }
      return { className: `text-[${resolved}]`, style: { color: resolved } }
    }
    if (resolved === "#ffffff" || resolved === "#fff") return { className: "bg-white" }
    if (resolved === "#000000" || resolved === "#000") return { className: "bg-black" }
    return { className: `bg-[${resolved}]`, style: { backgroundColor: resolved } }
  }

  // Gradient fill
  const grad = fill as PenFillGradient
  if (grad.colors && grad.colors.length) {
    const stops = grad.colors
      .map((c) => {
        const col = resolveTokenValue(c.color, variables)
        return `${col} ${Math.round(c.position * 100)}%`
      })
      .join(", ")
    const bgString =
      grad.gradientType === "radial"
        ? `radial-gradient(circle at center, ${stops})`
        : `linear-gradient(${grad.rotation ?? 180}deg, ${stops})`
    return {
      className: "",
      style: { background: bgString },
    }
  }

  return { className: "" }
}

function paddingToClasses(padding?: any): string {
  if (!padding) return ""
  if (typeof padding === "number") {
    return `p-[${padding}px]`
  }
  if (Array.isArray(padding)) {
    if (padding.length === 2) {
      return `py-[${padding[0]}px] px-[${padding[1]}px]`
    }
    if (padding.length === 4) {
      return `pt-[${padding[0]}px] pr-[${padding[1]}px] pb-[${padding[2]}px] pl-[${padding[3]}px]`
    }
  }
  const classes: string[] = []
  if (padding.top) classes.push(`pt-[${padding.top}px]`)
  if (padding.right) classes.push(`pr-[${padding.right}px]`)
  if (padding.bottom) classes.push(`pb-[${padding.bottom}px]`)
  if (padding.left) classes.push(`pl-[${padding.left}px]`)
  return classes.join(" ")
}

export function compileNodeToJSX(
  node: PenNode,
  depth = 1,
  variables?: Record<string, PenVariable>,
  parentLayout?: string
): string {
  const indent = "  ".repeat(depth)

  // 1. Icon Node
  if (node.type === "icon") {
    const iconName = node.icon || node.name || "Circle"
    const pascal = iconName
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("")
    const size = Math.max(node.width || 16, node.height || 16)
    const color = resolveTokenValue(node.fill, variables) || "currentColor"

    const classes: string[] = ["shrink-0"]
    if (parentLayout === "none") {
      classes.push(`absolute left-[${node.x || 0}px] top-[${node.y || 0}px]`)
    }

    const classAttr = classes.length ? ` className="${classes.join(" ")}"` : ""
    return `${indent}<LucideIcons.${pascal}${classAttr} style={{ width: ${size}, height: ${size}, color: ${JSON.stringify(color)} }} />`
  }

  // 2. Text Node
  if (node.type === "text") {
    const textContent = node.content !== undefined ? node.content : (node.text !== undefined ? node.text : "")
    const isHeading =
      (node.fontSize && node.fontSize >= 18) ||
      node.fontWeight === "600" ||
      node.fontWeight === "700" ||
      node.fontWeight === "bold"
    const tag = isHeading ? "h3" : "p"

    const classes: string[] = []
    if (parentLayout === "none") {
      classes.push(`absolute left-[${node.x || 0}px] top-[${node.y || 0}px]`)
    }
    if (node.width !== undefined) {
      classes.push(`w-[${node.width}px]`)
    }
    if (node.fontSize) classes.push(`text-[${node.fontSize}px]`)
    if (node.fontWeight) {
      const w = String(node.fontWeight)
      if (w === "700" || w === "bold") classes.push("font-bold")
      else if (w === "600" || w === "semibold") classes.push("font-semibold")
      else if (w === "500" || w === "medium") classes.push("font-medium")
      else classes.push("font-normal")
    }
    if (node.textAlign) {
      classes.push(`text-${node.textAlign}`)
    }
    if (node.rotation) {
      classes.push(`rotate-[${node.rotation}deg]`)
    }

    const fillRes = fillToStylesOrClasses(node.fill, true, variables)
    if (fillRes.className) classes.push(fillRes.className)

    const resolvedFont = resolveTokenValue(node.fontFamily, variables)
    const styleObj: React.CSSProperties = { ...(fillRes.style || {}) }
    if (resolvedFont && resolvedFont !== "inherit") {
      styleObj.fontFamily = resolvedFont.includes(" ") ? `"${resolvedFont}", sans-serif` : resolvedFont
    }

    const classAttr = classes.length ? ` className="${classes.join(" ")}"` : ""
    const styleAttr = Object.keys(styleObj).length ? ` style={${JSON.stringify(styleObj)}}` : ""

    return `${indent}<${tag}${classAttr}${styleAttr}>${textContent}</${tag}>`
  }

  // 3. Ellipse or Circle Node
  if (node.type === "ellipse" || node.type === "circle") {
    const classes: string[] = ["rounded-full", "shrink-0"]
    if (parentLayout === "none") {
      classes.push(`absolute left-[${node.x || 0}px] top-[${node.y || 0}px]`)
    }
    if (node.width) classes.push(`w-[${node.width}px]`)
    if (node.height) classes.push(`h-[${node.height}px]`)

    const fillRes = fillToStylesOrClasses(node.fill, false, variables)
    if (fillRes.className) classes.push(fillRes.className)

    const classAttr = classes.length ? ` className="${classes.join(" ")}"` : ""
    const styleAttr = fillRes.style ? ` style={${JSON.stringify(fillRes.style)}}` : ""

    return `${indent}<div${classAttr}${styleAttr} />`
  }

  // 4. Frames, rectangles, groups
  const classes: string[] = []

  // Layout & positioning
  if (depth === 1) {
    classes.push("relative")
  } else if (parentLayout === "none") {
    classes.push(`absolute left-[${node.x || 0}px] top-[${node.y || 0}px]`)
  } else if (node.layout === "none") {
    classes.push("relative")
  }

  if (node.layout === "vertical") {
    classes.push("flex flex-col")
  } else if (node.layout === "horizontal") {
    classes.push("flex flex-row")
  }

  if (node.gap) {
    classes.push(`gap-[${node.gap}px]`)
  }

  if (node.alignItems) {
    const a = node.alignItems.replace("_", "-")
    if (a === "center") classes.push("items-center")
    else if (a === "start" || a === "flex-start") classes.push("items-start")
    else if (a === "end" || a === "flex-end") classes.push("items-end")
    else if (a === "stretch") classes.push("items-stretch")
  }

  if (node.justifyContent) {
    const j = node.justifyContent.replace("_", "-")
    if (j === "center") classes.push("justify-center")
    else if (j === "space-between") classes.push("justify-between")
    else if (j === "start" || j === "flex-start") classes.push("justify-start")
    else if (j === "end" || j === "flex-end") classes.push("justify-end")
  }

  // Padding
  const padClass = paddingToClasses(node.padding)
  if (padClass) classes.push(padClass)

  // Dimensions & sizing
  if (node.fillWidth) {
    classes.push("w-full")
  } else if (node.width) {
    classes.push(`w-[${node.width}px]`)
  }

  if (node.fillHeight) {
    classes.push("h-full")
  } else if (node.height) {
    classes.push(`h-[${node.height}px]`)
  }

  // Corner radius
  if (node.cornerRadius) {
    classes.push(`rounded-[${node.cornerRadius}px]`)
  }

  // Clip content
  if (node.clip) {
    classes.push("overflow-hidden")
  }

  // Stroke / Border
  const strokeColor = resolveTokenValue(node.stroke, variables)
  if (strokeColor) {
    classes.push(node.strokeWidth && node.strokeWidth > 1 ? `border-[${node.strokeWidth}px] border-[${strokeColor}]` : `border border-[${strokeColor}]`)
  }

  // Rotation
  if (node.rotation) {
    classes.push(`rotate-[${node.rotation}deg]`)
  }

  // Fill
  const fillRes = fillToStylesOrClasses(node.fill, false, variables)
  if (fillRes.className) classes.push(fillRes.className)

  // Effects (Glass blur & shadow)
  const effectStyles = resolveEffects(node.effect || node.effects, variables)
  const mergedStyle: React.CSSProperties = {
    ...(fillRes.style || {}),
    ...(effectStyles.backdropFilter ? { backdropFilter: effectStyles.backdropFilter, WebkitBackdropFilter: effectStyles.backdropFilter } : {}),
    ...(effectStyles.boxShadow ? { boxShadow: effectStyles.boxShadow } : {}),
  }

  const classAttr = classes.length ? ` className="${classes.join(" ")}"` : ""
  const styleAttr = Object.keys(mergedStyle).length ? ` style={${JSON.stringify(mergedStyle)}}` : ""

  const childrenJSX = (node.children || [])
    .map((child) => compileNodeToJSX(child, depth + 1, variables, node.layout || "none"))
    .join("\n")

  if (childrenJSX) {
    return `${indent}<div${classAttr}${styleAttr}>\n${childrenJSX}\n${indent}</div>`
  }
  return `${indent}<div${classAttr}${styleAttr} />`
}

export function compilePenDocumentToReact(doc: PenDocument, componentName = "CanvasComponent"): string {
  const rootNode = doc.children && doc.children[0]
  if (!rootNode) {
    return `import React from 'react'

export default function ${componentName}() {
  return <div className="p-8 text-neutral-400">Empty Canvas Document</div>
}
`
  }

  const rootJSX = compileNodeToJSX(rootNode, 1, doc.variables, "none")

  return `import React from 'react'
import * as LucideIcons from 'lucide-react'

/**
 * Compiled from pen.dev declarative design (.pen)
 * 0 Token Deterministic Browser Compilation.
 */
export default function ${componentName}() {
  return (
${rootJSX}
  )
}
`
}
