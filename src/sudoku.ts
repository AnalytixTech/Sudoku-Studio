export type Grid = number[][]

export type VariantId =
  | '4x4'
  | '4x4_irregular'
  | '6x6'
  | '6x6_irregular'
  | '8x8'
  | '8x8_irregular'
  | '9x9'
  | 'irregular'

export interface VariantConfig {
  id: VariantId
  name: string
  size: number
  boxWidth: number
  boxHeight: number
  isIrregular?: boolean
  regionMap?: number[][]
}

export const IRREGULAR_4X4_MAP: number[][] = [
  [0, 0, 0, 1],
  [0, 2, 1, 1],
  [2, 2, 1, 3],
  [2, 3, 3, 3],
]

export const IRREGULAR_6X6_MAP: number[][] = [
  [0, 0, 0, 1, 1, 1],
  [0, 0, 2, 2, 1, 1],
  [0, 2, 2, 3, 3, 1],
  [4, 2, 2, 3, 3, 5],
  [4, 4, 3, 3, 5, 5],
  [4, 4, 4, 5, 5, 5],
]

export const IRREGULAR_8X8_MAP: number[][] = [
  [0, 0, 0, 0, 0, 1, 1, 1],
  [0, 0, 0, 2, 1, 1, 1, 1],
  [2, 2, 2, 2, 2, 3, 3, 1],
  [2, 2, 4, 4, 3, 3, 3, 3],
  [4, 4, 4, 4, 3, 3, 5, 5],
  [6, 4, 4, 5, 5, 5, 5, 5],
  [6, 6, 6, 6, 7, 5, 7, 7],
  [6, 6, 6, 7, 7, 7, 7, 7],
]

export const IRREGULAR_9X9_MAP: number[][] = [
  [0, 0, 0, 0, 1, 1, 1, 1, 2],
  [0, 0, 0, 1, 1, 1, 2, 2, 2],
  [0, 0, 1, 1, 2, 2, 2, 2, 2],
  [3, 3, 3, 4, 4, 4, 5, 5, 5],
  [3, 3, 3, 4, 4, 4, 5, 5, 5],
  [3, 3, 3, 4, 4, 4, 5, 5, 5],
  [6, 6, 6, 7, 7, 7, 8, 8, 8],
  [6, 6, 6, 7, 7, 7, 8, 8, 8],
  [6, 6, 6, 7, 7, 7, 8, 8, 8],
]

export function transformRegionMap(originalMap: number[][]): number[][] {
  const N = originalMap.length
  const transformed: number[][] = Array.from({ length: N }, () => Array(N).fill(0))

  // Pick one of 8 random geometric transformations
  const transformType = Math.floor(Math.random() * 8)

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let tr = r
      let tc = c

      switch (transformType) {
        case 1: // 90 deg clockwise
          tr = c
          tc = N - 1 - r
          break
        case 2: // 180 deg
          tr = N - 1 - r
          tc = N - 1 - c
          break
        case 3: // 270 deg clockwise
          tr = N - 1 - c
          tc = r
          break
        case 4: // Horizontal flip
          tr = r
          tc = N - 1 - c
          break
        case 5: // Vertical flip
          tr = N - 1 - r
          tc = c
          break
        case 6: // Transpose
          tr = c
          tc = r
          break
        case 7: // Anti-transpose
          tr = N - 1 - c
          tc = N - 1 - r
          break
        default: // 0 deg
          tr = r
          tc = c
          break
      }
      transformed[tr][tc] = originalMap[r][c]
    }
  }

  // Shuffle region IDs (0..N-1)
  const uniqueIds = Array.from({ length: N }, (_, i) => i)
  for (let i = uniqueIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[uniqueIds[i], uniqueIds[j]] = [uniqueIds[j], uniqueIds[i]]
  }

  const remapped: number[][] = Array.from({ length: N }, () => Array(N).fill(0))
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      remapped[r][c] = uniqueIds[transformed[r][c]]
    }
  }

  return remapped
}

export function getDynamicConfig(config: VariantConfig): VariantConfig {
  if (config.isIrregular && config.regionMap) {
    return {
      ...config,
      regionMap: transformRegionMap(config.regionMap),
    }
  }
  return config
}

