// Supabase Auth integration.
//
// Optional: with no VITE_SUPABASE_* variables the app falls back to the local
// wallet and the dev sign-in, so development needs no cloud project.
//
// The Supabase access token is sent to our API as the bearer credential — the
// server verifies its signature directly, so there is no second session to keep
// in sync.

import { createClient, type SupabaseClient, type Session as SbSession } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let client: SupabaseClient | null = null

export function supabaseEnabled(): boolean {
  return Boolean(URL && ANON)
}

export function getSupabase(): SupabaseClient | null {
  if (!supabaseEnabled()) return null
  if (!client) {
    client = createClient(URL as string, ANON as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

/** Start the Google OAuth flow through Supabase. Redirects the browser. */
export async function signInWithGoogle(): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw error
}

/** Passwordless email sign-in, for users without a Google account. */
export async function signInWithEmail(email: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase is not configured')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function getSupabaseSession(): Promise<SbSession | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session
}

export async function supabaseSignOut(): Promise<void> {
  const sb = getSupabase()
  if (sb) await sb.auth.signOut()
}

/**
 * Fires whenever Supabase establishes, refreshes or drops a session — including
 * when the OAuth redirect lands back on the page.
 */
export function onAuthChange(fn: (session: SbSession | null) => void): () => void {
  const sb = getSupabase()
  if (!sb) return () => {}
  const { data } = sb.auth.onAuthStateChange((_event, session) => fn(session))
  return () => data.subscription.unsubscribe()
}
