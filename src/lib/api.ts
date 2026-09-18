// Client for the wallet API.
//
// The app stays fully usable signed out and offline; this layer is additive.
// When a session exists the server is the authority, and the local wallet is a
// cache that reconciliation corrects.

export interface ApiUser {
  id: string
  email: string
  name: string | null
}

export interface ApiWallet {
  coins: number
  xp: number
  level: number
  into: number
  span: number
}

export interface Session {
  token: string
  user: ApiUser
}

const SESSION_KEY = 'sudoku_session_v1'

/**
 * Where the API lives.
 *
 * Defaults to the relay's host with an http(s) scheme, since both run in the
 * same service — so VITE_WS_URL alone configures the whole backend. Override
 * with VITE_API_URL when they are split.
 */
export function apiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_URL as string | undefined
  if (explicit) return explicit.replace(/\/$/, '')

  const ws = import.meta.env.VITE_WS_URL as string | undefined
  if (ws) return ws.replace(/^ws/, 'http').replace(/\/$/, '')

  if (import.meta.env.DEV) return 'http://localhost:8787'
  return `${window.location.origin}`
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Session
    return s && typeof s.token === 'string' && s.user ? s : null
  } catch {
    return null
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch (e) {
    console.error('Could not persist session', e)
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
  /** Permanent failures should drop a queued event rather than retry forever. */
  get permanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 429
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  token?: string | null
  timeoutMs?: number
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 12000 } = opts
  const token = opts.token !== undefined ? opts.token : loadSession()?.token

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(apiBaseUrl() + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await res.text()
    let json: any = null
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { error: 'bad_response', message: text.slice(0, 200) }
    }

    if (!res.ok) {
      // A rejected session is dead; drop it so the UI returns to signed out.
      if (res.status === 401) clearSession()
      throw new ApiError(res.status, json.error || 'error', json.message || res.statusText)
    }
    return json as T
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function signInWithIdToken(idToken: string): Promise<Session> {
  const res = await apiFetch<{ token: string; user: ApiUser }>('/api/auth/google', {
    method: 'POST',
    body: { idToken },
    token: null,
  })
  const session = { token: res.token, user: res.user }
  saveSession(session)
  return session
}

export async function fetchMe(): Promise<{
  user: ApiUser
  wallet: ApiWallet
  entitlements: string[]
}> {
  return apiFetch('/api/me')
}

export async function postEarn(event: Record<string, unknown>): Promise<ApiWallet> {
  return apiFetch('/api/earn', { method: 'POST', body: event })
}

export async function postSpend(event: Record<string, unknown>): Promise<ApiWallet> {
  return apiFetch('/api/spend', { method: 'POST', body: event })
}

export async function postBuyCosmetic(
  eventId: string,
  item: string
): Promise<{ entitlements: string[]; coins: number; xp: number }> {
  return apiFetch('/api/cosmetics/buy', { method: 'POST', body: { eventId, item } })
}

export async function postMigrate(localCoins: number): Promise<{ migrated: boolean } & ApiWallet> {
  return apiFetch('/api/migrate', { method: 'POST', body: { localCoins } })
}

export async function signOutRemote(): Promise<void> {
  try {
    await apiFetch('/api/auth/signout', { method: 'POST' })
  } catch {
    // Signing out locally matters more than telling the server.
  }
  clearSession()
}

export async function deleteAccount(): Promise<void> {
  await apiFetch('/api/me', { method: 'DELETE' })
  clearSession()
}

/** True when running inside the Play Store wrapper rather than a browser. */
export function isPlayWrapper(): boolean {
  try {
    if (sessionStorage.getItem('sudoku_twa') === '1') return true
    const fromApp = document.referrer.startsWith('android-app://')
    if (fromApp) sessionStorage.setItem('sudoku_twa', '1')
    return fromApp
  } catch {
    return false
  }
}
