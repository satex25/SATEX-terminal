/**
 * RS-1.7 — the oracle mutation proof.
 *
 * This suite is the reason any later sentence of the form "the Rust engine matches the
 * TS engine" is allowed to mean something. It takes a golden, perturbs it deliberately,
 * and demands the verifier react correctly — non-zero and specific for a real change,
 * silent for a change that carries no decision content.
 *
 * Ledger P-097 is the law being applied to our own measuring instrument: a check that
 * cannot fail is worse than no check. Every positive control here is a demonstration of
 * the failure direction, and every negative control is a demonstration that the failure
 * direction is not simply "always".
 *
 * The matrix runs twice. Against a **synthetic golden** built in-process, which runs
 * everywhere including CI, and against the **archived corpus golden**, which lives under
 * the gitignored `Vault/Backtests/goldens/` (ledger P-143) and therefore only exists on
 * operator hardware. The archived file is read, copied in memory and never written: it
 * changes only through the RS-1.3 regeneration procedure with operator review, and a
 * test that edited it would be forging its own reference.
 */
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { GoldenStream } from './golden'
import { GOLDEN_MUTATIONS, judgeMutation } from './mutate'
import { formatDriftReport, loadGolden, verifyGolden, type Divergence, type GoldenDiff, type OracleVerdict } from './verify'

/** Realistic generated ids — the stream normalises both to placeholders on emit. */
const ORD = 'ord_lym6yqrk8f3z001'
const SES = 'ses_lym6yqrkab12001'

/**
 * A golden shaped like the archived one, small enough to reason about.
 *
 * Every payload feature the matrix needs a target for is present on purpose: both
 * strata, a boolean, a plain string, a normalised id, a high-precision float, a zero, an
 * integer, a null, an array of differing objects, a scalar three levels down, and a
 * non-ASCII character. A mutation whose target is missing throws rather than returning
 * its input, so an incomplete fixture fails loudly instead of passing vacuously.
 */
function buildSyntheticGolden(): string {
  const stream = new GoldenStream()
  stream.emit({
    tickIndex: 0, ts: 1_784_880_000_000, level: 'L1', kind: 'replay.start',
    payload: { ok: true, sessionId: SES, speed: 1, tapeStartTs: 1_784_880_000_000 },
  })
  stream.emit({
    tickIndex: 0, ts: 1_784_880_000_000, level: 'L2', kind: 'account.checkpoint',
    payload: { cash: 100_000, dailyPnl: 0, equity: 100_000, killSwitchArmed: false, mode: 'paper', openPositions: [] },
  })
  stream.emit({
    tickIndex: 1, ts: 1_784_880_001_000, level: 'L2', kind: 'calibration.checkpoint',
    payload: { brierScore: null, buckets: [{ hi: 0.1, lo: 0, n: 0 }, { hi: 0.2, lo: 0.1, n: 0 }] },
  })
  stream.emit({
    tickIndex: 2, ts: 1_784_880_002_000, level: 'L1', kind: 'gates.verdict',
    payload: {
      breachingCount: 0,
      gates: [
        { key: 'DAILY_LOSS_LIMIT', pct: 0, status: 'OK', value: '0.0% / −2.0% buf' },
        { key: 'CORRELATION', pct: 0.5, status: 'WARN', value: 'ρ̄ 0.42' },
      ],
    },
  })
  stream.emit({
    tickIndex: 3, ts: 1_784_880_003_000, level: 'L1', kind: 'autonomy.decision',
    payload: {
      approved: false, confidence: 0.18522048141880315, id: ORD,
      reason: 'neutral · confidence 19% < 60%', size: 0, symbol: 'NVDA',
    },
  })
  stream.emit({
    tickIndex: 4, ts: 1_784_880_004_000, level: 'L2', kind: 'brain.checkpoint',
    payload: [0.25, 0.5, 0.125],
  })
  stream.emit({
    tickIndex: 5, ts: 1_784_880_005_000, level: 'L1', kind: 'replay.end',
    payload: { emittedTicks: 100_000, progress: 1, reason: 'end-of-tape' },
  })
  return stream.text()
}

