/**
 * SATEX-RS oracle — the mutation matrix.
 *
 * RS-UP-1 / RS-1.7. The oracle is the instrument every downstream parity claim is
 * measured with, and an instrument nobody has tried to fool is not evidence. Ledger
 * P-097 named the failure class: a check that cannot fail is worse than no check,
 * because it converts "we did not look" into "we looked and it was fine". This module
 * is the deliberate attempt to fool `verify.ts`.
 *
 * Each entry perturbs a *copy* of a golden — never the archived file, which changes only
 * through the RS-1.3 regeneration procedure with operator review — and declares in
 * advance whether the verifier must report it:
 *
 * - `divergent: true` — a **positive control**. The perturbation carries decision
 *   content, so the verifier must exit non-zero and name the exact field.
 * - `divergent: false` — a **negative control**. The perturbation touches only the file
 *   container (key order, whitespace, line endings, `1.0` vs `1`), so the verifier must
 *   stay silent. A harness that flags everything is exactly as useless as one that flags
 *   nothing, and it is more dangerous: the noise is what talks an operator into widening
 *   a tolerance on something that matters.
 *
 * The two halves falsify each other. A differ hard-wired to "clean" passes every
 * negative control and fails every positive one; a differ hard-wired to "divergent"
 * does the reverse. Only an implementation that actually compares passes both columns,
 * which is why the mutation classes are the contract RS-1.4's Rust structural-diff
 * engine must satisfy rather than a list of tests it may cherry-pick.
 *
 * Every mutation is also required to *change the bytes*. A perturbation that silently
 * found no target and returned its input would sail through a negative control and prove
 * nothing — the vacuous pass, one layer up. `apply` therefore throws when its target is
 * absent, and the suite asserts the text moved before it asserts anything about the
 * verdict.
 */
import { type GoldenRecord, type JsonValue } from './golden'
import { ENVELOPE_KEYS, loadGolden, splitGoldenLines, type OracleVerdict } from './verify'

/** A golden record as a mutable JSON object — what `JSON.parse` of a line returns. */
type RecordObject = { [k: string]: JsonValue }

/** The outcome of applying one mutation. */
export interface MutationResult {
  /** The perturbed golden text. */
  readonly text: string
  /** Stream position perturbed; `null` when the change is file-wide. */
  readonly targetIndex: number | null
  /** What actually changed — quoted verbatim in the suite's failure messages. */
  readonly note: string
}

/** One named way a golden can be perturbed, with its expected verdict. */
export interface GoldenMutation {
  /** Stable kebab-case id. This is the name RS-1.4 reports its coverage against. */
  readonly id: string
  readonly description: string
  /** Which golden field or structure the perturbation touches. */
  readonly appliedTo: string
  /** `true` = the verifier must report it; `false` = negative control, must not. */
  readonly divergent: boolean
  /** Pattern the drift report must name in some divergence. `null` for negatives. */
  readonly expectField: RegExp | null
  /** Perturbs `text`. Throws when the golden carries no suitable target. */
  apply(text: string): MutationResult
}

/* ------------------------------------------------------------------ helpers */

