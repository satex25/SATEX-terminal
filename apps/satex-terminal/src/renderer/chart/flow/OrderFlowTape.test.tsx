// @vitest-environment jsdom
/**
 * SATEX — OrderFlowTape characterization suite (P-129 chart-jsdom-harness wave 2).
 *
 * Pins the ring-buffer accumulation + 500-print cap (drop-oldest), the
 * dirty-flag rAF economy (a flush only touches the DOM when new trades
 * landed), the newest-first raw-HTML row render (bypasses React for the
 * print list — perf), and the header's SIM badge + ref-based count text
 * (which characteristically lags one render behind the buffer, since it
 * reads a ref during render, before the trades-sync effect for THIS render
 * has run). `requestAnimationFrame`/`cancelAnimationFrame` stubbed with the
 * cancel-aware queue (matches CanvasOverlay/DrawingLayer precedent).
 *
 * Subject `OrderFlowTape.tsx` is READ-ONLY here (byte-unchanged). jsdom env.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OrderFlowTape, type OrderFlowTapeProps } from './OrderFlowTape'
import type { Trade } from '@shared/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// ── Cancel-aware rAF stub ────────────────────────────────────────────────────────
let rafId = 0
let rafCallbacks: Map<number, FrameRequestCallback>
function flushOneFrame() {
  const cbs = [...rafCallbacks.values()]
  rafCallbacks.clear()
  act(() => { cbs.forEach(cb => cb(0)) })
}

beforeEach(() => {
  rafId = 0
  rafCallbacks = new Map()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { const id = ++rafId; rafCallbacks.set(id, cb); return id })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafCallbacks.delete(id) })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function trade(over: Partial<Trade> = {}): Trade {
  return { symbol: 'BTCUSD', ts: 1_700_000_000_000, price: 100, size: 1, side: 'buy', provenance: 'real', ...over }
}

function mount(props: OrderFlowTapeProps) {
  const container = document.createElement('div')
  const root = createRoot(container)
  act(() => { root.render(createElement(OrderFlowTape, props)) })
  return {
    wrapper: container.firstElementChild as HTMLDivElement,
    rerender: (next: OrderFlowTapeProps) => act(() => { root.render(createElement(OrderFlowTape, next)) }),
    unmount: () => act(() => { root.unmount() }),
  }
}

function printList(wrapper: HTMLDivElement): HTMLDivElement {
  return wrapper.children[2] as HTMLDivElement // header, column-labels, then the ref'd scroll container
}

// Matches the subject's own `new Date(t.ts).toLocaleTimeString('en-US', { hour12: false })` —
// computed rather than hardcoded so the suite is timezone-independent (sandbox runs CDT).
function localTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

describe('OrderFlowTape — ring buffer', () => {
  it('caps at 500 prints, dropping the oldest when a single tick overflows it', () => {
    const trades = Array.from({ length: 501 }, (_, i) => trade({ price: i }))
    const h = mount({ trades, isSyntheticFeed: false })
    flushOneFrame()
    const list = printList(h.wrapper)
    expect(list.children.length).toBe(500)
    // newest-first render: row 0 is the last pushed (price 500), last row is price 1 (price 0 dropped)
    expect(list.children[0]!.textContent).toContain('500')
    expect(list.children[499]!.textContent).toContain('1')
    expect(list.children[499]!.textContent).not.toContain('>0<')
    h.unmount()
  })

  it('accumulates across successive ticks (delta arrays), still capped at 500', () => {
    const h = mount({ trades: [trade({ price: 1 })], isSyntheticFeed: false })
    h.rerender({ trades: Array.from({ length: 500 }, (_, i) => trade({ price: 100 + i })), isSyntheticFeed: false })
    flushOneFrame()
    const list = printList(h.wrapper)
    expect(list.children.length).toBe(500)
    h.unmount()
  })
})

describe('OrderFlowTape — render', () => {
  it('renders rows newest-first with time/price/size, colored by side', () => {
    const older = trade({ price: 10, size: 3, side: 'buy', ts: 0 })
    const newer = trade({ price: 20, size: 7, side: 'sell', ts: 0 })
    const h = mount({ trades: [older, newer], isSyntheticFeed: false })
    flushOneFrame()
    const list = printList(h.wrapper)
    expect(list.children.length).toBe(2)
    const t = localTime(0)
    expect(list.children[0]!.textContent).toBe(`${t}20.007`)
    expect(list.children[1]!.textContent).toBe(`${t}10.003`)
    expect(list.children[0]!.getAttribute('style')).toContain('#ef4444') // sell -> red
    expect(list.children[1]!.getAttribute('style')).toContain('#22c55e') // buy -> green
    h.unmount()
  })

  it('dims inferred-provenance prints with a lower-alpha color suffix', () => {
    const h = mount({ trades: [trade({ side: 'buy', provenance: 'inferred' })], isSyntheticFeed: false })
    flushOneFrame()
    const list = printList(h.wrapper)
    expect(list.children[0]!.getAttribute('style')).toContain('#22c55e99')
    h.unmount()
  })

  it('colors an unknown/undefined side gray, undimmed when real', () => {
    const h = mount({ trades: [trade({ side: undefined as unknown as Trade['side'] })], isSyntheticFeed: false })
    flushOneFrame()
    const list = printList(h.wrapper)
    expect(list.children[0]!.getAttribute('style')).toContain('#6b7280')
    expect(list.children[0]!.getAttribute('style')).not.toContain('#6b728099')
    h.unmount()
  })
})

describe('OrderFlowTape — dirty-flag rAF economy', () => {
  it('the first (mount) frame writes the DOM; a subsequent frame with no new trades does not', () => {
    const h = mount({ trades: [trade()], isSyntheticFeed: false })
    const list = printList(h.wrapper)
    const setter = vi.fn()
    Object.defineProperty(list, 'innerHTML', { set: setter, get: () => '', configurable: true })
    flushOneFrame() // dirty=true from the mount trades-sync effect
    expect(setter).toHaveBeenCalledTimes(1)
    flushOneFrame() // self-rescheduled tick, nothing changed since
    expect(setter).toHaveBeenCalledTimes(1)
    h.unmount()
  })

  it('a new trades prop re-arms the dirty flag for the next frame', () => {
    const h = mount({ trades: [trade()], isSyntheticFeed: false })
    flushOneFrame()
    const list = printList(h.wrapper)
    const setter = vi.fn()
    Object.defineProperty(list, 'innerHTML', { set: setter, get: () => '', configurable: true })
    h.rerender({ trades: [trade({ price: 999 })], isSyntheticFeed: false })
    flushOneFrame()
    expect(setter).toHaveBeenCalledTimes(1)
    h.unmount()
  })
})

describe('OrderFlowTape — header', () => {
  it('shows "Flow Tape" always, SIM badge only when isSyntheticFeed', () => {
    const live = mount({ trades: [], isSyntheticFeed: false })
    const header = live.wrapper.children[0]!
    expect(header.textContent).toContain('Flow Tape')
    expect(header.querySelector('span')?.nextElementSibling?.textContent).not.toBe('SIM')
    live.unmount()

    const sim = mount({ trades: [], isSyntheticFeed: true })
    expect(sim.wrapper.children[0]!.textContent).toContain('SIM')
    sim.unmount()
  })

  it('the print count reads the ref BEFORE this render\'s trades-sync effect — it lags one render', () => {
    const h = mount({ trades: [trade()], isSyntheticFeed: false })
    // Mount already ran its effect (buf.length===1 in memory) but the committed
    // DOM was rendered first, so the count text still reads the pre-effect value.
    const header = h.wrapper.children[0]!
    expect(header.textContent?.trim().endsWith('0')).toBe(true)
    // A further render (even with an unrelated no-op prop change) now reads the
    // ref post-effect and catches up to the true buffer size.
    h.rerender({ trades: [], isSyntheticFeed: false })
    expect(h.wrapper.children[0]!.textContent?.trim().endsWith('1')).toBe(true)
    h.unmount()
  })
})

describe('OrderFlowTape — cleanup', () => {
  it('cancels the pending frame on unmount', () => {
    const h = mount({ trades: [], isSyntheticFeed: false })
    expect(rafCallbacks.size).toBe(1)
    h.unmount()
    expect(rafCallbacks.size).toBe(0)
  })
})
