/**
 * SATEX — Chart Indicators toggle modal (Phase 11).
 *
 * Opens via ⌘⇧I. Enables / disables the 6 chart indicators and exposes their
 * configurable knobs (EMA periods, RSI period, Fib lookback). Changes
 * persist live to Vault/Settings/indicator-toggles.md through the
 * indicatorStore and reconcile onto the live ChartPanel via lightweight-
 * charts series (EMA), sub-pane (RSI), price lines (Fibonacci, Pivot
 * Points), and series markers (Double Top / Double Bottom).
 */
import { Modal } from '../Modal'
import { useIndicatorStore } from '../../stores/indicatorStore'
import {
  EMA_PERIODS, INDICATOR_IDS,
  type EmaPeriod, type IndicatorId,
} from '@shared/chart-indicators'

interface Props { open: boolean; onClose: () => void }

interface IndicatorDescriptor {
  id: IndicatorId
  label: string
  blurb: string
}

const DESCRIPTORS: IndicatorDescriptor[] = [
  {
    id: 'ema',
    label: 'Exponential Moving Average',
    blurb: 'Trend-following overlay. EMA_t = α·Price_t + (1−α)·EMA_{t−1}, α = 2/(N+1).',
  },
  {
    id: 'rsi',
    label: 'Relative Strength Index',
    blurb: 'Momentum oscillator (0-100). Sub-panel below main chart. Overbought >70, oversold <30.',
  },
  {
    id: 'double-top',
    label: 'Double Top',
    blurb: 'Bearish reversal. Two swing-highs within ≤3%, alert on neckline break with volume.',
  },
  {
    id: 'double-bottom',
    label: 'Double Bottom',
    blurb: 'Bullish reversal. Two swing-lows within ≤3%, alert on neckline break with volume.',
  },
  {
    id: 'fibonacci',
    label: 'Fibonacci Retracement',
    blurb: 'Levels at 23.6 · 38.2 · 50 · 61.8 · 78.6 % between detected swing extremes.',
  },
  {
    id: 'pivot-points',
    label: 'Pivot Points',
    blurb: 'Standard floor PP + R1–R3 / S1–S3 from prior-day HLC.',
  },
]

export function IndicatorsModal({ open, onClose }: Props) {
  const settings = useIndicatorStore(s => s.settings)
  const setEnabled       = useIndicatorStore(s => s.setEnabled)
  const toggleEmaPeriod  = useIndicatorStore(s => s.toggleEmaPeriod)
  const setRsiPeriod     = useIndicatorStore(s => s.setRsiPeriod)
  const setFibLookback   = useIndicatorStore(s => s.setFibLookback)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Chart Indicators"
      kanji="指"
      size="wide"
      footer={
        <>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--ink-3)' }}>
            Persisted to <code style={{ fontFamily: 'var(--font-mono)' }}>Vault/Settings/indicator-toggles.md</code> · live on the Trade / Focus / Replay chart
          </span>
          <button type="button" className="dialog-btn primary" onClick={onClose}>Close</button>
        </>
      }
    >
      <div className="ind-modal">
        {DESCRIPTORS.map(desc => {
          const isOn = settings.enabled[desc.id]
          return (
            <div key={desc.id} className={`ind-row${isOn ? ' on' : ''}`}>
              <label className="ind-toggle">
                <input
                  type="checkbox"
                  checked={isOn}
                  onChange={e => setEnabled(desc.id, e.currentTarget.checked)}
                />
                <span className="ind-toggle-track" />
                <span className="ind-toggle-label">{desc.label}</span>
              </label>
              <div className="ind-blurb">{desc.blurb}</div>
              {desc.id === 'ema' && isOn && (
                <div className="ind-config">
                  <span className="ind-config-lbl">PERIODS</span>
                  <div className="ind-chips">
                    {EMA_PERIODS.map(p => (
                      <button
                        key={p}
                        type="button"
                        className={`ind-chip${settings.emaPeriods.includes(p) ? ' on' : ''}`}
                        onClick={() => toggleEmaPeriod(p as EmaPeriod)}
                      >{p}</button>
                    ))}
                  </div>
                </div>
              )}
              {desc.id === 'rsi' && isOn && (
                <div className="ind-config">
                  <span className="ind-config-lbl">PERIOD</span>
                  <input
                    type="number" min={2} max={200} step={1}
                    className="ind-num"
                    value={settings.rsiPeriod}
                    onChange={e => setRsiPeriod(parseInt(e.currentTarget.value, 10) || 14)}
                  />
                </div>
              )}
              {desc.id === 'fibonacci' && isOn && (
                <div className="ind-config">
                  <span className="ind-config-lbl">LOOKBACK</span>
                  <input
                    type="number" min={5} max={1000} step={5}
                    className="ind-num"
                    value={settings.fibLookback}
                    onChange={e => setFibLookback(parseInt(e.currentTarget.value, 10) || 50)}
                  />
                  <span className="ind-config-hint">bars</span>
                </div>
              )}
            </div>
          )
        })}

        <div className="ind-footer-note">
          Each toggle here drives:
          <ul style={{ margin: '4px 0 0 14px', padding: 0, color: 'var(--ink-2)' }}>
            <li>Persistence to <code>indicator-toggles.md</code> ✓</li>
            <li>Renderer state via <code>useIndicatorStore</code> ✓</li>
            <li>Live ChartPanel overlay — EMA series · RSI sub-pane · Fib + Pivot price lines · pattern markers ✓</li>
            <li>EMA color follows dominant HMM regime (COMPRESSION · EXPANSION · MEAN-REVERT · CAPITULATION)</li>
            <li>Pivot Points fetch prior-day H/L/C from Alpaca on enable / symbol switch</li>
          </ul>
        </div>
      </div>
    </Modal>
  )
}

/** Convenience type guard so other modules can list IDs without re-importing. */
export const INDICATOR_DESCRIPTORS = DESCRIPTORS
export type { IndicatorId, EmaPeriod }
export { INDICATOR_IDS }
