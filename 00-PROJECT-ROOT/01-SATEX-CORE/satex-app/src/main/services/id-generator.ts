/**
 * SATEX — Short ID generator
 * Produces collision-resistant prefixed IDs without external deps.
 */
let counter = 0

export function shortId(prefix: string): string {
  const ts  = Date.now().toString(36)
  const rnd = Math.random().toString(36).slice(2, 6)
  const seq = (++counter).toString(36).padStart(3, '0')
  return `${prefix}_${ts}${rnd}${seq}`
}

export function orderId(): string  { return shortId('ord') }
export function sessionId(): string { return shortId('ses') }
export function newsId(): string    { return shortId('nws') }
export function tradeId(): string   { return shortId('trd') }
