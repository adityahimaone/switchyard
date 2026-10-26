export interface CanvasNodeRect {
  id: string
  name?: string
  x: number
  y: number
  width: number
  height: number
  left: number
  right: number
  top: number
  bottom: number
  centerX: number
  centerY: number
  parentId?: string
  isRoot?: boolean
}

export interface GuideLine {
  id: string
  type: "horizontal" | "vertical"
  coord: number
  start: number
  end: number
  ticks: number[]
  distanceLabel?: { value: number; x: number; y: number }
}

export interface SmartGuideResult {
  guides: GuideLine[]
  snapOffset: { dx: number; dy: number }
}

/**
 * Reads all [data-node-id] DOM elements within the canvas and calculates their
 * coordinates in 1:1 unscaled canvas coordinate space.
 */
export function scanCanvasNodeRects(
  containerEl: HTMLElement,
  pan: { x: number; y: number },
  zoom: number
): Map<string, CanvasNodeRect> {
  const result = new Map<string, CanvasNodeRect>()
  const containerRect = containerEl.getBoundingClientRect()
  const elements = containerEl.querySelectorAll<HTMLElement>("[data-node-id]")

  elements.forEach((el) => {
    const id = el.getAttribute("data-node-id")
    if (!id) return

    const r = el.getBoundingClientRect()
    // Skip invisible or zero-size elements
    if (r.width <= 0 || r.height <= 0) return

    const x = (r.left - containerRect.left - pan.x) / zoom
    const y = (r.top - containerRect.top - pan.y) / zoom
    const width = r.width / zoom
    const height = r.height / zoom

    const parentEl = el.parentElement?.closest<HTMLElement>("[data-node-id]")
    const parentId = parentEl?.getAttribute("data-node-id") || undefined

    result.set(id, {
      id,
      name: el.getAttribute("data-node-name") || undefined,
      x,
      y,
      width,
      height,
      left: x,
      right: x + width,
      top: y,
      bottom: y + height,
      centerX: x + width / 2,
      centerY: y + height / 2,
      parentId,
      isRoot: !parentId,
    })
  })

  return result
}

/**
 * Calculates smart alignment ruler lines (matching pen.dev auto ruler) between
 * the active/dragged target element and surrounding canvas elements.
 */
