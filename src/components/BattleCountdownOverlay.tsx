import { useEffect, useState } from 'react'
import { sound } from '../lib/audio'

export interface BattleCountdownOverlayProps {
  onFinished: () => void
}

export default function BattleCountdownOverlay({ onFinished }: BattleCountdownOverlayProps) {
  const [count, setCount] = useState(3)

  useEffect(() => {
    if (count > 0) {
      sound.playCountdownTick()
    } else if (count === 0) {
      sound.playCountdownGo()
      const t = setTimeout(() => {
        onFinished()
      }, 500)
      return () => clearTimeout(t)
    }

    const t = setTimeout(() => {
      setCount((c) => c - 1)
    }, 1000)
    return () => clearTimeout(t)
  }, [count, onFinished])

  return (
    <div className="countdown-overlay">
      <div className="countdown-card">
        <span className="countdown-label">BATTLE STARTING IN</span>
        <div className="countdown-number">{count > 0 ? count : 'GO!'}</div>
        <p className="countdown-subtext">The puzzle is hidden for both players until countdown ends!</p>
      </div>
    </div>
  )
}
