import { DEFAULT_CONFIG, boxCells, boxIndex, type VariantConfig } from '../sudoku'

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

// Positional words for box naming, indexed by how many box bands a variant has.
const BANDS: Record<number, string[]> = {
  2: ['top', 'bottom'],
  3: ['top', 'middle', 'bottom'],
}
const FILES: Record<number, string[]> = {
  2: ['left', 'right'],
  3: ['left', 'center', 'right'],
}

/**
 * A complete noun phrase for a box/region, with no leading article to add:
 * "the top-left box" for grids whose boxes form a 2x2..3x3 arrangement,
 * "region 4" for jigsaw variants and any other box layout.
 */
function boxPhraseFor(b: number, config: VariantConfig): string {
  if (config.isIrregular) return `region ${b + 1}`
  const perRow = config.size / config.boxWidth
  const perCol = config.size / config.boxHeight
  const bands = BANDS[perCol]
  const files = FILES[perRow]
  if (!bands || !files) return `region ${b + 1}`
  return `the ${bands[Math.floor(b / perRow)]}-${files[b % perRow]} box`
}

interface StandardUnit {
  cells: Cell[]
  label: string
  kind: 'row' | 'col' | 'box'
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

export class SudokuSolver {
  grid: Board
  candidates: Set<number>[][]
  steps: Step[] = []
  config: VariantConfig

  private N: number
  private rows: Cell[][]
  private cols: Cell[][]
  private boxes: Cell[][]
  private units: StandardUnit[]

  constructor(grid: Board, config: VariantConfig = DEFAULT_CONFIG) {
    this.config = config
    const N = config.size
    this.N = N
    this.grid = grid.map((row) => row.slice())
    this.candidates = Array.from({ length: N }, () =>
      Array.from({ length: N }, () => new Set<number>())
    )

    this.rows = Array.from({ length: N }, (_, r) =>
      Array.from({ length: N }, (_, c) => [r, c] as Cell)
    )
    this.cols = Array.from({ length: N }, (_, c) =>
      Array.from({ length: N }, (_, r) => [r, c] as Cell)
    )
    this.boxes = Array.from({ length: N }, (_, b) => boxCells(b, config) as Cell[])

    this.units = [
      ...this.rows.map((cells, r) => ({ cells, label: `Row ${r + 1}`, kind: 'row' as const })),
      ...this.cols.map((cells, c) => ({ cells, label: `Column ${c + 1}`, kind: 'col' as const })),
      ...this.boxes.map((cells, b) => ({
        cells,
        label: boxPhraseFor(b, config),
        kind: 'box' as const,
      })),
    ]

    this.initCandidates()
  }

  private boxOf(r: number, c: number): number {
    return boxIndex(r, c, this.config)
  }

  private boxPhrase(b: number): string {
    return boxPhraseFor(b, this.config)
  }

  private unitsFor(r: number, c: number): StandardUnit[] {
    const N = this.N
    return [this.units[r], this.units[N + c], this.units[2 * N + this.boxOf(r, c)]]
  }

  private allValues(): number[] {
    return Array.from({ length: this.N }, (_, i) => i + 1)
  }

  private initCandidates(): void {
    for (let r = 0; r < this.N; r++) {
      for (let c = 0; c < this.N; c++) {
        if (this.grid[r][c] === 0) {
          this.candidates[r][c] = this.valuesAllowedByUnits(r, c)
        }
      }
    }
  }

  private valuesAllowedByUnits(r: number, c: number): Set<number> {
    const allowed = new Set<number>(this.allValues())
    for (const unit of this.unitsFor(r, c)) {
      for (const [rr, cc] of unit.cells) allowed.delete(this.grid[rr][cc])
    }
    return allowed
  }

  private handleUnitAfterPlacement(r: number, c: number, value: number): void {
    for (const unit of this.unitsFor(r, c)) {
      for (const [rr, cc] of unit.cells) {
        if (rr !== r || cc !== c) this.candidates[rr][cc].delete(value)
      }
    }
  }

