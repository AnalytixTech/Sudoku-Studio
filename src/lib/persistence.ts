// Autosave for the in-progress puzzle.
//
// Before this, board/notes/history lived only in React state, so a refresh --
// or the OS evicting a backgrounded PWA -- silently destroyed the game.

import type { Difficulty } from './generator'
import type { Grid, VariantConfig, VariantId } from '../sudoku'

const SAVE_KEY = 'sudoku_active_game_v1'
const VERSION = 1

export interface SavedGame {
  v: number
  savedAt: number
  variantId: VariantId
  /** Stored whole: jigsaw region maps are randomised per game, so the id alone
   *  is not enough to rebuild the board. */
  config: VariantConfig
  difficulty: Difficulty
  original: Grid
  solution: Grid
  board: Grid
  /** Sets are not JSON-serialisable, so notes travel as arrays. */
  notes: Record<string, number[]>
  history: { board: Grid; notes: Record<string, number[]> }[]
  historyIdx: number
  seconds: number
  mistakes: number
  usedNotes: boolean
  isDaily: boolean
  dailyDate?: string
}

export type NoteMap = Record<string, Set<number>>

export function notesToJson(notes: NoteMap): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  for (const [k, set] of Object.entries(notes)) {
    if (set && set.size > 0) out[k] = Array.from(set)
  }
  return out
}

export function notesFromJson(raw: Record<string, number[]> | undefined): NoteMap {
  const out: NoteMap = {}
  for (const [k, arr] of Object.entries(raw || {})) {
    if (Array.isArray(arr)) out[k] = new Set(arr.filter((n) => typeof n === 'number'))
  }
  return out
}

function isGrid(g: unknown, size: number): g is Grid {
  return (
    Array.isArray(g) &&
    g.length === size &&
    g.every((row) => Array.isArray(row) && row.length === size && row.every((v) => typeof v === 'number'))
  )
}

export function saveGame(game: SavedGame): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game))
  } catch (e) {
    // Quota or private mode: losing autosave must never break play.
    console.warn('Could not autosave game', e)
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // ignore
  }
}

/** Returns the saved game, or null if absent, malformed, or already finished. */
export function loadGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const g = JSON.parse(raw) as SavedGame
    if (!g || g.v !== VERSION) return null

    const size = g.config?.size
    if (typeof size !== 'number' || size < 4 || size > 9) return null
    if (!isGrid(g.original, size) || !isGrid(g.solution, size) || !isGrid(g.board, size)) return null
    if (typeof g.difficulty !== 'string') return null

    // A finished board is not worth resuming into.
    const empty = g.board.reduce((n, row) => n + row.filter((v) => v === 0).length, 0)
    if (empty === 0) return null

    return {
      ...g,
      notes: g.notes && typeof g.notes === 'object' ? g.notes : {},
      history: Array.isArray(g.history) ? g.history : [],
      historyIdx: Number.isFinite(g.historyIdx) ? g.historyIdx : -1,
      seconds: Math.max(0, Math.floor(Number(g.seconds) || 0)),
      mistakes: Math.max(0, Math.floor(Number(g.mistakes) || 0)),
      usedNotes: Boolean(g.usedNotes),
      isDaily: Boolean(g.isDaily),
    }
  } catch {
    return null
  }
}

export interface ResumeSummary {
  variantName: string
  difficulty: Difficulty
  seconds: number
  filled: number
  total: number
  isDaily: boolean
  savedAt: number
}

export function summarize(g: SavedGame): ResumeSummary {
  const total = g.config.size * g.config.size
  const filled = g.board.reduce((n, row) => n + row.filter((v) => v !== 0).length, 0)
  return {
    variantName: g.config.name,
    difficulty: g.difficulty,
    seconds: g.seconds,
    filled,
    total,
    isDaily: g.isDaily,
    savedAt: g.savedAt,
  }
}

export const SAVE_VERSION = VERSION
