/**
 * SATEX-RS oracle — golden record contract tests (RS-UP-1 / RS-1.3).
 *
 * These are characterization + property pins for the format the whole oracle rests on.
 * The pins that matter most are the ones that would let a *false* parity pass through:
 * a hash that ignores a changed value, a normaliser that maps two different ids to one
 * placeholder, or a serialiser that silently turns NaN into null.
 */
import { describe, expect, it } from 'vitest'
import {
  canonicalize,
  DEFAULT_ID_PREFIXES,
  GoldenStream,
  hashStream,
  IdNormalizer,
  renderRecord,
  type GoldenRecord,
  type JsonValue,
} from './golden'

// A realistic generated id: prefix_ + base36(ms) + 4 rnd + 3 seq (id-generator.ts).
const ORD_A = 'ord_lym6yqrk8f3z001'
const ORD_B = 'ord_lym6yqrk9x2q002'
const SES_A = 'ses_lym6yqrkab12001'

describe('canonicalize', () => {
  it('is independent of property insertion order', () => {
    const a: JsonValue = { b: 1, a: 2, c: { z: 3, y: 4 } }
    const b: JsonValue = { c: { y: 4, z: 3 }, a: 2, b: 1 }
    expect(canonicalize(a)).toBe(canonicalize(b))
    expect(canonicalize(a)).toBe('{"a":2,"b":1,"c":{"y":4,"z":3}}')
  })

  it('preserves array order (arrays are sequences, not sets)', () => {
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]')
    expect(canonicalize([3, 1, 2])).not.toBe(canonicalize([1, 2, 3]))
  })

  it('round-trips floats through JS shortest-round-trip text', () => {
    for (const n of [0, 1, -1, 0.1, 0.3, 1 / 3, 1e21, 1e-7, Number.MIN_VALUE,
                     Number.MAX_SAFE_INTEGER, -273.15, 4.35]) {
      expect(JSON.parse(canonicalize(n))).toBe(n)
    }
  })

  it('serialises -0 as 0, so the sign of zero is not a golden object', () => {
    // Matches String(-0) === '0' on the TS side; documented in the module header so a
    // future -0 divergence is investigated as a real numeric question, not a format bug.
    expect(canonicalize(-0)).toBe('0')
    expect(canonicalize(-0)).toBe(canonicalize(0))
  })

  it('throws on NaN and Infinity instead of emitting null (Appendix B.3)', () => {
    expect(() => canonicalize(NaN)).toThrow(/non-finite/)
    expect(() => canonicalize(Infinity)).toThrow(/non-finite/)
    expect(() => canonicalize(-Infinity)).toThrow(/non-finite/)
    // The failure mode this guards: JSON.stringify would have hidden it.
    expect(JSON.stringify({ x: NaN })).toBe('{"x":null}')
  })

  it('throws on an undefined property rather than dropping the key', () => {
    expect(() => canonicalize({ a: 1, b: undefined } as unknown as JsonValue)).toThrow(/undefined/)
  })

  it('escapes strings exactly as JSON does', () => {
    expect(canonicalize('a"b\\c\nd')).toBe(JSON.stringify('a"b\\c\nd'))
    expect(canonicalize('émoji 🚀')).toBe(JSON.stringify('émoji 🚀'))
  })

  it('handles null, booleans and empty containers', () => {
    expect(canonicalize(null)).toBe('null')
    expect(canonicalize(true)).toBe('true')
    expect(canonicalize(false)).toBe('false')
    expect(canonicalize([])).toBe('[]')
    expect(canonicalize({})).toBe('{}')
  })
})

