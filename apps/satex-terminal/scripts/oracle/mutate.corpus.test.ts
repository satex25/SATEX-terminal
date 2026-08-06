/**
 * RS-1.7 — the end-to-end half of the mutation proof: perturb the *input corpus*.
 *
 * `mutate.test.ts` proves the verifier reacts to a perturbed golden. That leaves the
 * other end of the instrument untested: does a change to the tape the engine reads
 * actually reach the golden it writes? If it did not, every parity claim would be
 * measured over a stream that is insensitive to its own input, and the oracle would be
 * green for reasons having nothing to do with the engine.
 *
 * So: capture a golden from a synthetic tape, change **one field of one tick** by one
 * cent, capture again, and require the verifier to exit non-zero and name the first
 * record that moved. The plan asks for exactly this (§5.2, RS-1.7: "also perturb the
 * harness input corpus (one tick) and confirm detection").
 *
 * The scaffolding is the RS-1.3 determinism proof's, unchanged: same sandbox, same
 * electron stub, same fresh-world-per-capture discipline. Autonomy is on at speed 1 for
 * the same reason it is there — at 10x the tape drains before the trader's 30 s virtual
 * cycle can fire, and a golden with no decisions cannot demonstrate an L1 divergence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { createSandbox, type OracleSandbox } from './sandbox'
import { synthesizeTape, type CorpusTape, type CorpusTickRow } from './corpus'
import { captureGolden, type VirtualClock, type CaptureResult } from './capture'
import { createElectronStub, type ElectronStub } from './electron-stub'
import { verifyGolden } from './verify'

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

/** One capture in a fresh world — see `capture.determinism.test.ts` for the rationale. */
async function captureOnce(tape: CorpusTape): Promise<CaptureResult> {
  sb.dispose()
  sb = createSandbox()
  stub.journal.reset()
  vi.resetModules()
  vi.useFakeTimers({ now: tape.header.firstTs })
  try {
    return await captureGolden({
      autonomy: true,
      speed: 1,
      sandbox: sb,
      clock: {
        now: () => Date.now(),
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

const BASE = (): CorpusTape => synthesizeTape({
  sessionId: 'ses_mutation0001',
  symbols: ['AAPL', 'MSFT', 'NVDA'],
  ticksPerSymbol: 480,
  startTs: 1_784_880_000_000,
  stepMs: 250,
})

/**
 * The perturbation: one row, one field, one cent.
 *
 * Deliberately the smallest change the tape format can express. It is applied a quarter
 * of the way in so the engine has warmed its indicator windows and the tick lands inside
 * a live decision window rather than in the startup burn-in.
 */
function perturbOneTick(tape: CorpusTape): { tape: CorpusTape; at: number; row: CorpusTickRow } {
  const at = Math.floor(tape.rows.length / 4)
  const rows = tape.rows.map((row, i) => (i === at ? { ...row, last: row.last + 0.01 } : row))
  return { tape: { header: tape.header, rows }, at, row: tape.rows[at] as CorpusTickRow }
}

describe('corpus mutation — a one-cent change to one tick must reach the golden', () => {
  it('diverges, and the verifier names the first record that moved', async () => {
    const clean = await captureOnce(BASE())
    const { tape: perturbed, at, row } = perturbOneTick(BASE())
    const dirty = await captureOnce(perturbed)

    // Vacuous-pass guards before any comparison is allowed to mean anything: both runs
    // must have reached the end of the tape and carried real decisions, or "the goldens
    // differ" would be a statement about two broken captures.
    for (const [label, result] of [['clean', clean], ['perturbed', dirty]] as const) {
      expect(result.summary.replayEndReason, label).toBe('end-of-tape')
      expect(result.summary.records, label).toBeGreaterThan(20)
      const kinds = result.stream.snapshot().map(l => (JSON.parse(l) as { kind: string }).kind)
      expect(kinds.filter(k => k === 'autonomy.decision').length, `${label} carried no decisions`).toBeGreaterThan(0)
    }

    const verdict = verifyGolden(clean.stream.text(), dirty.stream.text())
    const because = `tape row ${at} (${row.symbol} last ${row.last} -> ${row.last + 0.01})\n${verdict.report.slice(0, 2_000)}`

    // Byte stratum: the archived hash must move too, or the manifest would certify two
    // different runs with the same SHA.
    expect(dirty.summary.goldenHash, because).not.toBe(clean.summary.goldenHash)

    // Semantic stratum: non-zero, and specific about where.
    expect(verdict.exitCode, because).toBe(1)
    expect(verdict.diff.divergences.length, because).toBeGreaterThan(0)
    const first = verdict.diff.divergences[0]
    expect(first?.field, because).toBeTruthy()
    expect(first?.index, because).toBeGreaterThanOrEqual(0)
    expect(verdict.report).toContain('DIVERGENT')
  }, 600_000)

  it('is not merely sensitive to being run twice — the same tape reproduces exactly', async () => {
    // The control for the test above. Without it, "the goldens differ" would be
    // consistent with the capture being nondeterministic rather than with the tape
    // change propagating (RS-1.3's proof, restated here so this file stands alone).
    const first = await captureOnce(BASE())
    const second = await captureOnce(BASE())
    expect(first.summary.replayEndReason).toBe('end-of-tape')
    expect(verifyGolden(first.stream.text(), second.stream.text()).exitCode).toBe(0)
    expect(second.summary.goldenHash).toBe(first.summary.goldenHash)
  }, 600_000)
})
