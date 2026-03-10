// Pure layout functions — no React imports

const H_GAP = 260
const V_GAP = 160
const GRID_COLS = 6

export interface TreeNode<T> {
  item: T
  id: string
  parentId: string | null
  children: TreeNode<T>[]
  depth: number
  x: number
  y: number
  _verticalStacked?: boolean
}

export interface TreeMetrics {
  avgSpan: number
  maxDepth: number
  totalNodes: number
  dynamicGridCols: number
  useVerticalStacking: boolean
}

export interface LayoutConfig {
  gridCols: number
  verticalStackingDepth: number | null
  forcedVerticalNodes: Set<string>
}

export interface BoundingBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export function buildTree<T>(
  items: T[],
  getId: (item: T) => string,
  getParentId: (item: T) => string | null
): TreeNode<T>[] {
  const byParent = new Map<string | null, T[]>()
  items.forEach(item => {
    const p = getParentId(item) ?? null
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p)!.push(item)
  })

  function build(parentId: string | null, depth: number): TreeNode<T>[] {
    const children = byParent.get(parentId) ?? []
    return children.map(item => ({
      item,
      id: getId(item),
      parentId,
      children: build(getId(item), depth + 1),
      depth,
      x: 0,
      y: 0
    }))
  }

  return build(null, 0)
}

export function getSubtreeDepth<T>(node: TreeNode<T>): number {
  if (node.children.length === 0) return 0
  return 1 + Math.max(...node.children.map(getSubtreeDepth))
}

export function analyzeTree<T>(nodes: TreeNode<T>[]): TreeMetrics {
  let totalSpan = 0
  let spanCount = 0
  let maxDepth = 0
  let totalNodes = 0

  function dfs(node: TreeNode<T>): void {
    totalNodes++
    if (node.depth > maxDepth) maxDepth = node.depth
    if (node.children.length > 0) {
      totalSpan += node.children.length
      spanCount++
    }
    node.children.forEach(dfs)
  }
  nodes.forEach(dfs)

  const avgSpan = spanCount > 0 ? totalSpan / spanCount : 0
  const dynamicGridCols = avgSpan > 8 ? Math.ceil(avgSpan / 2) : GRID_COLS
  const useVerticalStacking = maxDepth > 9

  return { avgSpan, maxDepth, totalNodes, dynamicGridCols, useVerticalStacking }
}

export function layoutTree<T>(
  nodes: TreeNode<T>[],
  startX = 0,
  config: LayoutConfig = { gridCols: GRID_COLS, verticalStackingDepth: null, forcedVerticalNodes: new Set() }
): number {
  if (nodes.length === 0) return startX

  let x = startX

  for (const node of nodes) {
    node.y = node.depth * V_GAP

    const shouldStackVertically =
      config.forcedVerticalNodes.has(node.id) ||
      (config.verticalStackingDepth !== null && node.depth >= config.verticalStackingDepth)

    if (node.children.length === 0) {
      node.x = x
      x += H_GAP
    } else if (shouldStackVertically) {
      node.x = x
      let childY = (node.depth + 1) * V_GAP
      let maxChildRight = x + H_GAP
      for (const child of node.children) {
        child.x = x + H_GAP * 0.2
        child.y = childY
        const childRight = layoutTree(child.children, child.x, config)
        const yDelta = childY - child.depth * V_GAP
        if (yDelta !== 0) {
          for (const desc of flattenTree(child.children)) {
            desc.y += yDelta
          }
        }
        if (childRight > maxChildRight) maxChildRight = childRight
        childY += (getSubtreeDepth(child) + 1) * V_GAP
      }
      x = maxChildRight
    } else if (
      node.children.length > 4 &&
      node.children.every(c => c.children.length === 0)
    ) {
      const n = node.children.length
      const actualCols = Math.min(config.gridCols, n)
      const gridWidth = actualCols * H_GAP
      const gridStartX = x

      node.x = gridStartX + gridWidth / 2 - H_GAP / 2

      for (let i = 0; i < n; i++) {
        const col = i % config.gridCols
        const row = Math.floor(i / config.gridCols)
        node.children[i].x = gridStartX + col * H_GAP
        node.children[i].y = (node.depth + 1 + row) * V_GAP
      }

      x = gridStartX + gridWidth
    } else {
      const subtreeStart = x
      x = layoutTree(node.children, x, config)
      node.x = (subtreeStart + x - H_GAP) / 2
    }
  }

  return x
}

export function flattenTree<T>(nodes: TreeNode<T>[]): TreeNode<T>[] {
  return nodes.flatMap(n => [n, ...flattenTree(n.children)])
}

export function getBoundingBox<T>(nodes: TreeNode<T>[]): BoundingBox {
  const all = flattenTree(nodes)
  if (all.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of all) {
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
    if (n.y < minY) minY = n.y
    if (n.y > maxY) maxY = n.y
  }
  return { minX, maxX, minY, maxY }
}

export function findWidestHorizontalSubtree<T>(nodes: TreeNode<T>[]): TreeNode<T> | null {
  const all = flattenTree(nodes)
  let best: TreeNode<T> | null = null
  let bestChildren = 0
  for (const n of all) {
    if (
      n.children.length > 0 &&
      !n._verticalStacked &&
      n.children.every(c => c.children.length === 0) &&
      n.children.length > bestChildren
    ) {
      best = n
      bestChildren = n.children.length
    }
  }
  return best
}

export function buildAncestorPath<T>(
  id: string,
  items: T[],
  getId: (item: T) => string,
  getParentId: (item: T) => string | null
): Set<string> {
  const path = new Set<string>()
  let cur: string | null = id
  while (cur) {
    path.add(cur)
    const found = items.find(i => getId(i) === cur)
    cur = found ? getParentId(found) : null
  }
  return path
}
