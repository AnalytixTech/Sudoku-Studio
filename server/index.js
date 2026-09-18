// Battle relay: a room-scoped WebSocket fan-out for 1v1 Sudoku battles.
//
// The server is deliberately dumb. It never inspects game state, decides a
// winner, or generates puzzles -- the host client remains authoritative, exactly
// as it was when battles ran over BroadcastChannel. All this does is copy each
// message to the other player in the same room.
//
// Run locally:  npm run relay        (listens on ws://localhost:8787)
// Health check: GET /health

import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { openDb } from './api/db.js'
import { createApi } from './api/routes.js'

const PORT = Number(process.env.PORT) || 8787

// 1v1: a third connection to a full room is refused rather than silently
// joined, which would otherwise make two players see mismatched opponents.
const MAX_PER_ROOM = 2
// Application-defined close code (4000-4999 is reserved for app use).
const CLOSE_ROOM_FULL = 4409
// The same device opened a newer connection; the old one steps aside quietly.
const CLOSE_SUPERSEDED = 4410
const MAX_PAYLOAD_BYTES = 512 * 1024
const HEARTBEAT_MS = 30_000
const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,64}$/

// Message types the client protocol defines. Anything else is dropped so a
// stray sender cannot use the relay to push arbitrary payloads at a player.
const RELAYABLE = new Set([
  'JOIN_ROOM',
  'PLAYER_STATE',
  'TOGGLE_READY',
  'START_MATCH',
  'PROGRESS_UPDATE',
  'PLAYER_FINISHED',
  'LEAVE_ROOM',
])

// Comma-separated list, e.g. "https://my-sudoku.netlify.app". Empty = allow any.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function originAllowed(origin) {
  if (ALLOWED_ORIGINS.length === 0) return true
  if (!origin) return false
  return ALLOWED_ORIGINS.includes(origin)
}

/** @type {Map<string, Set<import('ws').WebSocket>>} */
const rooms = new Map()

// The wallet API is optional: without DATABASE_URL the service still runs as a
// pure relay, so battles keep working even if the database is unreachable.
let handleApi = null
if (process.env.DATABASE_URL || process.env.WALLET_API === '1') {
  try {
    const db = await openDb()
    handleApi = createApi(db, ALLOWED_ORIGINS)
    console.log('Wallet API enabled at /api')
  } catch (err) {
    console.error('Wallet API disabled — database unavailable:', err.message)
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    const players = [...rooms.values()].reduce((n, set) => n + set.size, 0)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players, api: Boolean(handleApi) }))
    return
  }
  if (handleApi && req.url.startsWith('/api/')) {
    handleApi(req, res).catch((err) => {
      console.error('Unhandled API error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'server_error' }))
      }
    })
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES })

server.on('upgrade', (req, socket, head) => {
  let roomId = null
  let deviceId = null
  try {
    const params = new URL(req.url, 'http://placeholder').searchParams
    roomId = params.get('room')
    deviceId = params.get('device')
  } catch {
    roomId = null
  }

  const reject = (status, reason) => {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
    socket.destroy()
  }

  if (!roomId || !ROOM_ID_RE.test(roomId)) return reject(400, 'Bad Request')
  if (!originAllowed(req.headers.origin)) return reject(403, 'Forbidden')

  const peers = rooms.get(roomId)

  // Capacity is two DEVICES, not two sockets. A client that reconnects -- a
  // dropped network, or a remount opening a fresh socket before the old one has
  // finished closing -- takes over its own slot instead of being counted as a
  // third player and locked out of its own match.
  let stale = null
  if (peers && deviceId) {
    for (const peer of peers) {
      if (peer.deviceId && peer.deviceId === deviceId) stale = peer
    }
  }
  const occupants = peers ? peers.size - (stale ? 1 : 0) : 0
  const full = occupants >= MAX_PER_ROOM

  wss.handleUpgrade(req, socket, head, (ws) => {
    // A refused HTTP upgrade reaches the browser only as an opaque 1006, so a
    // full room is accepted and then closed with an application code the
    // client can actually distinguish from a network drop.
    if (full) {
      ws.close(CLOSE_ROOM_FULL, 'room full')
      return
    }
    if (stale) {
      stale.supersededBy = deviceId
      stale.close(CLOSE_SUPERSEDED, 'reconnected elsewhere')
    }
    ws.roomId = roomId
    ws.deviceId = deviceId || null
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws) => {
  const roomId = ws.roomId
  if (!rooms.has(roomId)) rooms.set(roomId, new Set())
  rooms.get(roomId).add(ws)

  ws.isAlive = true
  ws.on('pong', () => {
    ws.isAlive = true
  })

  const relay = (payload) => {
    const peers = rooms.get(roomId)
    if (!peers) return
    for (const peer of peers) {
      // Never echo to the sender: clients apply their own actions locally, and
      // an echo would double-apply them.
      if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(payload)
    }
  }

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    if (!msg || typeof msg.type !== 'string' || !RELAYABLE.has(msg.type)) return

    // Remember who this socket is so an abrupt drop can be announced below.
    if (typeof msg.deviceId === 'string') ws.deviceId = msg.deviceId
    else if (msg.player && typeof msg.player.deviceId === 'string') ws.deviceId = msg.player.deviceId

    relay(JSON.stringify(msg))
  })

  ws.on('close', () => {
    const peers = rooms.get(roomId)
    if (peers) {
      peers.delete(ws)
      if (peers.size === 0) rooms.delete(roomId)
    }
    // A closed tab or dropped network sends no LEAVE_ROOM, so synthesize one
    // and the surviving player sees the opponent go offline. A socket replaced
    // by a reconnect from the same device is not a departure.
    if (ws.deviceId && !ws.supersededBy) {
      relay(JSON.stringify({ type: 'LEAVE_ROOM', roomId, deviceId: ws.deviceId }))
    }
  })

  ws.on('error', () => ws.terminate())
})

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate()
      continue
    }
    ws.isAlive = false
    ws.ping()
  }
}, HEARTBEAT_MS)

wss.on('close', () => clearInterval(heartbeat))

server.listen(PORT, () => {
  console.log(`Sudoku battle relay listening on port ${PORT}`)
  if (ALLOWED_ORIGINS.length > 0) console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
  else console.log('Allowed origins: any (set ALLOWED_ORIGINS to restrict)')
})

const shutdown = () => {
  clearInterval(heartbeat)
  for (const ws of wss.clients) ws.close(1001, 'server shutting down')
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
