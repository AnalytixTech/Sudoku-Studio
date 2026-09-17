import { useState } from 'react'
import { VARIANT_CONFIGS, type VariantId } from '../sudoku'
import type { Difficulty } from '../lib/generator'
import type { MultiplayerPlayer } from '../lib/multiplayer'
import { getUsername, setUsername } from '../lib/multiplayer'
import CustomSelect from './CustomSelect'
import { IconCheck, IconPlay, IconTrophy } from './Icons'

export interface MultiplayerModalProps {
  roomId: string
  isHost: boolean
  localPlayer: MultiplayerPlayer
  remotePlayer: MultiplayerPlayer | null
  variantId: VariantId
  difficulty: Difficulty
  onVariantChange: (v: VariantId) => void
  onDifficultyChange: (d: Difficulty) => void
  onToggleReady: () => void
  onStartMatch: () => void
  onClose: () => void
}

const VARIANT_OPTIONS = Object.values(VARIANT_CONFIGS).map((v) => ({
  value: v.id,
  label: v.name,
}))

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'easy' },
  { value: 'medium', label: 'medium' },
  { value: 'hard', label: 'hard' },
  { value: 'expert', label: 'expert' },
  { value: 'master', label: 'master' },
]

export default function MultiplayerModal({
  roomId,
  isHost,
  localPlayer,
  remotePlayer,
  variantId,
  difficulty,
  onVariantChange,
  onDifficultyChange,
  onToggleReady,
  onStartMatch,
  onClose,
}: MultiplayerModalProps) {
  const [name, setName] = useState(getUsername())
  const [copied, setCopied] = useState(false)

  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleNameChange = (val: string) => {
    setName(val)
    setUsername(val)
  }

  const bothReady = localPlayer.ready && remotePlayer && remotePlayer.ready

  return (
    <div className="overlay">
      <div className="overlay-card battle-modal">
        <header className="modal-head">
          <div className="modal-title">
            <IconTrophy size={20} color="var(--accent)" />
            <h2>1v1 Online Sudoku Battle</h2>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </header>

        <div className="room-invite-box">
          <span className="room-label">Room Invite Link:</span>
          <div className="invite-input-row">
            <input type="text" readOnly value={inviteUrl} className="invite-input" />
            <button className="btn btn-primary" onClick={handleCopyLink}>
              {copied ? <IconCheck size={14} /> : 'Copy Link'}
            </button>
          </div>
          <p className="invite-subtext">Share this link with a friend to join the same battle!</p>
        </div>

        <div className="player-profile-row">
          <label className="field-label">
            Your Player Name:
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="name-input"
              maxLength={16}
            />
          </label>
        </div>

        {isHost && (
          <div className="battle-settings-grid">
            <label className="pill diff-picker">
              Grid Variant:
              <CustomSelect
                options={VARIANT_OPTIONS}
                value={variantId}
                onChange={(val) => onVariantChange(val as VariantId)}
              />
            </label>
            <label className="pill diff-picker">
              Difficulty:
              <CustomSelect
                options={DIFFICULTY_OPTIONS}
                value={difficulty}
                onChange={(val) => onDifficultyChange(val as Difficulty)}
              />
            </label>
          </div>
        )}

        <div className="players-matchup">
          <div className={`player-card ${localPlayer.ready ? 'player-ready' : ''}`}>
            <span className="player-badge">YOU</span>
            <span className="player-name">{localPlayer.name}</span>
            <span className="ready-status">
              {localPlayer.ready ? 'READY ✓' : 'NOT READY'}
            </span>
          </div>

          <div className="vs-divider">VS</div>

          <div className={`player-card ${remotePlayer?.ready ? 'player-ready' : ''}`}>
            <span className="player-badge">OPPONENT</span>
            <span className="player-name">
              {remotePlayer ? remotePlayer.name : 'Waiting for opponent...'}
            </span>
            <span className="ready-status">
              {remotePlayer ? (remotePlayer.ready ? 'READY ✓' : 'NOT READY') : 'Offline'}
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <button
            className={`btn ${localPlayer.ready ? 'btn-warn' : 'btn-primary'} flex-btn`}
            onClick={onToggleReady}
          >
            {localPlayer.ready ? 'Unready' : 'I Am Ready!'}
          </button>

          {isHost && (
            <button
              className="btn btn-solve flex-btn"
              onClick={onStartMatch}
              disabled={!bothReady}
            >
              <IconPlay size={16} /> Start Match!
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
