/**
 * SATEX — Environment variable validation and access.
 * All env reads go through this module. Direct process.env access is forbidden.
 * On missing required variables, throws with a clear actionable error.
 */
import { createLogger } from './logger'

const log = createLogger('env')

export interface SatexEnv {
  // Alpaca
  alpacaKeyId: string
  alpacaSecretKey: string
  alpacaBaseUrl: string
  alpacaDataUrl: string
  alpacaFeed: 'iex' | 'sip'
  // Mode
  useSimulator: boolean
  rngSeed: number | null
  // Risk overrides
  dailyLossLimitPct: number
  maxOpenPositions: number
  // Logging
  logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error'
}

let _env: SatexEnv | null = null

export function loadEnv(): SatexEnv {
  if (_env) return _env

  const useSimulator = (process.env['SATEX_USE_SIMULATOR'] ?? 'false').toLowerCase() === 'true'

  const keyId     = process.env['ALPACA_KEY_ID']     ?? ''
  const secretKey = process.env['ALPACA_SECRET_KEY'] ?? ''
  const baseUrl   = process.env['ALPACA_BASE_URL']   ?? 'https://paper-api.alpaca.markets'
  const dataUrl   = process.env['ALPACA_DATA_URL']   ?? 'https://data.alpaca.markets'
  const feedRaw   = process.env['ALPACA_FEED']        ?? 'iex'
  const feed      = feedRaw === 'sip' ? 'sip' : 'iex'

  if (!useSimulator && (!keyId || !secretKey)) {
    log.info(
      'Alpaca env credentials not set. Engine will use stored credentials (if any) or fall back to simulator.'
    )
  }

  const seedRaw = process.env['SATEX_RNG_SEED']
  const rngSeed = seedRaw ? parseInt(seedRaw, 10) : null

  const dailyLossLimitPct  = parseFloat(process.env['SATEX_DAILY_LOSS_LIMIT_PCT']  ?? '0.02')
  const maxOpenPositions   = parseInt(  process.env['SATEX_MAX_OPEN_POSITIONS']     ?? '3', 10)
  const logLevel = (process.env['SATEX_LOG_LEVEL'] ?? 'info') as SatexEnv['logLevel']

  _env = {
    alpacaKeyId:      keyId,
    alpacaSecretKey:  secretKey,
    alpacaBaseUrl:    baseUrl,
    alpacaDataUrl:    dataUrl,
    alpacaFeed:       feed,
    // useSimulator now means "explicitly forced via SATEX_USE_SIMULATOR=true".
    // The engine separately decides to fall back to simulator when no usable
    // keys exist (env OR credential store). Pre-2026-05-13 this flag also
    // turned true when env keys were missing, which masked stored keypairs.
    useSimulator,
    rngSeed,
    dailyLossLimitPct,
    maxOpenPositions,
    logLevel,
  }

  log.info('environment loaded', {
    mode: _env.useSimulator ? 'simulator' : 'live-alpaca',
    feed: _env.alpacaFeed,
    baseUrl: _env.alpacaBaseUrl,
    hasKey: !!keyId,
  })

  return _env
}

export function getEnv(): SatexEnv {
  if (!_env) return loadEnv()
  return _env
}
