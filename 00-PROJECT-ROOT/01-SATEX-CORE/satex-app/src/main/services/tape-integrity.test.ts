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

  // 2026-05-18 — periodic-reseal work narrowed the mismatch surface. Drift in
  // the forward direction (more rows, later lastTs) on an unchanged firstTs is
  // now `ok-extended`, not `mismatch`. See the `rolling-reseal recovery`
  // describe block below for the new positive cases. The mismatch path now
  // only fires when drift is incompatible with append-only appending.

  it('returns mismatch when firstTs drifted (start of tape rewritten)', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, { ...sample, firstTs: sample.firstTs + 1000 })
    expect(verdict.status).toBe('mismatch')
  })

  it('returns mismatch when tickCount is unchanged but lastTs grew (no-row drift, impossible append)', () => {
    const stored = makeManifest()
    // Same N ticks somehow span a longer window — only happens if the last
    // row's timestamp was rewritten, which is corruption regardless of intent.
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

describe('verifyTapeManifest — rolling-reseal recovery (2026-05-18)', () => {
  // Periodic reseal during recording means the manifest captured at any moment
  // may NOT cover every row currently on disk. A clean crash leaves the tape
  // extended past the last seal: same firstTs, more rows, lastTs grown. This
  // pattern is `ok-extended` — the prefix is hash-verified, the tail is
  // structurally consistent.

  function makeManifest(extra: Partial<TapeManifest> = {}): TapeManifest {
    const base = { ...sample, sealedAt: 1_700_000_010_000 }
    return {
      ...base,
      manifestHash: computeTapeManifestHash(base),
      ...extra,
    }
  }

  it('returns ok-extended when more rows appended after seal (firstTs locked, lastTs grew)', () => {
    const stored = makeManifest()
    const observed = {
      ...sample,
      tickCount: sample.tickCount + 250,    // ~5s of additional ticks before crash
      lastTs:    sample.lastTs    + 5_000,
    }
    const verdict = verifyTapeManifest(stored, observed)
    expect(verdict.status).toBe('ok-extended')
    if (verdict.status === 'ok-extended') {
      expect(verdict.extraTicks).toBe(250)
      expect(verdict.extraSpanMs).toBe(5_000)
      expect(verdict.manifest).toBe(stored)
    }
  })

  it('returns ok-extended when tickCount grew but lastTs is exactly equal (edge: same-ms append)', () => {
    const stored = makeManifest()
    const observed = { ...sample, tickCount: sample.tickCount + 1 } // lastTs unchanged
    const verdict = verifyTapeManifest(stored, observed)
    expect(verdict.status).toBe('ok-extended')
    if (verdict.status === 'ok-extended') {
      expect(verdict.extraTicks).toBe(1)
      expect(verdict.extraSpanMs).toBe(0)
    }
  })

  it('returns mismatch when firstTs drifted even if tickCount grew (start was rewritten)', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, {
      ...sample,
      firstTs:   sample.firstTs   + 100,   // start moved forward
      tickCount: sample.tickCount + 50,
      lastTs:    sample.lastTs    + 1_000,
    })
    expect(verdict.status).toBe('mismatch')
  })

  it('returns mismatch when tickCount shrank (rows removed)', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, { ...sample, tickCount: sample.tickCount - 1 })
    expect(verdict.status).toBe('mismatch')
  })

  it('returns mismatch when lastTs moved backward (newest rows removed)', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, { ...sample, lastTs: sample.lastTs - 1 })
    expect(verdict.status).toBe('mismatch')
  })

  it('exact match still returns ok (not ok-extended) — stop-time seal is the trivial case', () => {
    const stored = makeManifest()
    const verdict = verifyTapeManifest(stored, sample)
    expect(verdict.status).toBe('ok')
  })
})
