/**
 * SATEX — Settings dialog.
 * Sections: Alpaca paper credentials · Alpaca live credentials ·
 *           AI Advisor (any OpenAI-compatible provider) ·
 *           Nightly Self-Evaluation · Display.
 *
 * Paper and live keypairs are stored in separate slots. The active endpoint
 * is selected via the top-right Paper/Live toggle (alpaca-mode.ts).
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { UNIVERSE, DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL } from '@shared/constants'
import { WORKSPACE_TABS, type Workspace, type SelfEvalStatus } from '@shared/types'
import { useSubsecondStore, type PreferredBucketMs } from '../../stores/subsecondStore'
import { useThemeStore, THEMES, type ThemeId } from '../../stores/themeStore'
import { useTimezoneStore, TRADING_TIMEZONES, type TimezoneId } from '../../stores/timezoneStore'
import { useWorkspaceStore } from '../../stores/workspaceStore'
import { useDataSourceStore } from '../../stores/dataSourceStore'
import { useAccountStore } from '../../stores/accountStore'

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

  // Advisory LLM — provider-agnostic (any OpenAI-compatible endpoint).
  // 2026-06-10: replaces the hardcoded Baidu/ERNIE slot. The key is stored in
  // safeStorage main-side; only `configured` + baseUrl/model echo back here.
  // Prefilled with the house default (Groq) so a fresh setup is paste-key-
  // and-go; getLlmStatus overwrites with the stored provider when configured.
  const [llmBaseUrl, setLlmBaseUrl] = useState(DEFAULT_LLM_BASE_URL)
  const [llmModel, setLlmModel] = useState(DEFAULT_LLM_MODEL)
  const [llmKey, setLlmKey] = useState('')
  const [llmHas, setLlmHas] = useState(false)
  const [llmMsg, setLlmMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [llmBusy, setLlmBusy] = useState(false)

  // Nightly self-eval toggle + status (Settings is the canonical surface).
  const [seStatus, setSeStatus] = useState<SelfEvalStatus | null>(null)
  const [seBusy, setSeBusy] = useState(false)
  const pollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Cancel any pending self-eval poll timers on unmount so a fast modal-close
  // does not setState (refreshSelfEval -> setSeStatus) on an unmounted component
  // (PR #6 "clean up what you create"; mirrors App.tsx armTimerRef).
  useEffect(() => () => {
    pollTimersRef.current.forEach(clearTimeout)
    pollTimersRef.current = []
  }, [])

  async function refreshSelfEval() {
    try {
      const s = await window.satex?.getSelfEvalStatus?.()
      if (s) setSeStatus(s)
    } catch { /* ignore */ }
  }

  async function toggleSelfEval() {
    if (!window.satex || !seStatus) return
    setSeBusy(true)
    try { setSeStatus(await window.satex.setSelfEvalEnabled(!seStatus.enabled)) }
    catch { /* ignore */ }
    setSeBusy(false)
  }

  async function runSelfEvalNow() {
    if (!window.satex) return
    setSeBusy(true)
    try {
      await window.satex.runSelfEvalNow()
      // Poll a few times so the "Running…" → result transition is visible
      // without a permanent interval.
      for (const delay of [1500, 4000, 8000]) {
        pollTimersRef.current.push(setTimeout(() => { void refreshSelfEval() }, delay))
      }
      await refreshSelfEval()
    } catch { /* ignore */ }
    setSeBusy(false)
  }

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
  const landingWorkspace    = useWorkspaceStore((s) => s.state.landingWorkspace)
  const setLandingWorkspace = useWorkspaceStore((s) => s.setLandingWorkspace)
  // v0.6 — selectable local clock zone (the TopBar/Macro clock over the fixed
  // UTC anchor). localStorage-backed like the theme; useClocks reads it.
  const timezone    = useTimezoneStore((s) => s.timezone)
  const setTimezone = useTimezoneStore((s) => s.setTimezone)

  // Market Data Feed (moved from the TopBar chip, operator ask 2026-07-04) —
  // same useDataSourceStore the old FeedSwitch used, so the data-source-guard.ts
  // interlock (blocked while real capital is armed or replay is active) and the
  // reset-to-clean semantics are completely unchanged; only the UI surface moved.
  const { source: feedSource, liveAvailable: feedLiveAvailable, switching: feedSwitching, hydrate: hydrateFeed, setSource: setFeedSource } = useDataSourceStore()
  const openPositions = useAccountStore((s) => s.account?.openPositions?.length ?? 0)
  const [feedErr, setFeedErr] = useState<string | null>(null)

  async function switchFeed(target: 'simulator' | 'live') {
    setFeedErr(null)
    const res = await setFeedSource(target)
    if (!res.ok && res.reason) setFeedErr(res.reason)
  }

  function requestFeedSwitch(target: 'simulator' | 'live') {
    if (feedSwitching || feedSource === target) return
    if (target === 'live' && openPositions > 0) {
      if (!confirm('Switch to the live Alpaca data feed?\n\nYour simulated paper positions will be cleared.')) return
    }
    void switchFeed(target)
  }

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
    setPaperMsg(null); setLiveMsg(null); setLlmMsg(null); setReconnectMsg(null); setFeedErr(null)
    void hydrateFeed()
    void (async () => {
      await refreshMaskedStatus()
      await refreshAlpacaModeStatus()
      try {
        const llm = await window.satex?.getLlmStatus()
        if (llm) {
          setLlmHas(llm.configured)
          if (llm.configured) { setLlmBaseUrl(llm.baseUrl); setLlmModel(llm.model) }
        }
        await refreshSelfEval()
        const z = await window.satex?.getZoom()
        if (z) setZoom(z)
        // A1 Sprint 2 — re-fetch sub-second prefs on open so a hand-edit
        // between mounts is reflected. Engine sanitizer drops bad entries.
        const p = await window.satex?.getSubsecondPrefs?.()
        if (p) useSubsecondStore.getState().hydratePrefs(p)
      } catch { /* ignore */ }
    })()
    // hydrateFeed is a stable zustand action reference (create() binds it once
    // per store, not per render) — safe to list without re-firing this effect
    // on anything but `open`.
  }, [open, hydrateFeed])

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

  async function saveLlm() {
    if (!window.satex) return
    setLlmBusy(true); setLlmMsg(null)
    try {
      // Empty key = keep the previously stored key (provider/model-only change).
      const res = await window.satex.setLlmConfig({ baseUrl: llmBaseUrl, model: llmModel, apiKey: llmKey })
      if (res.ok) {
        setLlmMsg({ ok: true, text: `Advisor config saved — ${llmModel}.` })
        setLlmKey('')
        setLlmHas(true)
      } else {
        setLlmMsg({ ok: false, text: res.reason ?? 'Failed' })
      }
    } catch (e) {
      setLlmMsg({ ok: false, text: String(e) })
    }
    setLlmBusy(false)
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
            color:      alpacaConnected ? 'var(--bb-pos)'          : 'var(--bb-warn)',
            border:     `1px solid ${alpacaConnected ? 'var(--bb-pos)' : 'var(--bb-warn)'}`,
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
        <div className="dialog-section-title">AI Advisor · any OpenAI-compatible provider</div>
        <div className="form-row">
          <label>Base URL</label>
          <input
            type="text"
            className="form-input"
            value={llmBaseUrl}
            placeholder="https://api.groq.com/openai/v1"
            onChange={e => setLlmBaseUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="form-row">
          <label>Model</label>
          <input
            type="text"
            className="form-input"
            value={llmModel}
            placeholder="llama-3.1-8b-instant"
            onChange={e => setLlmModel(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="form-row">
          <label>API Key</label>
          <input
            type="password"
            className="form-input"
            value={llmKey}
            placeholder={llmHas ? '••••••••  (stored — leave blank to keep)' : 'provider API key'}
            onChange={e => setLlmKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="form-hint">
          Advisory rationale only — never gates or routes an order. Works with any OpenAI-compatible
          endpoint: Groq, OpenAI, OpenRouter, Mistral, DeepSeek, Baidu AI Studio, or a local Ollama
          (<code>http://127.0.0.1:11434/v1</code>). The local online-learning brain runs without it.
        </div>
        {llmMsg && <div className={`form-hint ${llmMsg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{llmMsg.text}</div>}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="dialog-btn primary" disabled={llmBusy || !llmBaseUrl || !llmModel || (!llmKey && !llmHas)} onClick={saveLlm}>
            {llmBusy ? 'Saving…' : llmHas ? 'Update Advisor Config' : 'Save Advisor Config'}
          </button>
        </div>
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">
          Market Data Feed
          <span style={{
            marginLeft: 10, fontFamily: 'var(--font-mono)', fontSize: 10,
            padding: '2px 6px', borderRadius: 3,
            background: feedSource === 'live' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(6, 182, 212, 0.15)',
            color:      feedSource === 'live' ? 'var(--bb-pos)'          : 'var(--accent, #06b6d4)',
            border:     `1px solid ${feedSource === 'live' ? 'var(--bb-pos)' : 'var(--accent, #06b6d4)'}`,
          }}>
            {feedSource === 'live' ? 'LIVE ALPACA' : 'SIMULATOR'}
          </span>
        </div>
        <div className="form-hint">
          Simulator ⇄ live Alpaca <em>market data</em> — separate from the PAPER/LIVE
          real-capital toggle (top right) and from real-order arming. Switching to live
          requires a configured Alpaca connection (see Data Source above) and is blocked
          while a replay is active or real capital is armed.
        </div>
        <div className="form-row" style={{ marginTop: 10 }}>
          <label id="feed-seg-label">Feed source</label>
          <div className="seg" style={{ width: 'fit-content', opacity: feedSwitching ? 0.6 : 1 }} role="group" aria-labelledby="feed-seg-label">
            <button
              type="button"
              className={feedSource === 'simulator' ? 'on' : ''}
              aria-pressed={feedSource === 'simulator'}
              disabled={feedSwitching}
              onClick={() => requestFeedSwitch('simulator')}
              title="Simulated data — no live feed required"
            >
              Simulator
            </button>
            <button
              type="button"
              className={feedSource === 'live' ? 'on' : ''}
              aria-pressed={feedSource === 'live'}
              disabled={feedSwitching || (feedSource !== 'live' && !feedLiveAvailable)}
              onClick={() => requestFeedSwitch('live')}
              title={
                feedSource !== 'live' && !feedLiveAvailable
                  ? 'Add Alpaca paper keys above to enable the live feed'
                  : 'Live Alpaca market data'
              }
            >
              Live Alpaca
            </button>
          </div>
        </div>
        {feedSwitching && <div className="form-hint" style={{ marginTop: 8 }}>Switching data feed…</div>}
        {feedErr && <div className="form-hint err" style={{ marginTop: 8 }}>{feedErr}</div>}
      </div>

      <div className="dialog-section">
        <div className="dialog-section-title">Nightly Self-Evaluation · 02:30 local</div>
        <div className="form-hint">
          Re-runs the strategy roster — brain (live learned weights), momentum, mean-reversion,
          breakout, and the regime-routed ensemble — over the day's bars, regression-checks each
          against its locked baseline, and writes the verdict to <code>Vault/Backtests</code>.
          Observational only: it never places, sizes, or gates an order.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`dialog-btn ${seStatus?.enabled ? 'primary' : ''}`}
            onClick={toggleSelfEval}
            disabled={seBusy || !seStatus}
            aria-pressed={!!seStatus?.enabled}
          >
            {seStatus ? (seStatus.enabled ? '● Nightly ON' : '○ Nightly OFF') : '…'}
          </button>
          <button
            type="button"
            className="dialog-btn"
            onClick={runSelfEvalNow}
            disabled={seBusy || !!seStatus?.running}
          >
            {seStatus?.running ? 'Running…' : 'Run Now'}
          </button>
          <span className="form-hint" style={{ marginTop: 0 }}>
            {seStatus?.lastRun
              ? `last run ${new Date(seStatus.lastRun.finishedAt).toLocaleTimeString()} — ${seStatus.lastRun.evaluated} evaluated, ${seStatus.lastRun.baselined} baselined, ${seStatus.lastRun.regressions} regression${seStatus.lastRun.regressions === 1 ? '' : 's'} → ${seStatus.lastRun.reportFilename}`
              : 'no runs yet this boot'}
          </span>
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
          <label htmlFor="tz-select">Local clock</label>
          <select
            id="tz-select"
            className="dialog-select"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value as TimezoneId)}
          >
            {TRADING_TIMEZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code} · {z.label} — {z.market}
              </option>
            ))}
          </select>
        </div>
        <div className="form-hint">
          The upper clock (over the fixed UTC anchor) and the Macro strip’s “NOW”.
          Daylight saving is applied automatically. UTC stays fixed as the trading anchor.
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
        <div className="form-row">
          <label id="startup-seg-label">Startup page</label>
          <div className="seg" style={{ width: 'fit-content' }} role="group" aria-labelledby="startup-seg-label">
            {WORKSPACE_TABS.map((ws) => (
              <button
                key={ws}
                type="button"
                className={landingWorkspace === ws ? 'on' : ''}
                aria-pressed={landingWorkspace === ws}
                onClick={() => setLandingWorkspace(ws as Workspace)}
              >
                {ws}
              </button>
            ))}
          </div>
        </div>
        <div className="form-hint">
          The workspace SATEX opens after the intro. Applied once on launch — switch tabs freely afterward.
        </div>
      </div>
    </Modal>
  )
}
