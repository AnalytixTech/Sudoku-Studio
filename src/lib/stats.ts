// Player statistics tracking in localStorage

import type { Difficulty } from './generator'

export interface DifficultyStats {
  played: number
  won: number
  bestTimeSec: number | null
  currentStreak: number
  bestStreak: number
}

export type AllStats = Record<Difficulty, DifficultyStats>

export interface ExtraStats {
  battlePlayed: number
  battleWon: number
  flawlessSolves: number
  noNotesSolves: number
}

const STORAGE_KEY = 'sudoku_player_stats_v1'
const XP_STORAGE_KEY = 'sudoku_player_xp_v1'
const EXTRA_KEY = 'sudoku_extra_stats_v1'

const defaultDiffStats = (): DifficultyStats => ({
  played: 0,
  won: 0,
  bestTimeSec: null,
  currentStreak: 0,
  bestStreak: 0,
})

const defaultAllStats = (): AllStats => ({
  easy: defaultDiffStats(),
  medium: defaultDiffStats(),
  hard: defaultDiffStats(),
  expert: defaultDiffStats(),
  master: defaultDiffStats(),
  'grand master': defaultDiffStats(),
})

const defaultExtraStats = (): ExtraStats => ({
  battlePlayed: 0,
  battleWon: 0,
  flawlessSolves: 0,
  noNotesSolves: 0,
})

export function loadStats(): AllStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultAllStats()
    const parsed = JSON.parse(raw)
    return { ...defaultAllStats(), ...parsed }
  } catch {
    return defaultAllStats()
  }
}

export function saveStats(stats: AllStats): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch (e) {
    console.error('Failed to save stats to localStorage', e)
  }
}

export function loadExtraStats(): ExtraStats {
  try {
    const raw = localStorage.getItem(EXTRA_KEY)
    if (!raw) return defaultExtraStats()
    return { ...defaultExtraStats(), ...JSON.parse(raw) }
  } catch {
    return defaultExtraStats()
  }
}

export function saveExtraStats(extra: ExtraStats): void {
  try {
    localStorage.setItem(EXTRA_KEY, JSON.stringify(extra))
  } catch (e) {
    console.error('Failed to save extra stats', e)
  }
}

export function loadUserXp(): number {
  try {
    const raw = localStorage.getItem(XP_STORAGE_KEY)
    if (raw === null) return 250 // Initial welcome bonus XP
    return parseInt(raw, 10) || 0
  } catch {
    return 250
  }
}

export function saveUserXp(xp: number): void {
  try {
    localStorage.setItem(XP_STORAGE_KEY, String(Math.max(0, xp)))
  } catch (e) {
    console.error('Failed to save XP to localStorage', e)
  }
}

export function recordGameStart(diff: Difficulty): AllStats {
  const stats = loadStats()
  stats[diff].played += 1
  saveStats(stats)
  return stats
}

export function recordGameWin(diff: Difficulty, timeSec: number, mistakes: number = 0, usedNotes: boolean = true): AllStats {
  const stats = loadStats()
  const dStats = stats[diff]
  dStats.won += 1
  if (dStats.bestTimeSec === null || timeSec < dStats.bestTimeSec) {
    dStats.bestTimeSec = timeSec
  }
  dStats.currentStreak += 1
  if (dStats.currentStreak > dStats.bestStreak) {
    dStats.bestStreak = dStats.currentStreak
  }
  saveStats(stats)

  const extra = loadExtraStats()
  if (mistakes === 0) extra.flawlessSolves += 1
  if (!usedNotes) extra.noNotesSolves += 1
  saveExtraStats(extra)

  // Award XP for puzzle win
  const rewardXp = 150 + dStats.currentStreak * 25
  const currentXp = loadUserXp()
  saveUserXp(currentXp + rewardXp)

  return stats
}

export function recordBattleWin(): void {
  const extra = loadExtraStats()
  extra.battleWon += 1
  extra.battlePlayed += 1
  saveExtraStats(extra)
  saveUserXp(loadUserXp() + 300)
}

export function recordBattlePlayed(): void {
  const extra = loadExtraStats()
  extra.battlePlayed += 1
  saveExtraStats(extra)
}

export function recordGameLossOrReset(diff: Difficulty): AllStats {
  const stats = loadStats()
  stats[diff].currentStreak = 0
  saveStats(stats)
  return stats
}
