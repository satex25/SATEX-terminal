/**
 * SATEX — Topstep $50K Express Funded Account (XFA) preset.
 *
 * Numbers cross-referenced against Topstep's published ruleset as of
 * 2026-05. Update if Topstep changes the contract.
 *
 * Notes on the Alpaca overlay (since SATEX trades Alpaca today, not
 * Rithmic/Tradovate):
 *   - allowedAssetClasses is permissive (equity + future + crypto) so paper
 *     practice on AAPL / SPY / BTC / etc. doesn't trip Gate 13.
 *   - maxContracts maps Topstep's actual futures symbols. For non-listed
 *     equity symbols the fallback (defaultMaxContracts) applies. v2 will
 *     introduce notional-aware sizing for equities; v1 treats "contracts"
 *     and "shares" as the same axis.
 */
import type { FundedAccountProfile } from './types'

export const TOPSTEP_50K_XFA: FundedAccountProfile = {
  id: 'topstep-50k-xfa',
  name: 'Topstep $50K Express Funded Account',
  firm: 'topstep',
  phase: 'combine',

  initialBalance: 50_000,

  dailyLossLimit: 1_000,
  trailingMaxDrawdown: 2_000,
  trailingMaxDrawdownLockAt: 1_000, // locks once highestEod ≥ $51,000

  maxContracts: {
    // E-mini index futures
    ES:  5,  MES:  50,
    NQ:  3,  MNQ:  30,
    RTY: 5,  M2K:  50,
    YM:  5,  MYM:  50,
    // Energy
    CL:  2,  MCL:  20,
    QM:  2,
    // Metals
    GC:  2,  MGC:  20,
    SI:  2,  SIL:  20,
    // Bonds / rates
    ZB:  3,  ZN:  3, ZF: 3, ZT: 3,
    // FX
    '6E': 5, '6J': 5, '6B': 5, '6A': 5,
  },
  defaultMaxContracts: 1,

  flatBy: { hour: 16, minute: 10, tz: 'America/New_York' }, // 4:10 PM ET

  newsBlackoutImpacts: ['high'],
  newsBlackoutWindowMs: 60_000, // ±60s — Topstep is more permissive than FTMO

  profitTarget: 3_000,
  minTradingDays: 0,           // XFA has no minimum
  consistencyMaxDayFraction: 0, // not enforced in XFA Combine

  allowedAssetClasses: ['equity', 'future', 'crypto'],
}
