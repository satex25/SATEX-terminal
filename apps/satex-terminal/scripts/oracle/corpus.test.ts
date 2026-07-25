/**
 * RS-1.3 slice 2 — corpus reader contract.
 *
 * Corpus files are read-only artifacts: RS-UP-1 §5.2 states that a changed
 * SHA-256 is an incident, not a merge conflict. The reader is where that rule
 * becomes executable — it refuses a tape whose bytes disagree with the header
 * that describes them, so a truncated, re-ordered, or silently edited tape
 * fails at load instead of producing a plausible-looking golden.
 *
 * `synthesizeTape` exists because the real corpus lives under a gitignored
 * path (`Vault/Backtests/corpus/`, ledger P-143) and CI therefore cannot see
 * it. The double-run determinism proof still has to run on every push, so it
 * runs against a tape generated from integer arithmetic — no `Math.random`,
 * no `Date.now` — which is byte-identical on every machine.
 */
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readCorpusTape, synthesizeTape, sha256File, CORPUS_TAPE_SCHEMA } from './corpus'

const temps: string[] = []
afterEach(() => {
  while (temps.length > 0) fs.rmSync(temps.pop()!, { recursive: true, force: true })
})

function writeTape(lines: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-corpus-test-'))
  temps.push(dir)
  const file = path.join(dir, 'tape.jsonl')
  fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n')
  return file
}

/** Header + rows for a well-formed two-row tape. */
function goodTape(): unknown[] {
  return [
    {
      schema: CORPUS_TAPE_SCHEMA,
      sessionId: 'ses_test0000000001',
      kind: 'live-tick-tape',
      tickCount: 2,
      symbolCount: 1,
      firstTs: 1000,
      lastTs: 2000,
      sessionRow: { startedAt: 900, endedAt: 2100, startingEquity: 100000, endingEquity: 100000, realizedPnl: 0, tradeCount: 0 },
    },
    { ts: 1000, symbol: 'AAPL', last: 195.5, bid: 195.4, ask: 195.6, volume: 100, vwap: 195.5 },
    { ts: 2000, symbol: 'AAPL', last: 195.7, bid: 195.6, ask: 195.8, volume: 120, vwap: 195.6 },
  ]
}

describe('readCorpusTape', () => {
  it('reads the header and every tick row', () => {
    const tape = readCorpusTape(writeTape(goodTape()))
    expect(tape.header.sessionId).toBe('ses_test0000000001')
    expect(tape.rows).toHaveLength(2)
    expect(tape.rows[0]).toMatchObject({ ts: 1000, symbol: 'AAPL', last: 195.5 })
  })

  it('rejects a tape whose schema tag is not the one this reader understands', () => {
    const lines = goodTape()
    ;(lines[0] as Record<string, unknown>)['schema'] = 'satex.corpus.tape/2'
    expect(() => readCorpusTape(writeTape(lines))).toThrow(/schema/i)
  })

  it('rejects a truncated tape — the row count must match the header', () => {
    // The exact shape of the P-143 near-disaster: a prune ate rows out from
    // under a manifest that still claimed the original count.
    const lines = goodTape().slice(0, 2)
    expect(() => readCorpusTape(writeTape(lines))).toThrow(/tickCount|row count/i)
  })

  it('rejects a tape whose bounds disagree with its rows', () => {
    const lines = goodTape()
    ;(lines[0] as Record<string, unknown>)['lastTs'] = 9999
    expect(() => readCorpusTape(writeTape(lines))).toThrow(/lastTs/i)
  })

  it('rejects rows that are not in non-decreasing timestamp order', () => {
    // Three rows, with the two *interior* ones swapped: the first and last
    // timestamps still match the header, so this isolates the ordering check
    // instead of tripping the bounds check on the way past.
    const lines = goodTape()
    ;(lines[0] as Record<string, unknown>)['tickCount'] = 4
    // Rows become [1000, 1700, 1500, 2000]: the bounds still agree with the
    // header, so only the ordering rule can reject this tape.
    lines.splice(2, 0,
      { ts: 1700, symbol: 'AAPL', last: 195.6, bid: 195.5, ask: 195.7, volume: 110, vwap: 195.55 },
      { ts: 1500, symbol: 'AAPL', last: 195.55, bid: 195.45, ask: 195.65, volume: 105, vwap: 195.5 },
    )
    expect(() => readCorpusTape(writeTape(lines))).toThrow(/order/i)
  })

  it('rejects a row carrying a non-finite price rather than importing it', () => {
    const lines = goodTape()
    ;(lines[1] as Record<string, unknown>)['last'] = null
    expect(() => readCorpusTape(writeTape(lines))).toThrow(/finite|last/i)
  })
})

describe('sha256File', () => {
  it('is stable across reads and changes when a byte changes', () => {
    const file = writeTape(goodTape())
    const first = sha256File(file)
    expect(sha256File(file)).toBe(first)
    fs.appendFileSync(file, ' ')
    expect(sha256File(file)).not.toBe(first)
  })
})

describe('synthesizeTape', () => {
  it('produces the requested shape', () => {
    const tape = synthesizeTape({ sessionId: 'ses_synth00000001', symbols: ['AAPL', 'MSFT'], ticksPerSymbol: 5, startTs: 10_000, stepMs: 250 })
    expect(tape.rows).toHaveLength(10)
    expect(tape.header.tickCount).toBe(10)
    expect(tape.header.symbolCount).toBe(2)
    expect(tape.header.firstTs).toBe(10_000)
    expect(tape.header.lastTs).toBe(10_000 + 4 * 250)
  })

  it('emits rows in non-decreasing timestamp order, symbols grouped per timestamp', () => {
    const tape = synthesizeTape({ sessionId: 'ses_synth00000001', symbols: ['AAPL', 'MSFT'], ticksPerSymbol: 3, startTs: 0, stepMs: 100 })
    const stamps = tape.rows.map(r => r.ts)
    expect(stamps).toEqual([...stamps].sort((a, b) => a - b))
  })

  it('is bit-identical across calls — the property CI depends on', () => {
    const args = { sessionId: 'ses_synth00000001', symbols: ['AAPL', 'MSFT', 'NVDA'], ticksPerSymbol: 40, startTs: 1_700_000_000_000, stepMs: 250 } as const
    const a = synthesizeTape({ ...args, symbols: [...args.symbols] })
    const b = synthesizeTape({ ...args, symbols: [...args.symbols] })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('produces prices that actually move, so indicators have something to chew on', () => {
    const tape = synthesizeTape({ sessionId: 'ses_synth00000001', symbols: ['AAPL'], ticksPerSymbol: 50, startTs: 0, stepMs: 250 })
    const distinct = new Set(tape.rows.map(r => r.last))
    expect(distinct.size).toBeGreaterThan(5)
    for (const r of tape.rows) {
      expect(Number.isFinite(r.last)).toBe(true)
      expect(r.bid).toBeLessThanOrEqual(r.ask)
    }
  })

  it('survives its own reader — a synthesized tape is a valid corpus tape', () => {
    const tape = synthesizeTape({ sessionId: 'ses_synth00000001', symbols: ['AAPL', 'MSFT'], ticksPerSymbol: 8, startTs: 5_000, stepMs: 250 })
    const file = writeTape([tape.header, ...tape.rows])
    const reread = readCorpusTape(file)
    expect(reread.rows).toEqual(tape.rows)
    expect(reread.header.firstTs).toBe(tape.header.firstTs)
  })
})