export const VARIANT_CONFIGS: Record<VariantId, VariantConfig> = {
  '4x4': {
    id: '4x4',
    name: '4×4 Mini (Standard)',
    size: 4,
    boxWidth: 2,
    boxHeight: 2,
  },
  '4x4_irregular': {
    id: '4x4_irregular',
    name: '4×4 Mini (Jigsaw)',
    size: 4,
    boxWidth: 2,
    boxHeight: 2,
    isIrregular: true,
    regionMap: IRREGULAR_4X4_MAP,
  },
  '6x6': {
    id: '6x6',
    name: '6×6 Medium (Standard)',
    size: 6,
    boxWidth: 3,
    boxHeight: 2,
  },
  '6x6_irregular': {
    id: '6x6_irregular',
    name: '6×6 Medium (Jigsaw)',
    size: 6,
    boxWidth: 3,
    boxHeight: 2,
    isIrregular: true,
    regionMap: IRREGULAR_6X6_MAP,
  },
  '8x8': {
    id: '8x8',
    name: '8×8 Pro (Standard)',
    size: 8,
    boxWidth: 4,
    boxHeight: 2,
  },
  '8x8_irregular': {
    id: '8x8_irregular',
    name: '8×8 Pro (Jigsaw)',
    size: 8,
    boxWidth: 4,
    boxHeight: 2,
    isIrregular: true,
    regionMap: IRREGULAR_8X8_MAP,
  },
  '9x9': {
    id: '9x9',
    name: '9×9 Standard',
    size: 9,
    boxWidth: 3,
    boxHeight: 3,
  },
  irregular: {
    id: 'irregular',
    name: '9×9 Jigsaw Irregular',
    size: 9,
    boxWidth: 3,
    boxHeight: 3,
    isIrregular: true,
    regionMap: IRREGULAR_9X9_MAP,
  },
}

export const DEFAULT_CONFIG: VariantConfig = VARIANT_CONFIGS['9x9']

export function emptyGrid(config: VariantConfig = DEFAULT_CONFIG): Grid {
  return Array.from({ length: config.size }, () => Array(config.size).fill(0))
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice())
}

export function boxIndex(r: number, c: number, config: VariantConfig = DEFAULT_CONFIG): number {
  if (config.isIrregular && config.regionMap) {
    return config.regionMap[r][c]
  }
  const br = Math.floor(r / config.boxHeight)
  const bc = Math.floor(c / config.boxWidth)
  const boxesPerRow = config.size / config.boxWidth
  return br * boxesPerRow + bc
}

export function boxCells(b: number, config: VariantConfig = DEFAULT_CONFIG): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  if (config.isIrregular && config.regionMap) {
    for (let r = 0; r < config.size; r++) {
      for (let c = 0; c < config.size; c++) {
        if (config.regionMap[r][c] === b) {
          cells.push([r, c])
        }
      }
    }
    return cells
  }

  const boxesPerRow = config.size / config.boxWidth
  const br = Math.floor(b / boxesPerRow) * config.boxHeight
  const bc = (b % boxesPerRow) * config.boxWidth

  for (let r = br; r < br + config.boxHeight; r++) {
    for (let c = bc; c < bc + config.boxWidth; c++) {
      cells.push([r, c])
    }
  }
  return cells
}

export interface CandidateSet {
  cand: number[][][]
  rows: Set<number>[]
  cols: Set<number>[]
  boxes: Set<number>[]
}

export function computeCandidates(grid: Grid, config: VariantConfig = DEFAULT_CONFIG): CandidateSet {
  const N = config.size
  const rows = Array.from({ length: N }, () => new Set<number>())
  const cols = Array.from({ length: N }, () => new Set<number>())
  const boxes = Array.from({ length: N }, () => new Set<number>())

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = grid[r][c]
      if (v) {
        rows[r].add(v)
        cols[c].add(v)
        boxes[boxIndex(r, c, config)].add(v)
      }
    }
  }

  const cand: number[][][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => [])
  )
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c]) continue
      for (let v = 1; v <= N; v++) {
        if (!rows[r].has(v) && !cols[c].has(v) && !boxes[boxIndex(r, c, config)].has(v)) {
          cand[r][c].push(v)
        }
      }
    }
  }
  return { cand, rows, cols, boxes }
}

export function findConflicts(grid: Grid, config: VariantConfig = DEFAULT_CONFIG): Set<string> {
  const N = config.size
  const bad = new Set<string>()
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = grid[r][c]
      if (!v) continue
      let seen: string[] = []
      for (let i = 0; i < N; i++) {
        if (grid[r][i] === v && i !== c) seen.push(`${r},${i}`)
        if (grid[i][c] === v && i !== r) seen.push(`${i},${c}`)
      }
      for (const [rr, cc] of boxCells(boxIndex(r, c, config), config)) {
        if (grid[rr][cc] === v && (rr !== r || cc !== c)) seen.push(`${rr},${cc}`)
      }
      if (seen.length) bad.add(`${r},${c}`)
    }
  }
  return bad
}

export function countEmpty(grid: Grid): number {
  let n = 0
  for (const row of grid) for (const v of row) if (!v) n++
  return n
}