/** Rejoins record lines into golden file text — LF-delimited, trailing newline. */
function joinLines(lines: readonly string[]): string {
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

/**
 * Reads a golden that a mutation is about to perturb.
 *
 * Refuses anything the verifier already considers defective: mutating a broken golden
 * would prove nothing, because the verdict under test would have been non-zero anyway.
 */
function readClean(text: string): { lines: string[]; records: GoldenRecord[] } {
  const loaded = loadGolden(text, 'mutation input')
  if (loaded.defects.length > 0) {
    throw new Error(`mutate: input golden is already defective — ${loaded.defects[0]?.detail ?? 'unknown'}`)
  }
  return { lines: [...splitGoldenLines(text)], records: loaded.records as GoldenRecord[] }
}

function noTarget(what: string): never {
  throw new Error(
    `mutate: this golden carries no ${what}, so the mutation would be a no-op — ` +
    'a mutation that changes nothing passes vacuously (P-097 class)',
  )
}

/** Every scalar in a JSON value, in canonical (sorted-key) order, with its path. */
function scalarsOf(value: JsonValue, prefix: readonly string[] = []): Array<{ path: string[]; value: JsonValue }> {
  if (Array.isArray(value)) return value.flatMap((v, i) => scalarsOf(v, [...prefix, String(i)]))
  if (value !== null && typeof value === 'object') {
    const obj = value as { [k: string]: JsonValue }
    return Object.keys(obj).sort().flatMap(k => scalarsOf(obj[k] as JsonValue, [...prefix, k]))
  }
  return [{ path: [...prefix], value }]
}

/** Every container (object or array) in a JSON value, including the root. */
function nodesOf(value: JsonValue, prefix: readonly string[] = []): Array<{ path: string[]; value: JsonValue }> {
  const here = [{ path: [...prefix], value }]
  if (Array.isArray(value)) return here.concat(value.flatMap((v, i) => nodesOf(v, [...prefix, String(i)])))
  if (value !== null && typeof value === 'object') {
    const obj = value as { [k: string]: JsonValue }
    return here.concat(Object.keys(obj).sort().flatMap(k => nodesOf(obj[k] as JsonValue, [...prefix, k])))
  }
  return here
}

interface Hit { readonly index: number; readonly path: string[]; readonly value: JsonValue }

/** First payload scalar matching `pred`, scanning records in stream order. */
function findScalar(
  records: readonly GoldenRecord[],
  pred: (value: JsonValue, path: readonly string[], record: GoldenRecord) => boolean,
  what: string,
): Hit {
  for (let i = 0; i < records.length; i++) {
    const record = records[i] as GoldenRecord
    for (const hit of scalarsOf(record.payload)) {
      if (pred(hit.value, hit.path, record)) return { index: i, path: hit.path, value: hit.value }
    }
  }
  return noTarget(what)
}

/** First payload container matching `pred`, scanning records in stream order. */
function findNode(
  records: readonly GoldenRecord[],
  pred: (value: JsonValue) => boolean,
  what: string,
): Hit {
  for (let i = 0; i < records.length; i++) {
    const record = records[i] as GoldenRecord
    for (const node of nodesOf(record.payload)) {
      if (pred(node.value)) return { index: i, path: node.path, value: node.value }
    }
  }
  return noTarget(what)
}

/** First record matching `pred`. */
function findRecord(records: readonly GoldenRecord[], pred: (r: GoldenRecord, i: number) => boolean, what: string): number {
  const i = records.findIndex(pred)
  if (i < 0) return noTarget(what)
  return i
}

/** Reads the container that holds `path`'s last segment. */
function parentAt(record: RecordObject, path: readonly string[]): { [k: string]: JsonValue } {
  let node = record['payload'] as JsonValue
  for (let i = 0; i < path.length - 1; i++) {
    node = (node as { [k: string]: JsonValue })[path[i] as string] as JsonValue
  }
  return node as { [k: string]: JsonValue }
}

/** Writes `value` at a payload path; an empty path replaces the payload itself. */
function setPayloadAt(record: RecordObject, path: readonly string[], value: JsonValue): void {
  if (path.length === 0) { record['payload'] = value; return }
  parentAt(record, path)[path[path.length - 1] as string] = value
}

/** Reads the value at a payload path. */
function getPayloadAt(record: RecordObject, path: readonly string[]): JsonValue {
  if (path.length === 0) return record['payload'] as JsonValue
  return parentAt(record, path)[path[path.length - 1] as string] as JsonValue
}

/** Re-serialises one line after `patch` has edited its parsed form. */
function patchLine(lines: readonly string[], index: number, patch: (record: RecordObject) => void): string[] {
  const copy = [...lines]
  const record = JSON.parse(copy[index] as string) as RecordObject
  patch(record)
  copy[index] = JSON.stringify(record)
  return copy
}

/** Sentinel used to stage a raw JSON token no JS value can carry. */
const SENTINEL = '@@SATEX_MUTATION_SENTINEL@@'

/**
 * Writes a raw JSON token — `1e400`, `NaN`, `-0`, `1.0` — at a payload path.
 *
 * These forms cannot survive a round trip through a JS value (`1e400` becomes
 * `Infinity`, `-0` and `1.0` re-serialise as `0` and `1`), so the slot is staged with a
 * unique string and the token is substituted into the finished line.
 */
function patchRawToken(lines: readonly string[], index: number, path: readonly string[], token: string): string[] {
  const copy = [...lines]
  const record = JSON.parse(copy[index] as string) as RecordObject
  setPayloadAt(record, path, SENTINEL)
  const line = JSON.stringify(record)
  const quoted = JSON.stringify(SENTINEL)
  if (!line.includes(quoted)) throw new Error('mutate: sentinel did not survive serialisation')
  copy[index] = line.replace(quoted, token)
  return copy
}

/** The next representable f64 above `v`. One ULP is still a divergence (Appendix B.1). */
function nextUp(v: number): number {
  const buffer = new ArrayBuffer(8)
  const floats = new Float64Array(buffer)
  const bits = new BigUint64Array(buffer)
  floats[0] = v
  bits[0] = (bits[0] as bigint) + 1n
  const out = floats[0] as number
  if (!Number.isFinite(out) || out === v) throw new Error(`mutate: cannot nudge ${v} by one ULP`)
  return out
}

/** Changes a string without changing its length class. */
function perturbString(s: string): string {
  if (s.length === 0) return 'X'
  const last = s.slice(-1)
  return `${s.slice(0, -1)}${last === 'X' ? 'Y' : 'X'}`
}

/** True for the placeholder form the id normaliser emits, e.g. `<ord:1>`. */
function isPlaceholder(value: JsonValue): boolean {
  return typeof value === 'string' && /^<[a-z]+:\d+>$/.test(value)
}

/**
 * True when `path`'s last segment names an object key rather than an array index.
 *
 * The duplicate-key mutation splices `"k":a,"k":b` into a line, which is only valid JSON
 * inside an object — the same text inside an array would be a syntax error and would
 * therefore be caught as a parse defect, proving something entirely different from what
 * it set out to prove.
 */
function underObjectKey(payload: JsonValue, path: readonly string[]): boolean {
  if (path.length === 0) return false
  let node: JsonValue = payload
  for (let i = 0; i < path.length - 1; i++) {
    node = (node as { [k: string]: JsonValue })[path[i] as string] as JsonValue
  }
  return node !== null && typeof node === 'object' && !Array.isArray(node)
}

/** Rebuilds every object in a value with its keys in reverse-sorted order. */
function reverseKeys(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (value !== null && typeof value === 'object') {
    const obj = value as { [k: string]: JsonValue }
    const out: { [k: string]: JsonValue } = {}
    for (const key of Object.keys(obj).sort().reverse()) out[key] = reverseKeys(obj[key] as JsonValue)
    return out
  }
  return value
}

/** Rewrites `seq` to match stream position — used by the renumbering mutations. */
function renumber(lines: readonly string[]): string[] {
  return lines.map((line, i) => {
    const record = JSON.parse(line) as RecordObject
    record['seq'] = i
    return JSON.stringify(record)
  })
}

/** Asserts a mutation actually moved the bytes before it is allowed to be a test. */
function ensureChanged(before: string, after: string, id: string): string {
  if (before === after) {
    throw new Error(`mutate: "${id}" produced identical text — a no-op mutation is a vacuous pass (P-097 class)`)
  }
  return after
}

/** An interior record — a mid-stream perturbation is a stronger test than a first-record one. */
function midIndex(records: readonly GoldenRecord[]): number {
  if (records.length < 2) return noTarget('interior record (the golden carries fewer than 2 records)')
  return Math.floor(records.length / 2)
}

/** Renders a payload path for a note, handling the empty (payload-is-the-value) case. */
function pathLabel(path: readonly string[]): string {
  return path.length === 0 ? 'payload' : `payload.${path.join('.')}`
}

/** Builds a mutation, wrapping `apply` in the no-op guard. */
function define(spec: Omit<GoldenMutation, 'apply'>, apply: (text: string) => MutationResult): GoldenMutation {
  return {
    ...spec,
    apply: (text: string): MutationResult => {
      const result = apply(text)
      return { ...result, text: ensureChanged(text, result.text, spec.id) }
    },
  }
}

/** Every positive control names a payload path, which always starts `payload`. */
const PAYLOAD_FIELD = /^payload(\.|$)/

/* ------------------------------------------------- positive controls: payload */

const PAYLOAD_MUTATIONS: readonly GoldenMutation[] = [
  define({
    id: 'payload-scalar-ulp-nudge',
    description: 'Moves one positive payload float to the next representable f64 — the smallest numeric change that exists.',
    appliedTo: 'payload scalar (number)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(records, v => typeof v === 'number' && Number.isFinite(v) && v > 0, 'positive finite payload number')
    const after = nextUp(hit.value as number)
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, after))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> ${after} (1 ULP)`,
    }
  }),

  define({
    id: 'payload-scalar-precision-truncated',
    description: 'Rounds a high-precision payload float to six decimals — the divergence a human reading a report calls "the same number".',
    appliedTo: 'payload scalar (number)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(
      records,
      v => typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v) && (String(v).split('.')[1]?.length ?? 0) > 8,
      'payload float carrying more than eight decimals',
    )
    const after = Number((hit.value as number).toFixed(6))
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, after))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> ${after}`,
    }
  }),

  define({
    id: 'payload-scalar-bool-flip',
    description: 'Negates one payload boolean — the shape of an inverted gate verdict.',
    appliedTo: 'payload scalar (boolean)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(records, v => typeof v === 'boolean', 'payload boolean')
    const after = !(hit.value as boolean)
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, after))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> ${String(after)}`,
    }
  }),

  define({
    id: 'payload-scalar-string-flip',
    description: 'Changes one character of a payload string — the shape of a changed symbol, side or status.',
    appliedTo: 'payload scalar (string)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(
      records,
      v => typeof v === 'string' && v.length > 0 && !isPlaceholder(v),
      'payload string that is not an id placeholder',
    )
    const after = perturbString(hit.value as string)
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, after))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${JSON.stringify(hit.value)} -> ${JSON.stringify(after)}`,
    }
  }),

  define({
    id: 'payload-scalar-type-to-null',
    description: 'Replaces a payload string with null — same slot, no value.',
    appliedTo: 'payload scalar (JSON type)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(records, v => typeof v === 'string' && v.length > 0, 'payload string')
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, null))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${JSON.stringify(hit.value)} -> null`,
    }
  }),

  define({
    id: 'payload-scalar-number-to-string',
    description: 'Quotes a payload number. The two render identically in most reports; only a type-aware differ separates 3 from "3".',
    appliedTo: 'payload scalar (JSON type)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(records, v => typeof v === 'number' && Number.isFinite(v), 'payload number')
    const after = String(hit.value as number)
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, after))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> ${JSON.stringify(after)}`,
    }
  }),

  define({
    id: 'payload-nested-deep-scalar',
    description: 'Perturbs a scalar at least three levels inside the payload, proving the differ recurses and names the deep path.',
    appliedTo: 'payload scalar (nested, depth >= 3)',
    divergent: true,
    expectField: /^payload(\.[^.]+){3,}$/,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(
      records,
      (v, path) => path.length >= 3 && typeof v === 'number' && Number.isFinite(v),
      'payload number nested at least three levels deep',
    )
    const after = (hit.value as number) + 1
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, after))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> ${after}`,
    }
  }),

  define({
    id: 'payload-object-key-removed',
    description: 'Drops a key from a payload object — a field the candidate engine forgot to emit.',
    appliedTo: 'payload object (key set)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findNode(
      records,
      v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length >= 1,
      'payload object with at least one key',
    )
    const key = Object.keys(hit.value as { [k: string]: JsonValue }).sort()[0] as string
    return {
      text: joinLines(patchLine(lines, hit.index, r => {
        delete (getPayloadAt(r, hit.path) as { [k: string]: JsonValue })[key]
      })),
      targetIndex: hit.index,
      note: `removed key "${key}" from ${pathLabel(hit.path)}`,
    }
  }),

  define({
    id: 'payload-object-key-added',
    description: 'Adds a key to a payload object — a field the candidate emits and the reference never did.',
    appliedTo: 'payload object (key set)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findNode(
      records,
      v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length >= 1,
      'payload object with at least one key',
    )
    return {
      text: joinLines(patchLine(lines, hit.index, r => {
        (getPayloadAt(r, hit.path) as { [k: string]: JsonValue })['satexInjectedKey'] = 0
      })),
      targetIndex: hit.index,
      note: `added key "satexInjectedKey" to ${pathLabel(hit.path)}`,
    }
  }),

  define({
    id: 'payload-array-reordered',
    description: 'Swaps two payload array elements. Arrays are sequences, not sets — a reordered gate list is a different decision stream.',
    appliedTo: 'payload array (element order)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findNode(
      records,
      v => Array.isArray(v) && v.length >= 2 && JSON.stringify(v[0]) !== JSON.stringify(v[1]),
      'payload array with two differing elements',
    )
    return {
      text: joinLines(patchLine(lines, hit.index, r => {
        const arr = getPayloadAt(r, hit.path) as JsonValue[]
        const head = arr[0] as JsonValue
        arr[0] = arr[1] as JsonValue
        arr[1] = head
      })),
      targetIndex: hit.index,
      note: `swapped elements 0 and 1 of ${pathLabel(hit.path)}`,
    }
  }),

  define({
    id: 'payload-array-element-removed',
    description: 'Drops the last element of a payload array — a length-changing perturbation inside one record.',
    appliedTo: 'payload array (length)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findNode(records, v => Array.isArray(v) && v.length >= 2, 'payload array with at least two elements')
    return {
      text: joinLines(patchLine(lines, hit.index, r => {
        (getPayloadAt(r, hit.path) as JsonValue[]).pop()
      })),
      targetIndex: hit.index,
      note: `dropped the last element of ${pathLabel(hit.path)}`,
    }
  }),

  define({
    id: 'payload-duplicate-json-key',
    description: 'Writes one payload key twice in the same object with different values. JSON does not forbid a duplicate key and does not say which wins; JS and serde_json both keep the last, so a reader that kept the first would read a different payload out of identical bytes.',
    appliedTo: 'payload object (duplicate key)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(
      records,
      (v, path, record) => typeof v === 'number' && Number.isFinite(v) && underObjectKey(record.payload, path),
      'payload number held directly under an object key',
    )
    const key = hit.path[hit.path.length - 1] as string
    const shadowed = (hit.value as number) + 1
    // A duplicate key cannot be expressed as a JS object — the second assignment would
    // simply overwrite the first — so the pair is spliced into the finished line as raw
    // text, the same staging trick the non-finite tokens use.
    const token = `${JSON.stringify(hit.value)},${JSON.stringify(key)}:${JSON.stringify(shadowed)}`
    return {
      text: joinLines(patchRawToken(lines, hit.index, hit.path, token)),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} written twice — ${String(hit.value)} then ${shadowed} (last wins)`,
    }
  }),

  define({
    id: 'payload-array-to-object',
    description: 'Turns a payload array into an index-keyed object — the container-type confusion a serde map/seq mismatch produces.',
    appliedTo: 'payload container (JSON type)',
    divergent: true,
    expectField: PAYLOAD_FIELD,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findNode(records, v => Array.isArray(v) && v.length >= 1, 'payload array with at least one element')
    const asObject: { [k: string]: JsonValue } = {}
    for (const [i, v] of (hit.value as JsonValue[]).entries()) asObject[String(i)] = v
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, asObject))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} array -> object`,
    }
  }),
]

/* ------------------------------------------------ positive controls: envelope */

const ENVELOPE_MUTATIONS: readonly GoldenMutation[] = [
  define({
    id: 'envelope-kind-corrupted',
    description: 'Renames the `kind` of an L1 record — the subsystem label a drift report triages on.',
    appliedTo: 'record envelope (kind)',
    divergent: true,
    expectField: /^kind$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = findRecord(records, r => r.level === 'L1', 'L1 record')
    const after = `${(records[i] as GoldenRecord).kind}.tampered`
    return {
      text: joinLines(patchLine(lines, i, r => { r['kind'] = after })),
      targetIndex: i,
      note: `record ${i} kind "${(records[i] as GoldenRecord).kind}" -> "${after}"`,
    }
  }),

  define({
    id: 'envelope-level-l1-demoted',
    description: 'Moves an L1 decision record into L2. Appendix A.3 gives L1 no tolerance; a silent demotion would smuggle a decision out of the stratum that has none.',
    appliedTo: 'record envelope (level)',
    divergent: true,
    expectField: /^level$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = findRecord(records, r => r.level === 'L1', 'L1 record')
    return {
      text: joinLines(patchLine(lines, i, r => { r['level'] = 'L2' })),
      targetIndex: i,
      note: `record ${i} level L1 -> L2`,
    }
  }),

  define({
    id: 'envelope-level-l2-promoted',
    description: 'Moves an L2 checkpoint into L1 — the same mis-stratification in the direction that inflates the decision stream.',
    appliedTo: 'record envelope (level)',
    divergent: true,
    expectField: /^level$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = findRecord(records, r => r.level === 'L2', 'L2 record')
    return {
      text: joinLines(patchLine(lines, i, r => { r['level'] = 'L1' })),
      targetIndex: i,
      note: `record ${i} level L2 -> L1`,
    }
  }),

  define({
    id: 'envelope-key-removed',
    description: 'Deletes `level` from one record envelope. The envelope is exactly six keys and a reader must refuse a short one rather than default it.',
    appliedTo: 'record envelope (key set)',
    divergent: true,
    expectField: /^<stream>$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    return {
      text: joinLines(patchLine(lines, i, r => { delete r['level'] })),
      targetIndex: i,
      note: `record ${i} lost its "level" key`,
    }
  }),

  define({
    id: 'envelope-key-unknown-added',
    description: 'Adds a seventh envelope key — the serde `deny_unknown_fields` case. A schema change must not pass as a clean run.',
    appliedTo: 'record envelope (key set)',
    divergent: true,
    expectField: /^<stream>$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    return {
      text: joinLines(patchLine(lines, i, r => { r['annotation'] = 'injected' })),
      targetIndex: i,
      note: `record ${i} gained an unknown envelope key "annotation"`,
    }
  }),

  define({
    id: 'seq-duplicated',
    description: 'Repeats the previous record’s `seq`. Alignment is by ordinal position, so a duplicate must be reported rather than absorbed.',
    appliedTo: 'record envelope (seq)',
    divergent: true,
    expectField: /^seq$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const after = (records[i - 1] as GoldenRecord).seq
    return {
      text: joinLines(patchLine(lines, i, r => { r['seq'] = after })),
      targetIndex: i,
      note: `record ${i} seq ${(records[i] as GoldenRecord).seq} -> ${after}`,
    }
  }),

  define({
    id: 'seq-gap-introduced',
    description: 'Skips a sequence number. The stream contract is gap-free and monotonic from zero.',
    appliedTo: 'record envelope (seq)',
    divergent: true,
    expectField: /^seq$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const after = (records[i] as GoldenRecord).seq + 1
    return {
      text: joinLines(patchLine(lines, i, r => { r['seq'] = after })),
      targetIndex: i,
      note: `record ${i} seq ${(records[i] as GoldenRecord).seq} -> ${after}`,
    }
  }),

  define({
    id: 'seq-records-swapped',
    description: 'Swaps two adjacent records whole. Same multiset of records, different emission order — the reordering a concurrent engine produces.',
    appliedTo: 'stream order (record positions)',
    divergent: true,
    expectField: /^seq$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const copy = [...lines]
    const head = copy[i] as string
    copy[i] = copy[i + 1] as string
    copy[i + 1] = head
    return { text: joinLines(copy), targetIndex: i, note: `swapped records ${i} and ${i + 1}` }
  }),

  define({
    id: 'tick-index-drift',
    description: 'Attributes a record to the next corpus tick. The record is otherwise identical, so only the tick attribution moved.',
    appliedTo: 'record envelope (tickIndex)',
    divergent: true,
    expectField: /^tickIndex$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const after = (records[i] as GoldenRecord).tickIndex + 1
    return {
      text: joinLines(patchLine(lines, i, r => { r['tickIndex'] = after })),
      targetIndex: i,
      note: `record ${i} tickIndex ${(records[i] as GoldenRecord).tickIndex} -> ${after}`,
    }
  }),

  define({
    id: 'tick-index-regressed',
    description: 'Sends `tickIndex` backwards. Replay applies ticks in recorded order, so this is detectable with no reference at all.',
    appliedTo: 'record envelope (tickIndex)',
    divergent: true,
    expectField: /^tickIndex$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = findRecord(records, (_r, k) => k >= 1 && (records[k - 1] as GoldenRecord).tickIndex >= 1, 'record preceded by a non-zero tickIndex')
    const after = (records[i - 1] as GoldenRecord).tickIndex - 1
    return {
      text: joinLines(patchLine(lines, i, r => { r['tickIndex'] = after })),
      targetIndex: i,
      note: `record ${i} tickIndex ${(records[i] as GoldenRecord).tickIndex} -> ${after} (behind its predecessor)`,
    }
  }),

  define({
    id: 'ts-drift-one-millisecond',
    description: 'Advances one virtual clock reading by a single millisecond.',
    appliedTo: 'record envelope (ts)',
    divergent: true,
    expectField: /^ts$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const after = (records[i] as GoldenRecord).ts + 1
    return {
      text: joinLines(patchLine(lines, i, r => { r['ts'] = after })),
      targetIndex: i,
      note: `record ${i} ts ${(records[i] as GoldenRecord).ts} -> ${after}`,
    }
  }),

  define({
    id: 'ts-sub-millisecond-drift',
    description: 'Adds half a millisecond to one `ts`. The loader deliberately permits a non-integer ts, so this is caught by comparison rather than by validation — a differ that truncates to integer ms would miss it.',
    appliedTo: 'record envelope (ts, sub-ms boundary)',
    divergent: true,
    expectField: /^ts$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const after = (records[i] as GoldenRecord).ts + 0.5
    return {
      text: joinLines(patchLine(lines, i, r => { r['ts'] = after })),
      targetIndex: i,
      note: `record ${i} ts ${(records[i] as GoldenRecord).ts} -> ${after}`,
    }
  }),

  define({
    id: 'ts-regressed',
    description: 'Sends the virtual clock backwards. Detectable with no reference: the recorded timeline only moves forward.',
    appliedTo: 'record envelope (ts)',
    divergent: true,
    expectField: /^ts$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = findRecord(records, (_r, k) => k >= 1 && (records[k - 1] as GoldenRecord).ts >= 1, 'record preceded by a non-zero ts')
    const after = (records[i - 1] as GoldenRecord).ts - 1
    return {
      text: joinLines(patchLine(lines, i, r => { r['ts'] = after })),
      targetIndex: i,
      note: `record ${i} ts ${(records[i] as GoldenRecord).ts} -> ${after} (behind its predecessor)`,
    }
  }),
]

/* -------------------------------------- positive controls: stream shape + poison */

const STREAM_MUTATIONS: readonly GoldenMutation[] = [
  define({
    id: 'record-deleted',
    description: 'Removes one record, leaving the sequence numbers as they were — so the stream now carries a visible seq gap.',
    appliedTo: 'stream length (record removed)',
    divergent: true,
    expectField: /^seq$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const copy = [...lines]
    copy.splice(i, 1)
    return { text: joinLines(copy), targetIndex: i, note: `deleted record ${i}` }
  }),

  define({
    id: 'record-deleted-renumbered',
    description: 'Removes one record AND renumbers every later `seq`. The stream is now internally valid — only the length and the shifted content give it away.',
    appliedTo: 'stream length (record removed, seq repaired)',
    divergent: true,
    expectField: /^<stream>$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const copy = [...lines]
    copy.splice(i, 1)
    return { text: joinLines(renumber(copy)), targetIndex: i, note: `deleted record ${i} and renumbered seq` }
  }),

  define({
    id: 'record-inserted-duplicate',
    description: 'Duplicates one record verbatim, so its `seq` appears twice.',
    appliedTo: 'stream length (record inserted)',
    divergent: true,
    expectField: /^seq$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const copy = [...lines]
    copy.splice(i, 0, copy[i] as string)
    // The inserted copy is byte-identical to the record it shadows, so position i still
    // matches the reference; the streams first disagree one position later.
    return { text: joinLines(copy), targetIndex: i + 1, note: `duplicated record ${i}` }
  }),

  define({
    id: 'record-inserted-renumbered',
    description: 'Duplicates one record AND renumbers every later `seq`. Internally valid, one record too long — the insertion a double-emitting subscriber produces.',
    appliedTo: 'stream length (record inserted, seq repaired)',
    divergent: true,
    expectField: /^<stream>$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const copy = [...lines]
    copy.splice(i, 0, copy[i] as string)
    // Same shadowing as above, and the renumbering makes position i match exactly.
    return { text: joinLines(renumber(copy)), targetIndex: i + 1, note: `duplicated record ${i} and renumbered seq` }
  }),

  define({
    id: 'stream-truncated-tail',
    description: 'Drops the final record. Every remaining record is valid and the sequence is still gap-free, so nothing but the length comparison can see it — the `archive.ts` "incomplete run" class, which is indistinguishable from a good capture once on disk.',
    appliedTo: 'stream length (tail truncation)',
    divergent: true,
    expectField: /^<stream>$/,
  }, text => {
    const { lines, records } = readClean(text)
    if (records.length < 2) return noTarget('second record to truncate against')
    const copy = lines.slice(0, -1)
    return { text: joinLines(copy), targetIndex: lines.length - 1, note: `truncated the last of ${lines.length} records` }
  }),

  define({
    id: 'stream-emptied',
    description: 'Empties the golden entirely. An empty reference makes every future comparison pass vacuously, which is the P-097 shape the archive writer already refuses to create.',
    appliedTo: 'stream length (empty)',
    divergent: true,
    expectField: /^<stream>$/,
  }, text => {
    readClean(text)
    return { text: '', targetIndex: null, note: 'emptied the golden' }
  }),

  define({
    id: 'id-normalization-bypass',
    description: 'Replaces a normalised id placeholder with a raw generated id. This is the one class a pairwise diff cannot see when it appears on both sides: the goldens then carry Math.random() output and the next capture differs for no engine reason (P-143).',
    appliedTo: 'payload scalar (id placeholder)',
    divergent: true,
    expectField: /^payload(\.|$)/,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(records, v => isPlaceholder(v), 'normalised id placeholder in a payload')
    const after = 'ord_lym6yqrk8f3z001'
    return {
      text: joinLines(patchLine(lines, hit.index, r => setPayloadAt(r, hit.path, after))),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${JSON.stringify(hit.value)} -> "${after}" (raw, un-normalised)`,
    }
  }),

  define({
    id: 'float-overflow-to-infinity',
    description: 'Writes `1e400` into a payload number. JSON.parse accepts it and yields Infinity with no syntax error, so only the Appendix B.3 serialisation guard catches it.',
    appliedTo: 'payload scalar (non-finite float)',
    divergent: true,
    expectField: /^payload$/,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(records, v => typeof v === 'number' && Number.isFinite(v), 'payload number')
    return {
      text: joinLines(patchRawToken(lines, hit.index, hit.path, '1e400')),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> 1e400 (parses to Infinity)`,
    }
  }),

  define({
    id: 'float-nan-literal',
    description: 'Writes a bare `NaN` token into a payload. It is not JSON, and a reader that accepted it would be accepting a poisoned float (Appendix B.3).',
    appliedTo: 'payload scalar (non-finite float)',
    divergent: true,
    expectField: /^<stream>$/,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(records, v => typeof v === 'number' && Number.isFinite(v), 'payload number')
    return {
      text: joinLines(patchRawToken(lines, hit.index, hit.path, 'NaN')),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> NaN`,
    }
  }),

  define({
    id: 'line-not-json',
    description: 'Replaces a record line with text that is not JSON — the crude corruption a partial write or a merge conflict marker leaves behind.',
    appliedTo: 'record line (encoding)',
    divergent: true,
    expectField: /^<stream>$/,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const copy = [...lines]
    copy[i] = '<<<<<<< HEAD'
    return { text: joinLines(copy), targetIndex: i, note: `record ${i} replaced with non-JSON text` }
  }),
]

