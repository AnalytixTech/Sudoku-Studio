import { memo } from 'react'
import {
  IconPencil,
  IconLightbulb,
  IconUndo,
  IconRedo,
  IconErase,
  IconSparkles,
  IconTrash,
  IconCheck,
} from './Icons'

export interface KeypadProps {
  digitCounts: Record<number, number>
  digitHighlight: number
  noteMode: boolean
  canUndo: boolean
  canRedo: boolean
  size?: number
  onDigitHover: (v: number) => void
  onDigit: (v: number) => void
  onErase: () => void
  onToggleNoteMode: () => void
  onHint?: () => void
  onUndo: () => void
  onRedo: () => void
  onAutoNotes: () => void
  onClearNotes: () => void
  disabled: boolean
}

function Keypad({
  digitCounts,
  digitHighlight,
  noteMode,
  canUndo,
  canRedo,
  size = 9,
  onDigitHover,
  onDigit,
  onErase,
  onToggleNoteMode,
  onHint,
  onUndo,
  onRedo,
  onAutoNotes,
  onClearNotes,
  disabled,
}: KeypadProps) {
  const buttons = []
  for (let v = 1; v <= size; v++) {
    const remaining = size - (digitCounts[v] || 0)
    const completed = remaining === 0

    buttons.push(
      <button
        key={v}
        className={[
          'key',
          digitHighlight === v ? 'key-hot' : '',
          completed ? 'key-complete' : '',
          noteMode ? 'key-note-mode' : '',
        ].join(' ')}
        onMouseEnter={() => onDigitHover(v)}
        onMouseLeave={() => onDigitHover(0)}
        onClick={() => onDigit(v)}
        disabled={disabled || completed}
        title={completed ? `All ${v}s placed` : `${remaining} remaining`}
      >
        <span className="key-val">{v}</span>
        <sup className="key-power">{completed ? <IconCheck size={10} /> : remaining}</sup>
      </button>
    )
  }

  return (
    <div className="keypad-container">
      <div className="keypad-toolbar">
        <button
          className={`key-btn ${noteMode ? 'active-note' : ''}`}
          onClick={onToggleNoteMode}
          disabled={disabled}
          title="Toggle Note Mode (N)"
        >
          <IconPencil size={15} /> Pencil {noteMode ? 'ON' : 'OFF'}
        </button>
        {onHint && (
          <button
            className="key-btn key-btn-hint"
            onClick={onHint}
            disabled={disabled}
            title="Get a logical move hint (H)"
          >
            <IconLightbulb size={15} /> Hint
          </button>
        )}
        <button className="key-btn" onClick={onUndo} disabled={disabled || !canUndo} title="Undo (Ctrl+Z)">
          <IconUndo size={15} /> Undo
        </button>
        <button className="key-btn" onClick={onRedo} disabled={disabled || !canRedo} title="Redo (Ctrl+Y)">
          <IconRedo size={15} /> Redo
        </button>
        <button className="key-btn" onClick={onErase} disabled={disabled} title="Erase cell digit/notes (Backspace)">
          <IconErase size={15} /> Erase
        </button>
      </div>

      <div className="keypad" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {buttons}
      </div>

      <div className="keypad-subtools">
        <button className="sub-btn" onClick={onAutoNotes} disabled={disabled} title="Fill all valid candidate notes">
          <IconSparkles size={14} /> Auto-Fill Notes
        </button>
        <button className="sub-btn" onClick={onClearNotes} disabled={disabled} title="Clear all pencil notes">
          <IconTrash size={14} /> Clear Notes
        </button>
      </div>
    </div>
  )
}

export default memo(Keypad)