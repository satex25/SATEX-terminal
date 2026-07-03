/**
 * SATEX — Workspace state persistence tests (P-059).
 *
 * Round-trips `WorkspaceStateService` through a real tmpdir (the
 * subsecond-prefs.test.ts / kill-switch-store.test.ts pattern). Pins the
 * sanitize() contracts the boot path depends on — this service decides what the
 * operator sees at app open:
 *   • No file → DEFAULT_WORKSPACE_STATE (Quad / NVDA·SPY·ES·BTC), file NOT created.
 *   • quadSymbols: uppercase-normalized, UNIVERSE-filtered, deduped, padded/trimmed
 *     to exactly 4 — a removed-from-codebase ticker can't break the Quad charts.
 *   • chartSymbol: uppercase + UNIVERSE fallback.
 *   • landingWorkspace: the P-048 ADDITIVE field — a record written before the
 *     field existed hydrates to the default without a version bump (tolerant
 *     hydrate contract, workspace-state.ts sanitize()).
 *   • Corruption recovery: no fence / bad JSON → defaults, never a throw.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_WORKSPACE_STATE, type WorkspaceState } from '@shared/types'
import { WorkspaceStateService } from './workspace-state'

let tmpdir: string
let settingsPath: string

beforeEach(() => {
  tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-workspace-state-'))
  settingsPath = path.join(tmpdir, 'Vault', 'Settings', 'workspace-state.md')
})

afterEach(() => {
  try { fs.rmSync(tmpdir, { recursive: true, force: true }) } catch { /* OS reaps */ }
})

/** Hand-write a settings file the way an operator (or an older build) would. */
function writeRawFile(lines: string[]): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, lines.join('\n'), 'utf8')
}

function writeFenceJson(payload: unknown): void {
  writeRawFile(['# Hand-edited test', '', '```json', JSON.stringify(payload, null, 2), '```', ''])
}

describe('WorkspaceStateService — empty state', () => {
  it('returns the defaults when no file exists and does NOT create the file', () => {
    const svc = new WorkspaceStateService(tmpdir)
    expect(svc.get()).toEqual(DEFAULT_WORKSPACE_STATE)
    expect(fs.existsSync(settingsPath)).toBe(false)
  })

  it('the no-file default carries a defensive COPY of quadSymbols', () => {
    const svc = new WorkspaceStateService(tmpdir)
    // Mutating the returned state must never corrupt the shared module-level
    // default (readFromDisk spreads + copies the array for exactly this reason).
    expect(svc.get().quadSymbols).not.toBe(DEFAULT_WORKSPACE_STATE.quadSymbols)
  })

  it('the no-file default ALSO carries a defensive COPY of collapsedRails (P-061 aliasing class)', () => {
    // Same lesson as P-061 (indicator-settings.ts): a shallow spread of the
    // module-level default would alias the SAME empty array into every
    // returned state, so mutating one caller's result could corrupt the
    // shared DEFAULT_WORKSPACE_STATE.collapsedRails for every future reader.
    const svc = new WorkspaceStateService(tmpdir)
    expect(svc.get().collapsedRails).not.toBe(DEFAULT_WORKSPACE_STATE.collapsedRails)
    expect(svc.get().collapsedRails).toEqual(DEFAULT_WORKSPACE_STATE.collapsedRails)
  })
})

describe('WorkspaceStateService — round-trip', () => {
  it('set() persists and a FRESH instance reads the same state back', () => {
    const next: WorkspaceState = {
      version: 1,
      workspace: 'Intel',
      quadSymbols: ['QQQ', 'SPY', 'ES', 'BTC'],
      chartSymbol: 'TSLA',
      landingWorkspace: 'Focus',
      collapsedRails: ['depth', 'logs'],
    }
    new WorkspaceStateService(tmpdir).set(next)

    const reader = new WorkspaceStateService(tmpdir)
    expect(reader.get()).toEqual(next)
  })

  it('set() echoes the sanitized state: symbols uppercased, junk dropped, quad padded to 4', () => {
    const svc = new WorkspaceStateService(tmpdir)
    const result = svc.set({
      version: 1,
      workspace: 'Trade',
      quadSymbols: ['qqq', 'ZZZZ', 'qqq'],
      chartSymbol: 'tsla',
      landingWorkspace: 'Trade',
      collapsedRails: ['risk'],
    })
    // QQQ survives (uppercased, deduped); ZZZZ is not in UNIVERSE; the pad
    // fills from the defaults in order, skipping already-present symbols.
    expect(result.quadSymbols).toEqual(['QQQ', 'NVDA', 'SPY', 'ES'])
    expect(result.chartSymbol).toBe('TSLA')

    const raw = fs.readFileSync(settingsPath, 'utf8')
    expect(raw).toContain('# SATEX — Workspace State')
    const fence = /```json\s*\n([\s\S]*?)\n```/.exec(raw)
    expect(fence).not.toBeNull()
    expect(JSON.parse(fence![1]!)).toEqual(result)
  })
})

