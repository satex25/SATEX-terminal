/**
 * SATEX-RS oracle — corpus tape reader and synthesizer.
 *
 * RS-UP-1 / RS-1.3 slice 2. A corpus tape is one JSONL file: a header object
 * on line 1 describing the recording, then one object per tick row. The format
 * is what `rs12-corpus-export.py` emitted during the P-143 rescue, and the
 * files it produced are **read-only artifacts** — §5.2 makes a changed SHA-256
 * an incident rather than a merge conflict.
 *
 * This reader is where that rule becomes executable. Every consistency claim
 * the header makes about the rows below it is checked on load: the row count,
 * both timestamp bounds, the ordering, and the finiteness of every price. The
 * failure the checks exist for is not hypothetical — the P-143 prune deleted
 * 49 of 50 tapes and left manifests behind claiming 13.06 M ticks where 35,658
 * survived. A reader that trusted the header would have produced a
 * confident-looking golden from a fraction of the intended input.
 *
 * `synthesizeTape` covers the other half of the problem. The rescued corpus
 * lives under a gitignored path, so CI cannot see it, but the double-run
 * determinism proof has to run on every push — it is the plan's designated
 * early-warning tripwire (R3). The synthesizer builds a tape from integer
 * arithmetic alone: no `Math.random`, no `Date.now`, no floating-point
 * accumulation. The same arguments produce the same bytes on every machine, so
 * CI proves the *mechanism* even when the recorded corpus is absent, and the
 * operator's regeneration run proves it again over the real thing.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'

/** Schema tag written by the RS-1.2 exporter. Bump = new reader. */
export const CORPUS_TAPE_SCHEMA = 'satex.corpus.tape/1'

/** Session metadata carried in the tape header. */
export interface CorpusSessionRow {
  startedAt: number
  endedAt: number | null
  startingEquity: number
  endingEquity: number | null
  realizedPnl: number
  tradeCount: number
}

/** Line 1 of a corpus tape. */
export interface CorpusTapeHeader {
  schema: string
  sessionId: string
  kind: string
  tickCount: number
  symbolCount: number
  firstTs: number
  lastTs: number
  sessionRow: CorpusSessionRow
  /** Manifest sealed when the tape was recorded, when the exporter found one. */
  liveTapeManifest?: { manifestHash: string; tickCount: number; firstTs: number; lastTs: number; sealedAt: number }
}

/** One tick row. Mirrors the `ticks` table minus `session_id`. */
export interface CorpusTickRow {
  ts: number
  symbol: string
  last: number
  bid: number
  ask: number
  volume: number
  vwap: number
}

/** A validated corpus tape. */
export interface CorpusTape {
  readonly header: CorpusTapeHeader
  readonly rows: readonly CorpusTickRow[]
}

/** Hex SHA-256 of a file's bytes — the corpus index's integrity value. */
export function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function fail(file: string, detail: string): never {
  throw new Error(`corpus tape ${file}: ${detail}`)
}

function num(file: string, row: number, field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(file, `row ${row} field "${field}" is not a finite number (got ${JSON.stringify(value)})`)
  }
  return value
}

/**
 * Reads and validates a corpus tape.
 *
 * Throws on the first inconsistency rather than repairing anything: an
 * inconsistent corpus is an incident to investigate, and a golden captured
 * from a silently-repaired tape would be evidence for a run that never
 * happened.
 */
