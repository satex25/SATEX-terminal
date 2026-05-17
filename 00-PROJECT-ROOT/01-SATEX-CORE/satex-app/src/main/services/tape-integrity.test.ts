/**
 * S1-10 — Tape integrity manifest tests.
 *
 * Covers the pure layer of the integrity check: hash determinism, sensitivity
 * to each input field, and the verdict tree. Persistence I/O is integration-
 * tested separately (would require an in-memory SQLite harness this codebase
 * doesn't have).
 */
import { describe, it, expect } from 'vitest'
import {
  computeTapeManifestHash,
  serializeManifestInputs,
  verifyTapeManifest,
} from './tape-integrity'
import type { TapeManifest } from '@shared/types'

const sample = {
  sessionId: 'sess_abc123',
  tickCount: 9_999,
  firstTs:   1_700_000_000_000,
  lastTs:    1_700_000_003_600,
}

describe('serializeManifestInputs', () => {
  it('pins the canonical wire format — version prefix + 4 fields, pipe-joined', () => {
    expect(serializeManifestInputs(sample)).toBe(
      'satex:tape:v1|sess_abc123|9999|1700000000000|1700000003600'
    )
  })

  it('truncates non-integer numeric inputs (defensive — no caller should pass floats)', () => {
    const out = serializeManifestInputs({
      sessionId: 'x',
      tickCount: 1.7,
      firstTs:   100.9,
      lastTs:    200.4,
    })
    expect(out).toBe('satex:tape:v1|x|1|100|200')
  })
})

describe('computeTapeManifestHash', () => {
  it('is deterministic', () => {
    const a = computeTapeManifestHash(sample)
    const b = computeTapeManifestHash(sample)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes on any field flip', () => {
    const base = computeTapeManifestHash(sample)
    expect(computeTapeManifestHash({ ...sample, sessionId: 'sess_abc124' })).not.toBe(base)
    expect(computeTapeManifestHash({ ...sample, tickCount: 10_000 })).not.toBe(base)
    expect(computeTapeManifestHash({ ...sample, firstTs:   sample.firstTs + 1 })).not.toBe(base)
    expect(computeTapeManifestHash({ ...sample, lastTs:    sample.lastTs  - 1 })).not.toBe(base)
  })

  it('does not collide between count=0 firstTs=0 lastTs=0 and a real empty tape', () => {
    // Realistic edge case: tape with one zero-ts tick vs. fully empty tape.
    const empty = computeTapeManifestHash({ sessionId: 's', tickCount: 0, firstTs: 0, lastTs: 0 })
    const single = computeTapeManifestHash({ sessionId: 's', tickCount: 1, firstTs: 0, lastTs: 0 })
    expect(empty).not.toBe(single)
  })
})

describe('verifyTapeManifest', () => {
  function makeManifest(extra: Partial<TapeManifest> = {}): TapeManifest {
    const base = { ...sample, sealedAt: 1_700_000_010_000 }
    return {
      ...base,
      manifestHash: computeTapeManifestHash(base),
      ...extra,
    }
  }

  it('returns ok when stored manifest matches observed bounds', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, sample)
    expect(verdict.status).toBe('ok')
    if (verdict.status === 'ok') expect(verdict.manifest).toBe(stored)
  })

  it('returns no-manifest when stored is null and tape is non-empty (pre-S1-10 tape)', () => {
    const verdict = verifyTapeManifest(null, sample)
    expect(verdict.status).toBe('no-manifest')
    if (verdict.status === 'no-manifest') expect(verdict.reason).toBe('never sealed')
  })

  it('returns no-manifest with empty-tape reason when tape is genuinely empty', () => {
    const verdict = verifyTapeManifest(null, { ...sample, tickCount: 0 })
    expect(verdict.status).toBe('no-manifest')
    if (verdict.status === 'no-manifest') expect(verdict.reason).toBe('empty tape')
  })

  it('returns mismatch when tickCount drifted', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, { ...sample, tickCount: sample.tickCount + 1 })
    expect(verdict.status).toBe('mismatch')
    if (verdict.status === 'mismatch') {
      expect(verdict.reason).toContain('drifted')
      expect(verdict.observed.tickCount).toBe(sample.tickCount + 1)
      expect(verdict.expected.tickCount).toBe(sample.tickCount)
    }
  })

  it('returns mismatch when firstTs drifted', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, { ...sample, firstTs: sample.firstTs + 1000 })
    expect(verdict.status).toBe('mismatch')
  })

  it('returns mismatch when lastTs drifted', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, { ...sample, lastTs: sample.lastTs + 1000 })
    expect(verdict.status).toBe('mismatch')
  })

  it('detects a corrupted manifest row (hash field rewritten to a wrong value)', () => {
    const stored: TapeManifest = {
      ...sample,
      sealedAt:     1_700_000_010_000,
      manifestHash: '0'.repeat(64), // attacker-rewritten hash
    }
    const verdict = verifyTapeManifest(stored, sample)
    expect(verdict.status).toBe('mismatch')
    if (verdict.status === 'mismatch') {
      expect(verdict.reason).toContain('manifest row corrupted')
    }
  })

  it('detects a session-id swap (manifest row swapped between two sessions)', () => {
    // Stored row claims to be for sess_X but was secretly moved to sess_Y.
    // Verifier is called with the same observed sessionId as stored, so this
    // is detected at the stored-self-consistency check (stored.sessionId
    // contributes to the canonical hash).
    const baseInputs = { sessionId: 'sess_X', tickCount: 5, firstTs: 1000, lastTs: 5000 }
    const stored: TapeManifest = {
      ...baseInputs,
      sessionId: 'sess_Y', // swap visible field
      manifestHash: computeTapeManifestHash(baseInputs), // hash still encodes sess_X
      sealedAt: 0,
    }
    const verdict = verifyTapeManifest(stored, { ...baseInputs, sessionId: 'sess_Y' })
    expect(verdict.status).toBe('mismatch')
  })
})
