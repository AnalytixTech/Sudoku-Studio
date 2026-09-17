import { memo } from 'react'
import Cell from './Cell'
import { DEFAULT_CONFIG, boxIndex, type Grid, type VariantConfig } from '../sudoku'

function peerKind(
  sel: string | null,
  r: number,
  c: number,
  config: VariantConfig
): 'row' | 'col' | 'box' | null {
  if (!sel) return null
  const [sr, sc] = sel.split(',').map(Number)
  if (sr === r) return c === sc ? null : 'row'
  if (sc === c) return 'col'
  if (boxIndex(sr, sc, config) === boxIndex(r, c, config)) return 'box'
  return null
}

export interface BoardProps {
  grid: Grid
  original: Grid
  selected: string | null
  candidates: number[][][]
  userNotes?: Record<string, Set<number>>
  showNotes: boolean
  conflictSet: Set<string>
  focusCells: string[]
  placementCell: string | null
  strikeMap: Map<string, Set<number>>
  stepRows?: Set<number>
  stepCols?: Set<number>
  stepBoxes?: Set<number>
  clearedRows?: Set<number>
  clearedCols?: Set<number>
  clearedBoxes?: Set<number>
  digitHighlight: number
  config?: VariantConfig
  onSelect: (r: number, c: number) => void
}

function Board({
  grid,
  original,
  selected,
  candidates,
  userNotes,
  showNotes,
  conflictSet,
  focusCells,
  placementCell,
  strikeMap,
  stepRows,
  stepCols,
  stepBoxes,
  clearedRows,
  clearedCols,
  clearedBoxes,
  digitHighlight,
  config = DEFAULT_CONFIG,
  onSelect,
}: BoardProps) {
  const [sr, sc] = selected ? selected.split(',').map(Number) : [-1, -1]
  const selectedValue = sr >= 0 && sr < grid.length && sc >= 0 && sc < grid[sr].length ? grid[sr][sc] : 0

  return (
    <div
      className={`board board-${config.id}`}
      style={{ gridTemplateColumns: `repeat(${config.size}, 1fr)` }}
    >
      {grid.map((row, r) => (
        <div className="board-row" key={r}>
          {row.map((v, c) => {
            const key = `${r},${c}`
            const b = boxIndex(r, c, config)

            const isBoxRight =
              config.isIrregular && config.regionMap
                ? c < config.size - 1 && boxIndex(r, c, config) !== boxIndex(r, c + 1, config)
                : (c + 1) % config.boxWidth === 0 && c < config.size - 1

            const isBoxBottom =
              config.isIrregular && config.regionMap
                ? r < config.size - 1 && boxIndex(r, c, config) !== boxIndex(r + 1, c, config)
                : (r + 1) % config.boxHeight === 0 && r < config.size - 1

            const lineCleared = Boolean(clearedRows?.has(r) || clearedCols?.has(c) || clearedBoxes?.has(b))

            return (
              <Cell
                key={key}
                r={r}
                c={c}
                value={v}
                isGiven={original[r] && original[r][c] !== 0}
                selected={selected === key}
                peer={peerKind(selected, r, c, config)}
                sameValue={selectedValue !== 0 && v !== 0 && v === selectedValue}
                conflict={conflictSet.has(key)}
                focus={focusCells.indexOf(key) !== -1}
                placement={placementCell === key}
                stepRow={stepRows?.has(r)}
                stepCol={stepCols?.has(c)}
                stepBox={stepBoxes?.has(b)}
                lineCleared={lineCleared}
                borderRightThick={isBoxRight}
                borderBottomThick={isBoxBottom}
                strike={strikeMap.get(key)}
                candidates={candidates[r] ? candidates[r][c] : []}
                userNotes={userNotes?.[key]}
                showNotes={showNotes}
                highlightDigit={digitHighlight}
                size={config.size}
                onSelect={onSelect}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default memo(Board)