  private syncFromGrid(): void {
    for (let r = 0; r < this.N; r++) {
      for (let c = 0; c < this.N; c++) {
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
    for (let r = 0; r < this.N; r++)
      for (let c = 0; c < this.N; c++)
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
    for (let r = 0; r < this.N; r++) {
      for (let c = 0; c < this.N; c++) {
        if (this.grid[r][c] === 0 && this.candidates[r][c].size === 1) {
          const v = Array.from(this.candidates[r][c])[0]
          const others: number[][] = []
          for (const x of this.allValues()) if (x !== v) others.push([r, c, x])
          const place: Placement = { row: r, col: c, value: v }
          const peerValues = Array.from(this.peerValues(r, c)).sort((a, b) => a - b)
          const peerTxt = peerValues.map(String).join(', ')
          const sect = `${this.boxPhrase(this.boxOf(r, c))}, and crosses Row ${r + 1} and Column ${c + 1}`
          return {
            id: 0,
            technique: 'Naked Single',
            kind: 'placement',
            description: `${cellLabel(r, c)} (in ${sect}) is the only place ${peerTxt} are blocked elsewhere, so only ${v} is still possible there. ${v} is placed.`,
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
    for (const unit of this.units) {
      for (const v of this.allValues()) {
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
          let base = `Scanning ${unit.label}, the number ${v} fits in exactly one empty cell, ${cellLabel(r, c)} (${this.boxPhrase(this.boxOf(r, c))}, crossing Row ${r + 1} and Column ${c + 1}).`
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
      for (const peer of this.unitsFor(r, c)) {
        if (peer.cells.some(([rr, cc]) => this.grid[rr][cc] === v)) {
          reasons.push(`${cellLabel(r, c)} cannot take ${v} because ${peer.label} already has it`)
          break
        }
      }
    }
    return reasons.slice(0, 2)
  }

  private nakedPair(): Step | null {
    for (const unit of this.units) {
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
            description: `In ${unit.label}, the only places ${v1} and ${v2} can sit are ${cellLabel(a[0], a[1])} and ${cellLabel(b[0], b[1])} (both cells hold only these two values). Together they use up both ${v1} and ${v2}, so no other cell in ${unit.label} may contain them.`,
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
    const values = this.allValues()
    for (const unit of this.units) {
      const empties = unit.cells.filter(([r, c]) => this.grid[r][c] === 0)
      for (const v1 of values) {
        const h1 = empties.filter(([r, c]) => this.candidates[r][c].has(v1))
        if (h1.length !== 2) continue
        for (const v2 of values) {
          if (v2 <= v1) continue
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
            description: `In ${unit.label}, ${v1} and ${v2} each have only the same two possible spots, ${cellLabel(a[0], a[1])} and ${cellLabel(b[0], b[1])}. These two cells must hold ${v1} and ${v2} (in some order), so the other candidates ${valsText} inside them are impossible.`,
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
    for (let b = 0; b < this.N; b++) {
      const box = this.boxes[b]
      const label = this.boxPhrase(b)
      const empties = box.filter(([r, c]) => this.grid[r][c] === 0)
      for (const v of this.allValues()) {
        const holders = empties.filter(([r, c]) => this.candidates[r][c].has(v))
        if (holders.length < 2 || holders.length > 3) continue
        const rows = new Set(holders.map(([r]) => r))
        const cols = new Set(holders.map(([, c]) => c))
        if (rows.size === 1) {
          const row = Array.from(rows)[0]! // rows.size === 1 guarantees an element
          const outside: number[][] = []
          for (const [r, c] of this.rows[row]) {
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
          for (const [r, c] of this.cols[col]) {
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
    for (const unit of this.units) {
      if (unit.kind === 'box') continue
      const empties = unit.cells.filter(([r, c]) => this.grid[r][c] === 0)
      for (const v of this.allValues()) {
        const holders = empties.filter(([r, c]) => this.candidates[r][c].has(v))
        if (holders.length === 0) continue
        const boxes = new Set(holders.map(([r, c]) => this.boxOf(r, c)))
        if (boxes.size !== 1) continue
        const b = Array.from(boxes)[0]! // boxes.size === 1 guarantees an element
        const label = this.boxPhrase(b)
        const outside: number[][] = []
        for (const [r, c] of this.boxes[b]) {
          if (!holders.some(([hr, hc]) => hr === r && hc === c) && this.grid[r][c] === 0 && this.candidates[r][c].has(v)) {
            outside.push([r, c, v])
          }
        }
        if (outside.length > 0) {
          return {
            id: 0,
            technique: 'Box-Line Reduction',
            kind: 'elimination',
            description: `Along ${unit.label}, every possible spot for ${v} is inside ${label} (cells ${cellsText(holders)}). Wherever ${v} sits there, it fills that region's ${v}, so the other cells in ${label} cannot use ${v}.`,
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
    for (const unit of this.units) {
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
              description: `In ${unit.label}, three cells ${cellsText([a, b, d])} can only contain the values ${vals}. Those three numbers fill those three cells (in some order), so they are removed from every other cell in ${unit.label}.`,
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
    for (let ia = 0; ia < this.N; ia++) {
      for (const v of this.allValues()) {
        const aCols = this.rows[ia].filter(([r, c]) => this.grid[r][c] === 0 && this.candidates[r][c].has(v))
        if (aCols.length !== 2) continue
        for (let ib = ia + 1; ib < this.N; ib++) {
          const bCols = this.rows[ib].filter(([r, c]) => this.grid[r][c] === 0 && this.candidates[r][c].has(v))
          if (bCols.length !== 2) continue
          const c1 = aCols[0][1]
          const c2 = aCols[1][1]
          const b1 = bCols[0][1]
          const b2 = bCols[1][1]
          if (c1 !== b1 || c2 !== b2) continue
          const targets: number[][] = []
          for (const col of [c1, c2]) {
            for (const [r, c] of this.cols[col]) {
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
    for (let pr = 0; pr < this.N; pr++) {
      for (let pc = 0; pc < this.N; pc++) {
        if (this.grid[pr][pc] !== 0 || this.candidates[pr][pc].size !== 2) continue
        const [x, y] = Array.from(this.candidates[pr][pc])

        const peers: Cell[] = []
        for (let r = 0; r < this.N; r++) {
          for (let c = 0; c < this.N; c++) {
            if (r === pr && c === pc) continue
            if (this.grid[r][c] !== 0 || this.candidates[r][c].size !== 2) continue
            if (r === pr || c === pc || this.boxOf(r, c) === this.boxOf(pr, pc)) {
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
            for (let r = 0; r < this.N; r++) {
              for (let c = 0; c < this.N; c++) {
                if ((r === pr && c === pc) || (r === r1 && c === c1) || (r === r2 && c === c2)) continue
                if (this.grid[r][c] !== 0 || !this.candidates[r][c].has(z)) continue

                const seesPincer1 = r === r1 || c === c1 || this.boxOf(r, c) === this.boxOf(r1, c1)
                const seesPincer2 = r === r2 || c === c2 || this.boxOf(r, c) === this.boxOf(r2, c2)

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
    for (const v of this.allValues()) {
      const rowCandCols: { row: number; cols: number[] }[] = []
      for (let r = 0; r < this.N; r++) {
        const cols: number[] = []
        for (let c = 0; c < this.N; c++) {
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
              for (let r = 0; r < this.N; r++) {
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
    for (let r = 0; r < this.N; r++) {
      for (let c = 0; c < this.N; c++) {
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
      if (backtrack(trial, this.config)) {
        return {
          id: 0,
          technique: 'Guided Trial',
          kind: 'guess',
          description: `Logical techniques are exhausted, so I pick the most constrained cell, ${cellLabel(r, c)}, and try ${v}. Testing it lets the rest of the puzzle solve without conflict, so ${v} is confirmed.`,
          placement: { row: r, col: c, value: v },
          focus: [[r, c]],
          eliminations: vals.filter((x) => x !== v).map((x) => [r, c, x]),
          rank: 11,
        }
      }
    }
    return null
  }

  private peerValues(r: number, c: number): Set<number> {
    const used = new Set<number>()
    for (const unit of this.unitsFor(r, c)) {
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

export function backtrack(grid: Board, config: VariantConfig = DEFAULT_CONFIG): boolean {
  const N = config.size
  let best: { r: number; c: number; cand: number[] } | null = null
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (grid[r][c] !== 0) continue
      const used = new Set<number>()
      for (let i = 0; i < N; i++) {
        used.add(grid[r][i])
        used.add(grid[i][c])
      }
      for (const [rr, cc] of boxCells(boxIndex(r, c, config), config)) {
        used.add(grid[rr][cc])
      }
      const cand: number[] = []
      for (let v = 1; v <= N; v++) if (!used.has(v)) cand.push(v)
      if (!best || cand.length < best.cand.length) best = { r, c, cand }
    }
  }
  if (!best) return true
  const { r, c, cand } = best
  for (const v of cand) {
    grid[r][c] = v
    if (backtrack(grid, config)) return true
    grid[r][c] = 0
  }
  grid[r][c] = 0
  return false
}
