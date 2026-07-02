/**
 * SATEX — EMA theme-color tests (v0.6 Phase 3 logic · Phase 5 hardening).
 *
 * Pins the per-period / per-regime / per-theme EMA color + opacity decision
 * extracted out of ChartPanel.tsx so it's unit-testable without mounting the
 * chart (Lightweight-Charts + canvas). The CSS-custom-property read is injected
 * as `readVar`, keeping the decision pure. Behavior mirrors the shipped Phase 3
 * ChartPanel exactly: Classic = regime hue × period opacity; Mono/Bluyel =
 * period-keyed token with hex fallback, full opacity.
 */
import { describe, it, expect, vi } from 'vitest'
import { emaColorForRegime, emaColorForPeriod } from './ema-theme'

describe('emaColorForRegime', () => {
  it('maps each HMM regime to its accent hex', () => {
    expect(emaColorForRegime('COMPRESSION')).toBe('#21c97a')
    expect(emaColorForRegime('EXPANSION')).toBe('#00c8ff')
    expect(emaColorForRegime('MEAN-REVERT')).toBe('#f5a623')
    expect(emaColorForRegime('CAPITULATION')).toBe('#ff4655')
  })

  it('falls back to neutral mute for unknown / null / undefined', () => {
    expect(emaColorForRegime('???')).toBe('#9aa1ad')
    expect(emaColorForRegime(null)).toBe('#9aa1ad')
    expect(emaColorForRegime(undefined)).toBe('#9aa1ad')
  })
})

describe('emaColorForPeriod — Classic (regime hue × period opacity)', () => {
  const readVar = vi.fn(() => '') // must NOT be consulted in Classic

  it('colors by regime and fades by period', () => {
    expect(emaColorForPeriod(9, 'EXPANSION', 'classic', readVar)).toEqual({ color: '#00c8ff', opacity: 1.0 })
    expect(emaColorForPeriod(21, 'COMPRESSION', 'classic', readVar)).toEqual({ color: '#21c97a', opacity: 0.78 })
    expect(emaColorForPeriod(50, 'MEAN-REVERT', 'classic', readVar)).toEqual({ color: '#f5a623', opacity: 0.58 })
    expect(emaColorForPeriod(200, 'CAPITULATION', 'classic', readVar)).toEqual({ color: '#ff4655', opacity: 0.42 })
  })

  it('uses a 0.5 opacity fallback for non-standard periods', () => {
    expect(emaColorForPeriod(33, 'EXPANSION', 'classic', readVar)).toEqual({ color: '#00c8ff', opacity: 0.5 })
  })

  it('never reads CSS vars in Classic (regime is the hue source)', () => {
    readVar.mockClear()
    emaColorForPeriod(9, 'EXPANSION', 'classic', readVar)
    expect(readVar).not.toHaveBeenCalled()
  })
})

describe('emaColorForPeriod — Mono / Bluyel (period token, full opacity)', () => {
  it('reads --bb-ema9 for short periods and --bb-ema21 for medium', () => {
    const readVar = vi.fn((name: string) => (name === '--bb-ema9' ? '#111' : '#222'))

    expect(emaColorForPeriod(9, null, 'mono', readVar)).toEqual({ color: '#111', opacity: 1.0 })
    expect(readVar).toHaveBeenCalledWith('--bb-ema9')

    expect(emaColorForPeriod(21, null, 'bluyel', readVar)).toEqual({ color: '#222', opacity: 1.0 })
    expect(readVar).toHaveBeenCalledWith('--bb-ema21')
  })

  it('maps periods > 21 back to the --bb-ema9 token', () => {
    const readVar = vi.fn(() => '#333')
    emaColorForPeriod(200, null, 'mono', readVar)
    expect(readVar).toHaveBeenCalledWith('--bb-ema9')
  })

  it('falls back to gold for short / plasma for longer when the token is empty', () => {
    const readVar = vi.fn(() => '')
    expect(emaColorForPeriod(9, null, 'mono', readVar).color).toBe('#f5c46a')
    expect(emaColorForPeriod(21, null, 'mono', readVar).color).toBe('#b48cff')
  })
})
