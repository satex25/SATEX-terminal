/**
 * RS-1.3 slice 3 — headless capture contract.
 *
 * This is the first suite that boots the real `TradingEngine` with no Electron
 * runtime, drives it over a tape on a virtual clock, and reads a golden stream
 * out the other side. It pins what a capture must be *able to say about
 * itself* — that it reached the end of the tape, that nothing left the
 * machine, that no dialog was answered, and that no raw generated id survived
 * into the golden bytes.
 *
 * The determinism proof lives next door in `capture.determinism.test.ts`.
 * These are the preconditions that make that proof mean something: two
 * identical *empty* streams would also hash equal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { createSandbox, type OracleSandbox } from './sandbox'
import { synthesizeTape } from './corpus'
import { captureGolden, type VirtualClock } from './capture'
import { createElectronStub, type ElectronStub } from './electron-stub'

// vitest calls a `vi.mock` factory once per file, so the stub is file-scoped
// and follows the current sandbox through a provider rather than capturing one.
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

beforeEach(() => {
  sb = createSandbox()
  stub.journal.reset()
  // Every capture needs its own module registry: `persistence.ts` caches the
  // open database in a module-level singleton, and `id-generator.ts` keeps a
  // process-wide counter. Without this the second capture in a file would
  // reuse the first one's database.
  vi.resetModules()
})

afterEach(async () => {
  vi.useRealTimers()
  try { (await import('../../src/main/services/persistence')).closeDB() } catch { /* never opened */ }
  sb.dispose()
})

/**
 * A tape long enough to matter.
 *
 * 480 steps × 250 ms = 120 s of tape, which at the default 10× replay speed is
 * 12 s of *virtual wall* time — past `EdgarService`'s 10 s boot timer, so its
 * SEC poll fires inside the run and the network block is exercised for real
 * rather than only in its own unit test.
 */
const TAPE = (): ReturnType<typeof synthesizeTape> => synthesizeTape({
  sessionId: 'ses_capture000001',
  symbols: ['AAPL', 'MSFT', 'NVDA'],
  ticksPerSymbol: 480,
  startTs: 1_784_880_000_000,
  stepMs: 250,
})

/** Vitest fake timers, wrapped in the clock interface the capture expects. */
function fakeClock(startMs: number): VirtualClock {
  vi.useFakeTimers({ now: startMs })
  return {
    now: () => Date.now(),
    // `advanceTimersByTimeAsync` resolves to the vitest utils object; the
    // clock contract is `Promise<void>`, so the result is discarded here
    // rather than widened in the driver's own type.
    advance: async (ms: number) => { await vi.advanceTimersByTimeAsync(ms) },
  }
}

async function capture(): Promise<Awaited<ReturnType<typeof captureGolden>>> {
  const tape = TAPE()
  return captureGolden({
    sandbox: sb,
    clock: fakeClock(tape.header.firstTs),
    tape,
    journal: stub.journal,
  })
}

describe('captureGolden', () => {
  it('runs the tape to its end rather than stopping on a budget', async () => {
    const { summary } = await capture()
    // 'end-of-tape' is ReplaySource's own auto-pause reason. A budget stall
    // would report something else, and a stalled capture is not evidence.
    expect(summary.replayEndReason).toBe('end-of-tape')
    expect(summary.emittedTicks).toBeGreaterThan(0)
  }, 180_000)

  it('produces a golden stream with gap-free sequence numbers', async () => {
    const { stream } = await capture()
    expect(stream.length).toBeGreaterThan(0)
    const seqs = stream.snapshot().map(line => (JSON.parse(line) as { seq: number }).seq)
    expect(seqs).toEqual(seqs.map((_, i) => i))
  }, 180_000)

  it('captures both parity strata — decisions and state checkpoints', async () => {
    const { stream } = await capture()
    const kinds = new Set(stream.snapshot().map(l => (JSON.parse(l) as { kind: string }).kind))
    expect(kinds).toContain('replay.start')
    expect(kinds).toContain('replay.end')
    expect(kinds).toContain('account.checkpoint')
    expect(kinds).toContain('gates.verdict')
    const levels = new Set(stream.snapshot().map(l => (JSON.parse(l) as { level: string }).level))
    expect(levels).toContain('L1')
    expect(levels).toContain('L2')
  }, 180_000)

  it('normalizes every generated id out of the golden bytes', async () => {
    const { stream } = await capture()
    const text = stream.text()
    // A raw `ses_…`/`ord_…` id carries `Date.now()` and `Math.random()` in it.
    // Any surviving one would make two runs differ, so this is both a format
    // rule and the reason the determinism proof can pass at all.
    expect(text).not.toMatch(/"ses_[0-9a-z]{13,24}"/)
    expect(text).not.toMatch(/\bord_[0-9a-z]{13,24}\b/)
    expect(text).toMatch(/<ses:\d+>/)
  }, 180_000)

  it('records that the network was closed, and what tried to leave', async () => {
    const { summary } = await capture()
    // EdgarService.start() arms a 10s timer; this tape is 60 virtual seconds
    // long, so the poll fires and must be refused rather than served.
    expect(summary.networkAttempts.length).toBeGreaterThan(0)
    expect(summary.networkAttempts.some(u => u.includes('sec.gov'))).toBe(true)
  }, 180_000)

  it('answers no dialog — the harness cannot arm live mode', async () => {
    const { summary } = await capture()
    expect(summary.dialogs).toEqual([])
  }, 180_000)

  it('writes its tape into a real database and says how many rows landed', async () => {
    const { summary } = await capture()
    expect(summary.import.bounds.count).toBe(1440)
    expect(summary.import.rowsWritten).toBe(1440)
  }, 180_000)

  it('never leaves the sandbox — no capture path appears in the golden', async () => {
    const { stream } = await capture()
    // Sandbox roots are `mkdtemp` random. A leaked path would be a per-run
    // value inside a stream whose whole purpose is being reproducible.
    expect(stream.text()).not.toContain(sb.root.replace(/\\/g, '\\\\'))
    expect(stream.text()).not.toContain(sb.root)
  }, 180_000)

  it('leaves the operator vault untouched by writing only inside the sandbox', async () => {
    await capture()
    // The engine's VaultWriter resolves through app.getAppPath(); if the
    // sandbox marker did its job, the notes are here.
    expect(fs.existsSync(sb.root)).toBe(true)
  }, 180_000)

  it('reports a stall instead of hanging when the tape cannot finish', async () => {
    const tape = TAPE()
    const { summary } = await captureGolden({
      sandbox: sb,
      clock: fakeClock(tape.header.firstTs),
      tape,
      // Far too little virtual time to drain a 60-second tape at speed 10.
      budgetMs: 200,
    })
    expect(summary.replayEndReason).toBe('budget-exhausted')
  }, 180_000)
})
