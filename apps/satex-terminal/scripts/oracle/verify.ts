/**
 * SATEX-RS oracle — the golden verifier: loader, structural differ, drift report.
 *
 * RS-UP-1 / RS-1.7. `golden.ts` is the *writer* half of the oracle; this is the
 * *reader* half. It answers the only question a parity claim may rest on — "is this
 * candidate stream the same decision stream the TS engine produced?" — and answers it
 * with an Appendix A.4-shaped divergence list rather than a boolean, because RS-L4 says
 * parity is measured and a measurement that cannot name what moved is not one.
 *
 * It exists now, one task early, because RS-1.7 cannot mutation-test a comparator that
 * does not exist. RS-1.4 ports this module to Rust; the mutation matrix in `mutate.ts`
 * is the falsifiability contract both implementations must satisfy.
 *
 * Two strata, deliberately different sensitivities
 * -----------------------------------------------
 * There are two ways to compare goldens and conflating them is how a harness ends up
 * either blind or hysterical:
 *
 * - **Byte stratum** — `hashStream()` / the manifest SHA-256. Both sides came from the
 *   same writer, so *any* byte difference is signal. This is what the RS-1.3 double-run
 *   determinism proof compares, and it is strictly stronger than the semantic stratum.
 * - **Semantic stratum** — this module. The two sides came from *different language
 *   runtimes*, so properties of the file container — key order, intra-line whitespace,
 *   CRLF, a trailing newline, a BOM, `1.0` vs `1`, `-0` vs `0`, a \uXXXX escape vs its literal — carry
 *   no decision content and must never be reported as divergence. A harness that flags
 *   them would make every real divergence unfindable in the noise, and the first
 *   response to that noise would be to widen a tolerance somewhere that matters.
 *
 * `mutate.ts` proves both directions: every semantically-loaded perturbation is caught,
 * every container-only perturbation is not. Neither half means anything without the
 * other — a differ that always returns "clean" passes every negative control, and a
 * differ that always returns "divergent" passes every positive one.
 *
 * Alignment is by ordinal position, never by `seq`
 * -----------------------------------------------
 * Record *i* of the candidate is compared with record *i* of the reference, and `seq` is
 * compared as ordinary data. Aligning *on* `seq` would let a stream with duplicated or
 * renumbered sequence numbers silently re-align itself into a clean report, which is
 * precisely one of the mutation classes this harness has to catch.
 *
 * Unilateral checks are not redundant with pairwise ones
 * -----------------------------------------------------
 * `loadGolden` validates a stream against the format's own laws with no reference at
 * all. This catches the failure a pairwise diff structurally cannot: a defect present in
 * *both* streams. A raw `ord_…` id leaking past the normaliser into both sides compares
 * equal and is still fatal — it means the goldens carry `Math.random()` output, so the
 * next capture will differ for no engine reason (ledger P-143 / the RS-1.3 header's
 * second law).
 */
import { canonicalize, IdNormalizer, type GoldenRecord, type JsonValue, type OracleLevel } from './golden'

/** What kind of disagreement a {@link Divergence} records. */
export type DivergenceCategory =
  /** A line could not be read as a golden record at all. */
  | 'parse'
  /** A stream broke one of the format's own laws, judged without a reference. */
  | 'invariant'
  /** Both sides have the value; the values differ. */
  | 'value'
  /** The reference has a record or key the candidate does not. */
  | 'missing'
  /** The candidate has a record or key the reference does not. */
  | 'extra'

/** Stand-in for "there is no value here", so a report never prints a bare `undefined`. */
export const ABSENT = '<absent>'

/** Field path used when the finding is about the stream rather than one record. */
export const STREAM_FIELD = '<stream>'

/**
 * One Appendix A.4 divergence row.
 *
 * `expected` / `actual` are *canonical text*, not live values: a report is evidence and
 * has to survive being written to a file, and canonical text is the same text the golden
 * itself would carry for that value.
 */
export interface Divergence {
  readonly category: DivergenceCategory
  /** 0-based stream position — the alignment key. Not the record's own `seq`. */
  readonly index: number
  /** Envelope context from the reference side; `null` when no record could be read. */
  readonly seq: number | null
  readonly tickIndex: number | null
  readonly level: OracleLevel | null
  readonly kind: string | null
  /** Dotted path: `seq`, `level`, `payload.stop`, `payload.gates.3.status`. */
  readonly field: string
  readonly expected: string
  readonly actual: string
  /** One human sentence naming what moved. */
  readonly detail: string
}

