import {
  IconTrophy,
  IconSoundOn,
  IconSoundOff,
  IconCamera,
  IconPlay,
  IconClose,
  IconCoin,
  IconPalette,
  IconUser,
  IconCalendar,
  IconFlame,
  IconCheck,
} from './Icons'
import { isTodayCompleted, loadDailyStatus, getTodayDateString } from '../lib/daily'
import type { ResumeSummary } from '../lib/persistence'
import { DAILY_COINS, DAILY_XP } from '../lib/economy'

export interface StartScreenProps {
  muted: boolean
  onOpenSinglePlayerModal: () => void
  onOpenBattle: () => void
  onOpenSolver: () => void
  onStartDaily: () => void
  onOpenStats: () => void
  onToggleSound: () => void
  onOpenShop: () => void
  onOpenAccount: () => void
  /** Email of the signed-in player, or null when playing locally. */
  accountEmail: string | null
  /** An unfinished puzzle waiting to be picked back up, if any. */
  resume: ResumeSummary | null
  onResume: () => void
  onDiscardResume: () => void
  coins: number
  level: number
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function StartScreen({
  muted,
  onOpenSinglePlayerModal,
  onOpenBattle,
  onOpenSolver,
  onStartDaily,
  onOpenStats,
  onToggleSound,
  onOpenShop,
  onOpenAccount,
  accountEmail,
  resume,
  onResume,
  onDiscardResume,
  coins,
  level,
}: StartScreenProps) {
  const dailyDone = isTodayCompleted()
  const dailyStatus = loadDailyStatus()
  const todayStr = getTodayDateString()

  return (
    <div className="menu">
      <div className="menu-top-toolbar">
        <span className="menu-wallet" title="Coins — spend on hints and continues">
          <IconCoin size={15} /> {coins}
        </span>
        <span className="menu-level" title="Level from lifetime XP">
          LVL {level}
        </span>
        <button className="top-tool-btn" onClick={onOpenStats} title="View player statistics">
          <IconTrophy size={16} /> Stats &amp; Badges
        </button>
        <button className="top-tool-btn" onClick={onToggleSound} title="Toggle sound effects">
          {muted ? <IconSoundOff size={16} /> : <IconSoundOn size={16} />}
          <span>{muted ? 'Muted' : 'Sound On'}</span>
        </button>
        <button className="top-tool-btn" onClick={onOpenShop} title="Themes, numerals and win effects">
          <IconPalette size={16} /> Shop
        </button>
        <button
          className="top-tool-btn"
          onClick={onOpenAccount}
          title={accountEmail || 'Sign in to save your progress across devices'}
        >
          <IconUser size={16} /> {accountEmail ? 'Account' : 'Sign in'}
        </button>
      </div>

      <div className="menu-hero">
        <span className="logo-cell logo-big">9</span>
        <h1 className="hero-title">Sudoku Studio</h1>
        <p className="hero-tagline">
          Tactile puzzle arena, daily challenges, 1v1 online duels &amp; step-by-step logic solver.
        </p>
      </div>

      <div className="action-buttons-grid">
        {resume && (
          <div className="resume-card">
            <button className="action-tile tile-resume" onClick={onResume}>
              <div className="tile-icon-wrap icon-resume">
                <IconPlay size={22} />
              </div>
              <div className="tile-info">
                <div className="tile-head-row">
                  <h3>Continue</h3>
                  <span className="resume-progress">
                    {resume.filled}/{resume.total}
                  </span>
                </div>
                <p>
                  {resume.isDaily ? 'Daily Challenge' : resume.variantName} · {resume.difficulty} ·{' '}
                  {fmtClock(resume.seconds)}
                </p>
              </div>
            </button>
            <button
              className="resume-discard"
              onClick={onDiscardResume}
              title="Discard this saved puzzle"
              aria-label="Discard saved puzzle"
            >
              <IconClose size={14} />
            </button>
          </div>
        )}

        <button className="action-tile tile-daily" onClick={onStartDaily}>
          <div className="tile-icon-wrap icon-daily">
            <IconCalendar size={22} />
          </div>
          <div className="tile-info">
            <div className="tile-head-row">
              <h3>Daily Challenge</h3>
              <span className={`daily-badge ${dailyDone ? 'daily-done' : 'daily-active'}`}>
                {dailyDone ? (
                  <>
                    <IconCheck size={11} /> Completed
                  </>
                ) : (
                  <>
                    <IconCoin size={11} /> +{DAILY_COINS} &amp; {DAILY_XP} XP
                  </>
                )}
              </span>
            </div>
            <p className="tile-sub-row">
              Seeded puzzle for {todayStr} • {dailyStatus.currentStreak}d streak{' '}
              <IconFlame size={12} />
            </p>
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