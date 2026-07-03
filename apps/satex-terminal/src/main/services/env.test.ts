/**
 * Coverage for src/main/services/env.ts (P-079). Source untouched.
 *
 * env.ts owns a module-level `_env` cache (`loadEnv()` populates it once,
 * `getEnv()` returns the cached value forever after). To test each scenario
 * in isolation we `vi.resetModules()` + dynamic-import a fresh copy of the
 * module per test, and save/restore `process.env` around every test so this
 * suite never leaks env state into siblings (main/services runs hundreds of
 * files in one Vitest worker — a leaked `ALPACA_KEY_ID` etc. here would be a
 * cross-file pollution bug of exactly the class this repo watches for).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS = [
  'SATEX_USE_SIMULATOR',
  'ALPACA_KEY_ID',
  'ALPACA_SECRET_KEY',
  'ALPACA_BASE_URL',
  'ALPACA_DATA_URL',
  'ALPACA_FEED',
  'SATEX_RNG_SEED',
  'SATEX_DAILY_LOSS_LIMIT_PCT',
  'SATEX_MAX_OPEN_POSITIONS',
  'SATEX_LOG_LEVEL',
] as const

let savedEnv: Record<string, string | undefined>

beforeEach(() => {
  savedEnv = {}
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k]
    delete process.env[k]
  }
  vi.resetModules()
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

async function freshEnvModule() {
  return import('./env')
}

describe('env.loadEnv — defaults with no env vars set', () => {
  it('defaults useSimulator to false', async () => {
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().useSimulator).toBe(false)
  })

  it('defaults alpacaKeyId/secretKey to empty string', async () => {
    const { loadEnv } = await freshEnvModule()
    const env = loadEnv()
    expect(env.alpacaKeyId).toBe('')
    expect(env.alpacaSecretKey).toBe('')
  })

  it('defaults alpacaBaseUrl to the paper endpoint', async () => {
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().alpacaBaseUrl).toBe('https://paper-api.alpaca.markets')
  })

  it('defaults alpacaDataUrl to the data endpoint', async () => {
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().alpacaDataUrl).toBe('https://data.alpaca.markets')
  })

  it('defaults alpacaFeed to iex', async () => {
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().alpacaFeed).toBe('iex')
  })

  it('defaults rngSeed to null', async () => {
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().rngSeed).toBeNull()
  })

  it('defaults dailyLossLimitPct to 0.02', async () => {
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().dailyLossLimitPct).toBe(0.02)
  })

  it('defaults maxOpenPositions to 3', async () => {
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().maxOpenPositions).toBe(3)
  })

  it('defaults logLevel to info', async () => {
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().logLevel).toBe('info')
  })
})

describe('env.loadEnv — useSimulator parsing', () => {
  it('is case-insensitive for "true"', async () => {
    process.env['SATEX_USE_SIMULATOR'] = 'TRUE'
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().useSimulator).toBe(true)
  })

  it('treats any non-"true" value as false (typo guard)', async () => {
    process.env['SATEX_USE_SIMULATOR'] = 'yes'
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().useSimulator).toBe(false)
  })
})

describe('env.loadEnv — alpacaFeed validation', () => {
  it('accepts "sip"', async () => {
    process.env['ALPACA_FEED'] = 'sip'
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().alpacaFeed).toBe('sip')
  })

  it('falls back to "iex" for an unrecognized value rather than passing it through', async () => {
    process.env['ALPACA_FEED'] = 'nasdaq-totalview'
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().alpacaFeed).toBe('iex')
  })
})

describe('env.loadEnv — numeric parsing', () => {
  it('parses a valid SATEX_RNG_SEED to an integer', async () => {
    process.env['SATEX_RNG_SEED'] = '42'
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().rngSeed).toBe(42)
  })

  it('parses SATEX_DAILY_LOSS_LIMIT_PCT overrides', async () => {
    process.env['SATEX_DAILY_LOSS_LIMIT_PCT'] = '0.05'
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().dailyLossLimitPct).toBe(0.05)
  })

  it('parses SATEX_MAX_OPEN_POSITIONS overrides', async () => {
    process.env['SATEX_MAX_OPEN_POSITIONS'] = '7'
    const { loadEnv } = await freshEnvModule()
    expect(loadEnv().maxOpenPositions).toBe(7)
  })

  it('parses a non-numeric SATEX_RNG_SEED to NaN (documents current behavior, not a fix — see P-079)', async () => {
    process.env['SATEX_RNG_SEED'] = 'not-a-number'
    const { loadEnv } = await freshEnvModule()
    // parseInt('not-a-number', 10) === NaN. loadEnv only null-guards the
    // *absent* case (`seedRaw ? parseInt(...) : null`); a present-but-malformed
    // value flows straight through to NaN. Pinning today's real behavior so a
    // future guard change shows up here as an intentional diff, not a surprise.
    expect(Number.isNaN(loadEnv().rngSeed as number)).toBe(true)
  })
})

describe('env.loadEnv — memoization', () => {
  it('caches on first call: a second loadEnv() after process.env mutates still returns the first snapshot', async () => {
    process.env['SATEX_MAX_OPEN_POSITIONS'] = '3'
    const { loadEnv } = await freshEnvModule()
    const first = loadEnv()
    expect(first.maxOpenPositions).toBe(3)

    process.env['SATEX_MAX_OPEN_POSITIONS'] = '99'
    const second = loadEnv()
    expect(second.maxOpenPositions).toBe(3)
    expect(second).toBe(first)
  })
})

describe('env.getEnv', () => {
  it('lazily calls loadEnv() the first time it is invoked', async () => {
    process.env['SATEX_LOG_LEVEL'] = 'debug'
    const { getEnv } = await freshEnvModule()
    expect(getEnv().logLevel).toBe('debug')
  })

  it('returns the same cached object as loadEnv() on repeat calls', async () => {
    const { loadEnv, getEnv } = await freshEnvModule()
    const loaded = loadEnv()
    expect(getEnv()).toBe(loaded)
    expect(getEnv()).toBe(getEnv())
  })

  it('does not re-read process.env once cached (mirrors loadEnv memoization)', async () => {
    process.env['SATEX_LOG_LEVEL'] = 'debug'
    const { getEnv } = await freshEnvModule()
    const first = getEnv()
    process.env['SATEX_LOG_LEVEL'] = 'error'
    expect(getEnv().logLevel).toBe(first.logLevel)
  })
})
