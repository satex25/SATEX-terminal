import { describe, it, expect } from 'vitest'
import type { CalibrationSnapshot, SelfEvalStatus } from '@shared/types'
import {
  readConviction, readSelfAudit, composeDiscipline,
  fmtMultiplier, fmtRelTime, fmtBrier,
  type ConvictionRead, type SelfAuditRead,
} from './discipline'

// ── fixtures ────────────────────────────────────────────────────────────────

function calib(over: Partial<CalibrationSnapshot> = {}): CalibrationSnapshot {
  return {
    samples: 50, minSamples: 30, brierScore: 0.12, buckets: [],
    multiplier: 1.0, computedAt: 0, ...over,
  }
}

function selfEval(over: Partial<SelfEvalStatus> = {}): SelfEvalStatus {
  return { enabled: true, running: false, lastRun: null, ...over }
}

function lastRun(over: Partial<NonNullable<SelfEvalStatus['lastRun']>> = {}) {
  return {
    finishedAt: 0, evaluated: 12, skipped: 0, baselined: 3,
    regressions: 0, reportFilename: 'self-eval-2026-07-13.md', ...over,
  }
}

const NOW = 1_700_000_000_000
const HOUR = 3_600_000

// ── readConviction ──────────────────────────────────────────────────────────

describe('readConviction', () => {
  it('null snapshot → NO DATA, unproven, never throws', () => {
    const r = readConviction(null)
    expect(r.label).toBe('NO DATA')
    expect(r.tone).toBe('mute')
    expect(r.armed).toBe(false)
    expect(r.multiplier).toBeNull()
    expect(r.samples).toBe(0)
  })

  it('zero samples → NO DATA (a cold-boot terminal renders, not crashes)', () => {
    const r = readConviction(calib({ samples: 0, brierScore: null }))
    expect(r.label).toBe('NO DATA')
    expect(r.armed).toBe(false)
  })

  it('below minSamples → WARMUP, multiplier withheld until the sample is real', () => {
    const r = readConviction(calib({ samples: 18, minSamples: 30, multiplier: 1 }))
    expect(r.label).toBe('WARMUP')
    expect(r.tone).toBe('mute')
    expect(r.armed).toBe(false)
    expect(r.multiplier).toBeNull()
    expect(r.detail).toContain('18/30')
  })

  it('multiplier at/above 0.97 → CALIBRATED (positive)', () => {
    expect(readConviction(calib({ multiplier: 1.0 })).label).toBe('CALIBRATED')
    expect(readConviction(calib({ multiplier: 0.97 })).label).toBe('CALIBRATED')
    expect(readConviction(calib({ multiplier: 1.0 })).tone).toBe('pos')
    expect(readConviction(calib({ multiplier: 1.0 })).armed).toBe(true)
  })

  it('multiplier in [0.75, 0.97) → TEMPERED (warn), shows the scale factor', () => {
    const r = readConviction(calib({ multiplier: 0.85 }))
    expect(r.label).toBe('TEMPERED')
    expect(r.tone).toBe('warn')
    expect(r.detail).toContain('×0.85')
    expect(readConviction(calib({ multiplier: 0.75 })).label).toBe('TEMPERED')
  })

  it('multiplier below 0.75 → OVERCONFIDENT (negative) — the cardinal sin', () => {
    const r = readConviction(calib({ multiplier: 0.6 }))
    expect(r.label).toBe('OVERCONFIDENT')
    expect(r.tone).toBe('neg')
    expect(r.detail).toContain('×0.60')
    expect(readConviction(calib({ multiplier: 0.74 })).label).toBe('OVERCONFIDENT')
  })

  it('never scales up: a system winning more than it claims stays CALIBRATED', () => {
    // calibration.ts caps the multiplier at 1.0; conviction must honor that.
    expect(readConviction(calib({ multiplier: 1.0 })).label).toBe('CALIBRATED')
  })
})

// ── readSelfAudit ───────────────────────────────────────────────────────────

describe('readSelfAudit', () => {
  it('null or disabled → DISABLED (warn)', () => {
    expect(readSelfAudit(null, NOW).label).toBe('DISABLED')
    expect(readSelfAudit(selfEval({ enabled: false }), NOW).label).toBe('DISABLED')
    expect(readSelfAudit(null, NOW).tone).toBe('warn')
  })

  it('enabled + running → RUNNING', () => {
    expect(readSelfAudit(selfEval({ running: true }), NOW).label).toBe('RUNNING')
  })

  it('enabled but never completed → PENDING', () => {
    expect(readSelfAudit(selfEval({ lastRun: null }), NOW).label).toBe('PENDING')
  })

  it('fresh clean run → GRADED (positive) with counts + relative age', () => {
    const r = readSelfAudit(selfEval({ lastRun: lastRun({ finishedAt: NOW - HOUR, evaluated: 12, regressions: 0 }) }), NOW)
    expect(r.label).toBe('GRADED')
    expect(r.tone).toBe('pos')
    expect(r.regressions).toBe(0)
    expect(r.detail).toContain('12 strategies')
    expect(r.detail).toContain('1h ago')
    expect(r.ageMs).toBe(HOUR)
  })

  it('regressions caught → FLAGGED (warn)', () => {
    const r = readSelfAudit(selfEval({ lastRun: lastRun({ finishedAt: NOW - HOUR, regressions: 2 }) }), NOW)
    expect(r.label).toBe('FLAGGED')
    expect(r.tone).toBe('warn')
    expect(r.detail).toContain('2 regressions')
  })

  it('overdue run → STALE (warn)', () => {
    const r = readSelfAudit(selfEval({ lastRun: lastRun({ finishedAt: NOW - 40 * HOUR, regressions: 0 }) }), NOW)
    expect(r.label).toBe('STALE')
    expect(r.tone).toBe('warn')
  })

  it('pluralizes strategy/regression correctly at n=1', () => {
    const r = readSelfAudit(selfEval({ lastRun: lastRun({ finishedAt: NOW - HOUR, evaluated: 1, regressions: 1 }) }), NOW)
    expect(r.detail).toContain('1 strategy')
    expect(r.detail).toContain('1 regression')
    expect(r.detail).not.toContain('1 strategies')
    expect(r.detail).not.toContain('1 regressions')
  })

  it('clock skew (finishedAt in the future) clamps age to zero, not negative', () => {
    const r = readSelfAudit(selfEval({ lastRun: lastRun({ finishedAt: NOW + HOUR }) }), NOW)
    expect(r.ageMs).toBe(0)
    expect(r.detail).toContain('just now')
  })
})

