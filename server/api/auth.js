// Accounts and sessions.
//
// Identity can come from three places, checked in this order:
//
//   1. Supabase Auth  - the client signs in with Supabase and sends its access
//                       token; we verify the JWT signature ourselves so no
//                       round-trip to Supabase is needed per request.
//   2. Google Sign-In - a Google ID token, verified against Google's keys.
//   3. Dev auth       - local only, refuses to run when NODE_ENV=production.
//
// Verification is delegated to `jose` / `google-auth-library` rather than
// hand-rolled: token crypto is exactly where a home-made bug becomes a
// vulnerability.

import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { SCHEMA } from './db.js'

const SESSION_DAYS = 60

/**
 * Local development identity. Refuses to operate when NODE_ENV=production, so
 * it cannot be left switched on by accident in a deployed environment.
 */
function devAuthEnabled() {
  return process.env.DEV_AUTH === '1' && process.env.NODE_ENV !== 'production'
}

// --- Supabase -------------------------------------------------------------

let supabaseVerifier = null

/**
 * Build a verifier for Supabase access tokens.
 *
 * Supabase signs either with the project's shared secret (HS256) or, on newer
 * projects, an asymmetric key published at a JWKS endpoint. Both are supported;
 * set whichever your project uses.
 */
async function getSupabaseVerifier() {
  if (supabaseVerifier !== null) return supabaseVerifier

  const secret = process.env.SUPABASE_JWT_SECRET
  const url = process.env.SUPABASE_URL
  if (!secret && !url) {
    supabaseVerifier = false
    return false
  }

  const jose = await import('jose')
  const issuer = url ? `${url.replace(/\/$/, '')}/auth/v1` : undefined

  if (secret) {
    const key = new TextEncoder().encode(secret)
    supabaseVerifier = (token) =>
      jose.jwtVerify(token, key, { audience: 'authenticated', ...(issuer ? { issuer } : {}) })
  } else {
    const jwks = jose.createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
    supabaseVerifier = (token) => jose.jwtVerify(token, jwks, { audience: 'authenticated', issuer })
  }
  return supabaseVerifier
}

async function verifySupabaseToken(token) {
  const verify = await getSupabaseVerifier()
  if (!verify) return null
  try {
    const { payload } = await verify(token)
    if (!payload.sub) return null
    const email =
      payload.email ||
      payload.user_metadata?.email ||
      `${payload.sub}@users.noreply.supabase`
    return { sub: String(payload.sub), email: String(email).toLowerCase(), name: payload.user_metadata?.full_name }
  } catch {
    return null // not a Supabase token, or expired/forged
  }
}

// --- Google ---------------------------------------------------------------

let googleClient = null
async function getGoogleClient() {
  if (!process.env.GOOGLE_CLIENT_ID) return null
  if (!googleClient) {
    const { OAuth2Client } = await import('google-auth-library')
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  }
  return googleClient
}

/**
 * @returns {Promise<{ sub: string, email: string, name?: string }>}
 */
export async function verifyIdToken(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 8) throw new Error('missing token')

  if (devAuthEnabled() && idToken.startsWith('dev:')) {
    const email = idToken.slice(4).trim().toLowerCase()
    if (!email || !email.includes('@')) throw new Error('dev token needs an email')
    return { sub: 'dev_' + createHash('sha256').update(email).digest('hex').slice(0, 24), email }
  }

  const supabase = await verifySupabaseToken(idToken)
  if (supabase) return supabase

  const client = await getGoogleClient()
  if (client) {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email) throw new Error('token missing subject or email')
    if (payload.email_verified === false) throw new Error('email not verified')
    return { sub: payload.sub, email: String(payload.email).toLowerCase(), name: payload.name }
  }

  throw new Error('no identity provider configured or token not verifiable')
}

// --- Users and sessions ---------------------------------------------------

/** Find or create the local user row for a verified identity. */
async function upsertUser(db, identity) {
  return db.tx(async (c) => {
    const existing = await c.query(`SELECT id, email, name FROM ${SCHEMA}.users WHERE email = $1`, [
      identity.email,
    ])
    if (existing.rows.length > 0) return existing.rows[0]

    const id = 'u_' + randomUUID().replace(/-/g, '').slice(0, 24)
    await c.query(`INSERT INTO ${SCHEMA}.users (id, email, name) VALUES ($1, $2, $3)`, [
      id,
      identity.email,
      identity.name || null,
    ])
    // New accounts start with the same balance a fresh local player gets.
    // The opening balance is written as a ledger row rather than straight into
    // the wallet, so `sum(ledger) = wallet` holds for every account and the
    // balance can always be reconciled from its history.
    const { ECONOMY } = await import('./wallet.js')
    await c.query(`INSERT INTO ${SCHEMA}.wallets (user_id, coins, xp) VALUES ($1, 0, 0)`, [id])
    await c.query(
      `INSERT INTO ${SCHEMA}.ledger (id, user_id, kind, reason, delta_coins, delta_xp)
       VALUES ($1, $2, 'grant', 'signup', $3, 0)`,
      ['signup_' + id, id, ECONOMY.startCoins]
    )
    await c.query(`UPDATE ${SCHEMA}.wallets SET coins = $2 WHERE user_id = $1`, [id, ECONOMY.startCoins])
    return { id, email: identity.email, name: identity.name || null }
  })
}

/** Exchange a provider token for one of our own session tokens. */
export async function signIn(db, idToken) {
  const identity = await verifyIdToken(idToken)
  const user = await upsertUser(db, identity)

  const token = randomBytes(32).toString('base64url')
  await db.query(
    `INSERT INTO ${SCHEMA}.sessions (token, user_id, expires_at)
     VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [token, user.id, String(SESSION_DAYS)]
  )
  return { token, user }
}

/**
 * Resolve the caller.
 *
 * Accepts either one of our session tokens or a provider access token directly,
 * so a Supabase client can call the API with its own token and never hold a
 * second credential.
 *
 * @returns {Promise<{id: string, email: string, name: string|null}|null>}
 */
export async function userForSession(db, token) {
  if (!token || typeof token !== 'string') return null

  const { rows } = await db.query(
    `SELECT u.id, u.email, u.name
       FROM ${SCHEMA}.sessions s JOIN ${SCHEMA}.users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  )
  if (rows[0]) return rows[0]

  // Not one of ours; it may be a provider token.
  const identity = await verifySupabaseToken(token)
  if (!identity) return null
  return upsertUser(db, identity)
}

export async function signOut(db, token) {
  if (token) await db.query(`DELETE FROM ${SCHEMA}.sessions WHERE token = $1`, [token])
}

export { devAuthEnabled }
