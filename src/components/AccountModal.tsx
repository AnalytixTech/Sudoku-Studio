import { useEffect, useRef, useState } from 'react'
import {
  deleteAccount,
  isPlayWrapper,
  loadSession,
  signInWithIdToken,
  signOutRemote,
  type Session,
} from '../lib/api'
import { pendingCount } from '../lib/walletSync'
import {
  signInWithEmail,
  signInWithGoogle,
  supabaseEnabled,
  supabaseSignOut,
} from '../lib/supabase'
import { IconClose, IconCheck, IconTrophy, IconCoin } from './Icons'

export interface AccountModalProps {
  session: Session | null
  coins: number
  onSignedIn: (session: Session) => void
  onSignedOut: () => void
  onClose: () => void
}

declare global {
  interface Window {
    google?: any
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

/**
 * Sign-in, sync status and account deletion.
 *
 * Signing in is optional: the game is fully playable without it. An account
 * exists so a balance survives a cleared cache or a new device, which is a
 * requirement once coins can be bought with money.
 */
export default function AccountModal({
  session,
  coins,
  onSignedIn,
  onSignedOut,
  onClose,
}: AccountModalProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [devEmail, setDevEmail] = useState('player@example.com')
  const [magicEmail, setMagicEmail] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const useSupabase = supabaseEnabled()
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const pending = pendingCount()

  // Render Google's button when a client id is configured.
  useEffect(() => {
    if (session || useSupabase || !GOOGLE_CLIENT_ID || !googleBtnRef.current) return
    let cancelled = false

    const render = () => {
      if (cancelled || !window.google?.accounts?.id || !googleBtnRef.current) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential: string }) => {
          setBusy(true)
          setError(null)
          try {
            onSignedIn(await signInWithIdToken(response.credential))
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Sign-in failed')
          } finally {
            setBusy(false)
          }
        },
      })
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'filled_blue',
        size: 'large',
        width: 280,
      })
    }

    if (window.google?.accounts?.id) {
      render()
    } else {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = render
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
    }
  }, [session, useSupabase, onSignedIn])

  const devSignIn = async () => {
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await signInWithIdToken(`dev:${devEmail}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const handleSignOut = async () => {
    setBusy(true)
    if (useSupabase) await supabaseSignOut()
    await signOutRemote()
    setBusy(false)
    onSignedOut()
  }

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      after?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount()
      onSignedOut()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card account-card" onClick={(e) => e.stopPropagation()}>
        <header className="stats-header">
          <div className="modal-title">
            <IconTrophy size={20} color="var(--accent)" />
            <h2>{session ? 'Your account' : 'Save your progress'}</h2>
          </div>
          <button className="stats-close-btn" onClick={onClose} aria-label="Close">
            <IconClose size={20} />
          </button>
        </header>

        {error && <div className="status status-error">{error}</div>}

        {session ? (
          <>
            <div className="account-row">
              <span className="account-label">Signed in as</span>
              <strong>{session.user.email}</strong>
            </div>
            <div className="account-row">
              <span className="account-label">Balance</span>
              <strong className="inline-coin">
                <IconCoin size={14} /> {coins}
              </strong>
            </div>
            <div className="account-row">
              <span className="account-label">Sync</span>
              <strong className={pending > 0 ? 'sync-pending' : 'sync-ok'}>
                {pending > 0 ? `${pending} change${pending === 1 ? '' : 's'} waiting` : (
                  <>
                    <IconCheck size={12} /> up to date
                  </>
                )}
              </strong>
            </div>
            <p className="account-note">
              Your coins and unlocks are stored on your account, so they follow you to any device.
            </p>

            <div className="modal-actions">
              <button className="btn flex-btn" onClick={handleSignOut} disabled={busy}>
                Sign out
              </button>
            </div>

            <div className="account-danger">
              {confirmDelete ? (
                <>
                  <p className="danger-warn">
                    This permanently deletes your account, balance, unlocks and purchase history.
                    It cannot be undone.
                  </p>
                  <div className="modal-actions">
                    <button className="btn sub-btn flex-btn" onClick={() => setConfirmDelete(false)}>
                      Keep my account
                    </button>
                    <button className="btn btn-danger flex-btn" onClick={handleDelete} disabled={busy}>
                      Delete permanently
                    </button>
                  </div>
                </>
              ) : (
                <button className="link-danger" onClick={() => setConfirmDelete(true)}>
                  Delete my account and data
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="account-note">
              Playing signed out works fine — your progress is saved on this device. Sign in to keep
              your coins and unlocks if you clear your browser or switch devices.
            </p>

            {useSupabase ? (
              <div className="auth-providers">
                <button
                  className="btn btn-primary flex-btn"
                  onClick={() => run(signInWithGoogle)}
                  disabled={busy}
                >
                  Continue with Google
                </button>

                <div className="auth-divider"><span>or</span></div>

                {magicSent ? (
                  <p className="account-note">
                    Check <strong>{magicEmail}</strong> for a sign-in link.
                  </p>
                ) : (
                  <div className="invite-input-row">
                    <input
                      className="invite-input"
                      type="email"
                      placeholder="you@example.com"
                      value={magicEmail}
                      onChange={(e) => setMagicEmail(e.target.value)}
                      aria-label="Email address"
                    />
                    <button
                      className="btn"
                      disabled={busy || !magicEmail.includes('@')}
                      onClick={() => run(() => signInWithEmail(magicEmail), () => setMagicSent(true))}
                    >
                      Email me a link
                    </button>
                  </div>
                )}
              </div>
            ) : GOOGLE_CLIENT_ID ? (
              <div className="google-btn-wrap" ref={googleBtnRef} />
            ) : (
              <div className="account-dev">
                <p className="dev-note">
                  No identity provider is configured
                  {import.meta.env.DEV ? '. Development sign-in:' : ' yet.'}
                </p>
                {import.meta.env.DEV && (
                  <div className="invite-input-row">
                    <input
                      className="invite-input"
                      value={devEmail}
                      onChange={(e) => setDevEmail(e.target.value)}
                      aria-label="Development email"
                    />
                    <button className="btn btn-primary" onClick={devSignIn} disabled={busy}>
                      Sign in
                    </button>
                  </div>
                )}
              </div>
            )}

            {!isPlayWrapper() && (
              <p className="account-note account-fineprint">
                We only use your email to identify your account.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export { loadSession }
