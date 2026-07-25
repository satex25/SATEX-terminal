/**
 * SATEX-RS oracle — the golden record contract.
 *
 * RS-UP-1 / RS-1.3. This module is the *format* half of the golden-capture driver:
 * the record envelope, the canonical serialisation, the id normaliser, and the stream
 * hash that the double-run determinism proof compares. It is deliberately free of any
 * dependency on the engine, electron, or sqlite so that it can be unit-tested anywhere
 * and reused by every later oracle slice (the driver, the drift differ, RS-1.7's
 * mutation test).
 *
 * Three laws it exists to enforce
 * ------------------------------
 * 1. **Determinism (Appendix A.2).** Two runs over the same corpus session must produce
 *    byte-identical goldens. Serialisation therefore fixes key order and rejects any
 *    value whose text form is ambiguous or platform-dependent.
 * 2. **Ids are identity, not behavior (operator ruling, 2026-07-25, ledger P-143).**
 *    `id-generator.ts` mixes `Date.now()` and `Math.random()` into every order/session
 *    id. Goldens normalise them to stable placeholders keyed by first-occurrence order
 *    rather than seeding `Math.random()` globally — seeding would make a *new* stray
 *    nondeterministic call invisible to the double-run hash proof, which is the one
 *    tripwire that catches it.
 * 3. **NaN and Infinity never reach serialisation (Appendix B.3).** A poisoned float
 *    reaching the golden writer is a caught engine bug, so it throws rather than
 *    silently emitting `null` the way `JSON.stringify` would.
 *
 * Numeric note: numbers are emitted by `JSON.stringify`, which is JS shortest
 * round-trip (Ryū) — the exact contract Appendix B.3 requires, and the same text the
 * Rust side produces for finite `f64` via `{}`. `-0` serialises as `0`, matching
 * `String(-0)`; the sign of zero is therefore not a golden object (documented, tested).
 */
import { createHash } from 'node:crypto'

/** Oracle strata (Appendix A.3). L3 artifacts are compared as files, not as records. */
export type OracleLevel = 'L1' | 'L2'

/** A single golden observation. One JSON object per line in the golden stream. */
export interface GoldenRecord {
  /** 0-based position in the golden stream. Monotonic, gap-free. */
  readonly seq: number
  /** Index of the corpus tick being applied when this record was emitted. */
  readonly tickIndex: number
  /** Virtual clock reading, UTC ms — the recorded timeline, never wall time. */
  readonly ts: number
  /** Which parity stratum this record belongs to. */
  readonly level: OracleLevel
  /** Subsystem + event, e.g. `gate.verdict`, `order.intent`, `brain.checkpoint`. */
  readonly kind: string
  /** The observed value. Must contain no NaN/Infinity and no unnormalised id. */
  readonly payload: JsonValue
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue }

/**
 * Id prefixes `shortId(prefix)` is called with in the engine (measured 2026-07-25 by
 * grep over `src/main`). Only these are normalised, so a market symbol, an enum string,
 * or free text can never be mangled into a placeholder by accident.
 *
 * Adding a prefix here is a deliberate act: it changes golden bytes, so it invalidates
 * previously captured goldens and needs the RS-1.3 regeneration procedure.
 */
export const DEFAULT_ID_PREFIXES: readonly string[] = [
  'ad', 'bmk', 'edgar', 'nws', 'ord', 'order', 'ses', 'seed', 'seq',
]

/**
 * Structural shape of a generated id: `prefix_` + base36(ms) + 4 random base36 + a
 * base36 sequence padded to 3. For any realistic epoch the body is 15 chars; the bound
 * below stays loose enough for a longer sequence (past 46,655 ids in one process) and
 * tight enough that ordinary words cannot match.
 */
const ID_BODY = '[0-9a-z]{13,24}';

/** Placeholder form. Chosen so it can never itself match {@link ID_BODY}. */
const placeholder = (prefix: string, n: number): string => `<${prefix}:${n}>`

/**
 * Replaces generated ids with first-occurrence-ordered placeholders.
 *
 * One instance per golden stream: the numbering is the stream's own order, so the same
 * id always maps to the same placeholder within a run, and two runs that emit the same
 * ids in the same order produce identical text. Counters are per prefix, so an order id
 * and a session id do not share a numbering space.
 *
 * Normalising an already-normalised value is a no-op, which makes the transform safe to
 * apply twice (belt and braces in the driver, and required by the differ).
 */
export class IdNormalizer {
  private readonly pattern: RegExp
  private readonly seen = new Map<string, string>()
  private readonly counters = new Map<string, number>()

  constructor(prefixes: readonly string[] = DEFAULT_ID_PREFIXES) {
    if (prefixes.length === 0) throw new Error('IdNormalizer: prefix list must not be empty')
    // Longest-first so `order_` wins over `ord_` — otherwise `order_x` would normalise
    // as prefix `ord` against the remainder `er_x`, which is not an id at all.
    const alt = [...prefixes].sort((a, b) => b.length - a.length).join('|')
    this.pattern = new RegExp(`\\b(${alt})_(${ID_BODY})\\b`, 'g')
  }

