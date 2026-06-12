/**
 * VaultWriter integration — P-013 (`Vault/Trades/` never populates).
 *
 * Pins the WRITER half of the trade-close pipeline so the runtime diagnostic
 * can reason cleanly:
 *
 *   TradingEngine.recordTradeClose ──(vault && entry)──▶ vault.writeTradeClose
 *
 * With these green, an empty Vault/Trades/ in a live session can only mean
 * the engine never invoked the writer (no closes happened, or closes ran
 * without entry features) — which the P-013 `trade close not journaled`
 * warn line in trading-engine.ts now surfaces explicitly.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Order, Position } from '@shared/types'
import { VaultWriter } from './vault-writer'

interface CloseArgs {
  order: Order
  position: Position
  pnl: number
  holdMs: number
  aiDecision: null
  tacticsAtEntry: null
  regimeAtEntry: string
}

function closeFixture(pnl: number): CloseArgs {
  const order: Order = {
    id: 'ord-p013',
    traceId: 'trace-p013',
    createdAt: 1_770_000_000_000,
    filledAt: 1_770_000_300_000,
    status: 'filled',
    fillPrice: 102.5,
    request: { symbol: 'TEST', side: 'sell', type: 'market', quantity: 10, source: 'order-manager' },
  }
  const position: Position = {
    symbol: 'TEST',
    quantity: 10,
    avgPrice: 100,
    unrealizedPnl: 0,
    realizedPnl: pnl,
    openedAt: 1_770_000_000_000,
  }
  return { order, position, pnl, holdMs: 300_000, aiDecision: null, tacticsAtEntry: null, regimeAtEntry: 'trend-up' }
}

describe('VaultWriter — P-013 trade-close path', () => {
  let root: string
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'satex-vault-')) })
  afterEach(() => { rmSync(root, { recursive: true, force: true }) })

  it('initialize() enables only when .obsidian/ exists at projectRoot', () => {
    const w = new VaultWriter({ projectRoot: root })
    w.initialize()
    expect(w.stats().enabled).toBe(false)

    mkdirSync(join(root, '.obsidian'))
    w.initialize()
    expect(w.stats().enabled).toBe(true)
    expect(w.stats().vaultRoot).toBe(root)
  })

  it('writeTradeClose materialises a Trades note with frontmatter + result', async () => {
    mkdirSync(join(root, '.obsidian'))
    const w = new VaultWriter({ projectRoot: root })
    w.initialize()

    await w.writeTradeClose(closeFixture(25))

    const dir = join(root, 'Vault', 'Trades')
    const notes = readdirSync(dir)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatch(/\.md$/)
    const text = readFileSync(join(dir, notes[0]!), 'utf8')
    expect(text).toContain('trade-close')
    expect(text).toContain('TEST')
    expect(text).toContain('## Result')
    expect(text).toContain('[[Symbols/TEST]]')
    expect(w.stats().notesWritten).toBe(1)
    expect(w.stats().lastNotePath).toBe(join(dir, notes[0]!))
  })

  it('captures learnings on losses (MAY-TACTICS extraction principle)', async () => {
    mkdirSync(join(root, '.obsidian'))
    const w = new VaultWriter({ projectRoot: root })
    w.initialize()

    await w.writeTradeClose(closeFixture(-40))

    const dir = join(root, 'Vault', 'Trades')
    const text = readFileSync(join(dir, readdirSync(dir)[0]!), 'utf8')
    expect(text).toContain('loss')
    expect(text).toContain('## Learnings')
  })

  it('is a no-op when disabled — no dirs created, no notes written', async () => {
    const w = new VaultWriter({ projectRoot: root }) // no .obsidian
    w.initialize()

    await w.writeTradeClose(closeFixture(25))

    expect(existsSync(join(root, 'Vault', 'Trades'))).toBe(false)
    expect(w.stats().notesWritten).toBe(0)
    expect(w.stats().lastNotePath).toBeNull()
  })
})
