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

export class MultiplayerClient {
  private channel: BroadcastChannel | null = null
  private roomId: string | null = null
  private deviceId: string = getDeviceId()
  private listener: ((msg: NetMessage) => void) | null = null

  connect(roomId: string, onMessage: (msg: NetMessage) => void): void {
    this.roomId = roomId
    this.listener = onMessage
    this.channel = new BroadcastChannel(`sudoku_battle_${roomId}`)
    this.channel.onmessage = (evt) => {
      if (this.listener && evt.data) {
        this.listener(evt.data as NetMessage)
      }
    }
  }

  send(msg: NetMessage): void {
    if (this.channel) {
      this.channel.postMessage(msg)
    }
  }

  disconnect(): void {
    if (this.channel) {
      if (this.roomId) {
        this.send({ type: 'LEAVE_ROOM', roomId: this.roomId, deviceId: this.deviceId })
      }
      this.channel.close()
      this.channel = null
    }
    this.roomId = null
    this.listener = null
  }
}
