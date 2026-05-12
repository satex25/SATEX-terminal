/**
 * SATEX — Settings dialog.
 * Sections: Alpaca paper credentials · Anthropic key · Display.
 */
import { useEffect, useState } from 'react'
import { Modal } from '../Modal'

interface Props { open: boolean; onClose: () => void }

interface CredFormState {
  keyId: string
  secretKey: string
  feed: 'iex' | 'sip'
  loaded: boolean
  hasExisting: boolean
}

export function SettingsModal({ open, onClose }: Props) {
  const [creds, setCreds] = useState<CredFormState>({ keyId: '', secretKey: '', feed: 'iex', loaded: false, hasExisting: false })
  const [credMsg, setCredMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [credBusy, setCredBusy] = useState(false)

  const [anthropicKey, setAnthropicKey] = useState('')
  const [anthropicHas, setAnthropicHas] = useState(false)
  const [anthropicMsg, setAnthropicMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [anthropicBusy, setAnthropicBusy] = useState(false)

  const [zoom, setZoom] = useState(1.0)

  useEffect(() => {
    if (!open) return
    setCredMsg(null); setAnthropicMsg(null)
    void (async () => {
      try {
        const status = await window.satex?.getCredentialsMasked()
        if (status) {
          setCreds(s => ({ ...s, feed: status.feed, hasExisting: status.paperConfigured, loaded: true }))
        }
        const anth = await window.satex?.getAnthropicMasked()
        if (anth) setAnthropicHas(anth.configured)
        const z = await window.satex?.getZoom()
        if (z) setZoom(z)
      } catch { /* ignore */ }
    })()
  }, [open])

  async function saveCreds() {
    if (!window.satex) return
    setCredBusy(true); setCredMsg(null)
    try {
      const res = await window.satex.setCredentials({ keyId: creds.keyId, secretKey: creds.secretKey, feed: creds.feed })
      if (res.ok) {
        setCredMsg({ ok: true, text: 'Credentials saved · reconnecting Alpaca stream…' })
        setCreds(s => ({ ...s, keyId: '', secretKey: '', hasExisting: true }))
      } else {
        setCredMsg({ ok: false, text: res.reason ?? 'Failed to save' })
      }
    } catch (e) {
      setCredMsg({ ok: false, text: String(e) })
    }
    setCredBusy(false)
  }

  async function clearCreds() {
    if (!window.satex) return
    if (!confirm('Clear stored Alpaca credentials? The app will fall back to simulator on next launch.')) return
    setCredBusy(true)
    try {
      await window.satex.clearCredentials()
      setCredMsg({ ok: true, text: 'Credentials cleared.' })
      setCreds(s => ({ ...s, hasExisting: false }))
    } catch (e) {
      setCredMsg({ ok: false, text: String(e) })
    }
    setCredBusy(false)
  }

  async function saveAnthropic() {
    if (!window.satex) return
    setAnthropicBusy(true); setAnthropicMsg(null)
    try {
      const res = await window.satex.setAnthropicKey(anthropicKey)
      if (res.ok) {
        setAnthropicMsg({ ok: true, text: 'Anthropic key saved.' })
        setAnthropicKey('')
        setAnthropicHas(true)
      } else {
        setAnthropicMsg({ ok: false, text: res.reason ?? 'Failed' })
      }
    } catch (e) {
      setAnthropicMsg({ ok: false, text: String(e) })
    }
    setAnthropicBusy(false)
  }

  function setZoomAndApply(z: number) {
    const clamped = Math.max(0.6, Math.min(1.6, z))
    setZoom(clamped)
    void window.satex?.setZoom(clamped)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      kanji="設"
      size="wide"
      footer={<button type="button" className="dialog-btn" onClick={onClose}>Done</button>}
    >
      <div className="dialog-section">
        <div className="dialog-section-title">Alpaca · Paper Trading</div>
        <div className="form-row">
          <label>Key ID</label>
          <input
            type="text"
            className="form-input"
            value={creds.keyId}
            placeholder={creds.hasExisting ? '••••••••  (stored, enter new to replace)' : 'PKxxxxxxxxxxxxxxxxxx'}
            onChange={e => setCreds(s => ({ ...s, keyId: e.target.value.trim() }))}
            autoComplete="off"
          />
        </div>
        <div className="form-row">
          <label>Secret Key</label>
          <input
            type="password"
            className="form-input"
            value={creds.secretKey}
            placeholder={creds.hasExisting ? '••••••••  (stored, enter new to replace)' : 'your alpaca secret'}
            onChange={e => setCreds(s => ({ ...s, secretKey: e.target.value }))}
            autoComplete="off"
          />
        </div>
        <div className="form-row">
          <label>Feed</label>
          <div className="seg" style={{ width: 'fit-content' }}>
            {(['iex', 'sip'] as const).map(f => (
              <button key={f} type="button" className={creds.feed === f ? 'on' : ''} onClick={() => setCreds(s => ({ ...s, feed: f }))}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="form-hint">
          Paper endpoint is enforced: <code>paper-api.alpaca.markets</code>. Credentials are encrypted with the OS keychain via Electron <code>safeStorage</code>.
        </div>
        {credMsg && <div className={`form-hint ${credMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{credMsg.text}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="dialog-btn primary"
            disabled={credBusy || (!creds.keyId && !creds.secretKey)}
            onClick={saveCreds}
          >
            {credBusy ? 'Saving…' : 'Save & Reconnect'}
          </button>
          {creds.hasExisting && (
            <button type="button" className="dialog-btn danger" onClick={clearCreds} disabled={credBusy}>
              Clear stored
            </button>
          )}
        </div>
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">Anthropic · AI Decision Agent</div>
        <div className="form-row">
          <label>API Key</label>
          <input
            type="password"
            className="form-input"
            value={anthropicKey}
            placeholder={anthropicHas ? '••••••••  (stored, enter new to replace)' : 'sk-ant-…'}
            onChange={e => setAnthropicKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="form-hint">
          Used by the Claude opus-4-7 decision agent. The local online-learning brain runs without an API key.
        </div>
        {anthropicMsg && <div className={`form-hint ${anthropicMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{anthropicMsg.text}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="dialog-btn primary" disabled={anthropicBusy || !anthropicKey} onClick={saveAnthropic}>
            {anthropicBusy ? 'Saving…' : 'Save Anthropic Key'}
          </button>
        </div>
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">Display</div>
        <div className="form-row">
          <label>Zoom</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="dialog-btn" onClick={() => setZoomAndApply(zoom - 0.1)}>−</button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, minWidth: 50, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" className="dialog-btn" onClick={() => setZoomAndApply(zoom + 0.1)}>+</button>
            <button type="button" className="dialog-btn" onClick={() => setZoomAndApply(1.0)}>Reset</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
