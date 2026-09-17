import { memo, useEffect, useRef } from 'react'
import type { Step } from '../lib/solver'
import {
  IconSparkles,
  IconCheck,
  IconTrash,
  IconPlay,
  IconPause,
  IconStepBackward,
  IconStepForward,
  IconClose,
} from './Icons'

const RANK_COLORS = [
  'badge-naked-single',
  'badge-hidden-single',
  'badge-naked-pair',
  'badge-hidden-pair',
  'badge-pointing',
  'badge-box-line',
  'badge-naked-triple',
  'badge-x-wing',
  'badge-y-wing',
  'badge-swordfish',
  'badge-trial',
]

function badgeClass(rank: number): string {
  const i = Math.max(0, Math.min(RANK_COLORS.length - 1, (rank || 1) - 1))
  return RANK_COLORS[i]
}

function StepCard({ step, active, onFocus }: { step: Step; active: boolean; onFocus: (s: Step) => void }) {
  const place = step.placement
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (active && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [active])

  return (
    <article ref={cardRef} className={`step-card ${active ? 'step-active' : ''}`}>
      <header className="step-head">
        <span className={`badge ${badgeClass(step.rank)}`}>
          #{step.id} {step.technique}
        </span>
        <button className="focus-btn" onClick={() => onFocus(step)} title="Highlight on board">
          <IconSparkles size={13} /> Focus
        </button>
      </header>
      <p className="step-desc">{step.description}</p>
      {step.eliminations.length > 0 && (
        <div className="step-elim">
          <span className="elim-label"><IconTrash size={12} /> Eliminated:</span>
          <div className="elim-pills">
            {step.eliminations.map(([r, c, v]) => (
              <span key={`${r}-${c}-${v}`} className="elim-pill">
                Digit {v} @ R{r + 1}C{c + 1}
              </span>
            ))}
          </div>
        </div>
      )}
      {place && (
        <div className="step-place">
          <span className="place-label"><IconCheck size={13} /> Placed Digit:</span>
          <span className="place-pill">
            {place.value} @ Row {place.row + 1}, Col {place.col + 1}
          </span>
        </div>
      )}
    </article>
  )
}

export interface Status {
  type: 'info' | 'ok' | 'warn' | 'error'
  text: string
}

export interface ExplanationPanelProps {
  steps: Step[]
  activeIndex: number | null
  playing?: boolean
  speed?: number
  canPrev?: boolean
  canNext?: boolean
  onTogglePlay?: () => void
  onChangeSpeed?: (s: number) => void
  onPrevStep?: () => void
  onNextStep?: () => void
  onFocus: (s: Step) => void
  status?: Status | null
  onDismissStatus?: () => void
}

function ExplanationPanel({
  steps,
  activeIndex,
  playing = false,
  speed = 1,
  canPrev = false,
  canNext = false,
  onTogglePlay,
  onChangeSpeed,
  onPrevStep,
  onNextStep,
  onFocus,
  status,
  onDismissStatus,
}: ExplanationPanelProps) {
  const listRef = useRef<HTMLDivElement>(null)

  return (
    <div className="explain">
      <header className="explain-head">
        <div className="explain-title-row">
          <h2>Logic Explanation</h2>
          {steps.length > 0 && (
            <div className="explain-ctrls">
              {onChangeSpeed && (
                <div className="speed-picker-pills">
                  {[0.5, 1, 2].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`speed-pill ${speed === s ? 'speed-pill-active' : ''}`}
                      onClick={() => onChangeSpeed(s)}
                      title={`Playback Speed ${s}x`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              )}
              <button
                className="explain-ctrl-btn"
                onClick={onPrevStep}
                disabled={!canPrev}
                title="Previous Step (<)"
              >
                <IconStepBackward size={14} />
              </button>
              <button
                className={`explain-ctrl-btn ${playing ? 'btn-play-active' : 'btn-play-ctrl'}`}
                onClick={onTogglePlay}
                title={playing ? 'Pause' : 'Play Auto-Solve'}
              >
                {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
              </button>
              <button
                className="explain-ctrl-btn"
                onClick={onNextStep}
                disabled={!canNext}
                title="Next Step (>)"
              >
                <IconStepForward size={14} />
              </button>
            </div>
          )}
        </div>
        {activeIndex != null && (
          <p className="now-explaining">
            Step {activeIndex + 1} of {steps.length}
          </p>
        )}
      </header>

      {status?.text && (
        <div className={`status status-${status.type} status-dismissible`}>
          <span>{status.text}</span>
          {onDismissStatus && (
            <button className="status-dismiss-btn" onClick={onDismissStatus} title="Dismiss message">
              <IconClose size={13} />
            </button>
          )}
        </div>
      )}

      <div className="steps-list" ref={listRef}>
        {steps.map((s, i) => (
          <StepCard key={s.id} step={s} active={i === activeIndex} onFocus={onFocus} />
        ))}
      </div>
    </div>
  )
}

export default memo(ExplanationPanel)