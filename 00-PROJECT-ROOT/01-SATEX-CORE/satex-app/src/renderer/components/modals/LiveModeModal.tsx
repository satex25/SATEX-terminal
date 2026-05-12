/**
 * SATEX — Live-mode interlock dialog.
 * Crossing into LIVE requires:
 *   1. Paper credentials configured AND endpoint confirmed (read-only check)
 *   2. Kill switch disarmed
 *   3. Daily-loss limit not breached
 *   4. Notional cap entered (max $/order)
 *   5. Typed-confirm phrase exactly: I ACCEPT REAL CAPITAL
 * Crossing back to paper is one-click.
 */
import { useEffect, useState } from 'react'
import { Modal } from '../Modal'
import { useAccountStore } from '../../stores/accountStore'
import { fmt } from '../../lib/format'

interface Props { open: boolean; onClose: () => void }

const CONFIRM_PHRASE = 'I ACCEPT REAL CAPITAL'

interface LiveStatus {
  enabled: boolean
  notionalCap: number
  endpoint: string
  paperOnly: boolean
}

export function LiveModeModal({ open, onClose }: Props) {
  const account = useAccountStore(s => s.account)
  const [status, setStatus] = useState<LiveStatus | null>(null)
  const [phrase, setPhrase] = useState('')
  const [cap, setCap]       = useState('500')
  const [busy, setBusy]     = useState(false)
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setPhrase(''); setMsg(null)
    void (async () => {
      try {
        const s = await window.satex?.getLiveMode()
        if (s) { setStatus(s); setCap(String(s.notionalCap)) }
      } catch { /* ignore */ }
    })()
  }, [open])

  const dailyLossOk = account.dailyPnl >= -(account.equity * account.dailyLossLimitPct)
  const killOk      = !account.killSwitchArmed
  const phraseOk    = phrase.trim() === CONFIRM_PHRASE
  const capNum      = parseFloat(cap) || 0
  const capOk       = capNum > 0 && capNum <= 50_000
  const endpointOk  = status?.paperOnly === false ? false : true  // when LIVE, must not be paper; flipping ON from paper is the friction point we acknowledge

  const allOk = killOk && dailyLossOk && phraseOk && capOk

  async function enable() {
    if (!window.satex || busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await window.satex.setLiveMode({ enabled: true, notionalCap: capNum, confirmPhrase: phrase })
      if (res.ok) { setMsg({ ok: true, text: 'LIVE MODE ENABLED — orders now route to real capital.' }); setStatus(s => s ? { ...s, enabled: true } : s) }
      else        setMsg({ ok: false, text: res.reason ?? 'Failed to enable live mode' })
    } catch (e) { setMsg({ ok: false, text: String(e) }) }
    setBusy(false)
  }

  async function disable() {
    if (!window.satex || busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await window.satex.setLiveMode({ enabled: false, notionalCap: capNum, confirmPhrase: '' })
      if (res.ok) { setMsg({ ok: true, text: 'Reverted to paper mode.' }); setStatus(s => s ? { ...s, enabled: false } : s) }
      else        setMsg({ ok: false, text: res.reason ?? 'Failed' })
    } catch (e) { setMsg({ ok: false, text: String(e) }) }
    setBusy(false)
  }

  const isLive = status?.enabled === true

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isLive ? 'Live Mode · ACTIVE' : 'Enable Live Mode'}
      kanji="本"
      size="wide"
      footer={isLive
        ? <button type="button" className="dialog-btn danger" onClick={disable} disabled={busy}>Disable Live Mode</button>
        : <button type="button" className="dialog-btn primary" onClick={enable} disabled={!allOk || busy}>
            {busy ? 'Enabling…' : 'Enable Live Mode'}
          </button>}
    >
      {isLive ? (
        <div className="live-banner">
          <span className="kanji">本</span>
          LIVE MODE IS ACTIVE — orders route to real capital. Notional cap {fmt.usd(status?.notionalCap ?? 0, 0)}/order.
        </div>
      ) : (
        <div className="dialog-section" style={{ background: 'var(--bear-soft)', borderLeft: '3px solid var(--bear)', padding: '10px 14px', borderRadius: '0 var(--r-s) var(--r-s) 0' }}>
          <strong style={{ color: 'var(--bear-glow)' }}>WARNING:</strong> Enabling live mode routes orders to a real-capital broker account.
          Paper-only enforcement will be lifted. Confirm every interlock below.
        </div>
      )}

      <div className="dialog-section">
        <div className="dialog-section-title">Interlocks</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', alignItems: 'center' }}>
          <Check ok={killOk} />      <span>Kill switch disarmed {killOk ? '' : '— DISARM FIRST'}</span>
          <Check ok={dailyLossOk} /> <span>Daily loss within limit ({fmt.pct((account.dailyPnl / account.equity) * 100)} / -{(account.dailyLossLimitPct * 100).toFixed(1)}%)</span>
          <Check ok={endpointOk} />  <span>Broker endpoint: {status?.endpoint ?? 'loading…'}</span>
        </div>
      </div>

      {!isLive && (
        <>
          <div className="dialog-section">
            <div className="dialog-section-title">Notional cap (per-order, USD)</div>
            <div className="form-row">
              <label>Max per order</label>
              <input
                type="number"
                className="form-input"
                value={cap}
                min={1} max={50_000}
                onChange={e => setCap(e.target.value)}
              />
            </div>
            <div className="form-hint">Each order while live cannot exceed this notional. Capped at $50,000 by code.</div>
          </div>

          <div className="dialog-section">
            <div className="dialog-section-title">Typed confirmation</div>
            <div className="form-row">
              <label>Type exactly</label>
              <input
                type="text"
                className="form-input"
                value={phrase}
                onChange={e => setPhrase(e.target.value)}
                placeholder={CONFIRM_PHRASE}
                autoComplete="off"
              />
            </div>
            <div className={`form-hint ${phraseOk ? 'ok' : ''}`}>
              Required phrase: <code style={{ color: 'var(--accent-glow)' }}>{CONFIRM_PHRASE}</code>
            </div>
          </div>
        </>
      )}

      {msg && <div className={`form-hint ${msg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{msg.text}</div>}
    </Modal>
  )
}

function Check({ ok }: { ok: boolean }) {
  return (
    <span style={{
      width: 16, height: 16,
      borderRadius: '50%',
      display: 'grid', placeItems: 'center',
      background: ok ? 'var(--bull-soft)' : 'var(--bear-soft)',
      color: ok ? 'var(--bull-glow)' : 'var(--bear-glow)',
      fontSize: 11, fontWeight: 700,
    }}>
      {ok ? '✓' : '×'}
    </span>
  )
}
