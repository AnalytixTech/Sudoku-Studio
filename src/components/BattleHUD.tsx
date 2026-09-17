import type { MultiplayerPlayer } from '../lib/multiplayer'
import { IconSparkles, IconTrophy } from './Icons'

export interface BattleHUDProps {
  localPlayer: MultiplayerPlayer
  remotePlayer: MultiplayerPlayer | null
  totalCells: number
}

export default function BattleHUD({ localPlayer, remotePlayer, totalCells }: BattleHUDProps) {
  const localPct = Math.min(100, Math.round((localPlayer.score.filledCount / totalCells) * 100))
  const remotePct = remotePlayer
    ? Math.min(100, Math.round((remotePlayer.score.filledCount / totalCells) * 100))
    : 0

  const diff = localPlayer.score.filledCount - (remotePlayer ? remotePlayer.score.filledCount : 0)

  return (
    <div className="battle-hud">
      <div className="hud-player hud-local">
        <div className="hud-meta">
          <div className="hud-identity">
            <span className="player-tag tag-you">YOU</span>
            <span className="hud-name">{localPlayer.name}</span>
          </div>
          <span className="hud-score"><IconTrophy size={14} /> {localPlayer.score.score} pts</span>
          {localPlayer.score.streak > 1 && (
            <span className="hud-streak"><IconSparkles size={12} /> {localPlayer.score.streak}x Streak!</span>
          )}
        </div>
        <div className="hud-bar-track">
          <div className="hud-bar-fill local-fill" style={{ width: `${localPct}%` }} />
        </div>
        <span className="hud-pct">{localPlayer.score.filledCount}/{totalCells} ({localPct}%)</span>
      </div>

      <div className="hud-versus-wrap">
        <div className="hud-versus">VS</div>
        {remotePlayer && diff !== 0 && (
          <div className={`lead-pill ${diff > 0 ? 'lead-ahead' : 'lead-behind'}`}>
            {diff > 0 ? `+${diff} Ahead!` : `${diff} Behind`}
          </div>
        )}
      </div>

      <div className="hud-player hud-remote">
        <div className="hud-meta">
          <div className="hud-identity">
            <span className="player-tag tag-rival">RIVAL</span>
            <span className="hud-name">{remotePlayer ? remotePlayer.name : 'Searching...'}</span>
          </div>
          <span className="hud-score">
            <IconTrophy size={14} /> {remotePlayer ? remotePlayer.score.score : 0} pts
          </span>
          {remotePlayer && remotePlayer.score.streak > 1 && (
            <span className="hud-streak"><IconSparkles size={12} /> {remotePlayer.score.streak}x Streak!</span>
          )}
        </div>
        <div className="hud-bar-track">
          <div className="hud-bar-fill remote-fill" style={{ width: `${remotePct}%` }} />
        </div>
        <span className="hud-pct">
          {remotePlayer ? `${remotePlayer.score.filledCount}/${totalCells} (${remotePct}%)` : 'Connecting...'}
        </span>
      </div>
    </div>
  )
}