/* ------------------------------------------------------- negative controls */

/**
 * Container-only perturbations. Every one of these changes the file's bytes — the byte
 * stratum still sees them — and none of them changes a single decision, so the semantic
 * verifier must stay silent. These are the rows that stop the harness from becoming a
 * detector of everything, which is a detector of nothing.
 */
const FORMAT_MUTATIONS: readonly GoldenMutation[] = [
  define({
    id: 'format-payload-key-order-reversed',
    description: 'Reverses the key order of every object inside one payload. `canonicalize` sorts keys, so property insertion order is not a golden object.',
    appliedTo: 'payload object (key order)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines, records } = readClean(text)
    const i = findRecord(
      records,
      r => r.payload !== null && typeof r.payload === 'object' && !Array.isArray(r.payload) && Object.keys(r.payload).length >= 2,
      'payload object with at least two keys',
    )
    return {
      text: joinLines(patchLine(lines, i, r => { r['payload'] = reverseKeys(r['payload'] as JsonValue) })),
      targetIndex: i,
      note: `reversed the payload key order of record ${i}`,
    }
  }),

  define({
    id: 'format-envelope-key-order-reversed',
    description: 'Reverses the six envelope keys of one record. The envelope is a set of named fields, not an ordered tuple.',
    appliedTo: 'record envelope (key order)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    return {
      text: joinLines(patchLine(lines, i, r => {
        const reordered: RecordObject = {}
        for (const key of [...ENVELOPE_KEYS].reverse()) reordered[key] = r[key] as JsonValue
        for (const key of Object.keys(r)) delete r[key]
        for (const key of Object.keys(reordered)) r[key] = reordered[key] as JsonValue
      })),
      targetIndex: i,
      note: `reversed the envelope key order of record ${i}`,
    }
  }),

  define({
    id: 'format-whitespace-inserted',
    description: 'Re-renders one record with spaces after every `:` and `,`. Insignificant JSON whitespace is not decision content.',
    appliedTo: 'record line (whitespace)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const copy = [...lines]
    // Pretty-print then flatten: valid JSON, one line, materially more bytes.
    copy[i] = JSON.stringify(JSON.parse(copy[i] as string), null, 2).split('\n').map(s => s.trim()).join(' ')
    return { text: joinLines(copy), targetIndex: i, note: `re-rendered record ${i} with insignificant whitespace` }
  }),

  define({
    id: 'format-crlf-line-endings',
    description: 'Rewrites the file with CRLF endings. Windows is the truth platform and git autocrlf exists; a line ending is transport, not a decision.',
    appliedTo: 'file container (line endings)',
    divergent: false,
    expectField: null,
  }, text => {
    readClean(text)
    return { text: text.replace(/\n/g, '\r\n'), targetIndex: null, note: 'converted every LF to CRLF' }
  }),

  define({
    id: 'format-trailing-newline-removed',
    description: 'Strips the final newline. JSONL carries one record per line; whether the last one is terminated is a writer habit.',
    appliedTo: 'file container (trailing newline)',
    divergent: false,
    expectField: null,
  }, text => {
    readClean(text)
    if (!text.endsWith('\n')) return noTarget('trailing newline to remove')
    return { text: text.slice(0, -1), targetIndex: null, note: 'removed the trailing newline' }
  }),

  define({
    id: 'format-bom-prefixed',
    description: 'Prepends a UTF-8 BOM. A byte-order mark is an encoding artifact of whatever tool rewrote the file, carrying no record content.',
    appliedTo: 'file container (encoding)',
    divergent: false,
    expectField: null,
  }, text => {
    readClean(text)
    return { text: `\uFEFF${text}`, targetIndex: null, note: 'prefixed a UTF-8 BOM' }
  }),

  define({
    id: 'format-blank-line-inserted',
    description: 'Inserts a blank line between two records — the same tolerance `readCorpusTape` already applies to corpus tapes.',
    appliedTo: 'file container (blank lines)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines } = readClean(text)
    const copy = [...lines]
    copy.splice(1, 0, '')
    return { text: joinLines(copy), targetIndex: null, note: 'inserted a blank line after record 0' }
  }),

  define({
    id: 'format-unicode-escaped',
    description: 'Escapes one non-ASCII character as \\uXXXX. `JSON.parse` resolves the escape, so the string is the same string — the escaping difference a Rust serializer will produce.',
    appliedTo: 'record line (string escaping)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines } = readClean(text)
    const copy = [...lines]
    // Surrogates are skipped: escaping half a pair would be a needlessly fiddly no-op risk.
    const pattern = /[\u00a0-\ud7ff\ue000-\uffff]/
    const i = copy.findIndex(line => pattern.test(line))
    if (i < 0) return noTarget('non-ASCII character to escape')
    const line = copy[i] as string
    const at = line.search(pattern)
    const code = line.charCodeAt(at).toString(16).padStart(4, '0')
    copy[i] = `${line.slice(0, at)}\\u${code}${line.slice(at + 1)}`
    return { text: joinLines(copy), targetIndex: i, note: `escaped "${line[at]}" as \\u${code} in record ${i}` }
  }),

  define({
    id: 'format-line-whitespace-padded',
    description: 'Indents one record line with a tab and pads it with trailing spaces. Both the line splitter and the JSON parser absorb it; padding is a property of whatever tool rewrote the file.',
    appliedTo: 'record line (leading/trailing whitespace)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines, records } = readClean(text)
    const i = midIndex(records)
    const copy = [...lines]
    // Distinct from `format-whitespace-inserted`: that one exercises whitespace *inside*
    // the JSON grammar, this one exercises the line splitter's own trim rule — a Rust
    // reader that split on '\n' and fed the raw slice to a strict parser would differ
    // here and nowhere else.
    copy[i] = `\t${copy[i] as string}  `
    return { text: joinLines(copy), targetIndex: i, note: `padded record ${i} with a leading tab and trailing spaces` }
  }),

  define({
    id: 'format-excess-precision',
    description: 'Rewrites one payload number with twenty significant digits that parse back to the identical f64. The value did not move, only its text — a Rust reader built on serde_json\'s `arbitrary_precision` feature keeps the literal instead of the float and would call this a divergence.',
    appliedTo: 'payload scalar (float representation)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(
      records,
      v => typeof v === 'number' && Number.isFinite(v) && v !== 0
        && v.toPrecision(20) !== String(v) && Number(v.toPrecision(20)) === v,
      'payload number whose twenty-digit form round-trips to the same f64',
    )
    const token = (hit.value as number).toPrecision(20)
    return {
      text: joinLines(patchRawToken(lines, hit.index, hit.path, token)),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> ${token} (identical f64)`,
    }
  }),

  define({
    id: 'format-negative-zero',
    description: 'Writes `-0` where the golden holds `0`. `canonicalize(-0)` is "0" and `String(-0)` is "0", so the sign of zero is documented as not a golden object — a Rust port must fold it the same way, because Rust prints -0.0 as "-0".',
    appliedTo: 'payload scalar (float representation)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(records, v => typeof v === 'number' && v === 0, 'payload number equal to zero')
    return {
      text: joinLines(patchRawToken(lines, hit.index, hit.path, '-0')),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} 0 -> -0`,
    }
  }),

  define({
    id: 'format-float-integer-form',
    description: 'Writes `1.0` where the golden holds `1`. Both parse to the same f64 — a Rust port must compare values, not serialised number text, because serde_json prints 1.0f64 as "1.0".',
    appliedTo: 'payload scalar (float representation)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(
      records,
      v => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 1e15,
      'integer-valued payload number below 1e15',
    )
    return {
      text: joinLines(patchRawToken(lines, hit.index, hit.path, `${String(hit.value)}.0`)),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> ${String(hit.value)}.0`,
    }
  }),

  define({
    id: 'format-exponent-notation',
    description: 'Writes a payload number in exponent form. `1e+5` and `100000` are the same f64; only a text comparison would call them different.',
    appliedTo: 'payload scalar (float representation)',
    divergent: false,
    expectField: null,
  }, text => {
    const { lines, records } = readClean(text)
    const hit = findScalar(
      records,
      v => typeof v === 'number' && Number.isFinite(v) && v.toExponential() !== String(v) && Number(v.toExponential()) === v,
      'payload number whose exponent form differs from its canonical text',
    )
    const token = (hit.value as number).toExponential()
    return {
      text: joinLines(patchRawToken(lines, hit.index, hit.path, token)),
      targetIndex: hit.index,
      note: `${pathLabel(hit.path)} ${String(hit.value)} -> ${token}`,
    }
  }),
]

/**
 * The full matrix — the falsifiability contract for the SATEX golden oracle.
 *
 * RS-1.4's Rust structural-diff engine must reproduce every verdict in this table:
 * report every `divergent: true` row naming the same field, and report nothing for every
 * `divergent: false` row. A Rust implementation that passes only the positive column has
 * built a smoke alarm that goes off when the kettle boils.
 */
export const GOLDEN_MUTATIONS: readonly GoldenMutation[] = [
  ...PAYLOAD_MUTATIONS,
  ...ENVELOPE_MUTATIONS,
  ...STREAM_MUTATIONS,
  ...FORMAT_MUTATIONS,
]

/**
 * Judges one oracle verdict against what its mutation declared must happen.
 *
 * This predicate — not the `it()` blocks that call it — is the contract. It lives here,
 * beside the matrix, for a reason that is the whole point of RS-1.7: a rule that exists
 * only inside a test body cannot be pointed at a *different* verifier, and pointing it at
 * a deliberately broken one is the only way to show the suite is capable of failing at
 * all. P-097 says a check that cannot fail is worse than none; that law applies to the
 * mutation suite exactly as it applies to the thing the suite measures.
 *
 * The four rules, and why each is here rather than a looser "it exited non-zero":
 *
 * 1. **Exit code.** The verdict a CI job branches on.
 * 2. **At least one divergence.** A non-zero exit with an empty list is a harness that
 *    knows something is wrong and cannot say what — useless during an investigation.
 * 3. **The named field.** Appendix A.4 requires the report to name what moved. Accepting
 *    any divergence would let a differ pass by reporting the wrong field every time.
 * 4. **The earliest index.** `targetIndex` is the first position at which the two streams
 *    *can* differ. Anything earlier is noise about untouched records; anything later
 *    means the perturbation slipped past and something else was reported instead.
 *
 * Returns the contract violations, most specific first. Empty means the oracle behaved.
 */
export function judgeMutation(
  mutation: GoldenMutation,
  applied: MutationResult,
  verdict: OracleVerdict,
): string[] {
  const failures: string[] = []
  const { divergences } = verdict.diff

  if (!mutation.divergent) {
    // NEGATIVE CONTROL — the bytes moved, no decision did. Silence is the only pass.
    if (verdict.exitCode !== 0) failures.push(`expected exit 0, got ${verdict.exitCode}`)
    for (const d of divergences) {
      failures.push(`reported [${d.category}] ${d.field} at record ${d.index} — ${d.detail}`)
    }
    return failures
  }

  // POSITIVE CONTROL — non-zero, and specific about what moved.
  if (verdict.exitCode !== 1) failures.push(`expected exit 1, got ${verdict.exitCode}`)
  if (divergences.length === 0) {
    failures.push('reported no divergences at all')
    return failures
  }
  const expectField = mutation.expectField as RegExp
  if (!divergences.some(d => expectField.test(d.field))) {
    const seen = [...new Set(divergences.map(d => d.field))].join(', ')
    failures.push(`no divergence named a field matching ${String(expectField)} (fields reported: ${seen})`)
  }
  if (applied.targetIndex !== null) {
    const earliest = Math.min(...divergences.map(d => d.index))
    if (earliest !== applied.targetIndex) {
      failures.push(`earliest divergence is at record ${earliest}, not at the perturbed record ${applied.targetIndex}`)
    }
  }
  return failures
}