/** The exact top-level keys a golden record carries. Anything else is a defect. */
export const ENVELOPE_KEYS: readonly string[] = ['kind', 'level', 'payload', 'seq', 'tickIndex', 'ts']

const BOM = '\uFEFF'

/**
 * Splits golden file text into record lines, absorbing container artifacts only.
 *
 * A leading BOM, CRLF endings, a missing or extra trailing newline and blank lines are
 * properties of how the bytes were transported, not of what the engine decided — the
 * same tolerance `readCorpusTape` already applies to corpus tapes. The byte stratum
 * still sees every one of them, which is where they belong.
 */
export function splitGoldenLines(text: string): readonly string[] {
  const body = text.startsWith(BOM) ? text.slice(BOM.length) : text
  const out: string[] = []
  for (const raw of body.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (line.trim().length > 0) out.push(line)
  }
  return out
}

/** A golden stream read from text, with whatever the read found wrong with it. */
export interface LoadedGolden {
  /** Name used in defect messages — `reference` or `candidate` at the diff level. */
  readonly label: string
  /** One entry per line, `null` where the line could not be read as a record. */
  readonly records: readonly (GoldenRecord | null)[]
  /** Parse and invariant findings, judged without reference to any other stream. */
  readonly defects: readonly Divergence[]
}

/** Envelope read result — a record, or the reason it is not one. */
type EnvelopeResult = { readonly record: GoldenRecord } | { readonly error: string }

function readEnvelope(value: unknown): EnvelopeResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    const got = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
    return { error: `line is not a JSON object (got ${got})` }
  }
  const obj = value as Record<string, unknown>
  // Strict in both directions — the serde `deny_unknown_fields` discipline the Rust
  // port will use. An extra envelope key is a schema change wearing a passing disguise.
  for (const key of Object.keys(obj)) {
    if (!ENVELOPE_KEYS.includes(key)) {
      return { error: `unknown envelope key "${key}" (the envelope is exactly ${ENVELOPE_KEYS.join(', ')})` }
    }
  }
  for (const key of ENVELOPE_KEYS) {
    if (!(key in obj)) return { error: `envelope is missing "${key}"` }
  }

  const { seq, tickIndex, ts, level, kind, payload } = obj
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
    return { error: `seq is not a non-negative integer (got ${JSON.stringify(seq)})` }
  }
  if (typeof tickIndex !== 'number' || !Number.isInteger(tickIndex) || tickIndex < 0) {
    return { error: `tickIndex is not a non-negative integer (got ${JSON.stringify(tickIndex)})` }
  }
  // `ts` is checked for finiteness but *not* for integrality: `renderRecord` validates
  // seq and tickIndex as integers and leaves ts alone, and a reader must not enforce a
  // rule its writer does not (RS-L1 — port behavior, not intentions).
  if (typeof ts !== 'number' || !Number.isFinite(ts)) {
    return { error: `ts is not a finite number (got ${JSON.stringify(ts)})` }
  }
  if (level !== 'L1' && level !== 'L2') {
    return { error: `level is not an oracle stratum (got ${JSON.stringify(level)}, expected "L1" or "L2")` }
  }
  if (typeof kind !== 'string' || kind.length === 0) {
    return { error: `kind is not a non-empty string (got ${JSON.stringify(kind)})` }
  }

  return { record: { seq, tickIndex, ts, level, kind, payload: payload as JsonValue } }
}

/**
 * The raw id, if any, that survived normalisation in `text`.
 *
 * Implemented by re-running the stream's own normaliser rather than by a second copy of
 * the id regex: a duplicated pattern would drift the day a prefix is added to
 * `DEFAULT_ID_PREFIXES`, and a detector that silently stops detecting is the P-097 shape.
 */
function rawIdIn(text: string): string | null {
  const probe = new IdNormalizer()
  if (probe.text(text) === text) return null
  return [...probe.mappings().keys()][0] ?? null
}

/**
 * Reads a golden stream and judges it against the format's own laws.
 *
 * Never throws. A mutation that leaves the file malformed has to be *reported* — a
 * harness that dies with a stack trace instead of a drift report has told the operator
 * nothing about which record moved.
 */
