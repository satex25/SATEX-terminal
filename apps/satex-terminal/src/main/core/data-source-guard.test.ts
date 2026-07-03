import { describe, it, expect } from 'vitest'
import { evaluateDataSourceSwitch } from './data-source-guard'

const base = { current: 'simulator', target: 'live', replayActive: false, realCapitalArmed: false, paperCredsPresent: true } as const

describe('evaluateDataSourceSwitch — feed-switch interlocks', () => {
  it('allows a valid sim→live switch when paper creds exist', () => {
    expect(evaluateDataSourceSwitch({ ...base })).toEqual({ ok: true })
  })
  it('no-ops when already on the target', () => {
    expect(evaluateDataSourceSwitch({ ...base, target: 'simulator' })).toEqual({ ok: true, noop: true })
  })
  it('refuses while replay is active', () => {
    const r = evaluateDataSourceSwitch({ ...base, replayActive: true })
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/replay/i)
  })
  it('refuses while real-capital is armed (paper-safe interlock)', () => {
    const r = evaluateDataSourceSwitch({ ...base, realCapitalArmed: true })
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/real-capital|LIVE/i)
  })
  it('refuses sim→live when paper creds are absent', () => {
    const r = evaluateDataSourceSwitch({ ...base, paperCredsPresent: false })
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/keys|Settings/i)
  })
  it('allows live→sim even with no creds (no creds needed to return to sim)', () => {
    expect(evaluateDataSourceSwitch({ current: 'live', target: 'simulator', replayActive: false, realCapitalArmed: false, paperCredsPresent: false })).toEqual({ ok: true })
  })
  it('replay interlock takes precedence over a missing-creds refusal', () => {
    const r = evaluateDataSourceSwitch({ ...base, replayActive: true, paperCredsPresent: false })
    expect(r.reason).toMatch(/replay/i)
  })
})
