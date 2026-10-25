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
}

export type PenFill = string | PenFillGradient

export interface PenPadding {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface PenNode {
  type: "frame" | "rectangle" | "text" | "group" | "path" | "vector" | "circle" | "ellipse"
  id: string
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: PenFill
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
  opacity?: number
  clip?: boolean
  layout?: "none" | "vertical" | "horizontal"
  gap?: number
  padding?: number | PenPadding
  alignItems?: "start" | "center" | "end" | "stretch"
  justifyContent?: "start" | "center" | "end" | "space-between" | "space-around"
  // Text properties
  text?: string
  fontSize?: number
  fontWeight?: string | number
  fontFamily?: string
  textAlign?: "left" | "center" | "right" | "justify"
  lineHeight?: number | string
  letterSpacing?: number
  // Nested children
  children?: PenNode[]
}

export interface PenDocument {
  version: string
  name?: string
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

