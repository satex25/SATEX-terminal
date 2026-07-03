import { describe, expect, it } from 'vitest'
import { BrokerError } from './broker-error'

describe('BrokerError', () => {
  it('is an Error subclass', () => {
    const e = new BrokerError({ broker: 'alpaca', code: 'AUTH_FAILED', message: 'bad key', retryable: false })
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(BrokerError)
  })

  it('carries broker / code / retryable as readonly fields', () => {
    const e = new BrokerError({ broker: 'rithmic', code: 'RATE_LIMIT', message: '429', retryable: true })
    expect(e.broker).toBe('rithmic')
    expect(e.code).toBe('RATE_LIMIT')
    expect(e.retryable).toBe(true)
    expect(e.message).toBe('429')
  })

  it('preserves the raw wire-protocol response when provided', () => {
    const raw = { status: 429, body: 'too many requests' }
    const e = new BrokerError({ broker: 'alpaca', code: 'RATE_LIMIT', message: '429', retryable: true, raw })
    expect(e.raw).toBe(raw)
  })

  it('raw is undefined when not provided', () => {
    const e = new BrokerError({ broker: 'alpaca', code: 'AUTH_FAILED', message: 'x', retryable: false })
    expect(e.raw).toBeUndefined()
  })

  it('sets name to "BrokerError" for instanceof + stack traces', () => {
    const e = new BrokerError({ broker: 'alpaca', code: 'TIMEOUT', message: 't', retryable: true })
    expect(e.name).toBe('BrokerError')
  })
})
