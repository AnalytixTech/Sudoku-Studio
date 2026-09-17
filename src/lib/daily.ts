// Daily Challenge puzzle generator and status tracking

import { generate, type Difficulty } from './generator'
import { VARIANT_CONFIGS, type Grid, type VariantConfig } from '../sudoku'

const DAILY_STORAGE_KEY = 'sudoku_daily_status_v1'

export interface DailyStatus {
  completedDates: string[]
  currentStreak: number
  lastCompletedDate: string | null
}

export function getTodayDateString(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function loadDailyStatus(): DailyStatus {
  try {
    const raw = localStorage.getItem(DAILY_STORAGE_KEY)
    if (!raw) return { completedDates: [], currentStreak: 0, lastCompletedDate: null }
    const parsed = JSON.parse(raw)
    return {
      completedDates: parsed.completedDates || [],
      currentStreak: parsed.currentStreak || 0,
      lastCompletedDate: parsed.lastCompletedDate || null,
    }
  } catch {
    return { completedDates: [], currentStreak: 0, lastCompletedDate: null }
  }
}

export function saveDailyStatus(status: DailyStatus): void {
  try {
    localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(status))
  } catch (e) {
    console.error('Failed to save daily status', e)
  }
}

export function isTodayCompleted(): boolean {
  const today = getTodayDateString()
  const status = loadDailyStatus()
  return status.completedDates.includes(today)
}

export function recordDailyCompletion(): { newStreak: number; bonusXp: number } {
  const today = getTodayDateString()
  const status = loadDailyStatus()

  if (status.completedDates.includes(today)) {
    return { newStreak: status.currentStreak, bonusXp: 0 }
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0')
  const yDay = String(yesterday.getDate()).padStart(2, '0')
  const yesterdayStr = `${yesterday.getFullYear()}-${yMonth}-${yDay}`

  let newStreak = 1
  if (status.lastCompletedDate === yesterdayStr) {
    newStreak = status.currentStreak + 1
  }

  const updated: DailyStatus = {
    completedDates: [...status.completedDates, today],
    currentStreak: newStreak,
    lastCompletedDate: today,
  }

  saveDailyStatus(updated)
  return { newStreak, bonusXp: 200 + newStreak * 25 }
}

// Simple seeded pseudo-random number generator
function pseudoRandom(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function stringToSeed(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function generateDailyPuzzle(dateStr: string = getTodayDateString()): {
  puzzle: Grid
  solution: Grid
  difficulty: Difficulty
  config: VariantConfig
} {
  const seed = stringToSeed(dateStr)
  const rng = pseudoRandom(seed)
  const difficulties: Difficulty[] = ['medium', 'hard', 'expert']
  const diffIndex = Math.floor(rng() * difficulties.length)
  const difficulty = difficulties[diffIndex]
  const config = VARIANT_CONFIGS['9x9']

  // Temporarily override Math.random with seeded rng during generation
  const origRandom = Math.random
  Math.random = rng
  try {
    const { puzzle, solution } = generate(difficulty, config)
    return { puzzle, solution, difficulty, config }
  } finally {
    Math.random = origRandom
  }
}