/**
 * Declares the matrix against one golden.
 *
 * The assertions are the same for both fixtures on purpose: a mutation class that only
 * holds against a hand-built stream would not be a contract RS-1.4 could rely on.
 */
function declareMatrix(label: string, golden: () => string, skip = false): void {
  describe.skipIf(skip)(`mutation matrix — ${label}`, () => {
    it('verifies a clean copy — the harness can return zero, or nothing below means anything', () => {
      const text = golden()
      const verdict = verifyGolden(text, text.slice())
      expect(verdict.report).toContain('CLEAN')
      expect(verdict.exitCode).toBe(0)
      expect(verdict.diff.divergences).toEqual([])
      expect(verdict.diff.bytesEqual).toBe(true)
      // Guard the guard: an empty stream would satisfy every assertion above.
      expect(verdict.diff.expectedRecords).toBeGreaterThan(4)
    })

    for (const mutation of GOLDEN_MUTATIONS) {
      const verdictWord = mutation.divergent ? 'catches' : 'ignores'
      it(`${verdictWord} ${mutation.id}`, () => {
        const text = golden()
        const applied = mutation.apply(text)
        // Every mutation must move the bytes. A perturbation that found no target and
        // returned its input would sail through a negative control proving nothing.
        expect(applied.text, `${mutation.id} produced identical text`).not.toBe(text)

        const verdict = verifyGolden(text, applied.text)
        const because = `${mutation.id}\n  changed: ${applied.note}\n${verdict.report}`

        // The byte stratum must see every mutation, including the ones the semantic
        // stratum is required to ignore — that is what makes the negative controls a
        // statement about *decision content* rather than about the file being untouched.
        expect(verdict.diff.bytesEqual, because).toBe(false)

        // The verdict is judged by the shared contract predicate, never by assertions
        // written inline here: the falsification proof below points that same predicate
        // at broken verifiers, and it can only do that if there is one copy of it.
        expect(judgeMutation(mutation, applied, verdict), because).toEqual([])
      })
    }
  })
}

/* ------------------------------------------------------------ registry sanity */

