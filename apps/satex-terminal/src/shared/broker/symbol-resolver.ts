/**
 * SATEX — SymbolResolver contract.
 *
 * Canonical SATEX symbol ⇆ broker-native string. Equities are identity
 * (AAPL ↔ AAPL); futures need front-month roll resolution (ES ↔ ESM5);
 * crypto needs pair normalization (BTC ↔ BTC/USD).
 *
 * Canonical naming convention:
 *   - Equity: all-uppercase ticker ('AAPL')
 *   - Future: all-uppercase product code ('ES', 'NQ', 'CL', 'GC')
 *   - Crypto: product code, no separator ('BTC', 'ETH')
 *
 * F.1 task A.4.
 */
export interface SymbolResolver {
  /**
   * Canonical → broker-native. 'ES' → 'ESM5'. Throws BrokerError
   * (SYMBOL_NOT_SUPPORTED) if no front-month is rollable for the
   * canonical symbol on this broker.
   */
  toBrokerSymbol(canonical: string): string

  /**
   * Broker-native → canonical. 'ESM5' → 'ES'. Throws BrokerError
   * (SYMBOL_NOT_SUPPORTED) on unrecognized broker symbol — engine never
   * silently records an unmappable position.
   */
  toCanonical(brokerSymbol: string): string

  /** True if `canonical` is tradeable on this broker right now. Cheap lookup. */
  isSupported(canonical: string): boolean
}