export function loadGolden(text: string, label: string): LoadedGolden {
  const lines = splitGoldenLines(text)
  const records: (GoldenRecord | null)[] = []
  const defects: Divergence[] = []

  const note = (
    category: DivergenceCategory,
    index: number,
    record: GoldenRecord | null,
    field: string,
    expected: string,
    actual: string,
    detail: string,
  ): void => {
    defects.push({
      category, index, field, expected, actual,
      seq: record?.seq ?? null,
      tickIndex: record?.tickIndex ?? null,
      level: record?.level ?? null,
      kind: record?.kind ?? null,
      detail: `${label}: ${detail}`,
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch (err) {
      records.push(null)
      note('parse', i, null, STREAM_FIELD, '<a golden record>', line.slice(0, 120),
        `record ${i} is not valid JSON (${String(err)})`)
      continue
    }

    const read = readEnvelope(parsed)
    if ('error' in read) {
      records.push(null)
      note('parse', i, null, STREAM_FIELD, '<a golden record>', line.slice(0, 120),
        `record ${i} ${read.error}`)
      continue
    }
    const record = read.record

    // Canonicalising is how a payload gets checked for the values `JSON.parse` will
    // happily produce and the golden writer refuses: `1e400` parses to `Infinity`
    // without a syntax error, and Appendix B.3 says a non-finite float reaching
    // serialisation is a caught engine bug, not a value to compare.
    let canonicalPayload: string
    try {
      canonicalPayload = canonicalize(record.payload)
    } catch (err) {
      records.push(null)
      note('invariant', i, record, 'payload', '<a serialisable value>', line.slice(0, 120),
        `record ${i} payload cannot be canonicalised (${String(err)})`)
      continue
    }

    const leaked = rawIdIn(`${record.kind} ${canonicalPayload}`)
    if (leaked !== null) {
      // Fatal even when both streams carry it — see the module header. This is the one
      // class a pairwise diff is structurally unable to see.
      note('invariant', i, record, 'payload', '<a normalised id placeholder>', leaked,
        `record ${i} carries the un-normalised id "${leaked}" — the golden holds raw ` +
        'Math.random() output and the next capture will differ for no engine reason (P-143)')
    }

    records.push(record)
  }

  if (records.length === 0) {
    note('invariant', 0, null, STREAM_FIELD, '>= 1 record', '0 records',
      'golden carries no records — every comparison against it would pass vacuously (P-097 class)')
  }

  let previous: GoldenRecord | null = null
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record === null) continue
    if (record.seq !== i) {
      note('invariant', i, record, 'seq', String(i), String(record.seq),
        `record ${i} carries seq ${record.seq} — the stream sequence must be gap-free, ` +
        'duplicate-free and in emission order')
    }
    if (previous !== null && record.tickIndex < previous.tickIndex) {
      note('invariant', i, record, 'tickIndex', `>= ${previous.tickIndex}`, String(record.tickIndex),
        `record ${i} tickIndex went backwards (${previous.tickIndex} then ${record.tickIndex}) — ` +
        'replay applies ticks in recorded order')
    }
    if (previous !== null && record.ts < previous.ts) {
      note('invariant', i, record, 'ts', `>= ${previous.ts}`, String(record.ts),
        `record ${i} ts went backwards (${previous.ts} then ${record.ts}) — the virtual clock only moves forward`)
    }
    previous = record
  }

  return { label, records, defects }
}

/** How many divergences a diff collects before it stops and says so. */
export const DEFAULT_MAX_DIVERGENCES = 100

export interface DiffOptions {
  /** Collection cap. A deleted record cascades through every later position. */
  readonly maxDivergences?: number
}

/** The verdict of one golden comparison. */
export interface GoldenDiff {
  readonly divergences: readonly Divergence[]
  /** True when the cap was hit and the list below is a prefix, not the whole story. */
  readonly truncated: boolean
  /** Byte-stratum result: are the two texts literally identical? */
  readonly bytesEqual: boolean
  readonly expectedRecords: number
  readonly actualRecords: number
}

/** JSON type tag, distinguishing the two things `typeof` calls `object`. */
function jsonTypeOf(value: JsonValue): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/** Canonical text, or a readable placeholder when the value cannot be serialised. */
function show(value: JsonValue): string {
  try {
    return canonicalize(value)
  } catch (err) {
    return `<unserialisable: ${String(err)}>`
  }
}

/**
 * Compares two golden streams, semantic stratum.
 *
 * Both sides are loaded first, so a defect in the *reference* is reported too. A
 * reference that violates the format is a halt-and-investigate condition: every claim
 * ever measured against it is suspect, and that is louder news than the candidate's
 * divergences.
 */
