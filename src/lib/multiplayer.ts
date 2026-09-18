import type { VariantId } from '../sudoku'
import type { Difficulty } from './generator'
import type { PlayerScoreState } from './scoring'

export interface MultiplayerPlayer {
  deviceId: string
  name: string
  ready: boolean
  isHost: boolean
  score: PlayerScoreState
  finished: boolean
  finishTime?: number
}

export interface MatchPayload {
  variantId: VariantId
  difficulty: Difficulty
  puzzle: number[][]
  solution: number[][]
}

export type NetMessage =
  | { type: 'JOIN_ROOM'; roomId: string; player: MultiplayerPlayer }
  | { type: 'PLAYER_STATE'; roomId: string; player: MultiplayerPlayer }
  | { type: 'TOGGLE_READY'; roomId: string; deviceId: string; ready: boolean }
  | { type: 'START_MATCH'; roomId: string; payload: MatchPayload }
  | { type: 'PROGRESS_UPDATE'; roomId: string; deviceId: string; score: PlayerScoreState }
  | { type: 'PLAYER_FINISHED'; roomId: string; deviceId: string; score: PlayerScoreState; timeSec: number }
  | { type: 'LEAVE_ROOM'; roomId: string; deviceId: string }

export function getDeviceId(): string {
  let id = localStorage.getItem('sudoku_device_id')
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36)
    localStorage.setItem('sudoku_device_id', id)
  }
  return id
}

export function getUsername(): string {
  let name = localStorage.getItem('sudoku_username')
  if (!name) {
    name = 'Player-' + Math.floor(1000 + Math.random() * 9000)
    localStorage.setItem('sudoku_username', name)
  }
  return name
}

export function setUsername(name: string): void {
  localStorage.setItem('sudoku_username', name.trim() || getUsername())
}

export type ConnectionState = 'connecting' | 'online' | 'offline' | 'room-full'

/**
 * Resolve the battle relay URL.
 *
 * Set VITE_WS_URL for a relay hosted separately from the app (the usual case:
 * the static app on Netlify/Vercel, the relay on a Node host). Without it, we
 * assume the relay is reverse-proxied at /ws on the app's own origin, and fall
 * back to the local relay during `npm run dev`.
 */
export function resolveRelayUrl(roomId: string, deviceId = getDeviceId()): string {
  const configured = import.meta.env.VITE_WS_URL as string | undefined
  const base = configured
    ? configured.replace(/\/$/, '')
    : import.meta.env.DEV
      ? 'ws://localhost:8787'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
  // The device id lets the relay treat a reconnect as taking over the same
  // slot rather than counting it as a third player.
  return `${base}?room=${encodeURIComponent(roomId)}&device=${encodeURIComponent(deviceId)}`
}

const RECONNECT_BASE_MS = 600
const RECONNECT_MAX_MS = 10_000
/** Must match the close codes in server/index.js. */
const CLOSE_ROOM_FULL = 4409
const CLOSE_SUPERSEDED = 4410

/**
 * Battle transport over a WebSocket relay (see server/index.js).
 *
 * The relay never echoes a message back to its sender, so callers must apply
 * their own actions locally and treat inbound messages as the opponent's.
 *
 * Reconnects automatically with backoff, because a dropped phone or laptop
 * connection should not end a match. Messages sent while offline are queued
 * and flushed on reconnect.
 */
export class MultiplayerClient {
  private ws: WebSocket | null = null
  private roomId: string | null = null
  private deviceId: string = getDeviceId()
  private listener: ((msg: NetMessage) => void) | null = null
  private onState: ((state: ConnectionState) => void) | null = null
  private queue: string[] = []
  private attempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private intentionallyClosed = false

  connect(
    roomId: string,
    onMessage: (msg: NetMessage) => void,
    onState?: (state: ConnectionState) => void
  ): void {
    this.roomId = roomId
    this.listener = onMessage
    this.onState = onState ?? null
    this.intentionallyClosed = false
    this.attempts = 0
    this.open()
  }

  private setState(state: ConnectionState): void {
    this.onState?.(state)
  }

  private open(): void {
    if (!this.roomId) return
    this.setState('connecting')

    let socket: WebSocket
    try {
      socket = new WebSocket(resolveRelayUrl(this.roomId, this.deviceId))
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = socket

    socket.onopen = () => {
      this.attempts = 0
      this.setState('online')
      const pending = this.queue
      this.queue = []
      for (const payload of pending) socket.send(payload)
    }

    socket.onmessage = (evt) => {
      if (!this.listener || typeof evt.data !== 'string') return
      let msg: NetMessage
      try {
        msg = JSON.parse(evt.data) as NetMessage
      } catch {
        return
      }
      if (msg && typeof msg.type === 'string') this.listener(msg)
    }

    socket.onerror = () => {
      // onclose always follows, which is where reconnection is handled.
    }

    socket.onclose = (evt) => {
      this.ws = null
      if (this.intentionallyClosed) {
        this.setState('offline')
        return
      }
      // The relay refused a third player; retrying cannot help.
      if (evt.code === CLOSE_ROOM_FULL) {
        this.setState('room-full')
        return
      }
      // This device opened a newer connection elsewhere (another tab, or a
      // remount). Reconnecting would just evict the live one, so stand down.
      if (evt.code === CLOSE_SUPERSEDED) {
        this.setState('offline')
        return
      }
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || !this.roomId) return
    this.setState('offline')
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.attempts, RECONNECT_MAX_MS)
    this.attempts++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, delay)
  }

  send(msg: NetMessage): void {
    const payload = JSON.stringify(msg)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(payload)
    else this.queue.push(payload)
  }

  disconnect(): void {
    this.intentionallyClosed = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      if (this.roomId && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({ type: 'LEAVE_ROOM', roomId: this.roomId, deviceId: this.deviceId })
        )
      }
      this.ws.close()
      this.ws = null
    }
    this.queue = []
    this.roomId = null
    this.listener = null
    this.setState('offline')
    this.onState = null
  }
}
