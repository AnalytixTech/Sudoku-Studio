import type { Board } from './solver'
import { SudokuSolver } from './solver'
import type { Step } from './solver'
import { DEFAULT_CONFIG, findConflicts as findConf, type VariantConfig } from '../sudoku'

export type HintResult =
  | { status: 'ok'; step: Step; remainingEmpty: number }
  | { status: 'conflict'; message: string; cells: number[][] }
  | { status: 'wrong'; message: string; cells: number[][] }
  | { status: 'complete'; message: string }
  | { status: 'unsolvable'; message: string }

export function analyzeHint(
  board: Board,
  original: Board,
  solution: Board,
  config: VariantConfig = DEFAULT_CONFIG
): HintResult {
  const N = config.size
  const conflictSet = findConf(board, config)
  if (conflictSet.size > 0) {
    const cells = Array.from(conflictSet).map((k) => k.split(',').map(Number))
    return {
      status: 'conflict',
      message: 'The highlighted numbers repeat in a row, column, or region. Fix them first.',
      cells,
    }
  }

  const wrong: number[][] = []
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = board[r][c]
      if (v !== 0 && original[r][c] === 0 && v !== solution[r][c]) wrong.push([r, c, v])
    }
  }
  if (wrong.length > 0) {
    return {
      status: 'wrong',
      message: "Some filled numbers don't match the solution. Check the highlighted cells.",
      cells: wrong.map(([r, c]) => [r, c]),
    }
  }

  const fullyFilled = board.every((row) => row.every((v) => v !== 0))
  if (fullyFilled) {
    return { status: 'complete', message: 'The board is complete. Congratulations!' }
  }

  const solver = new SudokuSolver(board, config)
  const { steps, solution: finalGrid } = solver.solve()
  if (steps.length === 0) {
    return { status: 'unsolvable', message: 'No moves found for this state.' }
  }

  const remainingEmpty = finalGrid.reduce((n, row) => n + row.filter((v) => v === 0).length, 0)
  return { status: 'ok', step: steps[0], remainingEmpty }
}