describe('mutation registry', () => {
  it('carries both columns — a matrix with no negative controls proves only half of it', () => {
    const positives = GOLDEN_MUTATIONS.filter(m => m.divergent)
    const negatives = GOLDEN_MUTATIONS.filter(m => !m.divergent)
    expect(positives.length).toBeGreaterThan(20)
    expect(negatives.length).toBeGreaterThan(5)
  })

  /**
   * The contract, written out.
   *
   * RS-1.4's Rust structural differ reports its coverage against these ids, so a class
   * that silently disappears would quietly narrow the parity guarantee for every phase
   * after it — and a shrinking matrix is invisible in a green suite. Pinning the set
   * makes removing a class an explicit, reviewable edit rather than a deletion nobody
   * sees. Adding one is meant to fail here too: the new id belongs in this list and in
   * the ledger entry that justifies it.
   */
  it('pins the exact id set — a silently dropped class would narrow the contract unseen', () => {
    expect([...GOLDEN_MUTATIONS.map(m => m.id)].sort()).toEqual([
      'envelope-kind-corrupted',
      'envelope-key-removed',
      'envelope-key-unknown-added',
      'envelope-level-l1-demoted',
      'envelope-level-l2-promoted',
      'float-nan-literal',
      'float-overflow-to-infinity',
      'format-blank-line-inserted',
      'format-bom-prefixed',
      'format-crlf-line-endings',
      'format-envelope-key-order-reversed',
      'format-excess-precision',
      'format-exponent-notation',
      'format-float-integer-form',
      'format-line-whitespace-padded',
      'format-negative-zero',
      'format-payload-key-order-reversed',
      'format-trailing-newline-removed',
      'format-unicode-escaped',
      'format-whitespace-inserted',
      'id-normalization-bypass',
      'line-not-json',
      'payload-array-element-removed',
      'payload-array-reordered',
      'payload-array-to-object',
      'payload-duplicate-json-key',
      'payload-nested-deep-scalar',
      'payload-object-key-added',
      'payload-object-key-removed',
      'payload-scalar-bool-flip',
      'payload-scalar-precision-truncated',
      'payload-scalar-string-flip',
      'payload-scalar-type-to-null',
      'payload-scalar-number-to-string',
      'payload-scalar-ulp-nudge',
      'record-deleted',
      'record-deleted-renumbered',
      'record-inserted-duplicate',
      'record-inserted-renumbered',
      'seq-duplicated',
      'seq-gap-introduced',
      'seq-records-swapped',
      'stream-emptied',
      'stream-truncated-tail',
      'tick-index-drift',
      'tick-index-regressed',
      'ts-drift-one-millisecond',
      'ts-regressed',
      'ts-sub-millisecond-drift',
    ].sort())
  })

  it('gives every mutation a unique kebab-case id — the ids are RS-1.4 coverage keys', () => {
    const ids = GOLDEN_MUTATIONS.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id, `"${id}" is not kebab-case`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('sets expectField exactly on the positive controls', () => {
    for (const m of GOLDEN_MUTATIONS) {
      expect(m.expectField === null, `${m.id}`).toBe(!m.divergent)
      expect(m.description.length, `${m.id} has no description`).toBeGreaterThan(20)
      expect(m.appliedTo.length, `${m.id} does not say what it is applied to`).toBeGreaterThan(3)
    }
  })
})

/* ------------------------------------------- falsification — P-097, one level up */

/**
 * The matrix proves the *verifier* can fail. This proves the *matrix* can fail.
 *
 * Everything above is a set of assertions about a verifier that is already correct, and
 * assertions no wrong implementation could ever trip are decoration. So the same
 * `judgeMutation` contract the matrix runs on is pointed at three deliberately broken
 * verifiers, and each is required to be caught by the column that exists to catch it:
 *
 * - **always-clean** must fail every *positive* control — otherwise the positive column
 *   is satisfied by a differ that never looks at anything.
 * - **always-divergent** must fail every *negative* control — otherwise the negative
 *   column is satisfied by a differ that flags the kettle boiling.
 * - **byte-equality** must fail every negative control too. This is the one RS-1.4 should
 *   read twice: comparing the two files is the first thing a port is tempted to write,
 *   it passes every positive control, and it is wrong — byte equality is strictly
 *   stronger than golden equality, so shipping it as the parity comparator would make
 *   every cross-language run "divergent" on serialiser formatting alone.
 *
 * Between them the first two show that neither column can be satisfied by a constant.
 */

/** A verdict built by hand, so a broken verifier can return the real interface. */
function fakeVerdict(divergences: readonly Divergence[], bytesEqual: boolean): OracleVerdict {
  const diff: GoldenDiff = {
    divergences, truncated: false, bytesEqual, expectedRecords: 0, actualRecords: 0,
  }
  return { exitCode: divergences.length === 0 ? 0 : 1, diff, report: formatDriftReport(diff) }
}

/** One divergence row that names a plausible field, so the failure is never about shape. */
const SOME_DIVERGENCE: readonly Divergence[] = [{
  category: 'value', index: 0, seq: 0, tickIndex: 0, level: 'L1', kind: 'replay.start',
  field: 'payload', expected: '<something>', actual: '<something else>',
  detail: 'this differ reports a divergence no matter what it was given',
}]

const BROKEN_VERIFIERS: ReadonlyArray<{
  readonly name: string
  readonly column: 'positive' | 'negative'
  verify(expected: string, actual: string): OracleVerdict
}> = [
  {
    name: 'always-clean (a differ that never looks)',
    column: 'positive',
    verify: (e, a) => fakeVerdict([], e === a),
  },
  {
    name: 'always-divergent (a differ that flags everything)',
    column: 'negative',
    verify: (e, a) => fakeVerdict(SOME_DIVERGENCE, e === a),
  },
  {
    name: 'byte-equality (the naive port: compare the two files)',
    column: 'negative',
    verify: (e, a) => (e === a ? fakeVerdict([], true) : fakeVerdict(SOME_DIVERGENCE, false)),
  },
]

describe('falsification — the mutation contract must itself be capable of failing', () => {
  it('the real verifier satisfies the contract on every row — the control for the three below', () => {
    const text = buildSyntheticGolden()
    for (const mutation of GOLDEN_MUTATIONS) {
      const applied = mutation.apply(text)
      expect(judgeMutation(mutation, applied, verifyGolden(text, applied.text)), mutation.id).toEqual([])
    }
  })

  for (const broken of BROKEN_VERIFIERS) {
    it(`rejects ${broken.name} on every ${broken.column} control`, () => {
      const text = buildSyntheticGolden()
      const column = GOLDEN_MUTATIONS.filter(m => m.divergent === (broken.column === 'positive'))
      // Guard the guard: an empty column would make the assertion below pass vacuously,
      // which is the exact failure this whole file exists to make impossible.
      expect(column.length, `the ${broken.column} column is empty`).toBeGreaterThan(5)

      const survived: string[] = []
      for (const mutation of column) {
        const applied = mutation.apply(text)
        const verdict = broken.verify(text, applied.text)
        if (judgeMutation(mutation, applied, verdict).length === 0) survived.push(mutation.id)
      }
      expect(survived, `${broken.name} went undetected by: ${survived.join(', ')}`).toEqual([])
    })
  }
})

/* ------------------------------------------------------------------ the matrix */

declareMatrix('synthetic golden (runs everywhere, including CI)', buildSyntheticGolden)

/**
 * The archived golden. Present on operator hardware, absent in CI (`Vault/Backtests/`
 * is gitignored — ledger P-143), exactly like the RS-1.3 corpus determinism proof.
 */
const GOLDEN_DIR = path.resolve(__dirname, '../../../../Vault/Backtests/goldens')
const archived = fs.existsSync(GOLDEN_DIR)
  ? fs.readdirSync(GOLDEN_DIR).filter(f => f.endsWith('.golden.jsonl')).sort()
  : []
const archivedPath = archived.length > 0 ? path.join(GOLDEN_DIR, archived[0] as string) : null

describe.skipIf(archivedPath === null)('archived golden — the reference itself', () => {
  it('loads with zero defects, so the matrix below perturbs a stream that was clean', () => {
    const loaded = loadGolden(fs.readFileSync(archivedPath as string, 'utf8'), 'archived')
    expect(loaded.defects.map(d => d.detail)).toEqual([])
    expect(loaded.records.length).toBeGreaterThan(100)
  })

  it('is never written by this suite — goldens change only via RS-1.3 regeneration', () => {
    // Read, hash, run every mutation over the in-memory copy, hash again. A mutation
    // that reached for the filesystem would show up here rather than in a later
    // session's inexplicable parity failure.
    const before = createHash('sha256').update(fs.readFileSync(archivedPath as string)).digest('hex')
    const text = fs.readFileSync(archivedPath as string, 'utf8')
    for (const mutation of GOLDEN_MUTATIONS) mutation.apply(text)
    const after = createHash('sha256').update(fs.readFileSync(archivedPath as string)).digest('hex')
    expect(after).toBe(before)
  })
})

declareMatrix(
  'archived corpus golden (operator hardware)',
  () => {
    if (archivedPath === null) throw new Error('archived golden absent')
    return fs.readFileSync(archivedPath, 'utf8')
  },
  archivedPath === null,
)

// A skipped matrix must never read as a passed one.
describe('archived golden availability', () => {
  it(archivedPath === null
    ? 'archived golden is ABSENT (gitignored, P-143) — only the synthetic matrix ran'
    : `archived golden is present (${archived[0]}) — both matrices ran`, () => {
    expect(typeof (archivedPath === null)).toBe('boolean')
  })
})
