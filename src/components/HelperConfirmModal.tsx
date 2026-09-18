import { memo } from 'react'
import { IconSparkles, IconCoin, IconWarning, IconClose } from './Icons'
import { sound } from '../lib/audio'

export interface HelperConfirmModalProps {
  title: string
  cost: number
  currentCoins: number
  description: string
  onConfirm: () => void
  onClose: () => void
}

function HelperConfirmModal({
  title,
  cost,
  currentCoins,
  description,
  onConfirm,
  onClose,
}: HelperConfirmModalProps) {
  const canAfford = currentCoins >= cost
  const remaining = currentCoins - cost

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card helper-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div className="modal-title">
            <IconSparkles size={22} color="var(--accent)" />
            <h2>{title}</h2>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <IconClose size={16} />
          </button>
        </header>

        <div className="helper-body">
          <p className="helper-desc">{description}</p>

          <div className="helper-cost-card">
            <div className="cost-row">
              <span className="cost-label">Cost:</span>
              <span className="cost-value inline-coin"><IconCoin size={13} /> {cost}</span>
            </div>
            <div className="cost-row">
              <span className="cost-label">Your balance:</span>
              <span className="cost-value inline-coin"><IconCoin size={13} /> {currentCoins}</span>
            </div>
            {canAfford ? (
              <div className="cost-row cost-result">
                <span className="cost-label">Balance after:</span>
                <span className="cost-value cost-remaining inline-coin">
                  <IconCoin size={13} /> {remaining}
                </span>
              </div>
            ) : (
              <div className="cost-warn">
                <IconWarning size={14} /> Not enough coins. Win puzzles and daily challenges to earn more.
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          {canAfford ? (
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
                Confirm (<IconCoin size={14} /> {cost})
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