export function diffGoldens(expectedText: string, actualText: string, opts: DiffOptions = {}): GoldenDiff {
  const limit = opts.maxDivergences ?? DEFAULT_MAX_DIVERGENCES
  const expected = loadGolden(expectedText, 'reference')
  const actual = loadGolden(actualText, 'candidate')

  const collected: Divergence[] = []
  let truncated = false
  const push = (d: Divergence): void => {
    if (collected.length >= limit) { truncated = true; return }
    collected.push(d)
  }

  const paired = Math.min(expected.records.length, actual.records.length)

  // The record-count mismatch is emitted FIRST, ahead of the defects and the field
  // walk, for a reason the RS-1.7 matrix found the hard way: a deleted or inserted
  // record shifts every later position, so the per-record rows alone can exhaust the
  // collection cap and bury the one line that says the streams are not the same length.
  // A length change is also the headline an investigator needs before any field diff.
  if (expected.records.length !== actual.records.length) {
    push({
      category: expected.records.length > actual.records.length ? 'missing' : 'extra',
      index: paired, seq: null, tickIndex: null, level: null, kind: null,
      field: STREAM_FIELD,
      expected: `${expected.records.length} records`,
      actual: `${actual.records.length} records`,
      detail: 'the two streams carry a different number of records',
    })
  }

  for (const defect of expected.defects) push(defect)
  for (const defect of actual.defects) push(defect)

  for (let i = 0; i < paired; i++) {
    const e = expected.records[i]
    const a = actual.records[i]
    // A null on either side was already reported as a parse/invariant defect; pairing an
    // unreadable record would only restate it in a less useful shape.
    if (e === null || a === null) continue
    compareRecords(i, e, a, push)
  }

  for (let i = paired; i < expected.records.length; i++) {
    const e = expected.records[i]
    push({
      category: 'missing', index: i, field: STREAM_FIELD,
      seq: e?.seq ?? null, tickIndex: e?.tickIndex ?? null, level: e?.level ?? null, kind: e?.kind ?? null,
      expected: e === null ? '<an unreadable record>' : `${e.kind} @ tick ${e.tickIndex}`,
      actual: ABSENT,
      detail: `candidate stream ended at ${actual.records.length} records; the reference has ${expected.records.length}`,
    })
  }
  for (let i = paired; i < actual.records.length; i++) {
    const a = actual.records[i]
    push({
      category: 'extra', index: i, field: STREAM_FIELD,
      seq: a?.seq ?? null, tickIndex: a?.tickIndex ?? null, level: a?.level ?? null, kind: a?.kind ?? null,
      expected: ABSENT,
      actual: a === null ? '<an unreadable record>' : `${a.kind} @ tick ${a.tickIndex}`,
      detail: `candidate stream carries ${actual.records.length} records; the reference has ${expected.records.length}`,
    })
  }

  return {
    divergences: collected,
    truncated,
    bytesEqual: expectedText === actualText,
    expectedRecords: expected.records.length,
    actualRecords: actual.records.length,
  }
}

/**
 * Compares one aligned record pair.
 *
 * The envelope is compared field by field before the payload so the first divergence
 * reported for a shifted stream names the envelope field that shifted, which is the
 * fact an investigator needs first.
 */
function compareRecords(
  index: number,
  e: GoldenRecord,
  a: GoldenRecord,
  push: (d: Divergence) => void,
): void {
  const at = (
    category: DivergenceCategory, field: string, expected: string, actual: string, detail: string,
  ): void => {
    push({
      category, index, field, expected, actual, detail,
      seq: e.seq, tickIndex: e.tickIndex, level: e.level, kind: e.kind,
    })
  }

  if (e.seq !== a.seq) at('value', 'seq', String(e.seq), String(a.seq), 'stream sequence number differs')
  if (e.tickIndex !== a.tickIndex) {
    at('value', 'tickIndex', String(e.tickIndex), String(a.tickIndex), 'record is attributed to a different corpus tick')
  }
  // `!==` rather than a canonical-text compare so `-0` and `0` agree here exactly as
  // they do in the payload — `canonicalize(-0)` is `"0"` and both are `=== 0`.
  if (e.ts !== a.ts) at('value', 'ts', String(e.ts), String(a.ts), 'virtual clock reading differs')
  if (e.level !== a.level) {
    at('value', 'level', e.level, a.level,
      'record changed oracle stratum — L1 is the zero-tolerance decision stratum (Appendix A.3)')
  }
  if (e.kind !== a.kind) at('value', 'kind', e.kind, a.kind, 'record kind differs')

  walk('payload', e.payload, a.payload, at)
}