  /** Normalises every id occurrence in `text`, including ids embedded in a message. */
  text(input: string): string {
    return input.replace(this.pattern, (match, prefix: string) => {
      const hit = this.seen.get(match)
      if (hit !== undefined) return hit
      const next = (this.counters.get(prefix) ?? 0) + 1
      this.counters.set(prefix, next)
      const token = placeholder(prefix, next)
      this.seen.set(match, token)
      return token
    })
  }

  /**
   * Normalises every string inside a JSON value, structure preserved. Object keys are
   * normalised too: ids are used as map keys in the engine (the in-flight order index),
   * and a raw id leaking through a key would break parity exactly as a raw value would.
   */
  value(input: JsonValue): JsonValue {
    if (typeof input === 'string') return this.text(input)
    if (Array.isArray(input)) return input.map(v => this.value(v))
    if (input !== null && typeof input === 'object') {
      const out: { [k: string]: JsonValue } = {}
      for (const key of Object.keys(input)) out[this.text(key)] = this.value(input[key] as JsonValue)
      return out
    }
    return input
  }

  /** Ids seen so far, in first-occurrence order — surfaced for drift reports. */
  mappings(): ReadonlyMap<string, string> {
    return new Map(this.seen)
  }
}

/**
 * Deterministic JSON text for a value: object keys sorted by code unit, arrays in place,
 * numbers via JS shortest round-trip.
 *
 * Sorting keys is what makes the format immune to property-insertion order, which is an
 * engine implementation detail that must never be able to fail a parity run. Rejecting
 * non-finite numbers and `undefined` is deliberate: both would serialise to something
 * lossy (`null`, or a dropped key) and hide a real defect.
 */
export function canonicalize(value: JsonValue): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`canonicalize: non-finite number reached serialisation (${String(value)})`)
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const parts: string[] = []
    for (const k of keys) {
      const v = (value as { [key: string]: JsonValue })[k]
      if (v === undefined) throw new Error(`canonicalize: undefined value at key "${k}"`)
      parts.push(`${JSON.stringify(k)}:${canonicalize(v)}`)
    }
    return `{${parts.join(',')}}`
  }
  throw new Error(`canonicalize: unsupported value of type ${typeof value}`)
}

/** One golden line: canonical text of the record, ids already normalised. */
export function renderRecord(record: GoldenRecord, normalizer: IdNormalizer): string {
  if (!Number.isInteger(record.seq) || record.seq < 0) {
    throw new Error(`renderRecord: seq must be a non-negative integer (got ${record.seq})`)
  }
  if (!Number.isInteger(record.tickIndex) || record.tickIndex < 0) {
    throw new Error(`renderRecord: tickIndex must be a non-negative integer (got ${record.tickIndex})`)
  }
  return canonicalize({
    seq: record.seq,
    tickIndex: record.tickIndex,
    ts: record.ts,
    level: record.level,
    kind: normalizer.text(record.kind),
    payload: normalizer.value(record.payload),
  })
}

/**
 * SHA-256 over a golden stream, computed from the exact bytes a file would hold
 * (each line LF-terminated). This is the value the RS-1.3 double-run proof compares:
 * capture twice, hash twice, demand equality. A mismatch is residual nondeterminism,
 * which is a halt-and-investigate condition, never a tolerance to widen.
 */
export function hashStream(lines: readonly string[]): string {
  const h = createHash('sha256')
  for (const line of lines) {
    h.update(line, 'utf8')
    h.update('\n', 'utf8')
  }
  return h.digest('hex')
}

/** Accumulates records into a hashable, writable golden stream. */
export class GoldenStream {
  private readonly lines: string[] = []
  private readonly normalizer: IdNormalizer
  private next = 0

  constructor(normalizer: IdNormalizer = new IdNormalizer()) {
    this.normalizer = normalizer
  }

  /** Appends one observation, assigning the next stream sequence number. */
  emit(record: Omit<GoldenRecord, 'seq'>): void {
    this.lines.push(renderRecord({ ...record, seq: this.next }, this.normalizer))
    this.next += 1
  }

  get length(): number { return this.lines.length }
  /** The stream's lines, in emission order. */
  snapshot(): readonly string[] { return [...this.lines] }
  /** File text: LF-delimited with a trailing newline, matching the corpus format. */
  text(): string { return this.lines.length === 0 ? '' : `${this.lines.join('\n')}\n` }
  /** Stream hash for the double-run proof. */
  hash(): string { return hashStream(this.lines) }
  /** Id mappings applied, for the drift report's context window. */
  idMappings(): ReadonlyMap<string, string> { return this.normalizer.mappings() }
}