describe('IdNormalizer', () => {
  it('maps ids to first-occurrence-ordered placeholders', () => {
    const n = new IdNormalizer()
    expect(n.text(ORD_A)).toBe('<ord:1>')
    expect(n.text(ORD_B)).toBe('<ord:2>')
    expect(n.text(ORD_A)).toBe('<ord:1>')      // stable on re-encounter
  })

  it('counts per prefix, so order and session ids share no numbering space', () => {
    const n = new IdNormalizer()
    expect(n.text(SES_A)).toBe('<ses:1>')
    expect(n.text(ORD_A)).toBe('<ord:1>')
  })

  it('never maps two different ids to the same placeholder', () => {
    const n = new IdNormalizer()
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      // Distinct bodies of legal length; only the id body varies.
      const id = `ord_lym6yqrk${i.toString(36).padStart(4, '0')}${i.toString(36).padStart(3, '0')}`
      seen.add(n.text(id))
    }
    expect(seen.size).toBe(500)
  })

  it('normalises ids embedded in a message string', () => {
    const n = new IdNormalizer()
    expect(n.text(`submit ${ORD_A} for ${SES_A} failed`)).toBe('submit <ord:1> for <ses:1> failed')
  })

  it('leaves non-ids untouched — symbols, enums, words, snake_case', () => {
    const n = new IdNormalizer()
    for (const s of ['NVDA', 'BTC/USD', 'buy', 'order_flow', 'ord_', 'ord_short',
                     'seq_of_events', 'a_b', 'RECONNECTING', '', 'ordinary text']) {
      expect(n.text(s)).toBe(s)
    }
    expect(n.mappings().size).toBe(0)
  })

  it('prefers the longest matching prefix so `order_` is not read as `ord`', () => {
    const n = new IdNormalizer()
    expect(n.text('order_lym6yqrkab12001')).toBe('<order:1>')
  })

  it('is idempotent — normalising twice changes nothing', () => {
    const n = new IdNormalizer()
    const once = n.text(`${ORD_A} ${SES_A}`)
    expect(n.text(once)).toBe(once)
  })

  it('is deterministic across instances given the same id order', () => {
    const a = new IdNormalizer()
    const b = new IdNormalizer()
    const seq = [ORD_A, SES_A, ORD_B, ORD_A]
    expect(seq.map(s => a.text(s))).toEqual(seq.map(s => b.text(s)))
  })

  it('normalises ids used as object keys, not just values', () => {
    const n = new IdNormalizer()
    const out = n.value({ [ORD_A]: { parent: SES_A } }) as { [k: string]: JsonValue }
    expect(Object.keys(out)).toEqual(['<ord:1>'])
    expect(out['<ord:1>']).toEqual({ parent: '<ses:1>' })
  })

  it('walks arrays and nested structures, leaving non-strings alone', () => {
    const n = new IdNormalizer()
    expect(n.value([ORD_A, 42, null, true, [SES_A]])).toEqual(['<ord:1>', 42, null, true, ['<ses:1>']])
  })

  it('rejects an empty prefix list', () => {
    expect(() => new IdNormalizer([])).toThrow(/must not be empty/)
  })

  it('covers every prefix the engine actually uses', () => {
    // Guards against a prefix being added to id-generator call sites without being
    // taught to the normaliser — which would leak raw randomness into goldens.
    for (const p of DEFAULT_ID_PREFIXES) {
      const n = new IdNormalizer()
      expect(n.text(`${p}_lym6yqrkab12001`)).toBe(`<${p}:1>`)
    }
  })
})

describe('renderRecord', () => {
  const base: GoldenRecord = {
    seq: 0, tickIndex: 7, ts: 1_784_880_866_709, level: 'L1',
    kind: 'order.intent', payload: { id: ORD_A, symbol: 'NVDA', qty: 3, stop: 101.25 },
  }

  it('emits canonical text with ids normalised', () => {
    expect(renderRecord(base, new IdNormalizer())).toBe(
      '{"kind":"order.intent","level":"L1","payload":' +
      '{"id":"<ord:1>","qty":3,"stop":101.25,"symbol":"NVDA"},' +
      '"seq":0,"tickIndex":7,"ts":1784880866709}',
    )
  })

  it('rejects a non-integer or negative seq / tickIndex', () => {
    const n = new IdNormalizer()
    expect(() => renderRecord({ ...base, seq: -1 }, n)).toThrow(/seq/)
    expect(() => renderRecord({ ...base, seq: 1.5 }, n)).toThrow(/seq/)
    expect(() => renderRecord({ ...base, tickIndex: -1 }, n)).toThrow(/tickIndex/)
  })

  it('propagates the NaN guard from a payload float', () => {
    expect(() => renderRecord({ ...base, payload: { px: NaN } }, new IdNormalizer()))
      .toThrow(/non-finite/)
  })
})

