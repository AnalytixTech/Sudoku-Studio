import { IconTrophy, IconSoundOn, IconSoundOff, IconCamera, IconPlay } from './Icons'
import { isTodayCompleted, loadDailyStatus, getTodayDateString } from '../lib/daily'

export interface StartScreenProps {
  theme: string
  muted: boolean
  onOpenSinglePlayerModal: () => void
  onOpenBattle: () => void
  onOpenSolver: () => void
  onStartDaily: () => void
  onOpenStats: () => void
  onToggleSound: () => void
  onChangeTheme: (theme: string) => void
}

function StartScreen({
  theme,
  muted,
  onOpenSinglePlayerModal,
  onOpenBattle,
  onOpenSolver,
  onStartDaily,
  onOpenStats,
  onToggleSound,
  onChangeTheme,
}: StartScreenProps) {
  const dailyDone = isTodayCompleted()
  const dailyStatus = loadDailyStatus()
  const todayStr = getTodayDateString()

  return (
    <div className="menu">
      <div className="menu-top-toolbar">
        <button className="top-tool-btn" onClick={onOpenStats} title="View player statistics">
          <IconTrophy size={16} /> Stats &amp; Badges
        </button>
        <button className="top-tool-btn" onClick={onToggleSound} title="Toggle sound effects">
          {muted ? <IconSoundOff size={16} /> : <IconSoundOn size={16} />}
          <span>{muted ? 'Muted' : 'Sound On'}</span>
        </button>
        <div className="theme-picker">
          <span className="theme-label">Theme:</span>
          <button
            className={`theme-dot dot-cyberpunk ${theme === 'cyberpunk' ? 'active' : ''}`}
            onClick={() => onChangeTheme('cyberpunk')}
            title="Cyberpunk Neon"
          />
          <button
            className={`theme-dot dot-midnight ${theme === 'midnight' ? 'active' : ''}`}
            onClick={() => onChangeTheme('midnight')}
            title="Midnight Slate"
          />
          <button
            className={`theme-dot dot-emerald ${theme === 'emerald' ? 'active' : ''}`}
            onClick={() => onChangeTheme('emerald')}
            title="Emerald Zen"
          />
        </div>
      </div>

      <div className="menu-hero">
        <span className="logo-cell logo-big">9</span>
        <h1 className="hero-title">Sudoku Studio</h1>
        <p className="hero-tagline">
          Tactile puzzle arena, daily challenges, 1v1 online duels &amp; step-by-step logic solver.
        </p>
      </div>

      <div className="action-buttons-grid">
        <button className="action-tile tile-daily" onClick={onStartDaily}>
          <div className="tile-icon-wrap icon-daily">
            📅
          </div>
          <div className="tile-info">
            <div className="tile-head-row">
              <h3>Daily Challenge</h3>
              <span className={`daily-badge ${dailyDone ? 'daily-done' : 'daily-active'}`}>
                {dailyDone ? 'Completed ✓' : '+200 XP Bonus'}
              </span>
            </div>
            <p>Seeded puzzle for {todayStr} • {dailyStatus.currentStreak}d Streak 🔥</p>
          </div>
        </button>

        <button className="action-tile tile-primary" onClick={onOpenSinglePlayerModal}>
          <div className="tile-icon-wrap">
            <IconPlay size={24} />
          </div>
          <div className="tile-info">
            <h3>Single Player Arena</h3>
            <p>4×4, 6×6, 8×8, 9×9 &amp; Jigsaw Irregular</p>
          </div>
        </button>

        <button className="action-tile tile-battle" onClick={onOpenBattle}>
          <div className="tile-icon-wrap">
            <IconTrophy size={24} />
          </div>
          <div className="tile-info">
            <h3>1v1 Online Battle</h3>
            <p>Race a friend on any device, same hidden puzzle</p>
          </div>
        </button>

        <button className="action-tile tile-solver" onClick={onOpenSolver}>
          <div className="tile-icon-wrap">
            <IconCamera size={24} />
          </div>
          <div className="tile-info">
            <h3>Image OCR Solver</h3>
            <p>Scan photo &amp; explain logic step-by-step</p>
          </div>
        </button>
      </div>
    </div>
  )
}

export default StartScreen