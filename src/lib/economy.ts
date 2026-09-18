// Player economy: one spendable currency, one progression track.
//
// Coins are spent on helpers and continues. XP is only ever earned and drives
// the player's Level. Keeping them separate removes the old ambiguity where the
// top bar and the stats modal both showed a number called "XP" but meant
// different things -- and it gives rewarded ads somewhere unambiguous to pay
// into (coins), without letting an ad buy progression.

import type { Difficulty } from './generator'
import { getTodayDateString } from './daily'

const WALLET_KEY = 'sudoku_wallet_v1'
const LEGACY_XP_KEY = 'sudoku_player_xp_v1'

export interface Wallet {
  coins: number
  /** Lifetime XP earned. Never decreases. */
  xp: number
  /** Date string of the last day a free continue was used. */
  continueDate: string
  continuesUsedToday: number
}

// ---------------------------------------------------------------------------
// Prices and rewards
//
// Tuned so a single win roughly buys a single hint: helpers should feel like a
// real decision. Before, a win paid 150+ while a hint cost 20, so the currency
// was effectively free and there was nothing for an ad reward to be worth.
// ---------------------------------------------------------------------------

export const COSTS = {
  hint: 15,
  autoNotes: 25,
  autoSolve: 60,
  continue: 40,
} as const

export type CostKey = keyof typeof COSTS

export const START_COINS = 100
export const FREE_CONTINUES_PER_DAY = 1

const WIN_COINS: Record<Difficulty, number> = {
  easy: 8,
  medium: 12,
  hard: 18,
  expert: 25,
  master: 35,
  'grand master': 50,
}

const WIN_XP: Record<Difficulty, number> = {
  easy: 20,
  medium: 35,
  hard: 60,
  expert: 90,
  master: 130,
  'grand master': 180,
}

export const FLAWLESS_MULTIPLIER = 1.5
export const DAILY_COINS = 25
export const DAILY_XP = 100
export const DAILY_STREAK_COIN_CAP = 20
export const BATTLE_WIN_COINS = 30
export const BATTLE_WIN_XP = 120
export const BATTLE_PLAYED_XP = 25

export interface Reward {
  coins: number
  xp: number
  /** Human-readable lines for the results screen. */
  lines: string[]
}

export function winReward(difficulty: Difficulty, flawless: boolean): Reward {
  const base = WIN_COINS[difficulty] ?? WIN_COINS.medium
  const coins = Math.round(base * (flawless ? FLAWLESS_MULTIPLIER : 1))
  const xp = WIN_XP[difficulty] ?? WIN_XP.medium
  const lines = [`${difficulty} solve +${base}`]
  if (flawless) lines.push(`flawless bonus +${coins - base}`)
  return { coins, xp, lines }
}

export function dailyReward(streak: number): Reward {
  const streakBonus = Math.min(Math.max(streak, 0) * 2, DAILY_STREAK_COIN_CAP)
  return {
    coins: DAILY_COINS + streakBonus,
    xp: DAILY_XP,
    lines: [
      `daily challenge +${DAILY_COINS}`,
      ...(streakBonus > 0 ? [`${streak}-day streak +${streakBonus}`] : []),
    ],
  }
}

export function battleWinReward(): Reward {
  return { coins: BATTLE_WIN_COINS, xp: BATTLE_WIN_XP, lines: [`battle win +${BATTLE_WIN_COINS}`] }
}

// ---------------------------------------------------------------------------
// Levels
//
// A rising curve, so early levels arrive quickly and later ones mean something.
// Level n -> n+1 costs BASE + (n-1) * STEP.
// ---------------------------------------------------------------------------

const LEVEL_BASE = 200
const LEVEL_STEP = 100
const MAX_LEVEL = 999

export interface LevelInfo {
  level: number
  /** XP earned inside the current level. */
  into: number
  /** XP the current level spans. */
  span: number
  pct: number
}

export function xpToAdvance(level: number): number {
  return LEVEL_BASE + Math.max(0, level - 1) * LEVEL_STEP
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1
  let remaining = Math.max(0, Math.floor(xp))
  let span = xpToAdvance(level)
  while (remaining >= span && level < MAX_LEVEL) {
    remaining -= span
    level++
    span = xpToAdvance(level)
  }
  return { level, into: remaining, span, pct: Math.round((remaining / span) * 100) }
}

export const RANKS: { min: number; name: string }[] = [
  { min: 40, name: 'Sudoku Overlord' },
  { min: 25, name: 'Grandmaster' },
  { min: 15, name: 'Master Solver' },
  { min: 8, name: 'Adept Strategist' },
  { min: 4, name: 'Sharp Thinker' },
  { min: 1, name: 'Novice Solver' },
]

