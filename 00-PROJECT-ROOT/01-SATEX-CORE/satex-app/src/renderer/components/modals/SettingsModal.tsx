/**
 * SATEX — Settings dialog.
 * Sections: Alpaca paper credentials · Alpaca live credentials ·
 *           Baidu AI Studio (ERNIE 5.1) · Display.
 *
 * Paper and live keypairs are stored in separate slots. The active endpoint
 * is selected via the top-right Paper/Live toggle (alpaca-mode.ts).
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
  const [paperCreds, setPaperCreds] = useState<CredFormState>({ keyId: '', secretKey: '', feed: 'iex', loaded: false, hasExisting: false })
  const [paperMsg, setPaperMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [paperBusy, setPaperBusy] = useState(false)
  const [paperMasked, setPaperMasked] = useState<string>('')

  const [liveCreds, setLiveCreds] = useState<CredFormState>({ keyId: '', secretKey: '', feed: 'iex', loaded: false, hasExisting: false })
  const [liveMsg, setLiveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [liveBusy, setLiveBusy] = useState(false)
  const [liveMasked, setLiveMasked] = useState<string>('')

  const [baiduKey, setBaiduKey] = useState('')
  const [baiduHas, setBaiduHas] = useState(false)
  const [baiduMsg, setBaiduMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [baiduBusy, setBaiduBusy] = useState(false)

  const [zoom, setZoom] = useState(1.0)

  async function refreshMaskedStatus() {
    try {
      const status = await window.satex?.getCredentialsMasked()
      if (!status) return
      setPaperCreds(s => ({ ...s, feed: status.feed, hasExisting: status.paperConfigured, loaded: true }))
      setLiveCreds (s => ({ ...s, feed: status.feed, hasExisting: status.liveConfigured,  loaded: true }))
      setPaperMasked(status.paperKeyIdMasked)
      setLiveMasked(status.liveKeyIdMasked)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!open) return
    setPaperMsg(null); setLiveMsg(null); setBaiduMsg(null)
    void (async () => {
      await refreshMaskedStatus()
      try {
        const baidu = await window.satex?.getBaiduMasked()
        if (baidu) setBaiduHas(baidu.configured)
        const z = await window.satex?.getZoom()
        if (z) setZoom(z)
      } catch { /* ignore */ }
    })()
  }, [open])

  async function savePaper() {
    if (!window.satex) return
    setPaperBusy(true); setPaperMsg(null)
    try {
      const res = await window.satex.setCredentials({
        keyId: paperCreds.keyId, secretKey: paperCreds.secretKey,
        feed: paperCreds.feed, mode: 'paper',
      })
      if (res.ok) {
        setPaperMsg({ ok: true, text: 'Paper credentials saved.' })
        setPaperCreds(s => ({ ...s, keyId: '', secretKey: '', hasExisting: true }))
        await refreshMaskedStatus()
        // Reconnect ONLY when paper is the active mode — flipping the toggle
        // is the right tool for selecting which slot is live.
        void window.satex.reconnectAlpaca?.()
      } else {
        setPaperMsg({ ok: false, text: res.reason ?? 'Failed to save' })
      }
    } catch (e) {
      setPaperMsg({ ok: false, text: String(e) })
    }
    setPaperBusy(false)
  }

  async function saveLive() {
    if (!window.satex) return
    setLiveBusy(true); setLiveMsg(null)
    try {
      const res = await window.satex.setCredentials({
        keyId: liveCreds.keyId, secretKey: liveCreds.secretKey,
        feed: liveCreds.feed, mode: 'live',
      })
      if (res.ok) {
        setLiveMsg({ ok: true, text: 'Live credentials saved. Use the PAPER/LIVE toggle (top right) to switch endpoints.' })
        setLiveCreds(s => ({ ...s, keyId: '', secretKey: '', hasExisting: true }))
        await refreshMaskedStatus()
      } else {
        setLiveMsg({ ok: false, text: res.reason ?? 'Failed to save' })
      }
    } catch (e) {
      setLiveMsg({ ok: false, text: String(e) })
    }
    setLiveBusy(false)
  }

  async function clearAllCreds() {
    if (!window.satex) return
    if (!confirm('Clear ALL stored Alpaca credentials (paper AND live)? The app will fall back to simulator on next launch.')) return
    setPaperBusy(true); setLiveBusy(true)
    try {
      await window.satex.clearCredentials()
      setPaperMsg({ ok: true, text: 'All credentials cleared.' })
      setLiveMsg(null)
      await refreshMaskedStatus()
    } catch (e) {
      setPaperMsg({ ok: false, text: String(e) })
    }
    setPaperBusy(false); setLiveBusy(false)
  }

  async function saveBaidu() {
    if (!window.satex) return
    setBaiduBusy(true); setBaiduMsg(null)
    try {
      const res = await window.satex.setBaiduKey(baiduKey)
      if (res.ok) {
        setBaiduMsg({ ok: true, text: 'Baidu AI Studio token saved.' })
        setBaiduKey('')
        setBaiduHas(true)
      } else {
        setBaiduMsg({ ok: false, text: res.reason ?? 'Failed' })
      }
    } catch (e) {
      setBaiduMsg({ ok: false, text: String(e) })
    }
    setBaiduBusy(false)
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
        <div className="dialog-section-title">
          Alpaca · Paper Trading {paperCreds.hasExisting && <span style={{ marginLeft: 8, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{paperMasked}</span>}
        </div>
        <div className="form-row">
          <label>Key ID</label>
          <input
            type="text"
            className="form-input"
            value={paperCreds.keyId}
            placeholder={paperCreds.hasExisting ? '••••••••  (stored, enter new to replace)' : 'PKxxxxxxxxxxxxxxxxxx'}
            onChange={e => setPaperCreds(s => ({ ...s, keyId: e.target.value.trim() }))}
            autoComplete="off"
          />
        </div>
        <div className="form-row">
          <label>Secret Key</label>
          <input
            type="password"
            className="form-input"
            value={paperCreds.secretKey}
            placeholder={paperCreds.hasExisting ? '••••••••  (stored, enter new to replace)' : 'your alpaca secret'}
            onChange={e => setPaperCreds(s => ({ ...s, secretKey: e.target.value }))}
            autoComplete="off"
          />
        </div>
        <div className="form-row">
          <label>Feed</label>
          <div className="seg" style={{ width: 'fit-content' }}>
            {(['iex', 'sip'] as const).map(f => (
              <button key={f} type="button" className={paperCreds.feed === f ? 'on' : ''} onClick={() => { setPaperCreds(s => ({ ...s, feed: f })); setLiveCreds(s => ({ ...s, feed: f })) }}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="form-hint">
          Paper endpoint: <code>paper-api.alpaca.markets</code>. Credentials are encrypted via Electron <code>safeStorage</code> (OS keychain). Feed selection is shared with the Live keypair below.
        </div>
        {paperMsg && <div className={`form-hint ${paperMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{paperMsg.text}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="dialog-btn primary"
            disabled={paperBusy || (!paperCreds.keyId && !paperCreds.secretKey)}
            onClick={savePaper}
          >
            {paperBusy ? 'Saving…' : 'Save Paper Keys'}
          </button>
        </div>
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title" style={{ color: 'var(--accent-glow)' }}>
          Alpaca · Live Trading
          {liveCreds.hasExisting && <span style={{ marginLeft: 8, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{liveMasked}</span>}
        </div>
        <div className="form-row">
          <label>Key ID</label>
          <input
            type="text"
            className="form-input"
            value={liveCreds.keyId}
            placeholder={liveCreds.hasExisting ? '••••••••  (stored, enter new to replace)' : 'AKxxxxxxxxxxxxxxxxxx  (live keys start with AK)'}
            onChange={e => setLiveCreds(s => ({ ...s, keyId: e.target.value.trim() }))}
            autoComplete="off"
          />
        </div>
        <div className="form-row">
          <label>Secret Key</label>
          <input
            type="password"
            className="form-input"
            value={liveCreds.secretKey}
            placeholder={liveCreds.hasExisting ? '••••••••  (stored, enter new to replace)' : 'your alpaca live secret'}
            onChange={e => setLiveCreds(s => ({ ...s, secretKey: e.target.value }))}
            autoComplete="off"
          />
        </div>
        <div className="form-hint" style={{ borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>
          Live endpoint: <code>api.alpaca.markets</code>. Saving live keys does <strong>not</strong> activate them — flip the PAPER / LIVE toggle (top right) to switch endpoints. Order submission against the live endpoint is additionally gated by the typed-phrase interlock in <em>Markets → ● LIVE mode</em>.
        </div>
        {liveMsg && <div className={`form-hint ${liveMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{liveMsg.text}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="dialog-btn primary"
            disabled={liveBusy || (!liveCreds.keyId && !liveCreds.secretKey)}
            onClick={saveLive}
          >
            {liveBusy ? 'Saving…' : 'Save Live Keys'}
          </button>
          {(paperCreds.hasExisting || liveCreds.hasExisting) && (
            <button type="button" className="dialog-btn danger" onClick={clearAllCreds} disabled={paperBusy || liveBusy} style={{ marginLeft: 'auto' }}>
              Clear all stored
            </button>
          )}
        </div>
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">Baidu AI Studio · ERNIE 5.1 Decision Agent</div>
        <div className="form-row">
          <label>Access Token</label>
          <input
            type="password"
            className="form-input"
            value={baiduKey}
            placeholder={baiduHas ? '••••••••  (stored, enter new to replace)' : 'AI Studio access token'}
            onChange={e => setBaiduKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="form-hint">
          Used by the Baidu ERNIE 5.1 decision agent. Grab a token at <code>aistudio.baidu.com/account/accessToken</code>. The local online-learning brain runs without a token.
        </div>
        {baiduMsg && <div className={`form-hint ${baiduMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{baiduMsg.text}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="dialog-btn primary" disabled={baiduBusy || !baiduKey} onClick={saveBaidu}>
            {baiduBusy ? 'Saving…' : 'Save AI Studio Token'}
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
