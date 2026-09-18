import { memo } from 'react'
import { IconPlay, IconArrowLeft, IconRefresh, IconCoin, IconClose } from './Icons'

export interface GameOverModalProps {
  mistakeLimit: number
  seconds: number
  freeContinues: number
  continueCost: number
  coins: number
  /** Continue is offered but not affordable: no free ones left and not enough coins. */
  onContinue: () => void
  onNewGame: () => void
  onMenu: () => void
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Shown when the mistake limit is reached.
 *
 * The Continue action is the natural home for a rewarded ad later: it is a
 * moment the player actively wants something, rather than an interruption.
 */
function GameOverModal({
  mistakeLimit,
  seconds,
  freeContinues,
  continueCost,
  coins,
  onContinue,
  onNewGame,
  onMenu,
}: GameOverModalProps) {
  const usingFree = freeContinues > 0
  const canContinue = usingFree || coins >= continueCost

  return (
    <div className="overlay">
      <div className="overlay-card gameover-card">
        <div className="gameover-badge" aria-hidden="true">
          <IconClose size={26} />
        </div>
        <h2>Out of mistakes</h2>
        <p className="gameover-sub">
          That was {mistakeLimit} mistakes. Continue from where you left off, or start fresh.
        </p>

        <div className="overlay-stats">
          <span>Time {fmt(seconds)}</span>
          <span>Mistakes {mistakeLimit}</span>
          <span className="inline-coin"><IconCoin size={13} /> {coins}</span>
        </div>

        <div className="gameover-actions">
          <button
            className="btn btn-primary flex-btn btn-hero"
            onClick={onContinue}
            disabled={!canContinue}
            title={canContinue ? undefined : 'Not enough coins — win a puzzle to earn more'}
          >
            <IconPlay size={16} />
            {usingFree ? (
              'Continue (free today)'
            ) : (
              <>
                Continue (<IconCoin size={14} /> {continueCost})
              </>
            )}
          </button>

          {!canContinue && (
            <p className="gameover-hint">
              You need {continueCost - coins} more coins. Your free continue resets tomorrow.
            </p>
          )}

          <div className="gameover-secondary">
            <button className="btn flex-btn" onClick={onNewGame}>
              <IconRefresh size={15} /> New puzzle
            </button>
            <button className="btn flex-btn" onClick={onMenu}>
              <IconArrowLeft size={15} /> Main menu
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(GameOverModal)
