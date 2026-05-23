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
import { UNIVERSE } from '@shared/constants'
import { useSubsecondStore, type PreferredBucketMs } from '../../stores/subsecondStore'
import { useThemeStore, THEMES, type ThemeId } from '../../stores/themeStore'

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

  // A1 Sprint 2 — per-symbol sub-second bucket preference. The store mirror
  // is refreshed on every modal-open (in case a hand-edit of subsecond-prefs.md
  // happened between this open and the last one) and on every save echo.
  // CRYPTO_UNIVERSE is computed once at module level via the immutable UNIVERSE
  // array — no need to memoize per render.
  const subsecondPrefs = useSubsecondStore((s) => s.prefs)
  const [subsecondBusy, setSubsecondBusy] = useState<string | null>(null)

  // v0.6 Phase 1 — theme picker. The store applies the `data-theme` attribute
  // via the effect in App.tsx; this Settings section is just the surface that
  // lets the user pick.
  const theme    = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  // Data-source state (simulator vs Alpaca live) — surfaced so the user has
  // a single in-app place to swap from the env-forced simulator over to
  // Alpaca live without editing .env.local.
  const [alpacaConnected, setAlpacaConnected] = useState<boolean>(false)
  const [alpacaModeLabel, setAlpacaModeLabel] = useState<'paper' | 'live'>('paper')
  const [reconnectBusy,   setReconnectBusy]   = useState(false)
  const [reconnectMsg,    setReconnectMsg]    = useState<{ ok: boolean; text: string } | null>(null)

  async function refreshAlpacaModeStatus() {
    try {
      const status = await window.satex?.getAlpacaMode()
      if (!status) return
      setAlpacaConnected(!!status.connected)
      setAlpacaModeLabel(status.mode)
    } catch { /* ignore */ }
  }

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
    setPaperMsg(null); setLiveMsg(null); setBaiduMsg(null); setReconnectMsg(null)
    void (async () => {
      await refreshMaskedStatus()
      await refreshAlpacaModeStatus()
      try {
        const baidu = await window.satex?.getBaiduMasked()
        if (baidu) setBaiduHas(baidu.configured)
        const z = await window.satex?.getZoom()
        if (z) setZoom(z)
        // A1 Sprint 2 — re-fetch sub-second prefs on open so a hand-edit
        // between mounts is reflected. Engine sanitizer drops bad entries.
        const p = await window.satex?.getSubsecondPrefs?.()
        if (p) useSubsecondStore.getState().hydratePrefs(p)
      } catch { /* ignore */ }
    })()
  }, [open])

  async function saveSubsecondPref(symbol: string, bucketMs: PreferredBucketMs): Promise<void> {
    if (!window.satex?.setSubsecondPref) return
    setSubsecondBusy(symbol)
    try {
      // Echo from main is the authoritative full-prefs map. Hydrating from it
      // (instead of an optimistic single-key splice) keeps the renderer
      // mirror byte-for-byte consistent with disk — important if the engine's
      // sanitizer dropped a stale symbol the renderer still had in memory.
      const next = await window.satex.setSubsecondPref(symbol, bucketMs)
      if (next) useSubsecondStore.getState().hydratePrefs(next)
    } catch { /* engine offline — leave pref unchanged */ }
    setSubsecondBusy(null)
  }

  async function connectAlpacaLive() {
    if (!window.satex) return
    setReconnectBusy(true); setReconnectMsg(null)
    try {
      const res = await window.satex.reconnectAlpaca?.()
      if (res?.ok) {
        setReconnectMsg({ ok: true, text: `Connected to Alpaca ${alpacaModeLabel} feed.` })
      } else {
        setReconnectMsg({ ok: false, text: res?.reason ?? 'Reconnect failed' })
      }
      await refreshAlpacaModeStatus()
    } catch (e) {
      setReconnectMsg({ ok: false, text: String(e) })
    }
    setReconnectBusy(false)
  }

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
          Data Source
          <span style={{
            marginLeft: 10, fontFamily: 'var(--font-mono)', fontSize: 10,
            padding: '2px 6px', borderRadius: 3,
            background: alpacaConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 166, 35, 0.15)',
            color:      alpacaConnected ? '#22c55e'                : '#f5a623',
            border:     `1px solid ${alpacaConnected ? '#22c55e' : '#f5a623'}`,
          }}>
            {alpacaConnected ? `LIVE · Alpaca ${alpacaModeLabel}` : 'SIMULATOR'}
          </span>
        </div>
        <div className="form-hint">
          {alpacaConnected
            ? `Quotes are streaming from Alpaca's ${alpacaModeLabel} endpoint. Re-clicking Connect will tear down the WebSocket and rebuild it (useful after a network hiccup).`
            : `The engine is running the offline simulator. Click Connect to swap to Alpaca's ${alpacaModeLabel} feed for real market data. Requires stored ${alpacaModeLabel} credentials below.`}
        </div>
        {reconnectMsg && (
          <div className={`form-hint ${reconnectMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{reconnectMsg.text}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className="dialog-btn primary"
            disabled={reconnectBusy || (alpacaModeLabel === 'paper' ? !paperCreds.hasExisting : !liveCreds.hasExisting)}
            onClick={connectAlpacaLive}
            title={alpacaConnected ? 'Rebuild the WebSocket' : `Swap data source to Alpaca ${alpacaModeLabel}`}
          >
            {reconnectBusy
              ? 'Connecting…'
              : alpacaConnected ? 'Reconnect WebSocket' : `Connect to Alpaca ${alpacaModeLabel}`}
          </button>
        </div>
      </div>

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
        <div className="dialog-section-title">Sub-second Candles · Crypto only</div>
        <div className="form-hint">
          Preferred default bucket per crypto symbol. The chart picks this when you focus the symbol; the timeframe buttons still let you flip at any time. The aggregator maintains both 250 ms and 500 ms internally — switching is free. Sub-second is unavailable for equities (IEX caps snapshots at 1 s; SIP entitlement required for sub-second equities).
        </div>
        {UNIVERSE
          .filter((u) => u.assetClass === 'crypto')
          .map((u) => {
            const current: PreferredBucketMs = subsecondPrefs[u.symbol] ?? 250
            const busy = subsecondBusy === u.symbol
            return (
              <div className="form-row" key={u.symbol}>
                <label>
                  {u.symbol}
                  <span style={{ marginLeft: 8, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{u.name}</span>
                </label>
                <div className="seg" style={{ width: 'fit-content', opacity: busy ? 0.5 : 1 }}>
                  {([250, 500] as const).map((ms) => (
                    <button
                      key={ms}
                      type="button"
                      className={current === ms ? 'on' : ''}
                      disabled={busy}
                      onClick={() => { void saveSubsecondPref(u.symbol, ms) }}
                      title={ms === 250 ? '~4 min history · finer scalping' : '~8 min history · smoother bars'}
                    >
                      {ms} ms
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">Display</div>
        <div className="form-row">
          <label id="theme-seg-label">Theme</label>
          <div className="seg" style={{ width: 'fit-content' }} role="group" aria-labelledby="theme-seg-label">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={theme === t.id ? 'on' : ''}
                aria-pressed={theme === t.id}
                onClick={() => setTheme(t.id as ThemeId)}
                title={t.description}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="form-hint">
          {THEMES.find((t) => t.id === theme)?.description ?? ''}
          {' '}Theme changes apply instantly across the app and persist locally.
        </div>
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
