import type { Difficulty } from '../lib/generator'
import { VARIANT_CONFIGS, type VariantId } from '../sudoku'
import CustomSelect from './CustomSelect'
import { IconPlay } from './Icons'
import { sound } from '../lib/audio'

export interface SinglePlayerModalProps {
  difficulty: Difficulty
  variantId: VariantId
  onDifficultyChange: (d: Difficulty) => void
  onVariantChange: (v: VariantId) => void
  onStartGame: (d: Difficulty, v: VariantId) => void
  onClose: () => void
}

const VARIANT_OPTIONS = Object.values(VARIANT_CONFIGS).map((v) => ({
  value: v.id,
  label: v.name,
}))

const DIFFICULTY_STAGES: { id: Difficulty; label: string; stage: number; stars: number; desc: string }[] = [
  { id: 'easy', label: 'Easy', stage: 1, stars: 1, desc: 'Casual start, plentiful clues' },
  { id: 'medium', label: 'Medium', stage: 2, stars: 2, desc: 'Balanced logic challenge' },
  { id: 'hard', label: 'Hard', stage: 3, stars: 3, desc: 'Requires naked/hidden pairs' },
  { id: 'expert', label: 'Expert', stage: 4, stars: 4, desc: 'Advanced deductions & wings' },
  { id: 'master', label: 'Master', stage: 5, stars: 5, desc: 'Grandmaster logic required' },
  { id: 'grand master', label: 'Grand Master', stage: 6, stars: 6, desc: 'Ultimate arena puzzle' },
]

export default function SinglePlayerModal({
  difficulty,
  variantId,
  onDifficultyChange,
  onVariantChange,
  onStartGame,
  onClose,
}: SinglePlayerModalProps) {
  return (
    <div className="overlay">
      <div className="overlay-card game-config-modal">
        <header className="modal-head">
          <div className="modal-title">
            <span className="logo-cell logo-sm">9</span>
            <h2>Single Player Arena Setup</h2>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </header>

        <div className="modal-body-fields">
          <div className="modal-field">
            <span className="field-title">Grid Variant:</span>
            <CustomSelect
              options={VARIANT_OPTIONS}
              value={variantId}
              onChange={(val) => {
                sound.playSelect()
                onVariantChange(val as VariantId)
              }}
            />
          </div>

          <div className="modal-field">
            <span className="field-title">Difficulty Tier Ladder:</span>
            <div className="difficulty-ladder">
              {DIFFICULTY_STAGES.map((stg) => {
                const isActive = difficulty === stg.id
                return (
                  <button
                    key={stg.id}
                    type="button"
                    className={`ladder-step ${isActive ? 'ladder-step-active' : ''}`}
                    onClick={() => {
                      sound.playSelect()
                      onDifficultyChange(stg.id)
                    }}
                  >
                    <div className="step-badge">Stage {stg.stage}</div>
                    <div className="step-info">
                      <div className="step-name">{stg.label}</div>
                      <div className="step-stars">
                        {'★'.repeat(stg.stars)}{'☆'.repeat(6 - stg.stars)}
                      </div>
                      <div className="step-desc">{stg.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-primary flex-btn btn-hero"
            onClick={() => {
              sound.playPlaceDigit()
              onStartGame(difficulty, variantId)
              onClose()
            }}
          >
            <IconPlay size={18} /> Launch Puzzle Arena
          </button>
        </div>
      </div>
    </div>
  )
}
