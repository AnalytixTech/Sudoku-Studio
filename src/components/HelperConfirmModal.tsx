import { memo } from 'react'
import { IconSparkles } from './Icons'
import { sound } from '../lib/audio'

export interface HelperConfirmModalProps {
  title: string
  cost: number
  currentXp: number
  description: string
  onConfirm: () => void
  onClose: () => void
}

function HelperConfirmModal({
  title,
  cost,
  currentXp,
  description,
  onConfirm,
  onClose,
}: HelperConfirmModalProps) {
  const hasEnoughXp = currentXp >= cost
  const remainingXp = currentXp - cost

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card helper-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <IconSparkles size={22} color="var(--accent)" />
            <h2>{title}</h2>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </header>

        <div className="helper-body">
          <p className="helper-desc">{description}</p>

          <div className="helper-cost-card">
            <div className="cost-row">
              <span className="cost-label">Tool XP Cost:</span>
              <span className="cost-value">-{cost} XP</span>
            </div>
            <div className="cost-row">
              <span className="cost-label">Your Current Balance:</span>
              <span className="cost-value">{currentXp} XP</span>
            </div>
            {hasEnoughXp ? (
              <div className="cost-row cost-result">
                <span className="cost-label">Balance After Use:</span>
                <span className="cost-value cost-remaining">{remainingXp} XP</span>
              </div>
            ) : (
              <div className="cost-warn">
                ⚠️ Insufficient XP! Win single-player puzzles or battle matches to earn more XP.
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          {hasEnoughXp ? (
            <>
              <button className="btn sub-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary flex-btn"
                onClick={() => {
                  sound.playPlaceDigit()
                  onConfirm()
                }}
              >
                Confirm (-{cost} XP)
              </button>
            </>
          ) : (
            <button className="btn btn-primary flex-btn" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(HelperConfirmModal)