/** Recursive structural comparison of two JSON values, emitting dotted paths. */
function walk(
  path: string,
  e: JsonValue,
  a: JsonValue,
  at: (category: DivergenceCategory, field: string, expected: string, actual: string, detail: string) => void,
): void {
  const te = jsonTypeOf(e)
  const ta = jsonTypeOf(a)
  if (te !== ta) {
    at('value', path, show(e), show(a), `value changed JSON type (${te} -> ${ta})`)
    return
  }

  if (Array.isArray(e) && Array.isArray(a)) {
    if (e.length !== a.length) {
      at('value', `${path}.length`, String(e.length), String(a.length), 'array length differs')
    }
    // Arrays are sequences, not sets: element *i* is compared with element *i*, so a
    // reordering is a divergence rather than a wash. `canonicalize` makes the same
    // promise on the writer side.
    const paired = Math.min(e.length, a.length)
    for (let i = 0; i < paired; i++) walk(`${path}.${i}`, e[i] as JsonValue, a[i] as JsonValue, at)
    return
  }

  if (te === 'object') {
    const eo = e as { [k: string]: JsonValue }
    const ao = a as { [k: string]: JsonValue }
    // Sorted union: key order is a serialiser detail the format already erases, and the
    // report has to be stable across two runs to be comparable evidence.
    const keys = [...new Set([...Object.keys(eo), ...Object.keys(ao)])].sort()
    for (const key of keys) {
      const inE = Object.prototype.hasOwnProperty.call(eo, key)
      const inA = Object.prototype.hasOwnProperty.call(ao, key)
      if (!inA) {
        at('missing', `${path}.${key}`, show(eo[key] as JsonValue), ABSENT, 'key present in the reference, absent in the candidate')
        continue
      }
      if (!inE) {
        at('extra', `${path}.${key}`, ABSENT, show(ao[key] as JsonValue), 'key absent in the reference, present in the candidate')
        continue
      }
      walk(`${path}.${key}`, eo[key] as JsonValue, ao[key] as JsonValue, at)
    }
    return
  }

  // Scalars compare as canonical text, which is exactly the golden's own equality: it
  // folds `-0` into `0` and `1.0` into `1` (both documented in `golden.ts`) and it
  // separates values that differ by a single ULP.
  const se = show(e)
  const sa = show(a)
  if (se !== sa) at('value', path, se, sa, 'scalar value differs')
}

/** A verifier run: the diff, a human report, and the exit code a CI job would use. */
export interface OracleVerdict {
  /** 0 when the candidate reproduces the reference, 1 otherwise. */
  readonly exitCode: 0 | 1
  readonly diff: GoldenDiff
  readonly report: string
}

/** One divergence row, rendered. */
function formatRow(n: number, d: Divergence): string {
  const where = [
    `record ${d.index}`,
    d.seq === null ? null : `seq ${d.seq}`,
    d.tickIndex === null ? null : `tick ${d.tickIndex}`,
    d.level,
    d.kind,
  ].filter((p): p is string => p !== null && p !== undefined).join(' · ')
  return [
    `  ${n}. [${d.category}] ${where} · ${d.field}`,
    `       expected ${d.expected}`,
    `         actual ${d.actual}`,
    `       ${d.detail}`,
  ].join('\n')
}

/**
 * Human-readable drift report (Appendix A.4's summary half).
 *
 * Reports the divergences in stream order so the first row is the first thing that
 * moved — the only row an investigation starts from.
 */
export function formatDriftReport(diff: GoldenDiff): string {
  if (diff.divergences.length === 0) {
    return `ORACLE VERDICT: CLEAN — ${diff.expectedRecords} records, no divergences` +
      `${diff.bytesEqual ? ' (byte-identical)' : ' (semantically equal; bytes differ)'}`
  }
  const head = `ORACLE VERDICT: DIVERGENT — ${diff.divergences.length}${diff.truncated ? '+' : ''} ` +
    `divergence(s) over ${diff.expectedRecords} reference / ${diff.actualRecords} candidate records`
  const rows = diff.divergences.map((d, i) => formatRow(i + 1, d))
  const tail = diff.truncated
    ? [`  … capped at ${diff.divergences.length} divergences; the stream diverges beyond this point.`]
    : []
  return [head, ...rows, ...tail].join('\n')
}

/**
 * Verifies a candidate golden against a reference golden.
 *
 * The entry point a parity job calls: a non-zero exit code plus a report that names the
 * exact divergence is the contract RS-1.7 tests and RS-1.4 reimplements in Rust.
 */
export function verifyGolden(expectedText: string, actualText: string, opts: DiffOptions = {}): OracleVerdict {
  const diff = diffGoldens(expectedText, actualText, opts)
  return {
    exitCode: diff.divergences.length === 0 ? 0 : 1,
    diff,
    report: formatDriftReport(diff),
  }
}
