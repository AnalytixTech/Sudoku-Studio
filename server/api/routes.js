// JSON API for the authoritative wallet, mounted under /api on the same HTTP
// server as the battle relay.

import { signIn, signOut, userForSession } from './auth.js'
import {
  WalletError,
  buyCosmetic,
  credit,
  deleteAccount,
  earn,
  getEntitlements,
  getWallet,
  migrateLocalBalance,
  spend,
} from './wallet.js'

const MAX_BODY_BYTES = 64 * 1024

function corsHeaders(origin, allowed) {
  // No allow-list configured means local development: reflect the origin.
  const ok = allowed.length === 0 || (origin && allowed.includes(origin))
  return {
    'access-control-allow-origin': ok ? origin || '*' : 'null',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY_BYTES) {
        reject(new WalletError('too_large', 'request body too large', 413))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new WalletError('bad_json', 'body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function bearer(req) {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null
}

/**
 * @param {import('./db.js').Db} db
 * @param {string[]} allowedOrigins
 * @returns {(req, res) => Promise<boolean>} true when the request was handled
 */
export function createApi(db, allowedOrigins = []) {
  return async function handleApi(req, res) {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return false

    const cors = corsHeaders(req.headers.origin, allowedOrigins)
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors)
      res.end()
      return true
    }

    try {
      const route = `${req.method} ${url.pathname}`

      if (route === 'POST /api/auth/google') {
        const body = await readBody(req)
        const { token, user } = await signIn(db, body.idToken)
        const wallet = await getWallet(db, user.id)
        return send(res, 200, { token, user, wallet }, cors), true
      }

      // Everything past this point needs a session.
      const session = bearer(req)
      const user = await userForSession(db, session)
      if (!user) {
        return send(res, 401, { error: 'unauthorized' }, cors), true
      }

      if (route === 'POST /api/auth/signout') {
        await signOut(db, session)
        return send(res, 200, { ok: true }, cors), true
      }

      if (route === 'GET /api/me') {
        const [wallet, entitlements] = await Promise.all([
          getWallet(db, user.id),
          getEntitlements(db, user.id),
        ])
        return send(res, 200, { user, wallet, entitlements }, cors), true
      }

      if (route === 'POST /api/earn') {
        const body = await readBody(req)
        const result = await earn(db, user.id, body)
        return send(res, 200, result, cors), true
      }

      if (route === 'POST /api/spend') {
        const body = await readBody(req)
        const result = await spend(db, user.id, body)
        return send(res, 200, result, cors), true
      }

      // One-time top-up for coins earned before the player signed in.
      if (route === 'POST /api/migrate') {
        const body = await readBody(req)
        const result = await migrateLocalBalance(db, user.id, body.localCoins)
        return send(res, 200, result, cors), true
      }

      // Play requires in-app account deletion for any app with sign-in.
      if (route === 'DELETE /api/me' || route === 'POST /api/me/delete') {
        await deleteAccount(db, user.id)
        return send(res, 200, { deleted: true }, cors), true
      }

      if (route === 'POST /api/cosmetics/buy') {
        const body = await readBody(req)
        const result = await buyCosmetic(db, user.id, body)
        const entitlements = await getEntitlements(db, user.id)
        return send(res, 200, { ...result, entitlements }, cors), true
      }

      // Rewarded-ad payouts land here once an ad network verifies the view.
      // Deliberately server-side only: the client cannot call it directly
      // without a signed callback, which is added with the ad integration.
      if (route === 'POST /api/credit' && process.env.ALLOW_TEST_CREDIT === '1') {
        const body = await readBody(req)
        const result = await credit(db, user.id, body)
        return send(res, 200, result, cors), true
      }

      return send(res, 404, { error: 'not_found' }, cors), true
    } catch (err) {
      if (err instanceof WalletError) {
        return send(res, err.status, { error: err.code, message: err.message }, cors), true
      }
      // Auth failures are expected traffic, not incidents.
      const msg = String(err?.message || err)
      if (/token|audience|verif|dev token|GOOGLE_CLIENT_ID/i.test(msg)) {
        return send(res, 401, { error: 'invalid_token', message: msg }, cors), true
      }
      console.error('API error:', err)
      return send(res, 500, { error: 'server_error' }, cors), true
    }
  }
}
