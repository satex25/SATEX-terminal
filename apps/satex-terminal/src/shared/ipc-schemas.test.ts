/**
 * IPC schema contract tests (P-056).
 *
 * First co-located coverage for `ipc-schemas.ts`, focused on the P-048 Intel
 * additions: `IntelLayoutSetReq` must stay `.strict()`, integer-bounded, and
 * capped at one placement per module (the P-056 bound — an over-long array is
 * structurally invalid because module ids are unique), and
 * `WorkspaceStateSetReq` must accept the additive `landingWorkspace` field
 * including the Intel tab. Wire contracts are load-bearing (Constitution 0.9:
 * IPC stays Zod-validated) — pin them so drift fails a gate, not a session.
 */
import { describe, it, expect } from 'vitest'
import { INTEL_MODULE_IDS, RAIL_IDS } from '@shared/types'
import { IntelLayoutSetReq, WorkspaceStateSetReq } from './ipc-schemas'

function fullValidLayout() {
  return INTEL_MODULE_IDS.map((id, i) => ({ id, x: 0, y: i * 2, w: 4, h: 2 }))
}

describe('IntelLayoutSetReq', () => {
  it('accepts a full valid layout (one placement per module)', () => {
    const res = IntelLayoutSetReq.safeParse(fullValidLayout())
    expect(res.success).toBe(true)
  })

  it('accepts an empty layout (renderer falls back to the curated default)', () => {
    expect(IntelLayoutSetReq.safeParse([]).success).toBe(true)
  })

  it('rejects more placements than modules exist (P-056 bound)', () => {
    const tooMany = [...fullValidLayout(), { id: INTEL_MODULE_IDS[0], x: 0, y: 99, w: 1, h: 1 }]
    expect(tooMany.length).toBe(INTEL_MODULE_IDS.length + 1)
    expect(IntelLayoutSetReq.safeParse(tooMany).success).toBe(false)
  })

  it('rejects an unknown module id', () => {
    const bad = [{ id: 'not-a-module', x: 0, y: 0, w: 2, h: 2 }]
    expect(IntelLayoutSetReq.safeParse(bad).success).toBe(false)
  })

  it('rejects extra keys (.strict() contract)', () => {
    const bad = [{ id: INTEL_MODULE_IDS[0], x: 0, y: 0, w: 2, h: 2, sneaky: true }]
    expect(IntelLayoutSetReq.safeParse(bad).success).toBe(false)
  })

  it('rejects fractional and negative geometry', () => {
    expect(IntelLayoutSetReq.safeParse([{ id: INTEL_MODULE_IDS[0], x: 0.5, y: 0, w: 2, h: 2 }]).success).toBe(false)
    expect(IntelLayoutSetReq.safeParse([{ id: INTEL_MODULE_IDS[0], x: -1, y: 0, w: 2, h: 2 }]).success).toBe(false)
    expect(IntelLayoutSetReq.safeParse([{ id: INTEL_MODULE_IDS[0], x: 0, y: 0, w: 0, h: 2 }]).success).toBe(false)
  })
})

describe('WorkspaceStateSetReq (P-048 landingWorkspace / Phase-D collapsedRails)', () => {
  const base = {
    version: 1,
    workspace: 'Trade',
    quadSymbols: ['AAPL', 'MSFT', 'TSLA', 'AMZN'],
    chartSymbol: 'NVDA',
    landingWorkspace: 'Trade',
    collapsedRails: [],
  }

  it('accepts Intel as a landing workspace', () => {
    expect(WorkspaceStateSetReq.safeParse({ ...base, landingWorkspace: 'Intel' }).success).toBe(true)
  })

  it('rejects an unknown landing workspace', () => {
    expect(WorkspaceStateSetReq.safeParse({ ...base, landingWorkspace: 'Lobby' }).success).toBe(false)
  })

  it('accepts a full set of known rail ids in collapsedRails', () => {
    expect(WorkspaceStateSetReq.safeParse({ ...base, collapsedRails: [...RAIL_IDS] }).success).toBe(true)
  })

  it('rejects an unknown rail id in collapsedRails', () => {
    expect(WorkspaceStateSetReq.safeParse({ ...base, collapsedRails: ['sidebar'] }).success).toBe(false)
  })

  it('rejects a collapsedRails array longer than the known rail set (bounded, cf. quadSymbols/IntelLayoutSetReq)', () => {
    const tooMany = [...RAIL_IDS, RAIL_IDS[0]]
    expect(WorkspaceStateSetReq.safeParse({ ...base, collapsedRails: tooMany }).success).toBe(false)
  })
})