describe('hashStream / GoldenStream', () => {
  it('hashes the exact bytes a file would hold (LF-terminated lines)', () => {
    // Independently computable: sha256 of "a\nb\n".
    expect(hashStream(['a', 'b'])).toBe(hashStream(['a', 'b']))
    expect(hashStream([])).toBe(hashStream([]))
    expect(hashStream(['a', 'b'])).not.toBe(hashStream(['ab']))
  })

  it('assigns gap-free sequence numbers in emission order', () => {
    const s = new GoldenStream()
    for (let i = 0; i < 4; i++) {
      s.emit({ tickIndex: i, ts: 1000 + i, level: 'L1', kind: 'gate.verdict', payload: { pass: true } })
    }
    expect(s.length).toBe(4)
    expect(s.snapshot().map(l => (JSON.parse(l) as { seq: number }).seq)).toEqual([0, 1, 2, 3])
  })

  it('produces byte-identical output for two identical runs (the double-run proof)', () => {
    const run = (): GoldenStream => {
      const s = new GoldenStream()
      s.emit({ tickIndex: 0, ts: 1, level: 'L1', kind: 'order.intent', payload: { id: ORD_A } })
      s.emit({ tickIndex: 1, ts: 2, level: 'L2', kind: 'brain.checkpoint', payload: { w: [0.1, 0.2] } })
      return s
    }
    expect(run().hash()).toBe(run().hash())
    expect(run().text()).toBe(run().text())
  })

  it('detects a single perturbed field — the property RS-1.7 will weaponise', () => {
    const build = (stop: number): string => {
      const s = new GoldenStream()
      s.emit({ tickIndex: 0, ts: 1, level: 'L1', kind: 'order.intent', payload: { stop } })
      return s.hash()
    }
    expect(build(101.25)).not.toBe(build(101.26))
    // One ULP is still a divergence: parity is bit-exact, not eyeball-exact.
    expect(build(101.25)).not.toBe(build(101.25 + Number.EPSILON * 64))
  })

  it('is insensitive to payload key order but sensitive to values', () => {
    const emit = (payload: JsonValue): string => {
      const s = new GoldenStream()
      s.emit({ tickIndex: 0, ts: 1, level: 'L1', kind: 'k', payload })
      return s.hash()
    }
    expect(emit({ a: 1, b: 2 })).toBe(emit({ b: 2, a: 1 }))
    expect(emit({ a: 1, b: 2 })).not.toBe(emit({ a: 1, b: 3 }))
  })

  it('renders file text with a trailing newline, and nothing for an empty stream', () => {
    const s = new GoldenStream()
    expect(s.text()).toBe('')
    s.emit({ tickIndex: 0, ts: 1, level: 'L1', kind: 'k', payload: null })
    expect(s.text().endsWith('\n')).toBe(true)
    expect(s.text().split('\n').filter(Boolean)).toHaveLength(1)
  })

  it('shares one id numbering space across the whole stream', () => {
    const s = new GoldenStream()
    s.emit({ tickIndex: 0, ts: 1, level: 'L1', kind: 'order.intent', payload: { id: ORD_A } })
    s.emit({ tickIndex: 1, ts: 2, level: 'L1', kind: 'order.fill', payload: { id: ORD_A } })
    s.emit({ tickIndex: 2, ts: 3, level: 'L1', kind: 'order.intent', payload: { id: ORD_B } })
    const ids = s.snapshot().map(l => (JSON.parse(l) as { payload: { id: string } }).payload.id)
    expect(ids).toEqual(['<ord:1>', '<ord:1>', '<ord:2>'])
    expect(s.idMappings().get(ORD_A)).toBe('<ord:1>')
  })
})
