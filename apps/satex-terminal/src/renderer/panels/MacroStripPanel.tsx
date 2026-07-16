/**
 * SATEX — Macro Strip Panel (Phase 10 · Black Box)
 *
 * 64px ribbon under the QuadChart. Renders the next 6 scheduled macro events
 * within a 12h horizon. Subscribes to macroStore (pushed by main-process
 * MacroCalendarService).
 */
import { useMacroStore } from '../stores/macroStore'
import { useClocks } from '../hooks/useClocks'
import type { MacroEvent } from '@shared/types'

const IMPACT_DOTS: Record<MacroEvent['impact'], string> = {
  high: '●●●',
  med:  '●●',
  low:  '●',
}

function fmtTime(iso: string): string {
  return iso.slice(11, 16)  // "HH:MM"
}

export function MacroStripPanel() {
  const snap = useMacroStore(s => s.snapshot)
  const { local, localCode } = useClocks()
  const events = snap?.events ?? []

  return (
    <div className="bb-macro-strip">
      <div className="bb-macro-head">
        <span className="bb-macro-title">MACRO · NEXT {snap?.horizonHours ?? 12}H</span>
        <span className="bb-macro-utc">UTC</span>
        <span style={{ flex: 1 }} />
        <span className="bb-macro-now">● NOW · {localCode} {local}</span>
      </div>
      <div className="bb-macro-cells">
        {events.length === 0 && (
          <div className="bb-macro-empty">No events scheduled in window</div>
        )}
        {events.map((e, i) => (
          <div key={e.id} className={`bb-macro-cell ${i === 0 ? 'first' : ''}`}>
            <div className="bb-macro-cell-head">
              <span className={`bb-macro-impact bb-impact-${e.impact}`}>{IMPACT_DOTS[e.impact]}</span>
              <span className="bb-macro-time">{fmtTime(e.tsUtc)}</span>
            </div>
            <span className="bb-macro-label">{e.label}</span>
            <span className="bb-macro-meta">cons {e.cons} · act {e.actual}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
