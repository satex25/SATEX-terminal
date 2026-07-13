import { describe, it, expect } from 'vitest'
import { classifyEdge } from './edge-verdict'

describe('classifyEdge', () => {
  it('DSR >= 0.95 → real (deflation survived), regardless of PSR', () => {
    expect(classifyEdge({ psr: 0.99, dsr: 0.95 })).toBe('real')
    expect(classifyEdge({ psr: null, dsr: 0.999 })).toBe('real')
  })

  it('DSR below bar (or null) with PSR >= 0.95 → selection-risk', () => {
    expect(classifyEdge({ psr: 0.95, dsr: 0.949 })).toBe('selection-risk')
    expect(classifyEdge({ psr: 0.99, dsr: null })).toBe('selection-risk')
  })

  it('neither test clears the bar → noise', () => {
    expect(classifyEdge({ psr: 0.949, dsr: 0.5 })).toBe('noise')
    expect(classifyEdge({ psr: 0.5, dsr: null })).toBe('noise')
  })

  it('degenerate nulls (n<2 / flat equity) → noise, never a fabricated verdict', () => {
    expect(classifyEdge({ psr: null, dsr: null })).toBe('noise')
  })

  it('boundary is inclusive at exactly 0.95 for both tests', () => {
    expect(classifyEdge({ psr: null, dsr: 0.95 })).toBe('real')
    expect(classifyEdge({ psr: 0.95, dsr: null })).toBe('selection-risk')
  })
})
