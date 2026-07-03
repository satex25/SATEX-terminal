/**
 * SATEX — News Desk (2026-06-10): CATALYSTS ⇄ THE WIRE.
 *
 * One quadrant, two desks. CATALYSTS is the trading-relevant feed the engine
 * already produces; THE WIRE is the toggleable live world-news module — real
 * channels (BBC World, NPR, Guardian, Hacker News) with per-channel tabs,
 * polled main-side the moment they publish. Flipping to CATALYSTS turns the
 * wire's polling OFF entirely (zero background traffic).
 *
 * The desk choice persists in localStorage so the terminal boots into
 * whichever desk the operator left open.
 */
import { useEffect, useState } from 'react'
import { CatalystsPanel } from './CatalystsPanel'
import { WirePanel } from './WirePanel'
import { useWireStore } from '../stores/wireStore'

const DESK_KEY = 'satex-newsdesk'
type Desk = 'catalysts' | 'wire'

function savedDesk(): Desk {
  try { return localStorage.getItem(DESK_KEY) === 'wire' ? 'wire' : 'catalysts' }
  catch { return 'catalysts' }
}

export function NewsDeskPanel() {
  const [desk, setDesk] = useState<Desk>(savedDesk)
  const setSnap = useWireStore(s => s.setSnap)

  // Live pushes flow whenever the wire is enabled; the subscription itself is
  // free when it's off (main simply never emits).
  useEffect(() => {
    const un = window.satex?.onWireUpdate?.(setSnap)
    return () => { un?.() }
  }, [setSnap])

  // Sync main-side polling with the chosen desk — on boot AND on every flip.
  useEffect(() => {
    try { localStorage.setItem(DESK_KEY, desk) } catch { /* ignore */ }
    void (async () => {
      try {
        const snap = await window.satex?.setWireEnabled?.(desk === 'wire')
        if (snap) setSnap(snap)
      } catch { /* main offline — desk still renders */ }
    })()
  }, [desk, setSnap])

  return (
    <div className="newsdesk">
      <div className="newsdesk-switch" role="tablist" aria-label="News desk">
        <button
          type="button" role="tab" aria-selected={desk === 'catalysts'}
          className={`newsdesk-chip ${desk === 'catalysts' ? 'active' : ''}`}
          onClick={() => setDesk('catalysts')}
        >
          CATALYSTS
        </button>
        <button
          type="button" role="tab" aria-selected={desk === 'wire'}
          className={`newsdesk-chip wire ${desk === 'wire' ? 'active' : ''}`}
          onClick={() => setDesk('wire')}
        >
          ◉ THE WIRE
        </button>
      </div>
      <div className="newsdesk-body">
        {desk === 'catalysts' ? <CatalystsPanel /> : <WirePanel />}
      </div>
    </div>
  )
}
