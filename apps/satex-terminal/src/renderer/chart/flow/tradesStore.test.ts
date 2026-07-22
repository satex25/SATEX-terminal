/**
 * SATEX — tradesStore characterization coverage (CHART-10 wiring).
 *
 * Pins the load-bearing behavior of the per-symbol raw-trade ring buffer that
 * feeds the OrderFlowTape / ChartPanel (P3 operator legibility). These are
 * CHARACTERIZATION tests: they assert MEASURED current behavior, so a refactor
 * that changes the eviction cadence, breaks the stable-empty-array selector
 * invariant, or drops the subscription-idempotency guard turns red.
 *
 * Three recidivist defect CLASSES are pinned:
 *   - unbounded growth   → the 500-cap ring buffer (FIFO, oldest-evicted)
 *   - stable references  → selectTrades returns ONE frozen empty array so the
 *                          Zustand-v5 useSyncExternalStore snapshot cache holds
 *                          (a fresh `[]` per call = infinite render loop)
 *   - leak / idempotency → ensure/dispose subscription lifecycle (§2.5.7)
 *
 * Node env (no DOM): the store is exercised via getState()/selectors directly,
 * not through React render. The subscription block stubs `window`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trade } from '@shared/types'
import {
  useTradesStore,
  selectTrades,
  ensureTradesSubscription,
  disposeTradesSubscription,
} from './tradesStore'

function trade(symbol: string, price: number, size = 1, side: Trade['side'] = 'buy'): Trade {
  return { symbol, ts: 1_700_000_000_000, price, size, side, provenance: 'inferred' }
}

const get = () => useTradesStore.getState()

beforeEach(() => {
  // Restore bySymbol:{} + the original ingest/reset fns.
  useTradesStore.setState(useTradesStore.getInitialState(), true)
  // Reset the module-level `subscribed`/`cleanup` singletons between tests.
  disposeTradesSubscription()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tradesStore — ingest guards', () => {
  it('ingest([]) is a no-op', () => {
    get().ingest([])
    expect(get().bySymbol).toEqual({})
  })

  it('ingest(null) is a no-op (defends the !batch guard)', () => {
    get().ingest(null as unknown as Trade[])
    expect(get().bySymbol).toEqual({})
  })
})

describe('tradesStore — ingest routing & order', () => {
  it('a single-trade batch lands under its symbol', () => {
    get().ingest([trade('AAPL', 100)])
    expect(get().bySymbol['AAPL']).toHaveLength(1)
    expect(get().bySymbol['AAPL']![0]!.price).toBe(100)
  })

  it('a mixed-symbol batch routes each print to its own symbol (isolation)', () => {
    get().ingest([trade('AAPL', 100), trade('MSFT', 200), trade('AAPL', 101)])
    expect(get().bySymbol['AAPL']).toHaveLength(2)
    expect(get().bySymbol['MSFT']).toHaveLength(1)
    expect(get().bySymbol['MSFT']![0]!.price).toBe(200)
  })

  it('separate ingest calls append oldest-first', () => {
    get().ingest([trade('AAPL', 100)])
    get().ingest([trade('AAPL', 101)])
    expect(get().bySymbol['AAPL']!.map((t) => t.price)).toEqual([100, 101])
  })
})

describe('tradesStore — ring buffer cap (MAX_PER_SYMBOL=500, unbounded-growth class)', () => {
  it('exactly 500 prints are all retained, in order', () => {
    get().ingest(Array.from({ length: 500 }, (_, i) => trade('AAPL', i)))
    const arr = get().bySymbol['AAPL']!
    expect(arr).toHaveLength(500)
    expect(arr[0]!.price).toBe(0)
    expect(arr[499]!.price).toBe(499)
  })

  it('a 501-print batch caps at 500 and evicts the OLDEST (FIFO)', () => {
    get().ingest(Array.from({ length: 501 }, (_, i) => trade('AAPL', i))) // prices 0..500
    const arr = get().bySymbol['AAPL']!
    expect(arr).toHaveLength(500)
    // index-0 (price 0) evicted; retained window is the last 500 → 1..500.
    expect(arr[0]!.price).toBe(1)
    expect(arr[499]!.price).toBe(500)
  })

  it('eviction holds across separate ingest calls', () => {
    get().ingest(Array.from({ length: 500 }, (_, i) => trade('AAPL', i))) // 0..499
    get().ingest(Array.from({ length: 10 }, (_, i) => trade('AAPL', 500 + i))) // 500..509
    const arr = get().bySymbol['AAPL']!
    expect(arr).toHaveLength(500)
    expect(arr[0]!.price).toBe(10) // first ten (0..9) evicted
    expect(arr[499]!.price).toBe(509)
  })
})

describe('tradesStore — immutability (P-061/P-074 class)', () => {
  it('ingest replaces bySymbol with a fresh object (no in-place mutation)', () => {
    const before = get().bySymbol
    get().ingest([trade('AAPL', 100)])
    expect(get().bySymbol).not.toBe(before)
    expect(before).toEqual({}) // the prior object was not mutated
  })

  it('a prior symbol array is replaced, not mutated, on the next ingest', () => {
    get().ingest([trade('AAPL', 100)])
    const arr1 = get().bySymbol['AAPL']!
    get().ingest([trade('AAPL', 101)])
    expect(arr1).toHaveLength(1) // captured reference untouched
    expect(get().bySymbol['AAPL']).not.toBe(arr1)
  })
})

describe('tradesStore — selectTrades stable-reference invariant', () => {
  it('missing symbols share ONE frozen empty array (snapshot-cache safe)', () => {
    const a = selectTrades('NOPE')(get())
    const b = selectTrades('ALSO-NOPE')(get())
    expect(a).toBe(b) // same reference — not a fresh [] per call
    expect(Object.isFrozen(a)).toBe(true)
  })

  it('a present symbol returns the stored array by identity (no copy)', () => {
    get().ingest([trade('AAPL', 100)])
    expect(selectTrades('AAPL')(get())).toBe(get().bySymbol['AAPL'])
  })
})

describe('tradesStore — reset', () => {
  it('reset() clears every symbol back to {}', () => {
    get().ingest([trade('AAPL', 100), trade('MSFT', 200)])
    get().reset()
    expect(get().bySymbol).toEqual({})
    expect(Object.isFrozen(selectTrades('AAPL')(get()))).toBe(true)
  })
})

describe('tradesStore — subscription lifecycle (leak/idempotency §2.5.7)', () => {
  function stubSatex() {
    let handler: ((batch: Trade[]) => void) | null = null
    const cleanup = vi.fn()
    const onTradesTick = vi.fn((h: (batch: Trade[]) => void) => {
      handler = h
      return cleanup
    })
    vi.stubGlobal('window', { satex: { onTradesTick } })
    return { onTradesTick, cleanup, fire: (b: Trade[]) => handler?.(b) }
  }

  it('first ensure subscribes once and routes ticks into the store', () => {
    const s = stubSatex()
    ensureTradesSubscription()
    expect(s.onTradesTick).toHaveBeenCalledTimes(1)
    s.fire([trade('AAPL', 100)])
    expect(get().bySymbol['AAPL']).toHaveLength(1)
  })

  it('repeat ensure is idempotent (no second subscription)', () => {
    const s = stubSatex()
    ensureTradesSubscription()
    ensureTradesSubscription()
    expect(s.onTradesTick).toHaveBeenCalledTimes(1)
  })

  it('dispose runs cleanup and allows a fresh subscription afterward', () => {
    const s = stubSatex()
    ensureTradesSubscription()
    disposeTradesSubscription()
    expect(s.cleanup).toHaveBeenCalledTimes(1)
    ensureTradesSubscription()
    expect(s.onTradesTick).toHaveBeenCalledTimes(2)
  })

  it('ensure/dispose are no-throw when window.satex is absent', () => {
    vi.stubGlobal('window', {})
    expect(() => ensureTradesSubscription()).not.toThrow()
    expect(() => disposeTradesSubscription()).not.toThrow()
  })
})