export function rankName(level: number): string {
  return RANKS.find((r) => level >= r.min)?.name ?? 'Novice Solver'
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function emptyWallet(): Wallet {
  return { coins: START_COINS, xp: 0, continueDate: '', continuesUsedToday: 0 }
}

/**
 * Carry an existing player over from the old single-XP model.
 *
 * Old balances ran into the thousands because sinks were negligible, so the
 * coin balance is capped -- otherwise a returning player would start with
 * enough to never make a spending decision again. Their lifetime XP is seeded
 * from the same value so their Level does not visibly drop.
 */
function migrateLegacy(): Wallet | null {
  try {
    const raw = localStorage.getItem(LEGACY_XP_KEY)
    if (raw === null) return null
    const legacy = parseInt(raw, 10)
    if (!Number.isFinite(legacy)) return null
    return {
      coins: Math.min(Math.max(legacy, 0), 300),
      xp: Math.max(0, legacy),
      continueDate: '',
      continuesUsedToday: 0,
    }
  } catch {
    return null
  }
}

export function loadWallet(): Wallet {
  try {
    const raw = localStorage.getItem(WALLET_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Wallet>
      return {
        coins: Math.max(0, Math.floor(Number(parsed.coins) || 0)),
        xp: Math.max(0, Math.floor(Number(parsed.xp) || 0)),
        continueDate: typeof parsed.continueDate === 'string' ? parsed.continueDate : '',
        continuesUsedToday: Math.max(0, Math.floor(Number(parsed.continuesUsedToday) || 0)),
      }
    }
    const migrated = migrateLegacy()
    if (migrated) {
      saveWallet(migrated)
      return migrated
    }
  } catch {
    // fall through to a fresh wallet
  }
  return emptyWallet()
}

/**
 * Replace the local balance with the server's.
 *
 * The local wallet is a cache for display; when the two disagree the server is
 * right, so reconciliation overwrites rather than merges.
 */
export function overwriteWallet(coins: number, xp: number): Wallet {
  const current = loadWallet()
  const next: Wallet = {
    ...current,
    coins: Math.max(0, Math.floor(coins)),
    xp: Math.max(0, Math.floor(xp)),
  }
  saveWallet(next)
  return next
}

export function saveWallet(wallet: Wallet): void {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(wallet))
  } catch (e) {
    console.error('Failed to save wallet', e)
  }
}

export function grant(reward: Reward): Wallet {
  const wallet = loadWallet()
  const next: Wallet = {
    ...wallet,
    coins: wallet.coins + Math.max(0, reward.coins),
    xp: wallet.xp + Math.max(0, reward.xp),
  }
  saveWallet(next)
  return next
}

export function grantXp(xp: number): Wallet {
  return grant({ coins: 0, xp, lines: [] })
}

/** Spend coins. Returns the new wallet, or null when the balance is short. */
export function spend(amount: number): Wallet | null {
  const wallet = loadWallet()
  if (wallet.coins < amount) return null
  const next = { ...wallet, coins: wallet.coins - amount }
  saveWallet(next)
  return next
}

/** Add coins from outside the reward table -- e.g. a future rewarded ad. */
export function credit(coins: number): Wallet {
  return grant({ coins, xp: 0, lines: [] })
}

// ---------------------------------------------------------------------------
// Continues
// ---------------------------------------------------------------------------

export interface ContinueOffer {
  freeRemaining: number
  cost: number
  affordable: boolean
}

export function continueOffer(wallet: Wallet = loadWallet()): ContinueOffer {
  const today = getTodayDateString()
  const usedToday = wallet.continueDate === today ? wallet.continuesUsedToday : 0
  const freeRemaining = Math.max(0, FREE_CONTINUES_PER_DAY - usedToday)
  return {
    freeRemaining,
    cost: COSTS.continue,
    affordable: freeRemaining > 0 || wallet.coins >= COSTS.continue,
  }
}

/** Consume a continue, using the daily free one first. Null when unaffordable. */
export function takeContinue(): Wallet | null {
  const wallet = loadWallet()
  const today = getTodayDateString()
  const usedToday = wallet.continueDate === today ? wallet.continuesUsedToday : 0

  if (usedToday < FREE_CONTINUES_PER_DAY) {
    const next: Wallet = { ...wallet, continueDate: today, continuesUsedToday: usedToday + 1 }
    saveWallet(next)
    return next
  }
  if (wallet.coins < COSTS.continue) return null
  const next: Wallet = {
    ...wallet,
    coins: wallet.coins - COSTS.continue,
    continueDate: today,
    continuesUsedToday: usedToday + 1,
  }
  saveWallet(next)
  return next
}