describe('WorkspaceStateService — sanitize on load', () => {
  it('invalid workspace string falls back to the default, valid siblings preserved', () => {
    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, workspace: 'Cockpit', chartSymbol: 'TSLA' })
    const svc = new WorkspaceStateService(tmpdir)
    const s = svc.get()
    expect(s.workspace).toBe(DEFAULT_WORKSPACE_STATE.workspace)
    expect(s.chartSymbol).toBe('TSLA')
  })

  it('quadSymbols: lowercase normalized, non-UNIVERSE dropped, deduped, padded to exactly 4', () => {
    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, quadSymbols: ['qqq', 'ZZZZ', 'QQQ', 7] })
    const svc = new WorkspaceStateService(tmpdir)
    expect(svc.get().quadSymbols).toEqual(['QQQ', 'NVDA', 'SPY', 'ES'])
  })

  it('quadSymbols longer than 4 valid entries is trimmed to the first 4', () => {
    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, quadSymbols: ['QQQ', 'TSLA', 'AAPL', 'MSFT', 'SPY'] })
    const svc = new WorkspaceStateService(tmpdir)
    expect(svc.get().quadSymbols).toEqual(['QQQ', 'TSLA', 'AAPL', 'MSFT'])
  })

  it('non-array quadSymbols falls back to the full default quad', () => {
    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, quadSymbols: 'NVDA' })
    const svc = new WorkspaceStateService(tmpdir)
    expect(svc.get().quadSymbols).toEqual(DEFAULT_WORKSPACE_STATE.quadSymbols)
  })

  it('chartSymbol: lowercase valid uppercased; non-UNIVERSE falls back to default', () => {
    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, chartSymbol: 'qqq' })
    expect(new WorkspaceStateService(tmpdir).get().chartSymbol).toBe('QQQ')

    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, chartSymbol: 'ZZZZ' })
    expect(new WorkspaceStateService(tmpdir).get().chartSymbol).toBe(DEFAULT_WORKSPACE_STATE.chartSymbol)
  })

  it('a record written BEFORE landingWorkspace existed hydrates to the default (additive field)', () => {
    // Simulate the pre-P-048 on-disk shape: no landingWorkspace key at all.
    writeFenceJson({
      version: 1,
      workspace: 'Trade',
      quadSymbols: ['NVDA', 'SPY', 'ES', 'BTC'],
      chartSymbol: 'NVDA',
    })
    const s = new WorkspaceStateService(tmpdir).get()
    expect(s.landingWorkspace).toBe(DEFAULT_WORKSPACE_STATE.landingWorkspace)
    expect(s.workspace).toBe('Trade')
  })

  it('landingWorkspace: invalid value falls back; valid Intel is honored', () => {
    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, landingWorkspace: 'Nope' })
    expect(new WorkspaceStateService(tmpdir).get().landingWorkspace)
      .toBe(DEFAULT_WORKSPACE_STATE.landingWorkspace)

    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, landingWorkspace: 'Intel' })
    expect(new WorkspaceStateService(tmpdir).get().landingWorkspace).toBe('Intel')
  })

  it('a foreign version number is normalized to 1 on read', () => {
    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, version: 99 })
    expect(new WorkspaceStateService(tmpdir).get().version).toBe(1)
  })

  it('a record written BEFORE collapsedRails existed hydrates to an empty array (additive field)', () => {
    // Simulate the pre-Phase-D on-disk shape: no collapsedRails key at all.
    writeFenceJson({
      version: 1,
      workspace: 'Trade',
      quadSymbols: ['NVDA', 'SPY', 'ES', 'BTC'],
      chartSymbol: 'NVDA',
      landingWorkspace: 'Trade',
    })
    const s = new WorkspaceStateService(tmpdir).get()
    expect(s.collapsedRails).toEqual([])
    expect(s.workspace).toBe('Trade')
  })

  it('collapsedRails: unknown ids dropped, valid ids deduped, non-array falls back to empty', () => {
    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, collapsedRails: ['depth', 'not-a-rail', 'depth', 'health'] })
    expect(new WorkspaceStateService(tmpdir).get().collapsedRails).toEqual(['depth', 'health'])

    writeFenceJson({ ...DEFAULT_WORKSPACE_STATE, collapsedRails: 'watchlist' })
    expect(new WorkspaceStateService(tmpdir).get().collapsedRails).toEqual([])
  })
})

describe('WorkspaceStateService — corruption recovery', () => {
  it('file with no json fence yields the defaults without throwing', () => {
    writeRawFile(['# Not a workspace file', '', 'just prose'])
    expect(new WorkspaceStateService(tmpdir).get()).toEqual(DEFAULT_WORKSPACE_STATE)
  })

  it('corrupt JSON inside the fence yields the defaults without throwing', () => {
    writeRawFile(['```json', '{ definitely not json ]', '```'])
    expect(new WorkspaceStateService(tmpdir).get()).toEqual(DEFAULT_WORKSPACE_STATE)
  })
})
