import { memo, useState, type ComponentType } from 'react'
import type { AllStats } from '../lib/stats'
import type { Difficulty } from '../lib/generator'
import { loadExtraStats } from '../lib/stats'
import { loadDailyStatus } from '../lib/daily'
import { levelFromXp, loadWallet, rankName } from '../lib/economy'
import {
  IconTrophy,
  IconClose,
  IconSparkles,
  IconLock,
  IconCheck,
  IconGamepad,
  IconCalendar,
  IconCalendarDays,
  IconSwords,
  IconSprout,
  IconPuzzle,
  IconGraduation,
  IconBrain,
  IconBolt,
  IconRocket,
  IconShield,
  IconPencilOff,
  IconCrown,
  IconFlame,
  IconStar,
  IconGem,
  IconMedal,
  type IconProps,
} from './Icons'

export interface StatsModalProps {
  stats: AllStats
  onClose: () => void
}

function fmtSec(sec: number | null): string {
  if (sec == null) return '--:--'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master', 'grand master']

interface Achievement {
  id: string
  category: 'solo' | 'daily' | 'battle'
  title: string
  desc: string
  Icon: ComponentType<IconProps>
  unlocked: boolean
}

function StatsModal({ stats, onClose }: StatsModalProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'solo' | 'daily' | 'battle'>('all')
  const dailyStatus = loadDailyStatus()
  const extraStats = loadExtraStats()

  // Compute Total Wins, Total Played, Best Time
  let totalWon = 0
  let totalPlayed = 0
  let maxStreak = 0
  let overallBestTime: number | null = null

  DIFFICULTIES.forEach((diff) => {
    const d = stats[diff]
    totalWon += d.won
    totalPlayed += d.played
    if (d.bestStreak > maxStreak) maxStreak = d.bestStreak
    if (d.bestTimeSec !== null && (overallBestTime === null || d.bestTimeSec < overallBestTime)) {
      overallBestTime = d.bestTimeSec
    }
  })

  // Level comes from the wallet's lifetime XP, the same number the top bar and
  // the results screen use -- previously this modal computed its own total, so
  // the app showed two different figures both labelled XP.
  const wallet = loadWallet()
  const { level, into, span, pct } = levelFromXp(wallet.xp)

  const achievements: Achievement[] = [
    // --- SINGLE PLAYER & MASTERY ---
    {
      id: 'first_win',
      category: 'solo',
      title: 'First Step',
      desc: 'Win your first puzzle match',
      Icon: IconSprout,
      unlocked: totalWon >= 1,
    },
    {
      id: 'puzzle_5',
      category: 'solo',
      title: 'Puzzle Enthusiast',
      desc: 'Solve 5 single-player puzzles',
      Icon: IconPuzzle,
      unlocked: totalWon >= 5,
    },
    {
      id: 'master_solver',
      category: 'solo',
      title: 'Sudoku Scholar',
      desc: 'Win at least 10 puzzles',
      Icon: IconGraduation,
      unlocked: totalWon >= 10,
    },
    {
      id: 'logic_architect',
      category: 'solo',
      title: 'Logic Architect',
      desc: 'Solve 25 single-player puzzles',
      Icon: IconBrain,
      unlocked: totalWon >= 25,
    },
    {
      id: 'speed_demon',
      category: 'solo',
      title: 'Speed Demon',
      desc: 'Solve a puzzle in under 3 minutes',
      Icon: IconBolt,
      unlocked: overallBestTime !== null && overallBestTime <= 180,
    },
    {
      id: 'sub2_velocity',
      category: 'solo',
      title: 'Sub-2 Velocity',
      desc: 'Solve a puzzle in under 2 minutes',
      Icon: IconRocket,
      unlocked: overallBestTime !== null && overallBestTime <= 120,
    },
    {
      id: 'flawless_solver',
      category: 'solo',
      title: 'Flawless Solver',
      desc: 'Solve a puzzle with 0 mistakes',
      Icon: IconShield,
      unlocked: extraStats.flawlessSolves >= 1,
    },
    {
      id: 'no_notes_solver',
      category: 'solo',
      title: 'Pure Tactician',
      desc: 'Solve a puzzle without candidate notes',
      Icon: IconPencilOff,
      unlocked: extraStats.noNotesSolves >= 1,
    },
    {
      id: 'grandmaster',
      category: 'solo',
      title: 'Grandmaster Conqueror',
      desc: 'Win a Grand Master tier puzzle',
      Icon: IconCrown,
      unlocked: stats['grand master']?.won > 0,
    },
    {
      id: 'streak_3',
      category: 'solo',
      title: 'Hot Streak',
      desc: 'Achieve a 3-game win streak',
      Icon: IconFlame,
      unlocked: maxStreak >= 3,
    },
    {
      id: 'streak_5',
      category: 'solo',
      title: 'Unstoppable Legend',
      desc: 'Achieve a 5-game win streak',
      Icon: IconTrophy,
      unlocked: maxStreak >= 5,
    },

    // --- DAILY CHALLENGE ARENA ---
    {
      id: 'daily_first',
      category: 'daily',
      title: 'Daily Pioneer',
      desc: 'Complete your first Daily Challenge',
      Icon: IconCalendar,
      unlocked: dailyStatus.completedDates.length >= 1,
    },
    {
      id: 'daily_3day',
      category: 'daily',
      title: '3-Day Consistency',
      desc: 'Maintain a 3-day Daily Challenge streak',
      Icon: IconCalendarDays,
      unlocked: dailyStatus.currentStreak >= 3,
    },
    {
      id: 'daily_streak',
      category: 'daily',
      title: 'Daily Streak Master',
      desc: 'Reach a 7-day Daily Challenge streak',
      Icon: IconStar,
      unlocked: dailyStatus.currentStreak >= 7,
    },
    {
      id: 'daily_30completed',
      category: 'daily',
      title: 'Monthly Legend',
      desc: 'Complete 30 Daily Challenges',
      Icon: IconGem,
      unlocked: dailyStatus.completedDates.length >= 30,
    },

    // --- ONLINE BATTLE ARENA ---
    {
      id: 'battle_first',
      category: 'battle',
      title: 'First Blood',
      desc: 'Win your first 1v1 Battle duel',
      Icon: IconSwords,
      unlocked: extraStats.battleWon >= 1,
    },
    {
      id: 'battle_5played',
      category: 'battle',
      title: 'Battle Veteran',
      desc: 'Compete in 5 Battle duels',
      Icon: IconShield,
      unlocked: extraStats.battlePlayed >= 5,
    },
    {
      id: 'battle_5won',
      category: 'battle',
      title: 'Battle Champion',
      desc: 'Win 5 Battle duels',
      Icon: IconMedal,
      unlocked: extraStats.battleWon >= 5,
    },
  ]

  const filtered =
    activeTab === 'all'
      ? achievements
      : achievements.filter((a) => a.category === activeTab)

  const unlockedCount = achievements.filter((a) => a.unlocked).length

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card stats-card" onClick={(e) => e.stopPropagation()}>
        <header className="stats-header">
          <div className="modal-title">
            <IconTrophy size={24} color="var(--accent)" />
            <h2>Player Profile &amp; Achievements</h2>
          </div>
          <button className="stats-close-btn" onClick={onClose} aria-label="Close modal">
            <IconClose size={20} />
          </button>
        </header>

        {/* Level Progress Banner */}
        <div className="xp-banner">
          <div className="xp-level-badge">
            <span className="lvl-lbl">LEVEL</span>
            <span className="lvl-num">{level}</span>
          </div>
          <div className="xp-info">
            <div className="xp-title-row">
              <span className="xp-rank-name">
                <IconSparkles size={14} /> {rankName(level)}
              </span>
              <span className="xp-val">
                {into} / {span} to next level
              </span>
            </div>
            <div className="xp-bar-track">
              <div className="xp-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="achieve-tabs">
          <button
            type="button"
            className={`achieve-tab ${activeTab === 'all' ? 'achieve-tab-active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Trophies ({unlockedCount}/{achievements.length})
          </button>
          <button
            type="button"
            className={`achieve-tab ${activeTab === 'solo' ? 'achieve-tab-active' : ''}`}
            onClick={() => setActiveTab('solo')}
          >
            <IconGamepad size={14} /> Solo (
            {achievements.filter((a) => a.category === 'solo' && a.unlocked).length})
          </button>
          <button
            type="button"
            className={`achieve-tab ${activeTab === 'daily' ? 'achieve-tab-active' : ''}`}
            onClick={() => setActiveTab('daily')}
          >
            <IconCalendar size={14} /> Daily (
            {achievements.filter((a) => a.category === 'daily' && a.unlocked).length})
          </button>
          <button
            type="button"
            className={`achieve-tab ${activeTab === 'battle' ? 'achieve-tab-active' : ''}`}
            onClick={() => setActiveTab('battle')}
          >
            <IconSwords size={14} /> Battle (
            {achievements.filter((a) => a.category === 'battle' && a.unlocked).length})
          </button>
        </div>

        {/* Achievements Section */}
        <div className="achievements-section">
          <div className="achievements-grid">
            {filtered.map((ach) => (
              <div key={ach.id} className={`achieve-card ${ach.unlocked ? 'achieve-unlocked' : 'achieve-locked'}`}>
                <span className="achieve-icon">
                  <ach.Icon size={20} />
                </span>
                <div className="achieve-details">
                  <span className="achieve-name">{ach.title}</span>
                  <span className="achieve-desc">{ach.desc}</span>
                </div>
                {ach.unlocked ? (
                  <span className="achieve-check">
                    <IconCheck size={14} />
                  </span>
                ) : (
                  <span className="achieve-lock-icon">
                    <IconLock size={13} />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <h3 className="section-subtitle">Tier Performance breakdown</h3>
        <div className="stats-grid">
          {DIFFICULTIES.map((diff) => {
            const d = stats[diff]
            const winRate = d.played > 0 ? Math.round((d.won / d.played) * 100) : 0

            return (
              <div key={diff} className="stat-diff-box">
                <h4 className="diff-name">{diff}</h4>
                <div className="stat-row">
                  <span>Played</span>
                  <strong>{d.played}</strong>
                </div>
                <div className="stat-row">
                  <span>Won</span>
                  <strong>{d.won} ({winRate}%)</strong>
                </div>
                <div className="stat-row">
                  <span>Best Time</span>
                  <strong>{fmtSec(d.bestTimeSec)}</strong>
                </div>
                <div className="stat-row">
                  <span>Streak</span>
                  <strong>{d.currentStreak} (Max {d.bestStreak})</strong>
                </div>
              </div>
            )
          })}
        </div>

        <button className="btn btn-primary stats-action-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

export default memo(StatsModal)
