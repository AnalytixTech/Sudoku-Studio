import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Service-worker status surface.
 *
 * The board and the in-progress puzzle live in React state, so we never reload
 * on the user's behalf -- a new version waits behind a button instead.
 */
export default function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  const dismiss = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div className="sw-toast" role="status" aria-live="polite">
      {needRefresh ? (
        <>
          <span className="sw-toast-text">A new version is ready.</span>
          <div className="sw-toast-actions">
            <button className="sw-btn sw-btn-primary" onClick={() => updateServiceWorker(true)}>
              Reload
            </button>
            <button className="sw-btn" onClick={dismiss}>
              Later
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="sw-toast-text">Installed — this app now works offline.</span>
          <div className="sw-toast-actions">
            <button className="sw-btn" onClick={dismiss}>
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  )
}
