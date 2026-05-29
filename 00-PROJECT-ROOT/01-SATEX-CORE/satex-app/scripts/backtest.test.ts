/**
 * SATEX — Backtest CLI integration test.
 * Verifies the end-to-end pipeline (canned tape → BrainStrategy → ZeroSlippage
 * → BacktestRunner → Reporter) by importing the same modules the CLI uses
 * and checking the report shape. We do NOT shell out to `npm run backtest`
 * here — the unit modules already cover the wiring; this just locks in that
 * the fixture round-trips through the runner without throwing.
 *
 * G-10 Task C.7.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Brain } from '../src/main/services/brain'
import { BrainStrategy } from '../src/main/backtest/brain-strategy'
import { BacktestRunner } from '../src/main/backtest/runner'
import { ZeroSlippageModel } from '../src/main/backtest/slippage-model'
import type { Candle } from '../src/shared/types'

describe('Backtest CLI pipeline (integration)', () => {
  it('runs end-to-end on the canned fixture and produces a complete report', async () => {
    const tapePath = resolve(__dirname, 'fixtures', 'tiny-tape.json')
    const candles = JSON.parse(await readFile(tapePath, 'utf8')) as Candle[]
    expect(candles.length).toBeGreaterThanOrEqual(120)

    const runner = new BacktestRunner(
      new BrainStrategy(new Brain()),
      new ZeroSlippageModel(),
      {
        strategy: 'brain', symbol: 'NVDA', tape: tapePath,
        startingEquity: 100_000, slippageModel: 'zero', notionalPct: 0.05,
      },
    )
    const report = runner.run({ candles, assetClass: 'equity' })

    expect(report.startingEquity).toBe(100_000)
    expect(report.equityCurve.length).toBe(candles.length)
    expect(typeof report.metrics.sharpe).toBe('number')
    expect(typeof report.metrics.maxDrawdown).toBe('number')
    expect(report.metrics.tradeCount).toBeGreaterThanOrEqual(0)
    expect(report.endedAt).toBeGreaterThanOrEqual(report.startedAt)
  })
})
