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

interface AlignmentCluster {
  ticks: Set<number>
  bounds: { min: number; max: number }
  count: number
  diff: number
  delta: number
}

/**
 * Context-aware smart alignment guides matching pen.dev Image 2:
 * - Only aligns against direct siblings, parent edges, or peer root frames.
 * - Merges coordinates within 3px to avoid duplicate parallel lines.
 * - Caps guides at max 1-2 lines per axis.
 * - Consolidates boundary ticks closer than 6px for flawless visual clarity.
 */
export function calculateSmartGuides(
  targetId: string,
  rectMap: Map<string, CanvasNodeRect>,
  activeOverrideRect?: { x: number; y: number; width?: number; height?: number },
  snapThreshold: number = 6
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
    parentId: target?.parentId,
    isRoot: target?.isRoot ?? !target?.parentId,
  }

  let snapDx = 0
  let snapDy = 0
  let minDiffX = snapThreshold + 1
  let minDiffY = snapThreshold + 1

  // Maps of clustered aligned coordinates (merged within 3px)
  const horizontalClusters = new Map<number, AlignmentCluster>()
  const verticalClusters = new Map<number, AlignmentCluster>()

  const addHorizontalCluster = (yCoord: number, tickX1: number, tickX2: number, diff: number, delta: number) => {
    let bestKey: number | null = null
    for (const k of horizontalClusters.keys()) {
      if (Math.abs(k - yCoord) <= 3) {
        bestKey = k
        break
      }
    }
    const key = bestKey !== null ? bestKey : Math.round(yCoord)
    const existing = horizontalClusters.get(key) || {
      ticks: new Set<number>(),
      bounds: { min: Infinity, max: -Infinity },
      count: 0,
      diff: 999,
      delta: 0,
    }
    existing.ticks.add(Math.round(tickX1))
    existing.ticks.add(Math.round(tickX2))
    existing.bounds.min = Math.min(existing.bounds.min, tickX1, tickX2)
    existing.bounds.max = Math.max(existing.bounds.max, tickX1, tickX2)
    existing.count += 1
    if (diff < existing.diff) {
      existing.diff = diff
      existing.delta = delta
    }
    horizontalClusters.set(key, existing)
  }

  const addVerticalCluster = (xCoord: number, tickY1: number, tickY2: number, diff: number, delta: number) => {
    let bestKey: number | null = null
    for (const k of verticalClusters.keys()) {
      if (Math.abs(k - xCoord) <= 3) {
        bestKey = k
        break
      }
    }
    const key = bestKey !== null ? bestKey : Math.round(xCoord)
    const existing = verticalClusters.get(key) || {
      ticks: new Set<number>(),
      bounds: { min: Infinity, max: -Infinity },
      count: 0,
      diff: 999,
      delta: 0,
    }
    existing.ticks.add(Math.round(tickY1))
    existing.ticks.add(Math.round(tickY2))
    existing.bounds.min = Math.min(existing.bounds.min, tickY1, tickY2)
    existing.bounds.max = Math.max(existing.bounds.max, tickY1, tickY2)
    existing.count += 1
    if (diff < existing.diff) {
      existing.diff = diff
      existing.delta = delta
    }
    verticalClusters.set(key, existing)
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

  // Filter candidates: context-aware selection (direct siblings, direct parent, or peer root frames)
  const isTargetRoot = curTarget.isRoot
  const targetParentId = curTarget.parentId

  rectMap.forEach((other, otherId) => {
    if (otherId === targetId) return
    // Skip descendants of target
    if (isDescendant(otherId, targetId)) return
    // Skip ancestors unless it's the direct parent container
    if (isDescendant(targetId, otherId) && otherId !== targetParentId) return

    // Context filter: If moving inside a container, ONLY align to direct siblings and the direct parent frame!
    if (!isTargetRoot && targetParentId) {
      const isSibling = other.parentId === targetParentId
      const isDirectParent = other.id === targetParentId
      if (!isSibling && !isDirectParent) {
        return // Ignore elements in unrelated nested cards!
      }
    }

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
        addHorizontalCluster(chk.otherVal, curTarget.left, curTarget.right, diff, chk.delta)
        addHorizontalCluster(chk.otherVal, other.left, other.right, diff, chk.delta)

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
        addVerticalCluster(chk.otherVal, curTarget.top, curTarget.bottom, diff, chk.delta)
        addVerticalCluster(chk.otherVal, other.top, other.bottom, diff, chk.delta)

        if (diff < minDiffX) {
          minDiffX = diff
          snapDx = chk.delta
        }
      }
    }
  })

  const guides: GuideLine[] = []

  // Helper to deduplicate ticks closer than 6px
  const cleanAndDeduplicateTicks = (rawTicks: Set<number>): number[] => {
    const sorted = Array.from(rawTicks).sort((a, b) => a - b)
    const cleaned: number[] = []
    for (const t of sorted) {
      if (cleaned.length === 0 || Math.abs(t - cleaned[cleaned.length - 1]) >= 6) {
        cleaned.push(t)
      }
    }
    return cleaned
  }

  // Format horizontal guides: cap at top 2 most prominent/relevant lines (e.g. top and bottom)
  const sortedHorizontal = Array.from(horizontalClusters.entries())
    .sort((a, b) => a[1].diff - b[1].diff || b[1].count - a[1].count)
    .slice(0, 2)

  sortedHorizontal.forEach(([yCoord, data]) => {
    guides.push({
      id: `guide_h_${yCoord}`,
      type: "horizontal",
      coord: yCoord,
      start: data.bounds.min - 16,
      end: data.bounds.max + 16,
      ticks: cleanAndDeduplicateTicks(data.ticks),
    })
  })

  // Format vertical guides: cap at top 1-2 most prominent lines (matching pen.dev Image 2)
  const sortedVertical = Array.from(verticalClusters.entries())
    .sort((a, b) => a[1].diff - b[1].diff || b[1].count - a[1].count)
    .slice(0, 2)

  sortedVertical.forEach(([xCoord, data]) => {
    guides.push({
      id: `guide_v_${xCoord}`,
      type: "vertical",
      coord: xCoord,
      start: data.bounds.min - 16,
      end: data.bounds.max + 16,
      ticks: cleanAndDeduplicateTicks(data.ticks),
    })
  })

  return {
    guides,
    snapOffset: { dx: snapDx, dy: snapDy },
  }
}
