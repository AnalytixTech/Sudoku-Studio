// Authoritative wallet.
//
// The one rule that makes this worth having: the client never states an amount.
// It reports what happened ("won a hard puzzle, no mistakes") and the server
// prices it from shared/economy.json. A tampered client can lie about the
// event, which rate limits and plausibility checks bound, but it cannot mint
// coins directly -- and it can never fake a purchase, which is the part that
// costs real money.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SCHEMA } from './db.js'

const ECONOMY = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../shared/economy.json', import.meta.url)), 'utf8')
)

export class WalletError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export function levelFromXp(xp) {
  const { base, step, max } = ECONOMY.level
  let level = 1
  let remaining = Math.max(0, Math.floor(xp))
  let span = base
  while (remaining >= span && level < max) {
    remaining -= span
    level++
    span = base + (level - 1) * step
  }
  return { level, into: remaining, span }
}

/** Price an earn event from the server-side table. Never trusts client amounts. */
export function priceEarn(event) {
  const e = event || {}
  switch (e.type) {
    case 'win': {
      const base = ECONOMY.winCoins[e.difficulty]
      const xp = ECONOMY.winXp[e.difficulty]
      if (base === undefined || xp === undefined) {
        throw new WalletError('bad_difficulty', `unknown difficulty: ${e.difficulty}`)
      }
      // A "solve" faster than a human could physically enter the digits is a
      // forged event, not a speedrun.
      if (Number(e.durationSec) < ECONOMY.limits.minSecondsPerWin) {
        throw new WalletError('implausible', 'win reported too quickly')
      }
      const coins = Math.round(base * (e.flawless ? ECONOMY.flawlessMultiplier : 1))
      return { coins, xp, reason: `win:${e.difficulty}${e.flawless ? ':flawless' : ''}` }
    }
    case 'daily': {
      const streak = Math.max(0, Math.min(Number(e.streak) || 0, 3650))
      const bonus = Math.min(streak * 2, ECONOMY.dailyStreakCoinCap)
      return { coins: ECONOMY.dailyCoins + bonus, xp: ECONOMY.dailyXp, reason: 'daily' }
    }
    case 'battleWin':
      return { coins: ECONOMY.battleWinCoins, xp: ECONOMY.battleWinXp, reason: 'battle:win' }
    case 'battlePlayed':
      return { coins: 0, xp: ECONOMY.battlePlayedXp, reason: 'battle:played' }
    default:
      throw new WalletError('bad_event', `unknown earn type: ${e.type}`)
  }
}

export function priceSpend(item) {
  const cost = ECONOMY.costs[item]
  if (cost === undefined) throw new WalletError('bad_item', `unknown helper: ${item}`)
  return { coins: cost, reason: `spend:${item}` }
}

export function priceCosmetic(item) {
  const entry = ECONOMY.cosmetics[item]
  if (!entry || typeof entry.price !== 'number') {
    throw new WalletError('bad_item', `unknown cosmetic: ${item}`)
  }
  return entry
}

// ---------------------------------------------------------------------------

export async function getWallet(db, userId) {
  const { rows } = await db.query(
    `SELECT coins, xp FROM ${SCHEMA}.wallets WHERE user_id = $1`,
    [userId]
  )
  const w = rows[0] || { coins: 0, xp: 0 }
  return { coins: Number(w.coins), xp: Number(w.xp), ...levelFromXp(Number(w.xp)) }
}

export async function getEntitlements(db, userId) {
  const { rows } = await db.query(`SELECT item FROM ${SCHEMA}.entitlements WHERE user_id = $1`, [userId])
  return rows.map((r) => r.item)
}

/**
 * Apply a balance change atomically.
 *
 * `eventId` is the ledger primary key, so a replayed request is absorbed rather
 * than paid out twice -- important when a flaky mobile connection retries.
 */
