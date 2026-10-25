import type { PenDocument, PenFill, PenFillGradient, PenNode, PenPadding } from "./penTypes"

/**
 * Deterministic (0 Token) Compiler: .pen Document -> React Component with Tailwind CSS.
 * Runs 100% in-browser in <1ms without LLM API tokens.
 */

function fillToStylesOrClasses(fill?: PenFill, isText?: boolean): { className: string; style?: React.CSSProperties } {
  if (!fill || fill === "transparent") return { className: "" }

  if (typeof fill === "string") {
    // If it's a solid hex or rgba
    if (isText) {
      if (fill === "#ffffff" || fill === "#fff") return { className: "text-white" }
      if (fill === "#000000" || fill === "#000") return { className: "text-black" }
      return { className: `text-[${fill}]` }
    }
    if (fill === "#ffffff" || fill === "#fff") return { className: "bg-white" }
    if (fill === "#000000" || fill === "#000") return { className: "bg-black" }
    return { className: `bg-[${fill}]` }
  }

  // Gradient fill
  const grad = fill as PenFillGradient
  if (grad.colors && grad.colors.length) {
    const stops = grad.colors.map((c) => `${c.color} ${Math.round(c.position * 100)}%`).join(", ")
    const bgString = grad.gradientType === "radial"
      ? `radial-gradient(circle, ${stops})`
      : `linear-gradient(${grad.rotation ?? 180}deg, ${stops})`
    return {
      className: "",
      style: { background: bgString },
    }
  }

  return { className: "" }
}

function paddingToClasses(padding?: number | PenPadding): string {
  if (!padding) return ""
  if (typeof padding === "number") {
    return `p-[${padding}px]`
  }
  const classes: string[] = []
  if (padding.top) classes.push(`pt-[${padding.top}px]`)
  if (padding.right) classes.push(`pr-[${padding.right}px]`)
  if (padding.bottom) classes.push(`pb-[${padding.bottom}px]`)
  if (padding.left) classes.push(`pl-[${padding.left}px]`)
  return classes.join(" ")
}

export function compileNodeToJSX(node: PenNode, depth = 1): string {
  const indent = "  ".repeat(depth)

  if (node.type === "text") {
    const isHeading = (node.fontSize && node.fontSize >= 18) || node.fontWeight === "600" || node.fontWeight === "700" || node.fontWeight === "bold"
    const tag = isHeading ? "h3" : "p"

    const classes: string[] = []
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

    const fillRes = fillToStylesOrClasses(node.fill, true)
    if (fillRes.className) classes.push(fillRes.className)

    const classAttr = classes.length ? ` className="${classes.join(" ")}"` : ""
    const styleAttr = fillRes.style ? ` style={${JSON.stringify(fillRes.style)}}` : ""

    return `${indent}<${tag}${classAttr}${styleAttr}>${node.text || ""}</${tag}>`
  }

  // Frames, rectangles, groups
  const classes: string[] = []

  // Layout
  if (node.layout === "vertical") {
    classes.push("flex flex-col")
  } else if (node.layout === "horizontal") {
    classes.push("flex flex-row")
  }

  if (node.gap) {
    classes.push(`gap-[${node.gap}px]`)
  }

  if (node.alignItems) {
    if (node.alignItems === "center") classes.push("items-center")
    else if (node.alignItems === "start") classes.push("items-start")
    else if (node.alignItems === "end") classes.push("items-end")
    else if (node.alignItems === "stretch") classes.push("items-stretch")
  }

  if (node.justifyContent) {
    if (node.justifyContent === "center") classes.push("justify-center")
    else if (node.justifyContent === "space-between") classes.push("justify-between")
    else if (node.justifyContent === "start") classes.push("justify-start")
    else if (node.justifyContent === "end") classes.push("justify-end")
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
  if (node.stroke) {
    classes.push(node.strokeWidth && node.strokeWidth > 1 ? `border-[${node.strokeWidth}px] border-[${node.stroke}]` : `border border-[${node.stroke}]`)
  }

  // Effects / Shadow
  if (node.effects === "shadow-xl") {
    classes.push("shadow-2xl")
  }

  // Rotation
  if (node.rotation) {
    classes.push(`rotate-[${node.rotation}deg]`)
  }

  // Fill
  const fillRes = fillToStylesOrClasses(node.fill, false)
  if (fillRes.className) classes.push(fillRes.className)

  const classAttr = classes.length ? ` className="${classes.join(" ")}"` : ""
  const styleAttr = fillRes.style ? ` style={${JSON.stringify(fillRes.style)}}` : ""

  const childrenJSX = (node.children || [])
    .map((child) => compileNodeToJSX(child, depth + 1))
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

  const rootJSX = compileNodeToJSX(rootNode, 1)

  return `import React from 'react'

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
