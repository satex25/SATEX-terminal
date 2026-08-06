/**
 * RS-1.7 — golden verifier contract tests.
 *
 * `mutate.test.ts` proves the verifier reacts correctly to a catalogue of perturbations.
 * This file pins the pieces that catalogue cannot reach on its own: the unilateral
 * checks that fire with no reference at all, the alignment rule, the collection cap, and
 * the report text a drift investigation actually reads.
 *
 * The most consequential test here is the last one. A pairwise diff is structurally
 * blind to a defect present in *both* streams — two goldens that both leaked a raw id
 * compare equal and are both worthless. That is the failure the unilateral loader exists
 * for, and it is the only one no amount of comparing can find.
 */
import { describe, expect, it } from 'vitest'
import { GoldenStream, type JsonValue } from './golden'
import { diffGoldens, formatDriftReport, loadGolden, splitGoldenLines, verifyGolden } from './verify'

const ORD = 'ord_lym6yqrk8f3z001'

/** A two-record golden, enough to exercise every envelope rule. */
function tiny(): string {
  const stream = new GoldenStream()
  stream.emit({ tickIndex: 0, ts: 1_000, level: 'L1', kind: 'order.intent', payload: { qty: 3, stop: 101.25 } })
  stream.emit({ tickIndex: 1, ts: 2_000, level: 'L2', kind: 'brain.checkpoint', payload: [0.5, 0.25] })
  return stream.text()
}

/** Rewrites one record line through a patch of its parsed form. */
function patch(text: string, index: number, fn: (record: { [k: string]: JsonValue }) => void): string {
  const lines = [...splitGoldenLines(text)]
  const record = JSON.parse(lines[index] as string) as { [k: string]: JsonValue }
  fn(record)
  lines[index] = JSON.stringify(record)
  return `${lines.join('\n')}\n`
}

describe('splitGoldenLines', () => {
  it('absorbs container artifacts and nothing else', () => {
    const text = tiny()
    const expected = splitGoldenLines(text)
    expect(expected).toHaveLength(2)
    expect(splitGoldenLines(text.replace(/\n/g, '\r\n'))).toEqual(expected)
    expect(splitGoldenLines(text.slice(0, -1))).toEqual(expected)
    // Written as an escape, not as a literal BOM: an invisible U+FEFF in source is what
    // `no-irregular-whitespace` exists to stop, and a reader cannot see it to review it.
    expect(splitGoldenLines(`\uFEFF${text}`)).toEqual(expected)
    expect(splitGoldenLines(text.replace('\n', '\n\n'))).toEqual(expected)
    expect(splitGoldenLines('')).toEqual([])
  })
})

describe('loadGolden — unilateral invariants', () => {
  it('reads a clean golden with no defects', () => {
    const loaded = loadGolden(tiny(), 'reference')
    expect(loaded.defects).toEqual([])
    expect(loaded.records).toHaveLength(2)
  })

  it('refuses an empty stream — every comparison against it would pass vacuously', () => {
    const defects = loadGolden('', 'reference').defects
    expect(defects).toHaveLength(1)
    expect(defects[0]?.detail).toMatch(/no records/)
    expect(defects[0]?.category).toBe('invariant')
  })

  it('names the label, so a defective *reference* is not mistaken for a bad candidate', () => {
    expect(loadGolden('', 'reference').defects[0]?.detail).toMatch(/^reference:/)
    expect(loadGolden('', 'candidate').defects[0]?.detail).toMatch(/^candidate:/)
  })

  it('rejects a line that is not JSON, and keeps reading the rest of the stream', () => {
    const lines = [...splitGoldenLines(tiny())]
    lines[0] = 'not json'
    const loaded = loadGolden(`${lines.join('\n')}\n`, 'candidate')
    expect(loaded.defects[0]?.category).toBe('parse')
    expect(loaded.records[0]).toBeNull()
    expect(loaded.records[1]).not.toBeNull()
  })

  it('rejects an unknown envelope key and a missing one — deny_unknown_fields, both ways', () => {
    const added = loadGolden(patch(tiny(), 0, r => { r['extra'] = 1 }), 'candidate')
    expect(added.defects[0]?.detail).toMatch(/unknown envelope key "extra"/)
    const removed = loadGolden(patch(tiny(), 0, r => { delete r['ts'] }), 'candidate')
    expect(removed.defects[0]?.detail).toMatch(/missing "ts"/)
  })

  it('rejects an envelope scalar of the wrong type or range', () => {
    const cases: Array<[string, JsonValue, RegExp]> = [
      ['seq', -1, /seq/],
      ['seq', 1.5, /seq/],
      ['tickIndex', -1, /tickIndex/],
      ['level', 'L3', /level/],
      ['kind', '', /kind/],
    ]
    for (const [key, value, pattern] of cases) {
      const loaded = loadGolden(patch(tiny(), 0, r => { r[key] = value }), 'candidate')
      expect(loaded.defects[0]?.detail, `${key} = ${JSON.stringify(value)}`).toMatch(pattern)
    }
  })

  it('catches 1e400, which JSON.parse turns into Infinity without a syntax error', () => {
    // The sneaky one: the line is valid JSON, so only the Appendix B.3 serialisation
    // guard separates it from a real number.
    const lines = [...splitGoldenLines(tiny())]
    lines[0] = (lines[0] as string).replace('101.25', '1e400')
    const loaded = loadGolden(`${lines.join('\n')}\n`, 'candidate')
    expect(loaded.defects[0]?.detail).toMatch(/non-finite/)
    expect(loaded.defects[0]?.field).toBe('payload')
  })

  it('catches a seq gap, a duplicate seq, and a backwards tickIndex or ts', () => {
    const seq = loadGolden(patch(tiny(), 1, r => { r['seq'] = 5 }), 'candidate')
    expect(seq.defects[0]?.field).toBe('seq')
    const dup = loadGolden(patch(tiny(), 1, r => { r['seq'] = 0 }), 'candidate')
    expect(dup.defects[0]?.field).toBe('seq')
    const tick = loadGolden(patch(tiny(), 1, r => { r['tickIndex'] = 0 }), 'candidate')
    expect(tick.defects.map(d => d.field)).toEqual([])
    const back = loadGolden(patch(tiny(), 1, r => { r['ts'] = 500 }), 'candidate')
    expect(back.defects[0]?.field).toBe('ts')
  })

  it('permits a non-integer ts — the writer does not require one, so the reader must not (RS-L1)', () => {
    expect(loadGolden(patch(tiny(), 1, r => { r['ts'] = 2_000.5 }), 'candidate').defects).toEqual([])
  })
})

