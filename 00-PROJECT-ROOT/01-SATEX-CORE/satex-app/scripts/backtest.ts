#!/usr/bin/env node
/**
 * SATEX — Headless Backtest CLI
 *
 * Usage:
 *   npm run backtest -- \
 *     --tape scripts/fixtures/tiny-tape.json \
 *     --symbol NVDA \
 *     --strategy brain \
 *     --slippage spread-half-impact \
 *     --starting-equity 100000 \
 *     --notional-pct 0.05 \
 *     --output result.json \
 *     --format console
 *
 * The tape file is a JSON array of Candle objects:
 *   [{ "time": 1700000000, "open":..., "high":..., "low":..., "close":..., "volume":... }, ...]
 *
 * G-10 Task C.7.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Brain } from '../src/main/services/brain'
import { BrainStrategy } from '../src/main/backtest/brain-strategy'
import { BacktestRunner } from '../src/main/backtest/runner'
import {
  FixedBpsSlippageModel,
  SpreadHalfPlusImpactModel,
  ZeroSlippageModel,
} from '../src/main/backtest/slippage-model'
import type { SlippageModel } from '../src/main/backtest/slippage-model'
import {
  formatReportConsole,
  formatReportMd,
  persistReportJson,
} from '../src/main/backtest/reporter'
import type { AssetClass, Candle } from '../src/shared/types'

interface Args {
  symbol: string
  strategy: string
  slippage: string
  tape: string
  startingEquity: number
  output: string | null
  notionalPct: number
  format: 'console' | 'md' | 'json'
  assetClass: AssetClass
  periodsPerYear: number
  warmupBars: number
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    symbol: 'NVDA',
    strategy: 'brain',
    slippage: 'spread-half-impact',
    tape: '',
    startingEquity: 100_000,
    output: null,
    notionalPct: 0.05,
    format: 'console',
    assetClass: 'equity',
    periodsPerYear: 252 * 6.5 * 60,
    warmupBars: 50,
  }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = argv[i + 1]
    if      (flag === '--symbol')          { out.symbol = next!;          i++ }
    else if (flag === '--strategy')        { out.strategy = next!;        i++ }
    else if (flag === '--slippage')        { out.slippage = next!;        i++ }
    else if (flag === '--tape')            { out.tape = next!;            i++ }
    else if (flag === '--starting-equity') { out.startingEquity = Number(next); i++ }
    else if (flag === '--output')          { out.output = next!;          i++ }
    else if (flag === '--notional-pct')    { out.notionalPct = Number(next); i++ }
    else if (flag === '--format')          { out.format = next as Args['format']; i++ }
    else if (flag === '--asset-class')     { out.assetClass = next as AssetClass; i++ }
    else if (flag === '--periods-per-year'){ out.periodsPerYear = Number(next); i++ }
    else if (flag === '--warmup-bars')     { out.warmupBars = Number(next); i++ }
  }
  if (!out.tape) throw new Error('--tape <path> required')
  return out
}

function buildSlippage(name: string): SlippageModel {
  if (name === 'zero') return new ZeroSlippageModel()
  if (name === 'fixed-bps-5') return new FixedBpsSlippageModel(5)
  if (name === 'fixed-bps-10') return new FixedBpsSlippageModel(10)
  if (name === 'spread-half-impact') return new SpreadHalfPlusImpactModel({ impactCoef: 0.0001 })
  throw new Error(`Unknown slippage model: ${name}. Try one of: zero, fixed-bps-5, fixed-bps-10, spread-half-impact`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const tapePath = resolve(process.cwd(), args.tape)
  const candles = JSON.parse(await readFile(tapePath, 'utf8')) as Candle[]
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error(`Tape ${tapePath} is empty or not a JSON array of candles`)
  }

  const brain = new Brain()
  const strategy = new BrainStrategy(brain)
  const slippage = buildSlippage(args.slippage)
  const runner = new BacktestRunner(strategy, slippage, {
    strategy: args.strategy,
    symbol: args.symbol,
    tape: tapePath,
    startingEquity: args.startingEquity,
    slippageModel: args.slippage,
    notionalPct: args.notionalPct,
  })

  const report = runner.run({
    candles,
    assetClass: args.assetClass,
    periodsPerYear: args.periodsPerYear,
    warmupBars: args.warmupBars,
  })

  if      (args.format === 'console') process.stdout.write(formatReportConsole(report) + '\n')
  else if (args.format === 'md')      process.stdout.write(formatReportMd(report) + '\n')
  else                                 process.stdout.write(JSON.stringify(report, null, 2) + '\n')

  if (args.output) await persistReportJson(report, resolve(process.cwd(), args.output))
}

main().catch(e => {
  process.stderr.write(`backtest failed: ${e instanceof Error ? e.message : String(e)}\n`)
  process.exit(1)
})