async function applyDelta(db, { userId, eventId, kind, reason, coins = 0, xp = 0 }) {
  return db.tx(async (c) => {
    const existing = await c.query(`SELECT id FROM ${SCHEMA}.ledger WHERE id = $1`, [eventId])
    if (existing.rows.length > 0) {
      const w = await c.query(`SELECT coins, xp FROM ${SCHEMA}.wallets WHERE user_id = $1`, [userId])
      const row = w.rows[0] || { coins: 0, xp: 0 }
      return { replayed: true, coins: Number(row.coins), xp: Number(row.xp) }
    }

    // Lock the row so concurrent requests cannot interleave a read and a write.
    const cur = await c.query(`SELECT coins, xp FROM ${SCHEMA}.wallets WHERE user_id = $1 FOR UPDATE`, [
      userId,
    ])
    const balance = cur.rows[0] || { coins: 0, xp: 0 }
    const nextCoins = Number(balance.coins) + coins
    const nextXp = Number(balance.xp) + xp
    if (nextCoins < 0) throw new WalletError('insufficient_funds', 'not enough coins', 402)

    await c.query(
      `INSERT INTO ${SCHEMA}.ledger (id, user_id, kind, reason, delta_coins, delta_xp)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [eventId, userId, kind, reason, coins, xp]
    )
    await c.query(
      `UPDATE ${SCHEMA}.wallets SET coins = $2, xp = $3, updated_at = now() WHERE user_id = $1`,
      [userId, nextCoins, nextXp]
    )
    return { replayed: false, coins: nextCoins, xp: nextXp }
  })
}

async function assertEarnRateOk(db, userId) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM ${SCHEMA}.ledger
     WHERE user_id = $1 AND kind = 'earn' AND created_at > now() - interval '1 hour'`,
    [userId]
  )
  if (Number(rows[0].n) >= ECONOMY.limits.maxEarnsPerHour) {
    throw new WalletError('rate_limited', 'too many rewards this hour', 429)
  }
}

export async function earn(db, userId, event) {
  const eventId = String(event?.eventId || '')
  if (eventId.length < 8 || eventId.length > 64) {
    throw new WalletError('bad_event_id', 'eventId must be 8-64 chars')
  }
  await assertEarnRateOk(db, userId)

  const priced = priceEarn(event)
  if (priced.coins > ECONOMY.limits.maxCoinsPerEarn) {
    throw new WalletError('implausible', 'reward above the per-event cap')
  }
  const res = await applyDelta(db, {
    userId,
    eventId,
    kind: 'earn',
    reason: priced.reason,
    coins: priced.coins,
    xp: priced.xp,
  })
  return { ...res, granted: res.replayed ? { coins: 0, xp: 0 } : priced, ...levelFromXp(res.xp) }
}

export async function spend(db, userId, { eventId, item }) {
  const priced = priceSpend(item)
  const res = await applyDelta(db, {
    userId,
    eventId: String(eventId || randomUUID()),
    kind: 'spend',
    reason: priced.reason,
    coins: -priced.coins,
  })
  return { ...res, ...levelFromXp(res.xp) }
}

/** Buy a cosmetic: level checked, coins debited and entitlement granted together. */
export async function buyCosmetic(db, userId, { eventId, item }) {
  const entry = priceCosmetic(item)
  const wallet = await getWallet(db, userId)
  if (entry.minLevel && wallet.level < entry.minLevel) {
    throw new WalletError('level_locked', `requires level ${entry.minLevel}`, 403)
  }

  const owned = await db.query(
    `SELECT item FROM ${SCHEMA}.entitlements WHERE user_id = $1 AND item = $2`,
    [userId, item]
  )
  if (owned.rows.length > 0) return { alreadyOwned: true, ...(await getWallet(db, userId)) }

  const id = String(eventId || randomUUID())
  await db.tx(async (c) => {
    const dup = await c.query(`SELECT id FROM ${SCHEMA}.ledger WHERE id = $1`, [id])
    if (dup.rows.length > 0) return

    const cur = await c.query(`SELECT coins, xp FROM ${SCHEMA}.wallets WHERE user_id = $1 FOR UPDATE`, [
      userId,
    ])
    const balance = cur.rows[0] || { coins: 0, xp: 0 }
    const next = Number(balance.coins) - entry.price
    if (next < 0) throw new WalletError('insufficient_funds', 'not enough coins', 402)

    await c.query(
      `INSERT INTO ${SCHEMA}.ledger (id, user_id, kind, reason, delta_coins, delta_xp)
       VALUES ($1, $2, 'purchase', $3, $4, 0)`,
      [id, userId, `cosmetic:${item}`, -entry.price]
    )
    await c.query(`UPDATE ${SCHEMA}.wallets SET coins = $2, updated_at = now() WHERE user_id = $1`, [
      userId,
      next,
    ])
    await c.query(
      `INSERT INTO ${SCHEMA}.entitlements (user_id, item) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, item]
    )
  })

  return { alreadyOwned: false, ...(await getWallet(db, userId)) }
}

/**
 * Credit coins from outside gameplay — a completed Stripe payment or a
 * rewarded ad. Kept separate from `earn` so paid currency is auditable in the
 * ledger and never subject to the gameplay rate limit.
 */
export async function credit(db, userId, { eventId, coins, reason }) {
  const amount = Math.floor(Number(coins))
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new WalletError('bad_amount', 'credit must be a positive integer')
  }
  const res = await applyDelta(db, {
    userId,
    eventId: String(eventId),
    kind: 'credit',
    reason: reason || 'credit',
    coins: amount,
  })
  return { ...res, ...levelFromXp(res.xp) }
}

/**
 * One-time credit for coins a player earned before they had an account.
 *
 * Capped, because the amount is asserted by the client: a tampered browser
 * could otherwise claim a million coins by editing localStorage and signing in.
 * The ledger id is derived from the user, so it can only ever happen once.
 */
export async function migrateLocalBalance(db, userId, localCoins) {
  const claimed = Math.max(0, Math.floor(Number(localCoins) || 0))
  const amount = Math.min(claimed, ECONOMY.limits.migrationCap)
  const eventId = `migrate_${userId}`

  const already = await db.query(`SELECT id FROM ${SCHEMA}.ledger WHERE id = $1`, [eventId])
  if (already.rows.length > 0) {
    return { migrated: false, ...(await getWallet(db, userId)) }
  }
  if (amount <= 0) {
    // Record the attempt so a later, larger claim cannot be made.
    await applyDelta(db, { userId, eventId, kind: 'grant', reason: 'migrate:local', coins: 0 })
    return { migrated: false, ...(await getWallet(db, userId)) }
  }
  await applyDelta(db, {
    userId,
    eventId,
    kind: 'grant',
    reason: 'migrate:local',
    coins: amount,
  })
  return { migrated: true, amount, ...(await getWallet(db, userId)) }
}

/**
 * Delete the account and everything attached to it.
 *
 * Google Play requires any app with accounts to offer this, reachable both
 * in-app and from a public URL. Every child table cascades from users.
 */
export async function deleteAccount(db, userId) {
  await db.query(`DELETE FROM ${SCHEMA}.users WHERE id = $1`, [userId])
  return { deleted: true }
}

export { ECONOMY }
