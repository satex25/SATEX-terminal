import { describe, it, expect } from 'vitest'
import { candlestickColors } from './quad-chart-theme'
import { applyOpacity } from './color'

describe('candlestickColors — Quad pane candles track the active theme tokens', () => {
  it('uses --bb-pos / --bb-neg when present, wicks at 60% opacity', () => {
    const readVar = (n: string): string =>
      ({ '--bb-pos': '#11ee88', '--bb-neg': '#ee3344' } as Record<string, string>)[n] ?? ''
    const c = candlestickColors(readVar)
    expect(c.upColor).toBe('#11ee88')
    expect(c.downColor).toBe('#ee3344')
    expect(c.borderUpColor).toBe('#11ee88')
    expect(c.borderDownColor).toBe('#ee3344')
    expect(c.wickUpColor).toBe('rgba(17,238,136,0.60)')
    expect(c.wickDownColor).toBe('rgba(238,51,68,0.60)')
  })

  it('falls back to Classic green/red when the tokens are empty', () => {
    const c = candlestickColors(() => '')
    expect(c.upColor).toBe('#21c97a')
    expect(c.downColor).toBe('#ff4655')
    expect(c.wickUpColor).toBe(applyOpacity('#21c97a', 0.6))
    expect(c.wickDownColor).toBe(applyOpacity('#ff4655', 0.6))
  })
})

describe('applyOpacity', () => {
  it('converts 6-digit hex to rgba with 2-decimal alpha', () => {
    expect(applyOpacity('#21c97a', 0.6)).toBe('rgba(33,201,122,0.60)')
  })
  it('expands 3-digit hex', () => {
    expect(applyOpacity('#0c8', 0.5)).toBe('rgba(0,204,136,0.50)')
  })
  it('passes non-hex strings through unchanged', () => {
    expect(applyOpacity('rgba(1,2,3,0.5)', 0.6)).toBe('rgba(1,2,3,0.5)')
  })
})
