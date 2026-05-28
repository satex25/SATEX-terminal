import { describe, it, expect } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

describe('ErrorBoundary', () => {
  it('exports an ErrorBoundary class', () => {
    expect(typeof ErrorBoundary).toBe('function') // ES classes are functions at runtime
  })

  it('getDerivedStateFromError returns { err } so the next render switches to the fallback', () => {
    // This is the load-bearing static method: React calls it after a render
    // throw to derive the next state. If it doesn't capture the error, the
    // component never renders its fallback and the whole subtree stays torn.
    const err = new Error('boom')
    expect(ErrorBoundary.getDerivedStateFromError(err)).toEqual({ err })
  })

  it('getDerivedStateFromError captures the exact Error instance (no cloning / wrapping)', () => {
    // The fallback gets the real error for logging / display; wrapping it
    // would strip the original stack and message.
    const err = new TypeError('asc ordered by time')
    const state = ErrorBoundary.getDerivedStateFromError(err)
    expect(state.err).toBe(err)
  })
})