export function calculateSmartGuides(
  targetId: string,
  rectMap: Map<string, CanvasNodeRect>,
  activeOverrideRect?: { x: number; y: number; width?: number; height?: number },
  snapThreshold: number = 8
): SmartGuideResult {
  const target = rectMap.get(targetId)
  if (!target && !activeOverrideRect) {
    return { guides: [], snapOffset: { dx: 0, dy: 0 } }
  }

  // Active target rect (either from live drag override or scanned DOM)
  const tw = activeOverrideRect?.width ?? target?.width ?? 0
  const th = activeOverrideRect?.height ?? target?.height ?? 0
  const tx = activeOverrideRect?.x ?? target?.x ?? 0
  const ty = activeOverrideRect?.y ?? target?.y ?? 0

  const curTarget: CanvasNodeRect = {
    id: targetId,
    x: tx,
    y: ty,
    width: tw,
    height: th,
    left: tx,
    right: tx + tw,
    top: ty,
    bottom: ty + th,
    centerX: tx + tw / 2,
    centerY: ty + th / 2,
  }

  const guides: GuideLine[] = []
  let snapDx = 0
  let snapDy = 0
  let minDiffX = snapThreshold + 1
  let minDiffY = snapThreshold + 1

  // Maps of aligned coordinates to gather all intersecting tick marks
  const horizontalAlignments = new Map<number, { ticks: Set<number>; bounds: { min: number; max: number } }>()
  const verticalAlignments = new Map<number, { ticks: Set<number>; bounds: { min: number; max: number } }>()

  // Helper to record horizontal alignment
  const addHorizontal = (yCoord: number, tickX1: number, tickX2: number) => {
    const existing = horizontalAlignments.get(yCoord) || {
      ticks: new Set<number>(),
      bounds: { min: Math.min(tickX1, tickX2), max: Math.max(tickX1, tickX2) },
    }
    existing.ticks.add(tickX1)
    existing.ticks.add(tickX2)
    existing.bounds.min = Math.min(existing.bounds.min, tickX1, tickX2)
    existing.bounds.max = Math.max(existing.bounds.max, tickX1, tickX2)
    horizontalAlignments.set(yCoord, existing)
  }

  // Helper to record vertical alignment
  const addVertical = (xCoord: number, tickY1: number, tickY2: number) => {
    const existing = verticalAlignments.get(xCoord) || {
      ticks: new Set<number>(),
      bounds: { min: Math.min(tickY1, tickY2), max: Math.max(tickY1, tickY2) },
    }
    existing.ticks.add(tickY1)
    existing.ticks.add(tickY2)
    existing.bounds.min = Math.min(existing.bounds.min, tickY1, tickY2)
    existing.bounds.max = Math.max(existing.bounds.max, tickY1, tickY2)
    verticalAlignments.set(xCoord, existing)
  }

  // Helper to verify if nodeA is descendant of nodeB
  const isDescendant = (childId: string, potentialAncestorId: string): boolean => {
    let cur = rectMap.get(childId)
    let depth = 0
    while (cur && cur.parentId && depth < 20) {
      if (cur.parentId === potentialAncestorId) return true
      cur = rectMap.get(cur.parentId)
      depth++
    }
    return false
  }

  rectMap.forEach((other, otherId) => {
    if (otherId === targetId) return
    // Skip descendants of target (don't align a moving frame to its own children!)
    if (isDescendant(otherId, targetId)) return
    // Skip ancestors of target (don't align to own parent container edges directly)
    if (isDescendant(targetId, otherId)) return

    // 1. HORIZONTAL ALIGNMENTS (Top, Center, Bottom)
    const hChecks = [
      { targetVal: curTarget.top, otherVal: other.top, delta: other.top - curTarget.top },
      { targetVal: curTarget.top, otherVal: other.bottom, delta: other.bottom - curTarget.top },
      { targetVal: curTarget.centerY, otherVal: other.centerY, delta: other.centerY - curTarget.centerY },
      { targetVal: curTarget.bottom, otherVal: other.top, delta: other.top - curTarget.bottom },
      { targetVal: curTarget.bottom, otherVal: other.bottom, delta: other.bottom - curTarget.bottom },
    ]

    for (const chk of hChecks) {
      const diff = Math.abs(chk.delta)
      if (diff <= snapThreshold) {
        addHorizontal(chk.otherVal, curTarget.left, curTarget.right)
        addHorizontal(chk.otherVal, other.left, other.right)

        if (diff < minDiffY) {
          minDiffY = diff
          snapDy = chk.delta
        }
      }
    }

    // 2. VERTICAL ALIGNMENTS (Left, Center, Right)
    const vChecks = [
      { targetVal: curTarget.left, otherVal: other.left, delta: other.left - curTarget.left },
      { targetVal: curTarget.left, otherVal: other.right, delta: other.right - curTarget.left },
      { targetVal: curTarget.centerX, otherVal: other.centerX, delta: other.centerX - curTarget.centerX },
      { targetVal: curTarget.right, otherVal: other.left, delta: other.left - curTarget.right },
      { targetVal: curTarget.right, otherVal: other.right, delta: other.right - curTarget.right },
    ]

    for (const chk of vChecks) {
      const diff = Math.abs(chk.delta)
      if (diff <= snapThreshold) {
        addVertical(chk.otherVal, curTarget.top, curTarget.bottom)
        addVertical(chk.otherVal, other.top, other.bottom)

        if (diff < minDiffX) {
          minDiffX = diff
          snapDx = chk.delta
        }
      }
    }
  })

  // Format horizontal guides
  horizontalAlignments.forEach((data, yCoord) => {
    rectMap.forEach((node) => {
      if (node.id === targetId || isDescendant(node.id, targetId)) return
      if (Math.abs(node.top - yCoord) <= 2 || Math.abs(node.bottom - yCoord) <= 2) {
        data.ticks.add(node.left)
        data.ticks.add(node.right)
        data.bounds.min = Math.min(data.bounds.min, node.left)
        data.bounds.max = Math.max(data.bounds.max, node.right)
      }
    })

    guides.push({
      id: `guide_h_${yCoord}`,
      type: "horizontal",
      coord: yCoord,
      start: data.bounds.min - 16,
      end: data.bounds.max + 16,
      ticks: Array.from(data.ticks).sort((a, b) => a - b),
    })
  })

  // Format vertical guides
  verticalAlignments.forEach((data, xCoord) => {
    rectMap.forEach((node) => {
      if (node.id === targetId || isDescendant(node.id, targetId)) return
      if (Math.abs(node.left - xCoord) <= 2 || Math.abs(node.right - xCoord) <= 2) {
        data.ticks.add(node.top)
        data.ticks.add(node.bottom)
        data.bounds.min = Math.min(data.bounds.min, node.top)
        data.bounds.max = Math.max(data.bounds.max, node.bottom)
      }
    })

    guides.push({
      id: `guide_v_${xCoord}`,
      type: "vertical",
      coord: xCoord,
      start: data.bounds.min - 16,
      end: data.bounds.max + 16,
      ticks: Array.from(data.ticks).sort((a, b) => a - b),
    })
  })

  return {
    guides,
    snapOffset: { dx: snapDx, dy: snapDy },
  }
}
