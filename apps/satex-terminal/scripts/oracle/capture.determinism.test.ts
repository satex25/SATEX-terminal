/**
 * RS-1.3 slice 3 — the double-run determinism proof.
 *
 * This is the plan's designated early-warning tripwire (RS-UP-1 risk R3).
 * Capture the same tape twice; the golden bytes must be identical. If they are
 * not, the TS replay path still carries nondeterminism that RS-0.6 did not
 * seam out, every downstream parity claim would be measured against a moving
 * reference, and the correct response is to halt Phase ≥ 2 work rather than
 * widen a tolerance.
 *
 * Two runs is a real test here, not a formality. `shortId()` mixes `Date.now()`
 * and `Math.random()` into every generated id *and* keeps a process-wide
 * counter, so the two captures produce genuinely different raw ids — run two's
 * session id is not run one's. Equality only holds because the golden
 * normalizes ids by first-occurrence order (slice 1's `IdNormalizer`). Every
 * other source of run-to-run variation is left exposed on purpose, which is
 * what makes the hash worth comparing.
 *
 * The `differs` case is the guard against a vacuous pass: two empty or
 * constant streams would also hash equal, so the suite proves the hash reacts
 * to a changed tape before it is allowed to prove that it does not react to a
 * repeated one.
 *
 * CI note: the recorded corpus lives under `Vault/Backtests/corpus/`, which is
 * gitignored (ledger P-143), so CI cannot see it. The synthetic tape carries
 * the proof on every push; the corpus case runs on operator hardware and is
 * reported as *skipped* — never as passed — when the files are absent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createSandbox, ORACLE_ENV, type OracleSandbox } from './sandbox'
import { synthesizeTape, readCorpusTape, sha256File, type CorpusTape } from './corpus'
import { captureGolden, CAPTURE_DEFAULTS, type VirtualClock, type CaptureResult } from './capture'
import { createElectronStub, type ElectronStub } from './electron-stub'
import { writeGoldenArchive } from './archive'

const ctx = vi.hoisted(() => ({ module: null as unknown }))
vi.mock('electron', () => ctx.module as Record<string, unknown>)

const nodeRequire = createRequire(import.meta.url)
vi.stubGlobal('require', (id: string) => {
  const override = process.env['SATEX_TEST_BETTER_SQLITE3']
  if (id === 'better-sqlite3' && override) return nodeRequire(override)
  return nodeRequire(id)
})

let sb: OracleSandbox
const stub: ElectronStub = createElectronStub(() => sb)
ctx.module = stub.module

beforeEach(() => { sb = createSandbox() })
afterEach(async () => {
  vi.useRealTimers()
  try { (await import('../../src/main/services/persistence')).closeDB() } catch { /* never opened */ }
  sb.dispose()
})

/**
 * One full capture in a fresh world: new sandbox, new module registry, new
 * database. Everything a second run could inherit from the first is discarded.
 */
async function captureOnce(tape: CorpusTape, extra?: { autonomy?: boolean; speed?: number }): Promise<CaptureResult> {
  sb.dispose()
  sb = createSandbox()
  stub.journal.reset()
  vi.resetModules()
  vi.useFakeTimers({ now: tape.header.firstTs })
  try {
    return await captureGolden({
      ...extra,
      sandbox: sb,
      clock: {
        now: () => Date.now(),
        // Result discarded: `advanceTimersByTimeAsync` resolves to the vitest
        // utils object, while the clock contract is `Promise<void>`.
        advance: async (ms: number) => { await vi.advanceTimersByTimeAsync(ms) },
      } satisfies VirtualClock,
      tape,
      journal: stub.journal,
    })
  } finally {
    try { (await import('../../src/main/services/persistence')).closeDB() } catch { /* never opened */ }
    vi.useRealTimers()
  }
}

/**
 * First point at which two golden streams disagree, rendered for a human.
 *
 * A determinism failure is a halt-and-investigate condition, so the report has
 * to name the record rather than dump two 90 KB blobs — this is the same shape
 * Appendix A.4 asks of the drift report: first divergence, with context.
 */
function firstDivergence(a: readonly string[], b: readonly string[]): string | null {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      const parsed = JSON.parse(a[i]!) as { kind: string; tickIndex: number }
      return `record ${i} (kind=${parsed.kind}, tickIndex=${parsed.tickIndex})\n  run 1: ${a[i]}\n  run 2: ${b[i]}`
    }
  }
  if (a.length !== b.length) return `record counts differ: run 1 has ${a.length}, run 2 has ${b.length}`
  return null
}

