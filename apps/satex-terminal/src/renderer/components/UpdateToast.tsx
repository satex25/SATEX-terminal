/**
 * SATEX — Update Toast (S1-9, 2026-05-19)
 *
 * Top-of-app notification banner that appears when AutoUpdateService pushes
 * an UPDATE_AVAILABLE event. Reads useUpdateStore (driven by useIPC.ts).
 *
 * UX contract:
 *   • Visible only while `show && available`.
 *   • [Restart Now] disabled until `downloaded === true` (binary actually
 *     present on disk — otherwise electron-updater's quitAndInstall is a no-op).
 *   • [Remind Me Later] hides the toast; the engine's 24h check cadence brings
 *     it back if the update is still pending (or a newer one arrives).
 *   • Auto-dismiss after 30 seconds of no action so the toast doesn't pin the
 *     header forever during an unattended session.
 */
import { useEffect } from 'react'
import { useUpdateStore } from '../stores/update-store'

const AUTO_DISMISS_MS = 30_000

export function UpdateToast() {
  const show       = useUpdateStore(s => s.show)
  const available  = useUpdateStore(s => s.available)
  const downloaded = useUpdateStore(s => s.downloaded)
  const version    = useUpdateStore(s => s.version)
  const setShow    = useUpdateStore(s => s.setShow)

  // Auto-dismiss after 30s. Re-armed every time `show` becomes true so a
  // re-push after the user closed it would restart the countdown.
  useEffect(() => {
    if (!show) return
    const id = setTimeout(() => setShow(false), AUTO_DISMISS_MS)
    return () => clearTimeout(id)
  }, [show, setShow])

  if (!show || !available) return null

  const onRestart = (): void => {
    if (!downloaded) return
    void window.satex?.installUpdate?.()
  }

  const onDismiss = (): void => setShow(false)

  const heading = downloaded
    ? `SATEX v${version ?? '?'} is ready. Restart to update.`
    : `SATEX v${version ?? '?'} is downloading…`

  return (
    <div className="bb-update-toast" role="status" aria-live="polite">
      <div className="bb-update-toast-text">{heading}</div>
      <div className="bb-update-toast-actions">
        <button
          type="button"
          className="bb-update-toast-btn primary"
          onClick={onRestart}
          disabled={!downloaded}
          title={downloaded ? 'Quit SATEX and install the update' : 'Waiting for download to finish…'}
        >
          Restart Now
        </button>
        <button
          type="button"
          className="bb-update-toast-btn ghost"
          onClick={onDismiss}
          aria-label="Remind me later"
        >
          Remind Me Later
        </button>
      </div>
    </div>
  )
}
