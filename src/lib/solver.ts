export type Cell = [number, number]
export type Board = number[][]

export interface Placement {
  row: number
  col: number
  value: number
}

export interface Step {
  id: number
  technique: string
  kind: 'placement' | 'elimination' | 'guess'
  description: string
  placement: Placement | null
  focus: Cell[]
  eliminations: number[][] // [r, c, value]
  rank: number
  done?: boolean // replay bookkeeping
}

export interface SolveResult {
  steps: Step[]
  solution: Board
  solved: boolean
}

const N = 9

const ROWS: Cell[][] = Array.from({ length: N }, (_, r) =>
  Array.from({ length: N }, (_, c) => [r, c] as Cell)
)
const COLS: Cell[][] = Array.from({ length: N }, (_, c) =>
  Array.from({ length: N }, (_, r) => [r, c] as Cell)
)
const BOXES: Cell[][] = Array.from({ length: N }, (_, b) => {
  const cells: Cell[] = []
  const br = Math.floor(b / 3) * 3
  const bc = (b % 3) * 3
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++) cells.push([r, c])
  return cells
})

const BOX_NAMES = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

interface StandardUnit {
  cells: Cell[]
  label: string
  kind: 'row' | 'col' | 'box'
}

const UNITS: StandardUnit[] = [
  ...ROWS.map((cells, r) => ({ cells, label: `Row ${r + 1}`, kind: 'row' as const })),
  ...COLS.map((cells, c) => ({ cells, label: `Column ${c + 1}`, kind: 'col' as const })),
  ...BOXES.map((cells, b) => ({ cells, label: `the ${BOX_NAMES[b]} box`, kind: 'box' as const })),
]

function boxOf(r: number, c: number): number {
  return Math.floor(r / 3) * 3 + Math.floor(c / 3)
}

function unitsFor(r: number, c: number): StandardUnit[] {
  const box = boxOf(r, c)
  return [UNITS[r], UNITS[9 + c], UNITS[18 + box]]
}

function cellLabel(r: number, c: number): string {
  return `Row ${r + 1}, Column ${c + 1}`
}

function union(...sets: Set<number>[]): Set<number> {
  const out = new Set<number>()
  for (const s of sets) for (const v of s) out.add(v)
  return out
}

function comma(values: number[]): string {
  if (values.length === 0) return ''
  if (values.length === 1) return String(values[0])
  return values.slice(0, -1).join(', ') + ' and ' + String(values[values.length - 1])
}

function targetsValues(targets: number[][]): number[] {
  return Array.from(new Set(targets.map((t) => t[2]))).sort((a, b) => a - b)
}

import { DEFAULT_CONFIG, type VariantConfig } from '../sudoku'

export class SudokuSolver {
  grid: Board
  candidates: Set<number>[][]
  steps: Step[] = []
  config: VariantConfig

  constructor(grid: Board, config: VariantConfig = DEFAULT_CONFIG) {
    this.config = config
    const N = config.size
    this.grid = grid.map((row) => row.slice())
    this.candidates = Array.from({ length: N }, () =>
      Array.from({ length: N }, () => new Set<number>())
    )
    this.initCandidates()
  }

