import { useCallback, useRef, useState } from 'react'
import { type Rect, type GridLines } from '../lib/ocr'

export interface GridOverlayProps {
  image: HTMLImageElement
  bounds: Rect
  gridLines?: GridLines | null
  onApply: (img: HTMLImageElement, b: Rect, detected: boolean, lines?: GridLines | null) => void
  onManual?: () => void
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'col' | 'row'

const HANDLES: { mode: DragMode; cls: string }[] = [
  { mode: 'nw', cls: 'go-h go-nw' },
  { mode: 'ne', cls: 'go-h go-ne' },
  { mode: 'sw', cls: 'go-h go-sw' },
  { mode: 'se', cls: 'go-h go-se' },
  { mode: 'n', cls: 'go-h go-n' },
  { mode: 's', cls: 'go-h go-s' },
  { mode: 'w', cls: 'go-h go-w' },
  { mode: 'e', cls: 'go-h go-e' },
]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function defaultLines(): GridLines {
  return {
    rows: Array.from({ length: 10 }, (_, i) => i / 9),
    cols: Array.from({ length: 10 }, (_, i) => i / 9),
  }
}

export default function GridOverlay({ image, bounds, gridLines, onApply, onManual }: GridOverlayProps) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    mode: DragMode
    sx: number
    sy: number
    startRect: Rect
    startLines: GridLines
    lineIdx?: number
  } | null>(null)

  const [lines, setLines] = useState<GridLines>(() => gridLines || defaultLines())

  const ow = image.naturalWidth
  const oh = image.naturalHeight
  const inset = bounds && bounds.w > 0 && bounds.h > 0
    ? {
        left: `${(bounds.x / ow) * 100}%`,
        top: `${(bounds.y / oh) * 100}%`,
        width: `${(bounds.w / ow) * 100}%`,
        height: `${(bounds.h / oh) * 100}%`,
      }
    : null

  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget as HTMLDivElement
      const dataset = (e.target as HTMLElement).dataset
      const handle = dataset.handle
      const lineType = dataset.lineType
      const lineIdxStr = dataset.lineIdx

      let mode: DragMode = 'move'
      let lineIdx: number | undefined = undefined

      if (lineType === 'col' || lineType === 'row') {
        mode = lineType as DragMode
        lineIdx = Number(lineIdxStr)
      } else if (handle) {
        mode = handle as DragMode
      }

      const box = boxRef.current
      if (!box) return

      const startRect: Rect = bounds && bounds.w > 0 ? { ...bounds } : { x: 0, y: 0, w: ow, h: oh }
      const startLines: GridLines = {
        rows: (lines.rows || defaultLines().rows).slice(),
        cols: (lines.cols || defaultLines().cols).slice(),
      }

      dragRef.current = { mode, sx: e.clientX, sy: e.clientY, startRect, startLines, lineIdx }
      el.setPointerCapture(e.pointerId)
      onManual?.()
      e.preventDefault()
    },
    [bounds, lines, ow, oh, onManual]
  )

  const onMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      const box = boxRef.current
      if (!d || !box) return

      const r = box.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return

      const dx = ((e.clientX - d.sx) / r.width) * ow
      const dy = ((e.clientY - d.sy) / r.height) * oh
      const { startRect, startLines, mode, lineIdx } = d
      const min = Math.min(40, ow / 4, oh / 4)

      let { x, y, w, h } = startRect
      const updatedLines: GridLines = {
        rows: startLines.rows.slice(),
        cols: startLines.cols.slice(),
      }

      if (mode === 'move') {
        x = clamp(startRect.x + dx, 0, ow - w)
        y = clamp(startRect.y + dy, 0, oh - h)
      } else if (mode === 'nw') {
        const nx = clamp(startRect.x + dx, 0, startRect.x + startRect.w - min)
        const ny = clamp(startRect.y + dy, 0, startRect.y + startRect.h - min)
        x = nx
        y = ny
        w = startRect.x + startRect.w - nx
        h = startRect.y + startRect.h - ny
      } else if (mode === 'ne') {
        const ny = clamp(startRect.y + dy, 0, startRect.y + startRect.h - min)
        y = ny
        w = clamp(startRect.w + dx, min, ow - startRect.x)
        h = startRect.y + startRect.h - ny
      } else if (mode === 'sw') {
        const nx = clamp(startRect.x + dx, 0, startRect.x + startRect.w - min)
        x = nx
        w = startRect.x + startRect.w - nx
        h = clamp(startRect.h + dy, min, oh - startRect.y)
      } else if (mode === 'se') {
        w = clamp(startRect.w + dx, min, ow - startRect.x)
        h = clamp(startRect.h + dy, min, oh - startRect.y)
      } else if (mode === 'n') {
        const ny = clamp(startRect.y + dy, 0, startRect.y + startRect.h - min)
        y = ny
        h = startRect.y + startRect.h - ny
      } else if (mode === 's') {
        h = clamp(startRect.h + dy, min, oh - startRect.y)
      } else if (mode === 'w') {
        const nx = clamp(startRect.x + dx, 0, startRect.x + startRect.w - min)
        x = nx
        w = startRect.x + startRect.w - nx
      } else if (mode === 'e') {
        w = clamp(startRect.w + dx, min, ow - startRect.x)
      } else if (mode === 'col' && lineIdx != null) {
        // Drag individual vertical grid line
        const relDx = (e.clientX - d.sx) / (r.width * (w / ow))
        const prev = startLines.cols[lineIdx - 1] ?? 0
        const next = startLines.cols[lineIdx + 1] ?? 1
        updatedLines.cols[lineIdx] = clamp(startLines.cols[lineIdx] + relDx, prev + 0.02, next - 0.02)
        setLines(updatedLines)
      } else if (mode === 'row' && lineIdx != null) {
        // Drag individual horizontal grid line
        const relDy = (e.clientY - d.sy) / (r.height * (h / oh))
        const prev = startLines.rows[lineIdx - 1] ?? 0
        const next = startLines.rows[lineIdx + 1] ?? 1
        updatedLines.rows[lineIdx] = clamp(startLines.rows[lineIdx] + relDy, prev + 0.02, next - 0.02)
        setLines(updatedLines)
      }

      onApply(image, { x, y, w, h }, false, updatedLines)
    },
    [image, ow, oh, onApply]
  )

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    ;(e.currentTarget as HTMLDivElement).releasePointerCapture?.(e.pointerId)
    dragRef.current = null
  }, [])

  const resetUniformLines = useCallback(() => {
    const fresh = defaultLines()
    setLines(fresh)
    if (bounds) onApply(image, bounds, false, fresh)
  }, [image, bounds, onApply])

  return (
    <div
      className="grid-overlay"
      ref={boxRef}
      onPointerDown={startDrag}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="overlay-tools">
        <button className="btn btn-sm btn-line-reset" onClick={resetUniformLines} title="Reset cell lines to equal 9x9 size">
          ↺ Reset Grid Lines
        </button>
      </div>

      {inset && (
        <div className="go-rect" style={inset}>
          {/* Vertical Draggable Cell Lines */}
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const posPct = (lines.cols[i] ?? i / 9) * 100
            const isThick = i % 3 === 0
            return (
              <div
                key={`v${i}`}
                className={`go-line go-v ${isThick ? 'go-thick' : ''}`}
                style={{ left: `${posPct}%` }}
                data-line-type="col"
                data-line-idx={i}
              >
                <span className="line-handle-grip" data-line-type="col" data-line-idx={i} />
              </div>
            )
          })}

          {/* Horizontal Draggable Cell Lines */}
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
            const posPct = (lines.rows[i] ?? i / 9) * 100
            const isThick = i % 3 === 0
            return (
              <div
                key={`h${i}`}
                className={`go-line go-h ${isThick ? 'go-thick' : ''}`}
                style={{ top: `${posPct}%` }}
                data-line-type="row"
                data-line-idx={i}
              >
                <span className="line-handle-grip" data-line-type="row" data-line-idx={i} />
              </div>
            )
          })}

          <div className="go-zone" data-handle="move" title="Drag to move full 9x9 grid" />

          {HANDLES.map((h) => (
            <span key={h.mode} className={h.cls} data-handle={h.mode} />
          ))}
        </div>
      )}
    </div>
  )
}