const SYNTHETIC = (): CorpusTape => synthesizeTape({
  sessionId: 'ses_determinism01',
  symbols: ['AAPL', 'MSFT', 'NVDA'],
  ticksPerSymbol: 480,
  startTs: 1_784_880_000_000,
  stepMs: 250,
})

describe('double-run determinism — synthetic tape (runs everywhere, including CI)', () => {
  it('produces byte-identical goldens across two independent captures', async () => {
    const first = await captureOnce(SYNTHETIC())
    const second = await captureOnce(SYNTHETIC())

    // Guard against a vacuous pass before comparing: an empty stream would
    // satisfy every assertion below.
    expect(first.summary.records).toBeGreaterThan(20)
    expect(first.summary.replayEndReason).toBe('end-of-tape')
    expect(second.summary.replayEndReason).toBe('end-of-tape')

    // The proof. Compare the text first: on a failure the diff names the
    // record that moved, which is what an investigation actually needs.
    expect(second.stream.text()).toBe(first.stream.text())
    expect(second.summary.goldenHash).toBe(first.summary.goldenHash)
  }, 300_000)

  it('assigns different raw ids to the two runs — the normalizer is load-bearing', async () => {
    // If this ever stops being true, the determinism proof above got easier
    // than it is supposed to be and the normalizer stopped being exercised.
    const first = await captureOnce(SYNTHETIC())
    const firstIds = [...first.stream.idMappings().keys()]
    const second = await captureOnce(SYNTHETIC())
    const secondIds = [...second.stream.idMappings().keys()]
    expect(firstIds.length).toBeGreaterThan(0)
    expect(secondIds).not.toEqual(firstIds)
  }, 300_000)

  /**
   * KNOWN DEFECT PIN — ledger P-155. This test asserts that something is
   * BROKEN, and must fail the day it is fixed.
   *
   * The AI decision path is **not** replay-deterministic. `getAiDecision`
   * (`trading-engine.ts:1538`) passes `this.depth.get(symbol)` into
   * `brain.decide()`, `DepthFeedService.jitterFor` churns that ladder with four
   * unseeded `Math.random()` calls per tick (`depth-feed.ts:87-91`), and the
   * brain turns the top of the ladder into `depth_imbalance` (weight 0.15) and
   * `microprice_dev` (0.10) (`brain.ts:86-105`). So a quarter of every
   * confidence score is drawn from an unseeded RNG.
   *
   * Measured divergence: identical symbol, tick index, and virtual timestamp;
   * confidence 0.3520162749933342 vs 0.36683881944775815.
   *
   * This is why `autonomy` defaults to off and why the archived golden carries
   * no decision records. It is a hard blocker for Oracle L1 decision parity —
   * the Rust engine cannot reproduce a number drawn from `Math.random()`. The
   * remedy is a seeded RNG in `depth-feed.ts`, which is an engine change and
   * needs an operator ruling.
   *
   * When that lands, this test fails, and the person who fixed it should delete
   * it, flip `autonomy` on for the corpus capture, and regenerate the goldens.
   */
  it('KNOWN DEFECT (P-155): the decision stream is NOT deterministic — unseeded depth RNG reaches confidence', async () => {
    // Speed 1, not the default 10: the trader's cycle is 30 s of *virtual wall*
    // time, so at 10× this 120-second tape would finish in 12 s and the trader
    // would never fire once. At 1× the cycle runs repeatedly.
    const opts = { autonomy: true, speed: 1 }
    const first = await captureOnce(SYNTHETIC(), opts)
    const second = await captureOnce(SYNTHETIC(), opts)

    const kinds = first.stream.snapshot().map(l => (JSON.parse(l) as { kind: string }).kind)
    expect(kinds).toContain('autonomy.enabled')
    expect(kinds.filter(k => k === 'autonomy.decision').length).toBeGreaterThan(0)
    expect(first.summary.replayEndReason).toBe('end-of-tape')

    const divergence = firstDivergence(first.stream.snapshot(), second.stream.snapshot())
    expect(divergence, 'depth RNG appears to have been seeded — see the docblock above, then delete this test').not.toBeNull()
    // Pin *where* it diverges. If the first divergence ever moves to another
    // record kind, that is a second, separate nondeterminism and wants its own
    // investigation rather than being absorbed by this pin.
    expect(divergence).toMatch(/kind=autonomy\.decision/)
    expect(divergence).toMatch(/confidence/)
  }, 300_000)

  it('hashes differently when the tape changes', async () => {
    const a = await captureOnce(SYNTHETIC())
    const b = await captureOnce(synthesizeTape({
      sessionId: 'ses_determinism02',
      symbols: ['AAPL', 'MSFT', 'NVDA'],
      // One extra symbol-step: a different tape must be a different golden, or
      // the hash is not measuring anything.
      ticksPerSymbol: 481,
      startTs: 1_784_880_000_000,
      stepMs: 250,
    }))
    expect(b.summary.goldenHash).not.toBe(a.summary.goldenHash)
  }, 300_000)
})