  private initCandidates(): void {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.grid[r][c] === 0) {
          this.candidates[r][c] = this.valuesAllowedByUnits(r, c)
        }
      }
    }
  }

  private valuesAllowedByUnits(r: number, c: number): Set<number> {
    const allowed = new Set<number>([1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const unit of unitsFor(r, c)) {
      for (const [rr, cc] of unit.cells) allowed.delete(this.grid[rr][cc])
    }
    return allowed
  }

  private handleUnitAfterPlacement(r: number, c: number, value: number): void {
    for (const unit of unitsFor(r, c)) {
      for (const [rr, cc] of unit.cells) {
        if (rr !== r || cc !== c) this.candidates[rr][cc].delete(value)
      }
    }
  }

  private syncFromGrid(): void {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.grid[r][c]) {
          this.candidates[r][c] = new Set()
        } else {
          const base = this.valuesAllowedByUnits(r, c)
          const current = this.candidates[r][c]
          current.forEach((v) => {
            if (!base.has(v)) current.delete(v)
          })
        }
      }
    }
  }

  solve(): SolveResult {
    this.syncFromGrid()
    let nextId = 1
    for (;;) {
      this.syncFromGrid()
      const empties = this.emptyCells()
      if (empties.length === 0) break

      const step = this.findLogicalStep() ?? this.guessStep()
      if (!step) break

      step.id = nextId++
      this.apply(step)
      this.steps.push(step)
    }
    return {
      steps: this.steps,
      solution: this.grid.map((row) => row.slice()),
      solved: this.emptyCells().length === 0,
    }
  }

  private emptyCells(): Cell[] {
    const out: Cell[] = []
    for (let r = 0; r < N; r++)
      for (let c = 0; c < N; c++)
        if (this.grid[r][c] === 0) out.push([r, c])
    return out
  }

  private apply(step: Step): void {
    if (step.placement) {
      const { row, col, value } = step.placement
      this.grid[row][col] = value
      this.candidates[row][col] = new Set()
      this.handleUnitAfterPlacement(row, col, value)
    }
    for (const [r, c, v] of step.eliminations) {
      this.candidates[r][c].delete(v)
    }
  }

  private findLogicalStep(): Step | null {
    const checks: Array<[() => Step | null, number]> = [
      [() => this.nakedSingle(), 1],
      [() => this.hiddenSingle(), 2],
      [() => this.nakedPair(), 3],
      [() => this.hiddenPair(), 4],
      [() => this.pointing(), 5],
      [() => this.boxLine(), 6],
      [() => this.nakedTriple(), 7],
      [() => this.xWing(), 8],
      [() => this.yWing(), 9],
      [() => this.swordfish(), 10],
    ]
    for (const [finder, rank] of checks) {
      const step = finder()
      if (step && (step.placement || step.eliminations.length > 0)) {
        step.rank = rank
        return step
      }
    }
    return null
  }

  private nakedSingle(): Step | null {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 1) {
          const v = Array.from(this.candidates[r][c])[0]
          const others: number[][] = []
          for (let x = 1; x <= 9; x++) if (x !== v) others.push([r, c, x])
          const place: Placement = { row: r, col: c, value: v }
          const peerValues = Array.from(this.peerValues(r, c)).sort((a, b) => a - b)
          const peerTxt = peerValues.map(String).join(', ')
          const sect = `${BOX_NAMES[boxOf(r, c)]} box, and crosses Row ${r + 1} and Column ${c + 1}`
          return {
            id: 0,
            technique: 'Naked Single',
            kind: 'placement',
            description: `${cellLabel(r, c)} (in the ${sect}) is the only place ${peerTxt} are blocked elsewhere, so only ${v} is still possible there. ${v} is placed.`,
            placement: place,
            focus: [[r, c]],
            eliminations: others,
            rank: 1,
          }
        }
      }
    }
    return null
  }

  private hiddenSingle(): Step | null {
    for (const unit of UNITS) {
      for (let v = 1; v <= 9; v++) {
        const holders: Cell[] = unit.cells.filter(
          ([r, c]) => this.grid[r][c] === 0 && this.candidates[r][c].has(v)
        )
        if (holders.length === 1) {
          const [r, c] = holders[0]
          const others = Array.from(this.candidates[r][c])
            .filter((x) => x !== v)
            .sort((a, b) => a - b)
            .map((x) => [r, c, x])
          const blocked = this.whyValueAbsent(v, unit, [r, c])
          let base = `Scanning the ${unit.label}, the number ${v} fits in exactly one empty cell, ${cellLabel(r, c)} (${BOX_NAMES[boxOf(r, c)]} box, crossing Row ${r + 1} and Column ${c + 1}).`
          if (blocked.length > 0) {
            base += ' It cannot be the others because of their blocking rows/columns/boxes: ' + blocked.join('; ') + '.'
          }
          base += others.length > 0
            ? ' That leaves only ' + v + ', so ' + v + ' is placed.'
            : ' So ' + v + ' is placed.'
          return {
            id: 0,
            technique: 'Hidden Single',
            kind: 'placement',
            description: base,
            placement: { row: r, col: c, value: v },
            focus: holders,
            eliminations: others,
            rank: 2,
          }
        }
      }
    }
    return null
  }

  private whyValueAbsent(v: number, unit: StandardUnit, target: Cell): string[] {
    const reasons: string[] = []
    for (const [r, c] of unit.cells) {
      if (r === target[0] && c === target[1]) continue
      if (this.grid[r][c] !== 0) continue
      for (const peer of unitsFor(r, c)) {
        if (peer.cells.some(([rr, cc]) => this.grid[rr][cc] === v)) {
          reasons.push(`${cellLabel(r, c)} cannot take ${v} because the ${peer.label} already has it`)
          break
        }
      }
    }
    return reasons.slice(0, 2)
  }

  private nakedPair(): Step | null {
    for (const unit of UNITS) {
      const empties = unit.cells.filter(([r, c]) => this.grid[r][c] === 0)
      const pairs = empties.filter(([r, c]) => this.candidates[r][c].size === 2)
      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const a = pairs[i]
          const b = pairs[j]
          if (!setsEqual(this.candidates[a[0]][a[1]], this.candidates[b[0]][b[1]])) continue
          const vals = Array.from(this.candidates[a[0]][a[1]]).sort((x, y) => x - y)
          const v1 = vals[0]
          const v2 = vals[1]
          const targets: number[][] = []
          for (const [r, c] of empties) {
            if ((r === a[0] && c === a[1]) || (r === b[0] && c === b[1])) continue
            if (this.candidates[r][c].has(v1)) targets.push([r, c, v1])
            if (this.candidates[r][c].has(v2)) targets.push([r, c, v2])
          }
          if (targets.length === 0) continue
          return {
            id: 0,
            technique: 'Naked Pair',
            kind: 'elimination',
            description: `In the ${unit.label}, the only places ${v1} and ${v2} can sit are ${cellLabel(a[0], a[1])} and ${cellLabel(b[0], b[1])} (both cells hold only these two values). Together they use up both ${v1} and ${v2}, so no other cell in the ${unit.label} may contain them.`,
            placement: null,
            focus: [a, b],
            eliminations: targets,
            rank: 3,
          }
        }
      }
    }
    return null
  }

  private hiddenPair(): Step | null {
    for (const unit of UNITS) {
      const empties = unit.cells.filter(([r, c]) => this.grid[r][c] === 0)
      for (let v1 = 1; v1 <= 9; v1++) {
        const h1 = empties.filter(([r, c]) => this.candidates[r][c].has(v1))
        if (h1.length !== 2) continue
        for (let v2 = v1 + 1; v2 <= 9; v2++) {
          const h2 = empties.filter(([r, c]) => this.candidates[r][c].has(v2))
          if (!sameCells(h1, h2)) continue
          const a = h1[0]
          const b = h1[1]
          const extraA = Array.from(this.candidates[a[0]][a[1]])
            .filter((x) => x !== v1 && x !== v2)
            .map((x) => [a[0], a[1], x])
          const extraB = Array.from(this.candidates[b[0]][b[1]])
            .filter((x) => x !== v1 && x !== v2)
            .map((x) => [b[0], b[1], x])
          const targets = [...extraA, ...extraB]
          if (targets.length === 0) continue
          const valsText = comma(targetsValues(targets))
          return {
            id: 0,
            technique: 'Hidden Pair',
            kind: 'elimination',
            description: `In the ${unit.label}, ${v1} and ${v2} each have only the same two possible spots, ${cellLabel(a[0], a[1])} and ${cellLabel(b[0], b[1])}. These two cells must hold ${v1} and ${v2} (in some order), so the other candidates ${valsText} inside them are impossible.`,
            placement: null,
            focus: [a, b],
            eliminations: targets,
            rank: 4,
          }
        }
      }
    }
    return null
  }

  private pointing(): Step | null {
    for (let b = 0; b < N; b++) {
      const box = BOXES[b]
      const label = `the ${BOX_NAMES[b]} box`
      const empties = box.filter(([r, c]) => this.grid[r][c] === 0)
      for (let v = 1; v <= 9; v++) {
        const holders = empties.filter(([r, c]) => this.candidates[r][c].has(v))
        if (holders.length < 2 || holders.length > 3) continue
        const rows = new Set(holders.map(([r]) => r))
        const cols = new Set(holders.map(([, c]) => c))
        if (rows.size === 1) {
          const row = Array.from(rows)[0]! // rows.size === 1 guarantees an element
          const outside: number[][] = []
          for (const [r, c] of ROWS[row]) {
            if (!holders.some(([hr, hc]) => hr === r && hc === c) && this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
              outside.push([r, c, v])
            }
          }
          if (outside.length > 0) {
            return {
              id: 0,
              technique: 'Pointing Pair/Triple',
              kind: 'elimination',
              description: `Inside ${label}, the number ${v} is confined to one row (Row ${row + 1}), in cells ${cellsText(holders)}. Because one of these must be ${v}, ${v} is eliminated from the rest of Row ${row + 1}.`,
              placement: null,
              focus: holders,
              eliminations: outside,
              rank: 5,
            }
          }
        }
        if (cols.size === 1) {
          const col = Array.from(cols)[0]! // cols.size === 1 guarantees an element
          const outside: number[][] = []
          for (const [r, c] of COLS[col]) {
            if (!holders.some(([hr, hc]) => hr === r && hc === c) && this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
              outside.push([r, c, v])
            }
          }
          if (outside.length > 0) {
            return {
              id: 0,
              technique: 'Pointing Pair/Triple',
              kind: 'elimination',
              description: `Inside ${label}, the number ${v} is confined to one column (Column ${col + 1}), in cells ${cellsText(holders)}. One of these must be ${v}, so ${v} is eliminated from the rest of Column ${col + 1}.`,
              placement: null,
              focus: holders,
              eliminations: outside,
              rank: 5,
            }
          }
        }
      }
    }
    return null
  }

  private boxLine(): Step | null {
    for (const unit of UNITS) {
      if (unit.kind === 'box') continue
      const empties = unit.cells.filter(([r, c]) => this.grid[r][c] === 0)
      for (let v = 1; v <= 9; v++) {
        const holders = empties.filter(([r, c]) => this.candidates[r][c].has(v))
        if (holders.length === 0) continue
        const boxes = new Set(holders.map(([r, c]) => boxOf(r, c)))
        if (boxes.size !== 1) continue
        const b = Array.from(boxes)[0]! // boxes.size === 1 guarantees an element
        const outside: number[][] = []
        for (const [r, c] of BOXES[b]) {
          if (!holders.some(([hr, hc]) => hr === r && hc === c) && this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
            outside.push([r, c, v])
          }
        }
        if (outside.length > 0) {
          return {
            id: 0,
            technique: 'Box-Line Reduction',
            kind: 'elimination',
            description: `Along ${unit.label}, every possible spot for ${v} is inside ${BOX_NAMES[b]} box (cells ${cellsText(holders)}). Wherever ${v} sits there, it fills that box's ${v}, so the other cells in the ${BOX_NAMES[b]} box cannot use ${v}.`,
            placement: null,
            focus: holders,
            eliminations: outside,
            rank: 6,
          }
        }
      }
    }
    return null
  }

  private nakedTriple(): Step | null {
    for (const unit of UNITS) {
      const empties = unit.cells.filter(([r, c]) => this.grid[r][c] === 0)
      if (empties.length < 3) continue
      for (let i = 0; i < empties.length; i++) {
        for (let j = i + 1; j < empties.length; j++) {
          for (let k = j + 1; k < empties.length; k++) {
            const a = empties[i]
            const b = empties[j]
            const d = empties[k]
            const unionSet = union(this.candidates[a[0]][a[1]], this.candidates[b[0]][b[1]], this.candidates[d[0]][d[1]])
            if (unionSet.size !== 3) continue
            if (![a, b, d].every((x) => {
              for (const v of this.candidates[x[0]][x[1]]) if (unionSet.has(v)) return true
              return false
            })) continue
            const targets: number[][] = []
            for (const [r, c] of empties) {
              if ([a, b, d].some((x) => x[0] === r && x[1] === c)) continue
              for (const v of Array.from(this.candidates[r][c])) {
                if (unionSet.has(v)) targets.push([r, c, v])
              }
            }
            if (targets.length === 0) continue
            const vals = comma(Array.from(unionSet).sort((x, y) => x - y))
            return {
              id: 0,
              technique: 'Naked Triple',
              kind: 'elimination',
              description: `In the ${unit.label}, three cells ${cellsText([a, b, d])} can only contain the values ${vals}. Those three numbers fill those three cells (in some order), so they are removed from every other cell in the ${unit.label}.`,
              placement: null,
              focus: [a, b, d],
              eliminations: targets,
              rank: 7,
            }
          }
        }
      }
    }
    return null
  }

  private xWing(): Step | null {
    for (let ia = 0; ia < N; ia++) {
      for (let v = 1; v <= 9; v++) {
        const aCols = ROWS[ia].filter(([r, c]) => this.grid[r][c] === 0 && this.candidates[r][c].has(v))
        if (aCols.length !== 2) continue
        for (let ib = ia + 1; ib < N; ib++) {
          const bCols = ROWS[ib].filter(([r, c]) => this.grid[r][c] === 0 && this.candidates[r][c].has(v))
          if (bCols.length !== 2) continue
          const c1 = aCols[0][1]
          const c2 = aCols[1][1]
          const b1 = bCols[0][1]
          const b2 = bCols[1][1]
          if (c1 !== b1 || c2 !== b2) continue
          const targets: number[][] = []
          for (const col of [c1, c2]) {
            for (const [r, c] of COLS[col]) {
              if (r === ia || r === ib) continue
              if (this.grid[r][c] === 0 && this.candidates[r][c].has(v)) targets.push([r, c, v])
            }
          }
          if (targets.length > 0) {
            return {
              id: 0,
              technique: 'X-Wing',
              kind: 'elimination',
              description: `Rows ${ia + 1} and ${ib + 1} can each have ${v} in only two columns (${c1 + 1} and ${c2 + 1}). An X-Wing forms: ${v} must sit in exactly one cell of Row ${ia + 1} and one of Row ${ib + 1}, always in columns ${c1 + 1} or ${c2 + 1}. Those columns are therefore 'claimed', and ${v} is eliminated from their other rows.`,
              placement: null,
              focus: [aCols[0], aCols[1], bCols[0], bCols[1]],
              eliminations: targets,
              rank: 8,
            }
          }
        }
      }
    }
    return null
  }

  private yWing(): Step | null {
    for (let pr = 0; pr < N; pr++) {
      for (let pc = 0; pc < N; pc++) {
        if (this.grid[pr][pc] !== 0 || this.candidates[pr][pc].size !== 2) continue
        const [x, y] = Array.from(this.candidates[pr][pc])

        const peers: Cell[] = []
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (r === pr && c === pc) continue
            if (this.grid[r][c] !== 0 || this.candidates[r][c].size !== 2) continue
            if (r === pr || c === pc || boxOf(r, c) === boxOf(pr, pc)) {
              peers.push([r, c])
            }
          }
        }

        for (let i = 0; i < peers.length; i++) {
          const [r1, c1] = peers[i]
          const cand1 = this.candidates[r1][c1]
          for (let j = i + 1; j < peers.length; j++) {
            const [r2, c2] = peers[j]
            const cand2 = this.candidates[r2][c2]

            let z: number | null = null
            if (cand1.has(x) && !cand1.has(y) && cand2.has(y) && !cand2.has(x)) {
              const z1 = Array.from(cand1).find((v) => v !== x)!
              const z2 = Array.from(cand2).find((v) => v !== y)!
              if (z1 === z2) z = z1
            } else if (cand1.has(y) && !cand1.has(x) && cand2.has(x) && !cand2.has(y)) {
              const z1 = Array.from(cand1).find((v) => v !== y)!
              const z2 = Array.from(cand2).find((v) => v !== x)!
              if (z1 === z2) z = z1
            }

            if (z === null) continue

            const targets: number[][] = []
            for (let r = 0; r < N; r++) {
              for (let c = 0; c < N; c++) {
                if ((r === pr && c === pc) || (r === r1 && c === c1) || (r === r2 && c === c2)) continue
                if (this.grid[r][c] !== 0 || !this.candidates[r][c].has(z)) continue

                const seesPincer1 = r === r1 || c === c1 || boxOf(r, c) === boxOf(r1, c1)
                const seesPincer2 = r === r2 || c === c2 || boxOf(r, c) === boxOf(r2, c2)

                if (seesPincer1 && seesPincer2) {
                  targets.push([r, c, z])
                }
              }
            }

            if (targets.length > 0) {
              return {
                id: 0,
                technique: 'Y-Wing (XY-Wing)',
                kind: 'elimination',
                description: `A Y-Wing forms with pivot at ${cellLabel(pr, pc)} [${x},${y}] and pincers at ${cellLabel(r1, c1)} and ${cellLabel(r2, c2)}. One pincer must contain ${z}, eliminating ${z} from cells that see both pincers.`,
                placement: null,
                focus: [[pr, pc], [r1, c1], [r2, c2]],
                eliminations: targets,
                rank: 9,
              }
            }
          }
        }
      }
    }
    return null
  }

  private swordfish(): Step | null {
    for (let v = 1; v <= 9; v++) {
      const rowCandCols: { row: number; cols: number[] }[] = []
      for (let r = 0; r < N; r++) {
        const cols: number[] = []
        for (let c = 0; c < N; c++) {
          if (this.grid[r][c] === 0 && this.candidates[r][c].has(v)) cols.push(c)
        }
        if (cols.length >= 2 && cols.length <= 3) {
          rowCandCols.push({ row: r, cols })
        }
      }

      if (rowCandCols.length < 3) continue

      for (let i = 0; i < rowCandCols.length; i++) {
        for (let j = i + 1; j < rowCandCols.length; j++) {
          for (let k = j + 1; k < rowCandCols.length; k++) {
            const r1 = rowCandCols[i]
            const r2 = rowCandCols[j]
            const r3 = rowCandCols[k]

            const allCols = Array.from(new Set([...r1.cols, ...r2.cols, ...r3.cols])).sort((a, b) => a - b)
            if (allCols.length !== 3) continue

            const targets: number[][] = []
            for (const col of allCols) {
              for (let r = 0; r < N; r++) {
                if (r === r1.row || r === r2.row || r === r3.row) continue
                if (this.grid[r][col] === 0 && this.candidates[r][col].has(v)) {
                  targets.push([r, col, v])
                }
              }
            }

            if (targets.length > 0) {
              const focusCells: Cell[] = []
              for (const rc of [r1, r2, r3]) {
                for (const c of rc.cols) focusCells.push([rc.row, c])
              }

              return {
                id: 0,
                technique: 'Swordfish',
                kind: 'elimination',
                description: `Rows ${r1.row + 1}, ${r2.row + 1}, and ${r3.row + 1} restrict candidate ${v} to Columns ${allCols.map((c) => c + 1).join(', ')}. A Swordfish pattern eliminates ${v} from those columns in all other rows.`,
                placement: null,
                focus: focusCells,
                eliminations: targets,
                rank: 10,
              }
            }
          }
        }
      }
    }
    return null
  }

  private guessStep(): Step | null {
    let best: Cell | null = null
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (this.grid[r][c] !== 0) continue
        if (!best || this.candidates[r][c].size < this.candidates[best[0]][best[1]].size) best = [r, c]
      }
    }
    if (!best) return null
    const [r, c] = best
    const vals = Array.from(this.candidates[r][c]).sort((a, b) => a - b)
    for (const v of vals) {
      const trial = this.grid.map((row) => row.slice())
      trial[r][c] = v
      if (backtrack(trial)) {
        return {
          id: 0,
          technique: 'Guided Trial',
          kind: 'guess',
          description: `Logical techniques are exhausted, so I pick the most constrained cell, ${cellLabel(r, c)}, and try ${v}. Testing it lets the rest of the puzzle solve without conflict, so ${v} is confirmed.`,
          placement: { row: r, col: c, value: v },
          focus: [[r, c]],
          eliminations: vals.filter((x) => x !== v).map((x) => [r, c, x]),
          rank: 9,
        }
      }
    }
    return null
  }

  private peerValues(r: number, c: number): Set<number> {
    const used = new Set<number>()
    for (const unit of unitsFor(r, c)) {
      for (const [rr, cc] of unit.cells) used.add(this.grid[rr][cc])
    }
    used.delete(0)
    return used
  }
}

function cellsText(cells: Cell[]): string {
  if (cells.length === 1) return cellLabel(cells[0][0], cells[0][1])
  return cells.map(([r, c]) => cellLabel(r, c)).join(', ')
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function sameCells(a: Cell[], b: Cell[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++)
    if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false
  return true
}

export function backtrack(grid: Board): boolean {
  let best: { r: number; c: number; cand: number[] } | null = null
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c] !== 0) continue
      const used = new Set<number>()
      for (let i = 0; i < N; i++) {
        used.add(grid[r][i])
        used.add(grid[i][c])
      }
      const br = Math.floor(r / 3) * 3
      const bc = Math.floor(c / 3) * 3
      for (let i = br; i < br + 3; i++)
        for (let j = bc; j < bc + 3; j++) used.add(grid[i][j])
      const cand = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => !used.has(v))
      if (!best || cand.length < best.cand.length) best = { r, c, cand }
    }
  }
  if (!best) return true
  const { r, c, cand } = best
  for (const v of cand) {
    grid[r][c] = v
    if (backtrack(grid)) return true
    grid[r][c] = 0
  }
  grid[r][c] = 0
  return false
}