// ── composeDiscipline ───────────────────────────────────────────────────────

const CLEAR = { breaching: 0, watching: 0, passing: 6 }

function conv(label: string): ConvictionRead {
  return readConviction(
    label === 'CALIBRATED' ? calib({ multiplier: 1 })
    : label === 'TEMPERED' ? calib({ multiplier: 0.85 })
    : label === 'OVERCONFIDENT' ? calib({ multiplier: 0.6 })
    : label === 'WARMUP' ? calib({ samples: 5, minSamples: 30 })
    : null,
  )
}
function audit(label: string, now = NOW): SelfAuditRead {
  return readSelfAudit(
    label === 'GRADED' ? selfEval({ lastRun: lastRun({ finishedAt: now - HOUR }) })
    : label === 'STALE' ? selfEval({ lastRun: lastRun({ finishedAt: now - 40 * HOUR }) })
    : label === 'DISABLED' ? selfEval({ enabled: false })
    : label === 'PENDING' ? selfEval({ lastRun: null })
    : selfEval(),
    now,
  )
}

describe('composeDiscipline', () => {
  it('calibrated + fresh audit + clear risk → DISCIPLINED, high score', () => {
    const c = composeDiscipline(conv('CALIBRATED'), audit('GRADED'), CLEAR)
    expect(c.label).toBe('DISCIPLINED')
    expect(c.tone).toBe('pos')
    expect(c.score).toBeGreaterThanOrEqual(85)
    expect(c.factors).toHaveLength(3)
  })

  it('unproven but otherwise clean → CALIBRATING (mute), not falsely DISCIPLINED', () => {
    const c = composeDiscipline(conv('WARMUP'), audit('GRADED'), CLEAR)
    expect(c.label).toBe('CALIBRATING')
    expect(c.tone).toBe('mute')
    expect(c.score).toBeGreaterThanOrEqual(85)
  })

  it('overconfident + disabled audit + a breach → DEGRADED, low score', () => {
    const c = composeDiscipline(conv('OVERCONFIDENT'), audit('DISABLED'), { breaching: 1, watching: 0, passing: 5 })
    expect(c.label).toBe('DEGRADED')
    expect(c.tone).toBe('neg')
    expect(c.score).toBeLessThanOrEqual(40)
  })

  it('middling state → GUARDED (warn) in the 60s band', () => {
    const c = composeDiscipline(conv('TEMPERED'), audit('STALE'), { breaching: 0, watching: 1, passing: 5 })
    expect(c.label).toBe('GUARDED')
    expect(c.score).toBe(60)
  })

  it('omitting risk yields two factors and never references risk', () => {
    const c = composeDiscipline(conv('CALIBRATED'), audit('GRADED'))
    expect(c.factors).toHaveLength(2)
    expect(c.factors.some(f => f.label === 'Risk')).toBe(false)
  })

  it('score is clamped to [0,100]', () => {
    const c = composeDiscipline(conv('OVERCONFIDENT'), audit('DISABLED'), { breaching: 9, watching: 9, passing: 0 })
    expect(c.score).toBeGreaterThanOrEqual(0)
    expect(c.score).toBeLessThanOrEqual(100)
  })
})

// ── formatters ──────────────────────────────────────────────────────────────

describe('formatters', () => {
  it('fmtMultiplier', () => {
    expect(fmtMultiplier(null)).toBe('—')
    expect(fmtMultiplier(1)).toBe('×1.00')
    expect(fmtMultiplier(0.618)).toBe('×0.62')
    expect(fmtMultiplier(NaN)).toBe('—')
  })

  it('fmtRelTime', () => {
    expect(fmtRelTime(null)).toBe('never')
    expect(fmtRelTime(-5)).toBe('never')
    expect(fmtRelTime(59_000)).toBe('just now')
    expect(fmtRelTime(60_000)).toBe('1m ago')
    expect(fmtRelTime(90 * 60_000)).toBe('1h ago')
    expect(fmtRelTime(25 * HOUR)).toBe('1d ago')
  })

  it('fmtBrier', () => {
    expect(fmtBrier(null)).toBe('—')
    expect(fmtBrier(0.1234)).toBe('0.123')
    expect(fmtBrier(NaN)).toBe('—')
  })
})
