/**
 * SATEX — BrokerError taxonomy.
 *
 * All thrown errors from broker interfaces (OrderRouter / AccountSyncer /
 * SymbolResolver / BrokerSession) are BrokerError (or subclasses).
 * Programmer errors (bad arg, null deref) stay as bare Error.
 *
 * F.1 task A.1.
 */
export type BrokerErrorCode =
  | 'AUTH_FAILED'
  | 'CONNECTION_LOST'
  | 'RATE_LIMIT'
  | 'INVALID_ORDER'
  | 'INSUFFICIENT_FUNDS'
  | 'SYMBOL_NOT_SUPPORTED'
  | 'NOT_IMPLEMENTED'   // Rithmic stubs throw with this code in F.1
  | 'PROTOCOL_ERROR'    // unexpected wire-protocol response shape
  | 'TIMEOUT'

export interface BrokerErrorOpts {
  broker: 'alpaca' | 'rithmic'
  code: BrokerErrorCode
  message: string
  retryable: boolean
  raw?: unknown
}

export class BrokerError extends Error {
  readonly broker:    'alpaca' | 'rithmic'
  readonly code:      BrokerErrorCode
  readonly retryable: boolean
  readonly raw?:      unknown

  constructor(opts: BrokerErrorOpts) {
    super(opts.message)
    this.name = 'BrokerError'
    this.broker = opts.broker
    this.code = opts.code
    this.retryable = opts.retryable
    if (opts.raw !== undefined) this.raw = opts.raw
  }
}
