import { describe, expect, it } from 'vitest'
import { DailyPnlLedger, type DailyPnlEntry } from './daily-pnl-ledger'
import type { ClosedTrade } from '@shared/types'

function trade(pnl: number, closedAt: number, id = 'x'): ClosedTrade {
  return {
    id, symbol: 'NVDA', side: 'long', quantity: 100,
    entryPrice: 100, exitPrice: 101, pnl, pnlPct: 0.01,
    holdMs: 60_000, closedAt,
    triggeredBy: null, source: 'backtest',
    tags: [], conviction: null, regimeAtEntry: null,
  }
}

function build(tz: string | null = 'America/New_York') {
  const persisted: DailyPnlEntry[][] = []
  const ledger = new DailyPnlLedger({
    getTimezone: () => tz,
    persist: (es) => persisted.push(es),
  })
  return { ledger, persisted }
}

describe('DailyPnlLedger', () => {
  it('records a closed trade into a per-day bucket', () => {
    const { ledger } = build()
    ledger.recordClosedTrade(trade(500, Date.parse('2026-05-29T19:00:00Z')))
    expect(ledger.getEntries()).toHaveLength(1)
    expect(ledger.getEntries()[0]!.date).toBe('2026-05-29')
    expect(ledger.getEntries()[0]!.realizedPnl).toBe(500)
    expect(ledger.getEntries()[0]!.tradeCount).toBe(1)
  })

  it('accumulates same-day trades', () => {
    const { ledger } = build()
    ledger.recordClosedTrade(trade(300, Date.parse('2026-05-29T15:00:00Z')))
    ledger.recordClosedTrade(trade(-100, Date.parse('2026-05-29T18:00:00Z')))
    ledger.recordClosedTrade(trade(200, Date.parse('2026-05-29T19:00:00Z')))
    expect(ledger.getEntries()).toHaveLength(1)
    expect(ledger.getEntries()[0]!.realizedPnl).toBe(400)
    expect(ledger.getEntries()[0]!.tradeCount).toBe(3)
  })

  it('separates different days', () => {
    const { ledger } = build()
    ledger.recordClosedTrade(trade(300, Date.parse('2026-05-29T19:00:00Z')))
    ledger.recordClosedTrade(trade(500, Date.parse('2026-05-30T19:00:00Z')))
    expect(ledger.getEntries()).toHaveLength(2)
  })

  it('no-ops without an active timezone', () => {
    const { ledger, persisted } = build(null)
    ledger.recordClosedTrade(trade(300, Date.now()))
    expect(ledger.getEntries()).toHaveLength(0)
    expect(persisted).toHaveLength(0)
  })

  it('persists every recordClosedTrade', () => {
    const { ledger, persisted } = build()
    ledger.recordClosedTrade(trade(100, Date.parse('2026-05-29T19:00:00Z')))
    ledger.recordClosedTrade(trade(200, Date.parse('2026-05-30T19:00:00Z')))
    expect(persisted).toHaveLength(2)
    expect(persisted[1]!).toHaveLength(2)
  })

  it('hydrate restores entries sorted by date', () => {
    const { ledger } = build()
    ledger.hydrate([
      { date: '2026-05-30', realizedPnl: 200, tradeCount: 1, updatedAt: 0 },
      { date: '2026-05-29', realizedPnl: 100, tradeCount: 1, updatedAt: 0 },
    ])
    expect(ledger.getEntries().map(e => e.date)).toEqual(['2026-05-29', '2026-05-30'])
  })

  it('reset clears state', () => {
    const { ledger } = build()
    ledger.recordClosedTrade(trade(100, Date.parse('2026-05-29T19:00:00Z')))
    ledger.reset()
    expect(ledger.getEntries()).toHaveLength(0)
  })
})
