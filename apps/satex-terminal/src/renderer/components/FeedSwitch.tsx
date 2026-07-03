import { useEffect, useState } from 'react'
import { useDataSourceStore } from '../stores/dataSourceStore'
import { useAccountStore } from '../stores/accountStore'

/** TopBar data-feed switch: ◇ SIM DATA ⇄ ◆ ALPACA. Cyan, deliberately distinct
 *  from the PAPER/LIVE real-capital toggle. One click flips the market data feed
 *  (Simulator ⇄ live Alpaca paper data) at runtime. */
export function FeedSwitch() {
  const { source, liveAvailable, switching, hydrate, setSource } = useDataSourceStore()
  const openPositions = useAccountStore(s => s.account?.openPositions?.length ?? 0)
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { void hydrate() }, [hydrate])

  const onLive = source === 'live'
  const disabled = switching || (!onLive && !liveAvailable)

  async function doSwitch(target: 'simulator' | 'live') {
    setErr(null)
    const res = await setSource(target)
    if (!res.ok && res.reason) setErr(res.reason)
  }

  function handleClick() {
    if (disabled) return
    const target: 'simulator' | 'live' = onLive ? 'simulator' : 'live'
    if (target === 'live' && openPositions > 0) { setConfirm(true); return }
    void doSwitch(target)
  }

  return (
    <>
      <button
        type="button"
        className={`bb-feed-chip ${onLive ? 'live' : 'sim'}${switching ? ' switching' : ''}`}
        onClick={handleClick}
        disabled={disabled}
        aria-label={`Data feed: ${onLive ? 'live Alpaca' : 'simulator'}. Click to switch.`}
        title={
          switching ? 'Switching data feed…'
            : !onLive && !liveAvailable ? 'Add Alpaca paper keys in Settings → Data Source to enable the live feed'
            : onLive ? 'Live Alpaca paper data — click to return to the simulator'
            : 'Simulated data — click to switch to the live Alpaca feed'
        }
      >
        <span className="bb-feed-mark" aria-hidden="true">{onLive ? '◆' : '◇'}</span>
        {onLive ? 'ALPACA' : 'SIM DATA'}
      </button>

      {confirm && (
        <div className="bb-feed-confirm-backdrop" role="dialog" aria-modal="true" onClick={() => setConfirm(false)}>
          <div className="bb-feed-confirm" onClick={(e) => e.stopPropagation()}>
            <p>Switch to the live Alpaca data feed?<br />Your simulated paper positions will be cleared.</p>
            <div className="bb-feed-confirm-actions">
              <button type="button" onClick={() => setConfirm(false)}>Cancel</button>
              <button type="button" className="bb-feed-confirm-go" onClick={() => { setConfirm(false); void doSwitch('live') }}>Switch to live</button>
            </div>
          </div>
        </div>
      )}

      {err && <span className="bb-feed-err" role="alert" title={err} onClick={() => setErr(null)}>⚠ {err}</span>}
    </>
  )
}