describe('diffGoldens', () => {
  it('aligns by stream position, not by seq', () => {
    // Both records keep their content; only the sequence numbers are swapped. A differ
    // that re-aligned on `seq` would call this clean.
    const swapped = patch(patch(tiny(), 0, r => { r['seq'] = 1 }), 1, r => { r['seq'] = 0 })
    const diff = diffGoldens(tiny(), swapped)
    expect(diff.divergences.some(d => d.field === 'seq')).toBe(true)
  })

  it('reports the record-count mismatch ahead of everything the cap could swallow', () => {
    const short = splitGoldenLines(tiny()).slice(0, 1).join('\n')
    const diff = diffGoldens(tiny(), `${short}\n`, { maxDivergences: 1 })
    expect(diff.divergences[0]?.field).toBe('<stream>')
    expect(diff.divergences[0]?.detail).toMatch(/different number of records/)
    expect(diff.truncated).toBe(true)
  })

  it('caps collection and says so rather than returning a silent prefix', () => {
    const stream = new GoldenStream()
    for (let i = 0; i < 20; i++) stream.emit({ tickIndex: i, ts: i, level: 'L1', kind: 'k', payload: { v: i } })
    const other = new GoldenStream()
    for (let i = 0; i < 20; i++) other.emit({ tickIndex: i, ts: i, level: 'L1', kind: 'k', payload: { v: i + 1 } })
    const diff = diffGoldens(stream.text(), other.text(), { maxDivergences: 3 })
    expect(diff.divergences).toHaveLength(3)
    expect(diff.truncated).toBe(true)
    expect(formatDriftReport(diff)).toMatch(/capped at 3 divergences/)
  })

  it('separates the byte stratum from the semantic one', () => {
    const text = tiny()
    const spaced = text.replace(/"seq":/g, '"seq" : ')
    const diff = diffGoldens(text, spaced)
    expect(diff.divergences).toEqual([])
    expect(diff.bytesEqual).toBe(false)
    expect(formatDriftReport(diff)).toMatch(/CLEAN.*semantically equal; bytes differ/)
  })
})

describe('verifyGolden', () => {
  it('exits zero on a faithful copy and one on a single changed field', () => {
    const text = tiny()
    expect(verifyGolden(text, text).exitCode).toBe(0)
    const moved = patch(text, 0, r => { (r['payload'] as { [k: string]: JsonValue })['stop'] = 101.26 })
    expect(verifyGolden(text, moved).exitCode).toBe(1)
  })

  it('names the exact divergence in the report, not just its existence', () => {
    const moved = patch(tiny(), 0, r => { (r['payload'] as { [k: string]: JsonValue })['stop'] = 101.26 })
    const report = verifyGolden(tiny(), moved).report
    expect(report).toContain('DIVERGENT')
    expect(report).toContain('payload.stop')
    expect(report).toContain('101.25')
    expect(report).toContain('101.26')
    expect(report).toContain('order.intent')
    expect(report).toContain('tick 0')
  })

  it('names deep payload paths so a nested field is findable', () => {
    const stream = new GoldenStream()
    stream.emit({ tickIndex: 0, ts: 1, level: 'L1', kind: 'gates.verdict', payload: { gates: [{ pct: 0 }, { pct: 1 }] } })
    const reference = stream.text()
    const moved = patch(reference, 0, r => {
      ((r['payload'] as { gates: Array<{ pct: number }> }).gates[1] as { pct: number }).pct = 2
    })
    expect(verifyGolden(reference, moved).report).toContain('payload.gates.1.pct')
  })

  /**
   * The class a pairwise diff cannot see.
   *
   * Both streams leak the same raw id, so every comparison between them is clean —
   * and both are worthless, because the id came from `Math.random()` and the next
   * capture will carry a different one (ledger P-143). Only the unilateral loader
   * catches it, which is why `loadGolden` runs on both sides rather than being an
   * optional pre-flight.
   */
  it('catches a raw id leaking into BOTH streams, where comparison is blind', () => {
    const leak = (text: string): string =>
      patch(text, 0, r => { (r['payload'] as { [k: string]: JsonValue })['id'] = ORD })
    const reference = leak(tiny())
    const candidate = leak(tiny())

    // The two streams are byte-identical, so the comparison itself finds nothing.
    expect(reference).toBe(candidate)

    const verdict = verifyGolden(reference, candidate)
    expect(verdict.exitCode).toBe(1)
    expect(verdict.diff.bytesEqual).toBe(true)
    expect(verdict.report).toContain(ORD)
    expect(verdict.diff.divergences.every(d => d.category === 'invariant')).toBe(true)
    expect(verdict.diff.divergences.some(d => d.detail.includes('reference:'))).toBe(true)
    expect(verdict.diff.divergences.some(d => d.detail.includes('candidate:'))).toBe(true)
  })
})
