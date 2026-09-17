import { useCallback, useEffect, useMemo, useState } from 'react'
import { computeCandidates, cloneGrid, countEmpty } from '../sudoku'
import { SudokuSolver, type Step } from '../lib/solver'
import {
  detectBounds,
  detectGridLines,
  extractGrid,
  loadImageFile,
  rotateImage,
  type Rect,
  type GridLines,
} from '../lib/ocr'
import { markersFor } from '../lib/markers'
import Board from './Board'
import ExplanationPanel from './ExplanationPanel'
import GridOverlay from './GridOverlay'
import {
  IconArrowLeft,
  IconCamera,
  IconUpload,
  IconRotateLeft,
  IconRotateRight,
  IconPlay,
  IconPause,
  IconStepForward,
  IconStepBackward,
  IconFastForward,
  IconCheck,
  IconLightbulb,
  IconClose,
} from './Icons'

type Phase = 'pick' | 'extracting' | 'review' | 'solved'

export interface SolverScreenProps {
  onBack: () => void
}

function emptyGrid() {
  return Array.from({ length: 9 }, () => Array(9).fill(0))
}

export default function SolverScreen({ onBack }: SolverScreenProps) {
  const [phase, setPhase] = useState<Phase>('pick')
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [bounds, setBounds] = useState<Rect | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [grid, setGrid] = useState<number[][]>(emptyGrid())
  const [confidence, setConfidence] = useState<number[][]>(emptyGrid())
  const [conflicts, setConflicts] = useState<boolean[][]>(emptyGrid().map((row) => row.map(() => false)))
  const [previews, setPreviews] = useState<string[][]>(emptyGrid().map((row) => row.map(() => '')))
  const [customLines, setCustomLines] = useState<GridLines | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [steps, setSteps] = useState<Step[]>([])
  const [stepIdx, setStepIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'warn' | 'error'; text: string } | null>(null)

  // Recalculate conflicts when user edits grid in review phase
  const updateGridCell = useCallback((r: number, c: number, val: number) => {
    setGrid((prevGrid) => {
      const nextGrid = prevGrid.map((row) => row.slice())
      nextGrid[r][c] = val

      // Re-evaluate conflicts
      const nextConflicts = emptyGrid().map((row) => row.map(() => false))
      // Row check
      for (let rowIdx = 0; rowIdx < 9; rowIdx++) {
        const seen: Record<number, number[]> = {}
        for (let colIdx = 0; colIdx < 9; colIdx++) {
          const v = nextGrid[rowIdx][colIdx]
          if (v > 0) {
            seen[v] = seen[v] || []
            seen[v].push(colIdx)
          }
        }
        for (const v in seen) {
          if (seen[v].length > 1) {
            for (const colIdx of seen[v]) nextConflicts[rowIdx][colIdx] = true
          }
        }
      }
      // Col check
      for (let colIdx = 0; colIdx < 9; colIdx++) {
        const seen: Record<number, number[]> = {}
        for (let rowIdx = 0; rowIdx < 9; rowIdx++) {
          const v = nextGrid[rowIdx][colIdx]
          if (v > 0) {
            seen[v] = seen[v] || []
            seen[v].push(rowIdx)
          }
        }
        for (const v in seen) {
          if (seen[v].length > 1) {
            for (const rowIdx of seen[v]) nextConflicts[rowIdx][colIdx] = true
          }
        }
      }
      // Box check
      for (let boxR = 0; boxR < 3; boxR++) {
        for (let boxC = 0; boxC < 3; boxC++) {
          const seen: Record<number, [number, number][]> = {}
          for (let dr = 0; dr < 3; dr++) {
            for (let dc = 0; dc < 3; dc++) {
              const rowIdx = boxR * 3 + dr
              const colIdx = boxC * 3 + dc
              const v = nextGrid[rowIdx][colIdx]
              if (v > 0) {
                seen[v] = seen[v] || []
                seen[v].push([rowIdx, colIdx])
              }
            }
          }
          for (const v in seen) {
            if (seen[v].length > 1) {
              for (const [rowIdx, colIdx] of seen[v]) nextConflicts[rowIdx][colIdx] = true
            }
          }
        }
      }

      setConflicts(nextConflicts)
      return nextGrid
    })
  }, [])

  // ---------------- image upload & drag-and-drop ----------------
  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    setMessage(null)
    setStatus('Reading image...')
    try {
      const img = await loadImageFile(file)
      setImage(img)
      setCustomLines(null)
      const found = detectBounds(img)
      if (found && found.w > 40 && found.h > 40) {
        setBounds(found)
        const lines = detectGridLines(img, found)
        if (lines) setCustomLines(lines)
        setStatus('Grid detected. Drag grid lines or corners to adjust.')
      } else {
        const fallbackBounds = { x: img.naturalWidth * 0.05, y: img.naturalHeight * 0.05, w: img.naturalWidth * 0.90, h: img.naturalHeight * 0.90 }
        setBounds(fallbackBounds)
        setStatus('Center crop applied. Drag outer corners or grid lines to match your puzzle cells.')
      }
      setPhase('pick')
    } catch (err) {
      console.error(err)
      setMessage({ type: 'error', text: 'Could not read that image. Try a JPG or PNG photo.' })
    }
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  // ---------------- rotation ----------------
  const handleRotate = useCallback(async (deg: number) => {
    if (!image) return
    setStatus('Rotating image...')
    try {
      const rotated = await rotateImage(image, deg)
      setImage(rotated)
      setCustomLines(null)
      const found = detectBounds(rotated)
      if (found && found.w > 40 && found.h > 40) {
        setBounds(found)
        const lines = detectGridLines(rotated, found)
        if (lines) setCustomLines(lines)
        setStatus('Grid bounds updated for rotated image.')
      } else {
        setBounds({ x: rotated.naturalWidth * 0.05, y: rotated.naturalHeight * 0.05, w: rotated.naturalWidth * 0.90, h: rotated.naturalHeight * 0.90 })
        setStatus('Used center crop for rotated image.')
      }
    } catch {
      setMessage({ type: 'error', text: 'Could not rotate image.' })
    }
  }, [image])

  // ---------------- OCR extraction ----------------
  const extract = useCallback(async () => {
    if (!image || !bounds) return
    setPhase('extracting')
    setProgress(0)
    setStatus('Detecting grid lines and isolating cells...')
    await new Promise((r) => setTimeout(r, 30))
    try {
      const linesToUse = customLines || detectGridLines(image, bounds)
      if (!linesToUse) setStatus('Grid lines not detected: using equal cell division.')
      else setStatus('Reading numbers from isolated cells...')

      const extracted = await extractGrid(image, bounds, linesToUse, (done, total) => {
        setProgress(Math.round((done / total) * 100))
      })
      setGrid(extracted.grid)
      setConfidence(extracted.confidence)
      setConflicts(extracted.conflicts)
      setPreviews(extracted.previews)
      setSelected(null)
      setActiveCell(null)
      setMessage(null)
      setPhase('review')
      const empty = 81 - extracted.grid.reduce((n, row) => n + row.filter((v) => v !== 0).length, 0)
      const conflictCount = extracted.conflicts.reduce((n, row) => n + row.filter(Boolean).length, 0)
      if (conflictCount > 0) {
        setStatus(`Extracted ${81 - empty} digits (${conflictCount} conflicts marked in red). Select cells to edit.`)
      } else {
        setStatus(`Extracted ${81 - empty} digits cleanly. Select any cell to inspect its OCR crop.`)
      }
    } catch {
      setMessage({ type: 'error', text: 'Extraction failed. Try a clearer front-on photo.' })
      setPhase('pick')
    }
  }, [image, bounds, customLines])

  // ---------------- solve ----------------
  const solve = useCallback(() => {
    const empty = countEmpty(grid)
    if (empty > 60) {
      setMessage({ type: 'warn', text: 'Very few digits were read: please check crop boundaries and try again.' })
      return
    }
    const solver = new SudokuSolver(grid)
    const { steps: solutionSteps, solved: ok } = solver.solve()
    if (!ok || solutionSteps.length === 0) {
      setMessage({ type: 'error', text: 'Could not solve: the scan misread some digits. Fix red/yellow cells and try again.' })
      return
    }
    setSteps(solutionSteps)
    setStepIdx(0)
    setPlaying(false)
    setPhase('solved')
    setStatus(`Solved in ${solutionSteps.length} moves. Use controls to step through the solution.`)
  }, [grid])

  // ---------------- solved: stepping replay ----------------
  const displayGrid = useMemo(() => {
    const g = cloneGrid(grid)
    for (let i = 0; i < stepIdx; i++) {
      const p = steps[i]?.placement
      if (p) g[p.row][p.col] = p.value
    }
    return g
  }, [grid, steps, stepIdx])

  const currentStep = steps.length ? steps[Math.min(stepIdx, steps.length - 1)] : null
  const markers = useMemo(
    () => markersFor(stepIdx >= steps.length || steps.length === 0 ? null : currentStep),
    [currentStep, stepIdx, steps.length]
  )

  const forward = useCallback(() => {
    setStepIdx((i) => Math.min(i + 1, steps.length))
  }, [steps.length])

  const backward = useCallback(() => {
    setStepIdx((i) => Math.max(0, i - 1))
  }, [])

  useEffect(() => {
    if (!playing) return
    if (stepIdx >= steps.length) {
      setPlaying(false)
      return
    }
    const t = setTimeout(forward, 1100)
    return () => clearTimeout(t)
  }, [playing, stepIdx, steps.length, forward])

  const fillAll = useCallback(() => setStepIdx(steps.length), [steps.length])

  // ---------------- render helpers ----------------
  const cand = useMemo(() => computeCandidates(displayGrid).cand, [displayGrid])

  return (
    <div
      className={`solver ${isDragging ? 'dragging-file' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="global-drag-overlay">
          <IconUpload size={54} color="var(--accent)" />
          <h3>Drop Sudoku image here</h3>
        </div>
      )}

      <div className="solver-topbar">
        <button className="btn flex-btn" onClick={onBack}>
          <IconArrowLeft size={16} /> Back to menu
        </button>
        <div className="solver-title">
          <h1>Image solver</h1>
          <p>Upload a puzzle photo, extract digits, and step through the solution.</p>
        </div>
        {image && phase !== 'extracting' && (
          <button className="btn" onClick={() => { setImage(null); setPhase('pick'); setMessage(null); setSteps([]); setStepIdx(0); setPlaying(false) }}>
            New image
          </button>
        )}
      </div>

      {message && <div className={`status status-${message.type}`}>{message.text}</div>}

      {phase === 'pick' && (
        <div className="solver-pick">
          {!image ? (
            <label
              className={`dropzone ${isDragging ? 'dropzone-active' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <div className="dz-inner">
                <div className="dz-icon">
                  <IconUpload size={40} color="var(--accent)" />
                </div>
                <p className="dz-title">Drop a Sudoku photo here or click to browse</p>
                <p className="dz-sub">Front-on photos of a printed grid work best with good lighting.</p>
              </div>
            </label>
          ) : (
            <div className="solver-preview">
              <div className="preview-box">
                <img src={image.src} alt="Uploaded puzzle" className="preview-img" />
                {bounds && (
                  <GridOverlay
                    image={image}
                    bounds={bounds}
                    gridLines={customLines}
                    onApply={(_img: HTMLImageElement, b: Rect, _det: boolean, lines?: GridLines | null) => {
                      setBounds(b)
                      if (lines) setCustomLines(lines)
                    }}
                  />
                )}
              </div>
              <div className="preview-actions">
                <p className="ok-text flex-hint">
                  <IconLightbulb size={16} /> Move the 9x9 box or drag individual grid lines to match your puzzle cells.
                </p>
                <div className="btn-row">
                  <button className="btn flex-btn" onClick={() => handleRotate(-90)}>
                    <IconRotateLeft size={16} /> Rotate Left
                  </button>
                  <button className="btn flex-btn" onClick={() => handleRotate(90)}>
                    <IconRotateRight size={16} /> Rotate Right
                  </button>
                  <button className="btn btn-primary flex-btn" onClick={extract}>
                    <IconCamera size={16} /> Extract numbers
                  </button>
                  <label className="btn">
                    Choose another image
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'extracting' && (
        <div className="extracting">
          <p>{status}</p>
          <div className="progress"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          <p className="progress-label">{progress}%: reading each cell...</p>
        </div>
      )}

      {phase === 'review' && (
        <div className="review">
          <div className="review-header">
            <p className="status-text">{status}</p>
            <div className="review-legend">
              <span className="legend-item legend-high">
                <IconCheck size={13} /> High Confidence
              </span>
              <span className="legend-item legend-mid">
                <IconLightbulb size={13} /> Check Reading
              </span>
              <span className="legend-item legend-conflict">
                <IconClose size={13} /> Rule Conflict
              </span>
            </div>
          </div>

          <div className="review-body">
            <div className="review-grid-container">
              <div className="review-grid">
                {grid.map((row, r) => (
                  <div className="review-row" key={r}>
                    {row.map((v, c) => {
                      const isConflict = conflicts[r]?.[c]
                      const confVal = confidence[r]?.[c] ?? 100
                      const lowConf = confVal < 65 && v !== 0
                      const isSelected = activeCell?.r === r && activeCell?.c === c

                      return (
                        <div
                          key={c}
                          className={`review-cell-wrap ${isConflict ? 'wrap-conflict' : lowConf ? 'wrap-low' : 'wrap-ok'} ${
                            isSelected ? 'wrap-selected' : ''
                          } ${(c === 2 || c === 5) ? 'border-right-thick' : ''} ${(r === 2 || r === 5) ? 'border-bottom-thick' : ''}`}
                          onClick={() => setActiveCell({ r, c })}
                        >
                          <input
                            className={`review-cell ${isConflict ? 'review-conflict' : lowConf ? 'review-low' : ''}`}
                            maxLength={1}
                            value={v === 0 ? '' : v}
                            onChange={(e) => {
                              const m = e.target.value.match(/[1-9]/)
                              updateGridCell(r, c, m ? Number(m[0]) : 0)
                            }}
                            onFocus={() => {
                              setSelected(`${r},${c}`)
                              setActiveCell({ r, c })
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* OCR Digit Crop Inspector Sidebar */}
            <div className="review-inspector">
              <h3>Cell OCR Inspector</h3>
              {activeCell ? (
                <div className="inspector-card">
                  <div className="inspector-head">
                    <span className="cell-pos">Row {activeCell.r + 1}, Col {activeCell.c + 1}</span>
                    <span className={`conf-badge ${conflicts[activeCell.r][activeCell.c] ? 'conf-red' : (confidence[activeCell.r][activeCell.c] < 65 ? 'conf-yellow' : 'conf-green')}`}>
                      {conflicts[activeCell.r][activeCell.c] ? 'Rule Conflict' : `${confidence[activeCell.r][activeCell.c]}% Match`}
                    </span>
                  </div>

                  <div className="crop-preview-box">
                    {previews[activeCell.r]?.[activeCell.c] ? (
                      <img
                        src={previews[activeCell.r][activeCell.c]}
                        alt={`Cell ${activeCell.r + 1},${activeCell.c + 1} crop`}
                        className="crop-img"
                      />
                    ) : (
                      <div className="no-crop">No image</div>
                    )}
                    <span className="crop-label">Isolated OCR Canvas</span>
                  </div>

                  <div className="quick-keypad">
                    <p className="kp-title">Quick Edit:</p>
                    <div className="kp-grid">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                          key={num}
                          className={`kp-btn ${grid[activeCell.r][activeCell.c] === num ? 'kp-active' : ''}`}
                          onClick={() => updateGridCell(activeCell.r, activeCell.c, num)}
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        className="kp-btn kp-clear"
                        onClick={() => updateGridCell(activeCell.r, activeCell.c, 0)}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="inspector-empty">
                  <p>Click or focus any cell to view its isolated OCR crop and edit the number.</p>
                </div>
              )}
            </div>
          </div>

          <div className="btn-row review-actions">
            <button className="btn" onClick={() => setPhase('pick')}>Back to image</button>
            <button className="btn btn-primary" onClick={solve}>Solve this board</button>
          </div>
        </div>
      )}

      {phase === 'solved' && (
        <div className="layout solver-layout">
          <section className="board-col">
            <div className="board-wrap">
              <Board
                grid={displayGrid}
                original={grid}
                selected={selected}
                candidates={cand}
                showNotes={false}
                conflictSet={new Set()}
                focusCells={markers.focus}
                placementCell={markers.placement}
                strikeMap={markers.strike}
                digitHighlight={0}
                onSelect={(r, c) => setSelected(`${r},${c}`)}
              />
            </div>
            <div className="replay-controls">
              <button className="btn flex-btn" onClick={backward} disabled={stepIdx === 0}>
                <IconStepBackward size={15} /> Prev
              </button>
              {playing ? (
                <button className="btn btn-warn flex-btn" onClick={() => setPlaying(false)}>
                  <IconPause size={15} /> Pause
                </button>
              ) : (
                <button className="btn btn-solve flex-btn" onClick={() => setPlaying(true)} disabled={stepIdx >= steps.length}>
                  <IconPlay size={15} /> Play
                </button>
              )}
              <button className="btn flex-btn" onClick={forward} disabled={stepIdx >= steps.length}>
                Next <IconStepForward size={15} />
              </button>
              <button className="btn flex-btn" onClick={fillAll} disabled={stepIdx >= steps.length}>
                Fill all <IconFastForward size={15} />
              </button>
              <span className="replay-count">{stepIdx} / {steps.length}</span>
            </div>
          </section>
          <aside className="explain-col">
            <div className="explain">
              <header className="explain-head">
                <h2>Step Walkthrough</h2>
                <p className="now-explaining">
                  Extracted puzzle solved in {steps.length} moves (showing move {Math.min(stepIdx + 1, steps.length)})
                </p>
              </header>
              <div className="steps-list">
                {currentStep && (
                  <ExplanationPanel
                    steps={steps.slice(0, Math.min(stepIdx + 1, steps.length))}
                    activeIndex={Math.min(stepIdx, steps.length - 1)}
                    onFocus={(s) => {
                      if (s.placement) setSelected(`${s.placement.row},${s.placement.col}`)
                      else if (s.focus?.length) setSelected(s.focus.map(([r, c]) => `${r},${c}`)[0])
                    }}
                  />
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}