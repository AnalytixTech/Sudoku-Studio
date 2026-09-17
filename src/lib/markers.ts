import type { Step } from './solver'
import { DEFAULT_CONFIG, boxIndex, type VariantConfig } from '../sudoku'

export interface Markers {
  focus: string[]
  strike: Map<string, Set<number>>
  placement: string | null
  stepRows: Set<number>
  stepCols: Set<number>
  stepBoxes: Set<number>
}

export function markersFor(
  step: Step | null | undefined,
  config: VariantConfig = DEFAULT_CONFIG
): Markers {
  if (!step) {
    return {
      focus: [],
      strike: new Map(),
      placement: null,
      stepRows: new Set(),
      stepCols: new Set(),
      stepBoxes: new Set(),
    }
  }

  const focus = (step.focus || []).map(([r, c]) => `${r},${c}`)
  const strike = new Map<string, Set<number>>()
  for (const [r, c, v] of step.eliminations || []) {
    const k = `${r},${c}`
    if (!strike.has(k)) strike.set(k, new Set())
    strike.get(k)!.add(v)
  }
  const placement = step.placement ? `${step.placement.row},${step.placement.col}` : null

  const stepRows = new Set<number>()
  const stepCols = new Set<number>()
  const stepBoxes = new Set<number>()

  const addCellUnits = (r: number, c: number) => {
    stepRows.add(r)
    stepCols.add(c)
    stepBoxes.add(boxIndex(r, c, config))
  }

  if (step.placement) {
    addCellUnits(step.placement.row, step.placement.col)
  }
  for (const [r, c] of step.focus || []) {
    addCellUnits(r, c)
  }
  for (const [r, c] of step.eliminations || []) {
    addCellUnits(r, c)
  }

  return { focus, strike, placement, stepRows, stepCols, stepBoxes }
}