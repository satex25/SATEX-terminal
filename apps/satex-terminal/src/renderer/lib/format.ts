/**
 * SATEX — number formatting helpers.
 * Centralized so every panel renders prices/PnL/percentages identically.
 */

export const fmt = {
  px(v: number | null | undefined, dp = 2): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
  },
  pct(v: number | null | undefined, dp = 2): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`
  },
  signed(v: number | null | undefined, dp = 2): string {
    if (v == null || !Number.isFinite(v)) return '—'
    const sign = v >= 0 ? '+' : ''
    return `${sign}${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
  },
  money(v: number | null | undefined, dp = 0): string {
    if (v == null || !Number.isFinite(v)) return '—'
    const sign = v >= 0 ? '+' : '−'
    return `${sign}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
  },
  usd(v: number | null | undefined, dp = 0): string {
    if (v == null || !Number.isFinite(v)) return '—'
    return `$${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
  },
  k(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v)) return '—'
    const a = Math.abs(v)
    if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B'
    if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M'
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K'
    if (Number.isInteger(v)) return String(v)
    // Sub-1000 non-integer: 3 significant figures with trailing zeros trimmed,
    // consistent with the K/M/B branches above and free of IEEE-754 noise
    // (e.g. 0.1 + 0.2 renders "0.3", not "0.30000000000000004").
    return String(Number(v.toPrecision(3)))
  },
}
