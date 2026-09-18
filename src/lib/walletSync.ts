// Keeps the local wallet and the server wallet in agreement.
//
// The app must stay playable offline, so mutations apply locally first and are
// queued for the server. Queued events carry a client-generated id and the
// server's ledger is keyed on it, so replaying the queue after a flaky
// connection cannot pay out twice.
//
// When the two disagree, the server wins: reconcile() overwrites the local
// cache. That is the whole point — the local number is a display value, the
// server number is the real balance.

import { ApiError, fetchMe, loadSession, postEarn, postSpend, postMigrate } from './api'
import type { Difficulty } from './generator'

const QUEUE_KEY = 'sudoku_sync_queue_v1'
const MAX_QUEUE = 200

export type PendingEvent =
  | { id: string; kind: 'earn'; payload: Record<string, unknown> }
  | { id: string; kind: 'spend'; payload: { eventId: string; item: string } }

function newId(): string {
  // crypto.randomUUID needs a secure context; fall back for plain http dev.
  try {
    return crypto.randomUUID()
  } catch {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  }
}

function readQueue(): PendingEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueue(events: PendingEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-MAX_QUEUE)))
  } catch {
    // A full quota must not break gameplay.
  }
}

export function pendingCount(): number {
  return readQueue().length
}

function enqueue(event: PendingEvent): void {
  if (!loadSession()) return // signed out: the local wallet is the only wallet
  writeQueue([...readQueue(), event])
  void flush()
}

/** Record a gameplay reward. The server prices it; amounts here are advisory. */
export function queueEarn(
  event:
    | { type: 'win'; difficulty: Difficulty; flawless: boolean; durationSec: number }
    | { type: 'daily'; streak: number }
    | { type: 'battleWin' }
    | { type: 'battlePlayed' }
): void {
  const id = newId()
  enqueue({ id, kind: 'earn', payload: { ...event, eventId: id } })
}

export function queueSpend(item: 'hint' | 'autoNotes' | 'autoSolve' | 'continue'): void {
  const id = newId()
  enqueue({ id, kind: 'spend', payload: { eventId: id, item } })
}

let flushing = false

/**
 * Send queued events oldest-first.
 *
 * Stops at the first network failure so ordering is preserved; drops events the
 * server permanently rejects, since retrying those forever would wedge the
 * queue behind one bad item.
 */
export async function flush(): Promise<boolean> {
  if (flushing || !loadSession()) return false
  const queue = readQueue()
  if (queue.length === 0) return true

  flushing = true
  try {
    let remaining = [...queue]
    while (remaining.length > 0) {
      const event = remaining[0]
      try {
        if (event.kind === 'earn') await postEarn(event.payload)
        else await postSpend(event.payload)
        remaining = remaining.slice(1)
        writeQueue(remaining)
      } catch (err) {
        if (err instanceof ApiError && err.permanent) {
          // Rejected for good (bad event, insufficient funds). Drop and continue.
          console.warn('Dropping rejected sync event', event.kind, err.code)
          remaining = remaining.slice(1)
          writeQueue(remaining)
          continue
        }
        return false // offline or server trouble: keep the rest for later
      }
    }
    return true
  } finally {
    flushing = false
  }
}

export interface ServerState {
  coins: number
  xp: number
  entitlements: string[]
}

/**
 * Pull the authoritative balance. Call after sign-in, on app start, and once
 * the queue has drained — otherwise in-flight events would be overwritten by a
 * stale server figure.
 */
export async function reconcile(): Promise<ServerState | null> {
  if (!loadSession()) return null
  const drained = await flush()
  if (!drained) return null
  try {
    const me = await fetchMe()
    return { coins: me.wallet.coins, xp: me.wallet.xp, entitlements: me.entitlements }
  } catch {
    return null
  }
}

/**
 * Offer the signed-out balance to a freshly signed-in account.
 *
 * The server caps what it honours: this number comes from localStorage and a
 * tampered client could claim anything.
 */
export async function migrateLocal(localCoins: number): Promise<boolean> {
  try {
    const res = await postMigrate(localCoins)
    return Boolean(res.migrated)
  } catch {
    return false
  }
}

/** Flush whenever the browser regains connectivity. */
export function startAutoFlush(): () => void {
  const onOnline = () => void flush()
  window.addEventListener('online', onOnline)
  return () => window.removeEventListener('online', onOnline)
}
