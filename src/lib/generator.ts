import { DEFAULT_CONFIG, boxIndex, boxCells, type VariantConfig } from '../sudoku'

export type Board = number[][]

const TARGETS: Record<Difficulty, number> = {
  easy: 42,
  medium: 35,
  hard: 29,
  expert: 25,
  master: 22,
  'grand master': 19,
}

const BUDGETS: Record<Difficulty, number> = {
  easy: 6,
  medium: 10,
  hard: 20,
  expert: 34,
  master: 46,
  'grand master': 62,
}

const ATTEMPTS: Record<Difficulty, number> = {
  easy: 1,
  medium: 1,
  hard: 1,
  expert: 1,
  master: 2,
  'grand master': 3,
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master' | 'grand master'

export function isDifficulty(value: string): value is Difficulty {
  return value in TARGETS
}

function emptyGrid(N: number): Board {
  return Array.from({ length: N }, () => Array(N).fill(0))
}

function clone(grid: Board): Board {
  return grid.map((row) => row.slice())
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

function fill(grid: Board, config: VariantConfig): boolean {
  const N = config.size
  let bestR = -1
  let bestC = -1
  let bestCand: number[] | null = null

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c] === 0) {
        const cand = candidatesOf(grid, r, c, config)
        if (cand.length === 0) return false
        if (!bestCand || cand.length < bestCand.length) {
          bestR = r
          bestC = c
          bestCand = cand
          if (cand.length === 1) break
        }
      }
    }
    if (bestCand && bestCand.length === 1) break
  }

  if (bestR === -1 || !bestCand) return true

  const values = shuffle(bestCand.slice())
  for (const v of values) {
    grid[bestR][bestC] = v
    if (fill(grid, config)) return true
    grid[bestR][bestC] = 0
  }
  return false
}

function candidatesOf(board: Board, r: number, c: number, config: VariantConfig): number[] {
  const N = config.size
  const used = new Set<number>()
  for (let i = 0; i < N; i++) {
    used.add(board[r][i])
    used.add(board[i][c])
  }
  for (const [rr, cc] of boxCells(boxIndex(r, c, config), config)) {
    used.add(board[rr][cc])
  }
  const result: number[] = []
  for (let v = 1; v <= N; v++) {
    if (!used.has(v)) result.push(v)
  }
  return result
}

function countClues(grid: Board): number {
  let n = 0
  for (const row of grid) for (const v of row) if (v !== 0) n++
  return n
}

function solutions(grid: Board, config: VariantConfig, limit = 2): { count: number; first: Board | null } {
  let count = 0
  let nodeCount = 0
  const maxNodes = config.isIrregular ? 200 : 1000
  let found: Board | null = null
  const N = config.size

  const search = (board: Board): void => {
    nodeCount++
    if (nodeCount > maxNodes) {
      count = 2
      return
    }
    let best: [number, number, number[]] | null = null
    let least = N + 1
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (board[r][c] === 0) {
          const cand = candidatesOf(board, r, c, config)
          if (cand.length === 0) return
          if (cand.length < least) {
            least = cand.length
            best = [r, c, cand]
            if (least === 1) break
          }
        }
      }
      if (least === 1) break
    }
    if (!best) {
      count++
      if (count === 1) found = board.map((row) => row.slice())
      return
    }
    const [r, c, cand] = best
    for (const v of cand) {
      board[r][c] = v
      search(board)
      if (count >= limit || nodeCount > maxNodes) return
      board[r][c] = 0
    }
    board[r][c] = 0
  }

  search(clone(grid))
  return { count, first: found }
}

function buildOnce(
  targetRatio: number,
  budget: number,
  config: VariantConfig
): { puzzle: Board; solution: Board } {
  const N = config.size
  const solution = emptyGrid(N)
  fill(solution, config)
  const puzzle = clone(solution)
  const totalCells = N * N
  const target = Math.max(Math.floor(totalCells * targetRatio), Math.floor(N * 1.5))
  const cells = shuffle(Array.from({ length: totalCells }, (_, i) => i))
  let fails = 0
  const maxFails = config.isIrregular ? Math.min(budget, 6) : budget

  for (const idx of cells) {
    if (countClues(puzzle) <= target) break
    const r = Math.floor(idx / N)
    const c = idx % N
    const saved = puzzle[r][c]
    puzzle[r][c] = 0
    const { count } = solutions(puzzle, config)
    if (count !== 1) {
      puzzle[r][c] = saved
      fails++
      if (fails >= maxFails) break
    }
  }
  return { puzzle, solution }
}

export function generate(
  difficulty: Difficulty = 'medium',
  config: VariantConfig = DEFAULT_CONFIG
): { puzzle: Board; solution: Board } {
  const ratio = (TARGETS[difficulty] || 35) / 81
  const budget = BUDGETS[difficulty] || 10
  const attempts = config.isIrregular ? 1 : ATTEMPTS[difficulty] || 1

  let best: { puzzle: Board; solution: Board } | null = null
  let bestCount = 1e9

  for (let a = 0; a < attempts; a++) {
    const result = buildOnce(ratio, budget, config)
    const clues = countClues(result.puzzle)
    if (clues < bestCount) {
      best = result
      bestCount = clues
    }
  }

  if (!best) best = buildOnce(ratio, budget, config)
  const { puzzle, solution } = best

  return { puzzle, solution }
}