export function readCorpusTape(file: string): CorpusTape {
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split('\n').filter(l => l.length > 0)
  if (lines.length === 0) fail(file, 'file is empty')

  let header: CorpusTapeHeader
  try {
    header = JSON.parse(lines[0]!) as CorpusTapeHeader
  } catch (err) {
    return fail(file, `header line is not JSON (${String(err)})`)
  }
  if (header.schema !== CORPUS_TAPE_SCHEMA) {
    fail(file, `unknown schema "${String(header.schema)}" (this reader understands ${CORPUS_TAPE_SCHEMA})`)
  }

  const rows: CorpusTickRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const raw = JSON.parse(lines[i]!) as Record<string, unknown>
    const row: CorpusTickRow = {
      ts: num(file, i, 'ts', raw['ts']),
      symbol: String(raw['symbol'] ?? ''),
      last: num(file, i, 'last', raw['last']),
      bid: num(file, i, 'bid', raw['bid']),
      ask: num(file, i, 'ask', raw['ask']),
      volume: num(file, i, 'volume', raw['volume']),
      vwap: num(file, i, 'vwap', raw['vwap']),
    }
    if (row.symbol === '') fail(file, `row ${i} has no symbol`)
    rows.push(row)
  }

  // The header's own claims, checked against the bytes that follow it.
  if (rows.length !== header.tickCount) {
    fail(file, `header tickCount ${header.tickCount} but file carries ${rows.length} rows — tape is truncated or the header is stale`)
  }
  if (rows.length === 0) fail(file, 'tape carries no tick rows')
  if (rows[0]!.ts !== header.firstTs) {
    fail(file, `header firstTs ${header.firstTs} but first row is ${rows[0]!.ts}`)
  }
  if (rows[rows.length - 1]!.ts !== header.lastTs) {
    fail(file, `header lastTs ${header.lastTs} but last row is ${rows[rows.length - 1]!.ts}`)
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.ts < rows[i - 1]!.ts) {
      fail(file, `rows are out of order at row ${i} (${rows[i - 1]!.ts} then ${rows[i]!.ts}) — the exporter guarantees ts ASC`)
    }
  }
  const symbols = new Set(rows.map(r => r.symbol))
  if (typeof header.symbolCount === 'number' && symbols.size !== header.symbolCount) {
    fail(file, `header symbolCount ${header.symbolCount} but rows carry ${symbols.size} distinct symbols`)
  }

  return { header, rows }
}

/** Arguments for a synthesized tape. All integers — see module header. */
export interface SynthesizeOptions {
  sessionId: string
  /** Symbols to emit. Must exist in `UNIVERSE` or `ReplaySource` drops them. */
  symbols: readonly string[]
  /** Rows per symbol. Total rows = symbols.length × ticksPerSymbol. */
  ticksPerSymbol: number
  /** Timestamp of the first row. */
  startTs: number
  /** Milliseconds between consecutive timestamps. */
  stepMs: number
}

/**
 * Integer price path, in cents, for one symbol at one step.
 *
 * A small deterministic zig-zag: prices have to *move* or the indicators the
 * engine computes stay flat and the decision stream says nothing interesting,
 * but the movement must not come from a random source. Everything here is
 * integer arithmetic; the single division by 100 at the end is the only
 * floating-point operation, and it is exact for these magnitudes on every
 * IEEE-754 platform.
 */
function priceCents(symbolIndex: number, step: number): number {
  const base = 10_000 + symbolIndex * 2_500
  // Two out-of-phase saw waves with coprime periods (17, 29) give a path that
  // trends, reverses, and never repeats over a short tape.
  const slow = ((step * 7 + symbolIndex * 13) % 29) - 14
  const fast = ((step * 11 + symbolIndex * 5) % 17) - 8
  return base + slow * 6 + fast * 2
}

/**
 * Builds a deterministic tape.
 *
 * Rows are emitted grouped by timestamp with symbols in the given order, which
 * is the shape `readTapeRange` returns them in (`ORDER BY ts ASC`) and the
 * shape the real exporter recorded (`ts ASC, symbol ASC`).
 */
export function synthesizeTape(opts: SynthesizeOptions): CorpusTape {
  const { sessionId, symbols, ticksPerSymbol, startTs, stepMs } = opts
  if (symbols.length === 0) throw new Error('synthesizeTape: at least one symbol required')
  if (ticksPerSymbol <= 0) throw new Error('synthesizeTape: ticksPerSymbol must be positive')

  const rows: CorpusTickRow[] = []
  for (let step = 0; step < ticksPerSymbol; step++) {
    const ts = startTs + step * stepMs
    for (let s = 0; s < symbols.length; s++) {
      const cents = priceCents(s, step)
      const last = cents / 100
      rows.push({
        ts,
        symbol: symbols[s]!,
        last,
        bid: (cents - 2) / 100,
        ask: (cents + 2) / 100,
        // Volume walks with the step so the tape is not constant anywhere.
        volume: 100 + ((step * 37 + s * 11) % 400),
        vwap: (cents + ((step % 3) - 1)) / 100,
      })
    }
  }

  const lastTs = startTs + (ticksPerSymbol - 1) * stepMs
  return {
    header: {
      schema: CORPUS_TAPE_SCHEMA,
      sessionId,
      kind: 'synthetic-tick-tape',
      tickCount: rows.length,
      symbolCount: symbols.length,
      firstTs: startTs,
      lastTs,
      sessionRow: {
        startedAt: startTs - 1_000,
        endedAt: lastTs + 1_000,
        startingEquity: 100_000,
        endingEquity: 100_000,
        realizedPnl: 0,
        tradeCount: 0,
      },
    },
    rows,
  }
}