/**
 * The recorded corpus. Present on operator hardware, absent in CI.
 *
 * Resolved relative to this file so it works from any working directory:
 * `scripts/oracle` → repo root is four levels up.
 */
const CORPUS_DIR = path.resolve(__dirname, '../../../../Vault/Backtests/corpus')
const CORPUS_INDEX = path.join(CORPUS_DIR, 'corpus-index.json')
const corpusPresent = fs.existsSync(CORPUS_INDEX)

describe.skipIf(!corpusPresent)('double-run determinism — recorded corpus (operator hardware)', () => {
  it('verifies every corpus file against the SHA-256 the index recorded', () => {
    const index = JSON.parse(fs.readFileSync(CORPUS_INDEX, 'utf8')) as {
      files: Array<{ name: string; sha256: string; lines: number }>
    }
    for (const file of index.files) {
      const full = path.join(CORPUS_DIR, file.name)
      expect(fs.existsSync(full), `corpus file missing: ${file.name}`).toBe(true)
      // §5.2: corpus files are read-only artifacts, a changed SHA is an incident.
      expect(sha256File(full), `corpus file changed on disk: ${file.name}`).toBe(file.sha256)
    }
  })

  it('produces byte-identical goldens across two captures of the rescued tape', async () => {
    const index = JSON.parse(fs.readFileSync(CORPUS_INDEX, 'utf8')) as { files: Array<{ name: string }> }
    const tapeName = index.files.map(f => f.name).find(n => n.startsWith('tape-'))
    expect(tapeName, 'corpus index carries no tape- file').toBeDefined()
    const tape = readCorpusTape(path.join(CORPUS_DIR, tapeName!))

    const first = await captureOnce(tape)
    const second = await captureOnce(tape)

    expect(first.summary.replayEndReason).toBe('end-of-tape')
    expect(first.summary.records).toBeGreaterThan(20)
    expect(second.summary.goldenHash).toBe(first.summary.goldenHash)

    // Regeneration. Archiving the *proven* run rather than a third capture is
    // deliberate: the bytes that go on disk are the ones this test just showed
    // to be reproducible, so the archive cannot disagree with the proof.
    //   SATEX_ORACLE_WRITE=1 npx vitest run scripts/oracle/capture.determinism.test.ts
    if (process.env['SATEX_ORACLE_WRITE'] === '1') {
      const index = JSON.parse(fs.readFileSync(CORPUS_INDEX, 'utf8')) as {
        files: Array<{ name: string; sha256: string }>
      }
      const entry = index.files.find(f => f.name === tapeName)!
      const { manifest } = writeGoldenArchive({
        dir: path.resolve(__dirname, '../../../../Vault/Backtests/goldens'),
        stream: first.stream,
        summary: first.summary,
        corpus: { file: entry.name, sha256: entry.sha256 },
        capture: {
          speed: CAPTURE_DEFAULTS.speed,
          stepMs: CAPTURE_DEFAULTS.stepMs,
          checkpointEvery: CAPTURE_DEFAULTS.checkpointEvery,
          rngSeed: ORACLE_ENV.rngSeed,
        },
      })
      expect(manifest.goldenSha256).toBe(first.summary.goldenHash)
    }
  }, 600_000)
})

// A capture must never be silently skipped into a green build. When the corpus
// is absent the suite above does not run, so say so out loud in the report.
describe('corpus availability', () => {
  it(corpusPresent
    ? 'recorded corpus is present — the corpus proof ran'
    : 'recorded corpus is ABSENT (gitignored, P-143) — only the synthetic proof ran', () => {
    expect(typeof corpusPresent).toBe('boolean')
  })
})
