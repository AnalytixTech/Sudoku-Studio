import { memo } from 'react'

interface CandidatesProps {
  values: number[]
  userNotes?: Set<number>
  strike?: Set<number>
  highlightDigit: number
  selected: boolean
  isSolverStep: boolean
  size: number
}

function Candidates({ values, userNotes, strike, highlightDigit, selected, isSolverStep, size }: CandidatesProps) {
  const cells = []
  const hasUserNotes = userNotes !== undefined && userNotes.size > 0
  // Keep the pip grid as square as the digit count allows (4 -> 2 cols, 6/8/9 -> 3).
  const pipStyle = { gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(size))}, 1fr)` }

  // Do not show faded auto-candidates initially unless user has notes or a solver step is active
  if (!hasUserNotes && !isSolverStep) {
    return <div className="pips" style={pipStyle} />
  }

  for (let v = 1; v <= size; v++) {
    const has = hasUserNotes ? userNotes.has(v) : values.includes(v)
    const struck = strike?.has(v)
    const hi = highlightDigit === v
    cells.push(
      <span
        key={v}
        className={[
          'pip',
          has ? 'pip-on' : 'pip-off',
          hasUserNotes ? 'pip-user' : '',
          struck ? 'pip-struck' : '',
          hi && has ? 'pip-hot' : '',
          selected && has ? 'pip-sel' : '',
        ].join(' ')}
      >
        {has ? v : ''}
      </span>
    )
  }
  return <div className="pips" style={pipStyle}>{cells}</div>
}

export interface CellProps {
  r: number
  c: number
  value: number
  isGiven: boolean
  selected: boolean
  peer: 'row' | 'col' | 'box' | null
  sameValue: boolean
  conflict: boolean
  focus: boolean
  placement: boolean
  stepRow?: boolean
  stepCol?: boolean
  stepBox?: boolean
  lineCleared?: boolean
  borderRightThick?: boolean
  borderBottomThick?: boolean
  strike?: Set<number>
  candidates?: number[]
  userNotes?: Set<number>
  showNotes: boolean
  highlightDigit: number
  size: number
  onSelect: (r: number, c: number) => void
}

function Cell({
  r,
  c,
  value,
  isGiven,
  selected,
  peer,
  sameValue,
  conflict,
  focus,
  placement,
  stepRow,
  stepCol,
  stepBox,
  lineCleared,
  borderRightThick,
  borderBottomThick,
  strike,
  candidates,
  userNotes,
  showNotes,
  highlightDigit,
  size,
  onSelect,
}: CellProps) {
  let cls = 'cell'
  if (selected) cls += ' cell-selected'
  if (peer === 'row') cls += ' peer-row'
  else if (peer === 'col') cls += ' peer-col'
  else if (peer === 'box') cls += ' peer-box'

  if (stepRow) cls += ' step-row'
  if (stepCol) cls += ' step-col'
  if (stepBox) cls += ' step-box'
  if (lineCleared) cls += ' line-cleared'

  if (borderRightThick) cls += ' border-right-thick'
  if (borderBottomThick) cls += ' border-bottom-thick'

  if (sameValue) cls += ' cell-same'
  if (conflict) cls += ' cell-conflict'
  if (focus) cls += ' cell-focus'
  if (placement) cls += ' cell-placement'
  if (isGiven) cls += ' cell-given'

  const isSolverStep = Boolean(strike || focus || placement || stepRow || stepCol || stepBox)

  return (
    <button
      className={cls}
      onClick={() => onSelect(r, c)}
      data-rc={`${r},${c}`}
    >
      {value ? (
        <span key={isGiven ? `g-${value}` : `u-${value}`} className={isGiven ? 'num given' : 'num user-num'}>
          {value}
        </span>
      ) : showNotes ? (
        <Candidates
          values={candidates || []}
          userNotes={userNotes}
          strike={strike}
          highlightDigit={highlightDigit}
          selected={selected}
          isSolverStep={isSolverStep}
          size={size}
        />
      ) : (
        <span className="num empty" />
      )}
    </button>
  )
}

export default memo(Cell)