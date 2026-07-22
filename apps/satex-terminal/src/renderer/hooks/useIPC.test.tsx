// @vitest-environment jsdom
/**
 * SATEX — useIPC characterization suite (P-129 chart-jsdom-harness wave 1).
 *
 * Pins the single IPC-subscription hub: the §2.5.7 listener-cleanup surface.
 * Uses a hand-rolled `renderHook` (react-dom/client + act, zero new deps —
 * @testing-library/react is intentionally NOT a dependency; §1.1 minimalism),
 * proven by the prior-session __harness_probe spike this suite supersedes.
 *
 * Subject `useIPC.ts` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement, type FC } from 'react'
import { createRoot } from 'react-dom/client'
import { useIPC } from './useIPC'
import { useMarketStore } from '../stores/marketStore'
import { useFootprintStore } from '../stores/footprintStore'
import { useReplayStore } from '../stores/replayStore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// ── Hand-rolled renderHook (no @testing-library) ───────────────────────────────
function renderHook(hook: () => void) {
  const container = document.createElement('div')
  const root = createRoot(container)
  const Probe: FC = () => { hook(); return null }
  act(() => { root.render(createElement(Probe)) })
  return {
    rerender: () => act(() => { root.render(createElement(Probe)) }),
    unmount:  () => act(() => { root.unmount() }),
  }
}

// ── Mock window.satex ──────────────────────────────────────────────────────────
// Each channel returns its OWN distinct unsub spy so cleanup can be counted.
function makeSatex(opts: { optional?: boolean; rejectSeed?: boolean } = {}) {
  const unsubs: Record<string, ReturnType<typeof vi.fn>> = {}
  const chan = (name: string) => {
    const u = vi.fn()
    unsubs[name] = u
    return vi.fn(() => u)
  }
  const seed = () => vi.fn(() => opts.rejectSeed ? Promise.reject(new Error('seed offline')) : Promise.resolve(null))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satex: any = {
    onQuotesTick:   chan('quotes'),
    onCandlesUpdate: chan('candles'),
    onNewsAppend:   chan('news'),
    onAccountUpdate: chan('account'),
    onOrdersUpdate: chan('orders'),
    onSystemStatus: chan('status'),
    subscribe: vi.fn(() => Promise.resolve()),
  }
  if (opts.optional) {
    satex.onCandlesBulkReplace   = chan('candlesBulk')
    satex.onAutonomousStats      = chan('autonomous')
    satex.onRegimeUpdate         = chan('regime')
    satex.onRiskGatesUpdate      = chan('riskGates')
    satex.onMacroUpdate          = chan('macro')
    satex.onLogsTail             = chan('logs')
    satex.onDepthUpdate          = chan('depth')
    satex.onTradesTick           = chan('trades')
    satex.onFeedStatusUpdate     = chan('feed')
    satex.onHealthReport         = chan('health')
    satex.onUpdateAvailable      = chan('update')
    satex.onSubsecondCandlesUpdate = chan('subsecond')
    satex.journal = { onTradeClosed: chan('journal'), getClosed: vi.fn(() => Promise.resolve(null)) }
    satex.replay  = { onStatus: chan('replay'), getStatus: vi.fn(() => Promise.resolve(null)) }
    satex.getAutonomousStatus = seed()
    satex.getRegime           = seed()
    satex.getRiskGates        = seed()
    satex.getMacro            = seed()
    satex.getLogsTail         = seed()
    satex.getDepth            = seed()
    satex.getSubsecondPrefs   = seed()
  }
  return { satex, unsubs }
}

const REQUIRED = ['onQuotesTick', 'onCandlesUpdate', 'onNewsAppend', 'onAccountUpdate', 'onOrdersUpdate', 'onSystemStatus'] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setSatex(s: any) { (window as any).satex = s }

beforeEach(() => { delete (window as unknown as { satex?: unknown }).satex })
afterEach(() => { vi.restoreAllMocks() })

describe('useIPC — missing bridge guard', () => {
  it('logs an error and does not throw when window.satex is absent', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    let h: ReturnType<typeof renderHook> | undefined
    expect(() => { h = renderHook(() => useIPC()) }).not.toThrow()
    expect(err).toHaveBeenCalledWith(expect.stringContaining('window.satex not found'))
    expect(() => h!.unmount()).not.toThrow()
  })
})

describe('useIPC — subscribe contract', () => {
  it('subscribes every required channel exactly once and seeds subscribe([])', () => {
    const { satex } = makeSatex()
    setSatex(satex)
    const h = renderHook(() => useIPC())
    for (const name of REQUIRED) expect(satex[name]).toHaveBeenCalledTimes(1)
    expect(satex.subscribe).toHaveBeenCalledTimes(1)
    expect(satex.subscribe).toHaveBeenCalledWith([])
    h.unmount()
  })

  it('does not re-subscribe on re-render (honestly-empty deps)', () => {
    const { satex } = makeSatex()
    setSatex(satex)
    const h = renderHook(() => useIPC())
    h.rerender()
    h.rerender()
    for (const name of REQUIRED) expect(satex[name]).toHaveBeenCalledTimes(1)
    expect(satex.subscribe).toHaveBeenCalledTimes(1)
    h.unmount()
  })
})

describe('useIPC — cleanup contract (the leak surface)', () => {
  it('calls every registered unsub exactly once on unmount (all channels present)', () => {
    const { satex, unsubs } = makeSatex({ optional: true })
    setSatex(satex)
    const h = renderHook(() => useIPC())
    // 6 required + 14 optional channels each returned a distinct unsub.
    expect(Object.keys(unsubs).length).toBe(20)
    for (const u of Object.values(unsubs)) expect(u).not.toHaveBeenCalled()
    h.unmount()
    for (const [name, u] of Object.entries(unsubs)) {
      expect(u, `unsub for ${name}`).toHaveBeenCalledTimes(1)
    }
  })

  it('required-channel unsubs each fire once even with no optional channels', () => {
    const { satex, unsubs } = makeSatex()
    setSatex(satex)
    const h = renderHook(() => useIPC())
    h.unmount()
    expect(Object.keys(unsubs).length).toBe(6)
    for (const u of Object.values(unsubs)) expect(u).toHaveBeenCalledTimes(1)
  })

  it('re-subscribes cleanly after an unmount (idempotent lifecycle)', () => {
    const { satex } = makeSatex()
    setSatex(satex)
    const h1 = renderHook(() => useIPC())
    h1.unmount()
    const h2 = renderHook(() => useIPC())
    for (const name of REQUIRED) expect(satex[name]).toHaveBeenCalledTimes(2)
    h2.unmount()
  })
})

describe('useIPC — optional-channel tolerance (?. + ?? fallback)', () => {
  it('mounts and unmounts without throwing when all optional channels are absent', () => {
    const { satex } = makeSatex() // required only
    setSatex(satex)
    let h: ReturnType<typeof renderHook> | undefined
    expect(() => { h = renderHook(() => useIPC()) }).not.toThrow()
    expect(() => h!.unmount()).not.toThrow()
  })

  it('subscribes each optional channel once when present', () => {
    const { satex } = makeSatex({ optional: true })
    setSatex(satex)
    const h = renderHook(() => useIPC())
    expect(satex.onRegimeUpdate).toHaveBeenCalledTimes(1)
    expect(satex.onHealthReport).toHaveBeenCalledTimes(1)
    expect(satex.onSubsecondCandlesUpdate).toHaveBeenCalledTimes(1)
    expect(satex.journal.onTradeClosed).toHaveBeenCalledTimes(1)
    expect(satex.replay.onStatus).toHaveBeenCalledTimes(1)
    h.unmount()
  })
})

describe('useIPC — push routing + replay-transition logic', () => {
  it('routes an onQuotesTick push straight to marketStore.updateQuotes (wiring not inverted)', () => {
    const updateQuotes = vi.spyOn(useMarketStore.getState(), 'updateQuotes').mockImplementation(() => {})
    const { satex } = makeSatex()
    setSatex(satex)
    const h = renderHook(() => useIPC())
    const cb = satex.onQuotesTick.mock.calls[0][0] as (q: unknown) => void
    const payload = [{ symbol: 'BTCUSD', price: 42 }]
    act(() => { cb(payload) })
    expect(updateQuotes).toHaveBeenCalledWith(payload)
    h.unmount()
  })

  it('resets candles + footprint only when crossing the replay boundary, and always forwards status', () => {
    const resetCandles = vi.spyOn(useMarketStore.getState(), 'resetCandles').mockImplementation(() => {})
    const resetFootprint = vi.spyOn(useFootprintStore.getState(), 'reset').mockImplementation(() => {})
    const setReplay = vi.spyOn(useReplayStore.getState(), 'setStatus').mockImplementation(() => {})
    const { satex } = makeSatex({ optional: true })
    setSatex(satex)
    const h = renderHook(() => useIPC())
    const cb = satex.replay.onStatus.mock.calls[0][0] as (s: unknown) => void

    act(() => { cb({ mode: 'playing' }) })   // enter → reset once
    expect(resetCandles).toHaveBeenCalledTimes(1)
    expect(resetFootprint).toHaveBeenCalledTimes(1)

    act(() => { cb({ mode: 'paused' }) })    // stay inside replay → no new reset
    expect(resetCandles).toHaveBeenCalledTimes(1)
    expect(resetFootprint).toHaveBeenCalledTimes(1)

    act(() => { cb({ mode: 'stopped' }) })   // leave → reset again
    expect(resetCandles).toHaveBeenCalledTimes(2)
    expect(resetFootprint).toHaveBeenCalledTimes(2)

    expect(setReplay).toHaveBeenCalledTimes(3) // every status forwarded
    h.unmount()
  })
})

describe('useIPC — seed fetches + .catch wall', () => {
  it('fires each optional seed fetch once on mount', () => {
    const { satex } = makeSatex({ optional: true })
    setSatex(satex)
    const h = renderHook(() => useIPC())
    expect(satex.getRegime).toHaveBeenCalledTimes(1)
    expect(satex.getRiskGates).toHaveBeenCalledTimes(1)
    expect(satex.getMacro).toHaveBeenCalledTimes(1)
    expect(satex.getLogsTail).toHaveBeenCalledTimes(1)
    expect(satex.getDepth).toHaveBeenCalledTimes(1)
    expect(satex.getSubsecondPrefs).toHaveBeenCalledTimes(1)
    h.unmount()
  })

  it('tolerates rejecting seed fetches (the .catch wall) without throwing', async () => {
    const { satex } = makeSatex({ optional: true, rejectSeed: true })
    setSatex(satex)
    let h: ReturnType<typeof renderHook> | undefined
    expect(() => { h = renderHook(() => useIPC()) }).not.toThrow()
    await act(async () => { await Promise.resolve() }) // flush the rejected seed microtasks
    expect(satex.getRegime).toHaveBeenCalled()
    expect(() => h!.unmount()).not.toThrow()
  })
})
