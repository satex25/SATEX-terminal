import type { DataSource } from '@shared/types'

export interface DataSourceSwitchState {
  current:           DataSource
  target:            DataSource
  replayActive:      boolean
  realCapitalArmed:  boolean
  paperCredsPresent: boolean
}

/** Pure interlock decision for a data-feed switch. Order of precedence:
 *  already-on → replay → real-capital → missing-creds. No I/O — the
 *  safety-critical core, unit-tested independently of the heavy engine. */
export function evaluateDataSourceSwitch(s: DataSourceSwitchState): { ok: boolean; reason?: string; noop?: boolean } {
  if (s.current === s.target) return { ok: true, noop: true }
  if (s.replayActive)         return { ok: false, reason: 'Stop replay before switching the data feed.' }
  if (s.realCapitalArmed)     return { ok: false, reason: 'Disarm ● LIVE real-capital mode before switching the data feed.' }
  if (s.target === 'live' && !s.paperCredsPresent)
                              return { ok: false, reason: 'Add Alpaca paper keys in Settings → Data Source first.' }
  return { ok: true }
}
