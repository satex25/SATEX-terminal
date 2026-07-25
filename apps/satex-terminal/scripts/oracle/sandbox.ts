/**
 * SATEX-RS oracle — capture sandbox.
 *
 * RS-UP-1 / RS-1.3 slice 2. A golden capture is only evidence if the run that
 * produced it depended on nothing outside the corpus. This module builds that
 * guarantee out of three pieces:
 *
 *   1. **A scratch filesystem tree.** Every `app.getPath(...)` the engine asks
 *      for resolves inside one temporary root, so the capture writes no bytes
 *      into the operator's real `userData` or Obsidian vault. The root carries
 *      an `.obsidian/` marker because `resolveVaultRoot()`
 *      (`trading-engine.ts`) walks up from `app.getAppPath()` looking for
 *      exactly that directory and checks the start directory first — planting
 *      the marker makes the sandbox win before the walk can climb out.
 *   2. **A pinned environment.** `env.ts` is the engine's only reader of
 *      `process.env`, and the values it returns decide whether the engine
 *      builds a seeded `MarketSimulator` or a live `AlpacaClient`. The capture
 *      forces the former and removes broker credentials, then restores the
 *      operator's environment exactly — including leaving unset variables
 *      unset.
 *   3. **A closed network with an audit trail.** This one is not theoretical.
 *      A spike run of the real engine under this harness logged
 *      `edgar poll failed — TypeError: fetch failed`: `EdgarService.start()`
 *      arms a 10-second timer, and since the virtual clock advances by the
 *      full replay duration, that timer fires on any tape longer than ten
 *      seconds and reaches for `https://www.sec.gov`. It failed only because
 *      that machine had no route at that moment. On a connected machine the
 *      poll would have injected live SEC filings — wall-clock dependent and
 *      unreproducible — into the captured decision stream. Blocking `fetch`
 *      converts an accident of connectivity into a stated property, and the
 *      recorded attempt list is what lets the capture *attest* that nothing
 *      external was consulted.
 *
 * Nothing here imports the engine, electron, or sqlite: the sandbox is plain
 * Node so it stays unit-testable on its own.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Fixed environment the oracle runs under. These values are part of the golden
 * contract: changing one changes captured bytes and therefore requires the
 * RS-1.3 regeneration procedure, not a silent edit.
 */
export const ORACLE_ENV = {
  /** Seeds `MarketSimulator`'s RNG. The simulator is suspended during replay,
   *  but it is constructed and briefly live during boot, so its seed is still
   *  part of the run's initial conditions. */
  rngSeed: 20260725,
  /** Quietest level the logger accepts, so a capture does not spray the CI log.
   *  Log output is Oracle L3 and is not part of the compared stream. */
  logLevel: 'error',
} as const

/** An isolated scratch tree standing in for the operator's application data. */
export interface OracleSandbox {
  /** Root of the scratch tree. Also the resolved vault root during a capture. */
  readonly root: string
  /** Directory for an electron `app.getPath(name)` lookup, created on demand. */
  path(name: string): string
  /** Removes the tree. Safe to call more than once. */
  dispose(): void
}

/**
 * Creates a scratch tree under the OS temp directory.
 *
 * Each call gets a distinct root (`mkdtemp`), so two captures — including the
 * two halves of the double-run determinism proof — cannot see each other's
 * database, kill-switch file, or vault notes.
 */
export function createSandbox(): OracleSandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-oracle-'))
  // Vault marker: see the module header. Created eagerly so the very first
  // `resolveVaultRoot()` call — which happens inside `engine.initialize()` —
  // already finds it.
  fs.mkdirSync(path.join(root, '.obsidian'), { recursive: true })
  let disposed = false
  return {
    root,
    path(name: string): string {
      const p = path.join(root, name)
      fs.mkdirSync(p, { recursive: true })
      return p
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      // Best-effort. On Windows a still-open sqlite handle makes `rmSync`
      // fail with EPERM, and a capture that already produced its golden must
      // not be failed by a cleanup race — the tree is under the OS temp
      // directory and is reclaimed regardless. Callers that care about
      // releasing the file (the capture does) call `closeDB()` first.
      try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }) }
      catch { /* temp tree; the OS owns it from here */ }
    },
  }
}

/** A reversible mutation of `process.env`. */
export interface EnvPin {
  /** Restores every touched variable to its prior state. */
  restore(): void
}

/** Variables the capture owns for the duration of a run. */
const PINNED_KEYS = [
  'SATEX_USE_SIMULATOR',
  'SATEX_RNG_SEED',
  'SATEX_LOG_LEVEL',
  'ALPACA_KEY_ID',
  'ALPACA_SECRET_KEY',
  'ALPACA_BASE_URL',
  'ALPACA_DATA_URL',
  'ALPACA_FEED',
] as const

/**
 * Pins the environment the engine boots under and returns the undo.
 *
 * Credentials are *deleted* rather than blanked: `initialize()` selects its
 * market source with `!env.useSimulator && !!keyId && !!secretKey`, and a
 * stray key on the operator's shell would otherwise put a live broker socket
 * in the middle of an oracle run.
 */
export function pinEnv(opts?: { rngSeed?: number }): EnvPin {
  const prior = new Map<string, string | undefined>()
  for (const key of PINNED_KEYS) prior.set(key, process.env[key])

  for (const key of PINNED_KEYS) delete process.env[key]
  process.env['SATEX_USE_SIMULATOR'] = 'true'
  process.env['SATEX_RNG_SEED'] = String(opts?.rngSeed ?? ORACLE_ENV.rngSeed)
  process.env['SATEX_LOG_LEVEL'] = ORACLE_ENV.logLevel

  return {
    restore(): void {
      for (const [key, value] of prior) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    },
  }
}

/** A closed network, with the list of what tried to leave. */
export interface NetworkBlock {
  /** Request targets that were refused, in call order. */
  readonly attempts: readonly string[]
  /** Reinstalls the original `fetch`. */
  restore(): void
}

/** Best-effort readable target for a `fetch` first argument. */
function describeTarget(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  if (typeof input === 'object' && input !== null && 'url' in input) {
    return String((input as { url: unknown }).url)
  }
  return String(input)
}

/**
 * Replaces `globalThis.fetch` with one that refuses and records.
 *
 * Refusing is deliberate rather than returning a canned response: a stubbed
 * 200 would make the engine believe it had fresh SEC or broker data and route
 * that fiction into the decision stream. A rejection exercises the same error
 * path the engine already handles when the operator is offline, which is a
 * state the engine is built to survive.
 */
export function blockNetwork(): NetworkBlock {
  const original = globalThis.fetch
  const attempts: string[] = []
  globalThis.fetch = ((input: unknown): Promise<never> => {
    const target = describeTarget(input)
    attempts.push(target)
    return Promise.reject(new Error(`oracle sandbox: network is closed during golden capture (blocked ${target})`))
  }) as typeof globalThis.fetch
  return {
    attempts,
    restore(): void { globalThis.fetch = original },
  }
}
