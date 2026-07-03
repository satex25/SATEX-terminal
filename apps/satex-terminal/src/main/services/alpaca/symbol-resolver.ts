/**
 * SATEX — AlpacaSymbolResolver.
 *
 * Equity tickers are identity (AAPL ↔ AAPL). Crypto canonicals normalize
 * to Alpaca's pair format (BTC ↔ BTC/USD). Unknown symbols throw
 * BrokerError(SYMBOL_NOT_SUPPORTED) so the engine never silently records
 * an unmappable position.
 *
 * F.1 task B.1.
 */
import type { SymbolResolver } from '@shared/broker/symbol-resolver'
import { BrokerError } from '@shared/broker/broker-error'
import { findUniverseEntry } from '@shared/constants'

/** Crypto canonical → Alpaca pair format. */
const CRYPTO_TO_PAIR: Record<string, string> = {
  BTC: 'BTC/USD',
  ETH: 'ETH/USD',
}
/** Reverse lookup, generated once. */
const PAIR_TO_CRYPTO: Record<string, string> = Object.fromEntries(
  Object.entries(CRYPTO_TO_PAIR).map(([k, v]) => [v, k])
)

export class AlpacaSymbolResolver implements SymbolResolver {
  toBrokerSymbol(canonical: string): string {
    if (canonical in CRYPTO_TO_PAIR) return CRYPTO_TO_PAIR[canonical]!
    const entry = findUniverseEntry(canonical)
    if (entry) return canonical
    throw new BrokerError({
      broker: 'alpaca', code: 'SYMBOL_NOT_SUPPORTED',
      message: `Unknown canonical symbol: ${canonical}`, retryable: false,
    })
  }

  toCanonical(brokerSymbol: string): string {
    if (brokerSymbol in PAIR_TO_CRYPTO) return PAIR_TO_CRYPTO[brokerSymbol]!
    const entry = findUniverseEntry(brokerSymbol)
    if (entry) return brokerSymbol
    throw new BrokerError({
      broker: 'alpaca', code: 'SYMBOL_NOT_SUPPORTED',
      message: `Unknown broker symbol: ${brokerSymbol}`, retryable: false,
    })
  }

  isSupported(canonical: string): boolean {
    if (canonical in CRYPTO_TO_PAIR) return true
    return findUniverseEntry(canonical) !== undefined
  }
}
