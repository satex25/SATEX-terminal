/**
 * SATEX — Tape integrity manifest (S1-10).
 *
 * Pure helper. The `TickRecorder.stop()` path (and historical-day importer's
 * post-materialize hook) computes a manifest hash over the canonical
 * projection of (session_id, tick_count, first_ts, last_ts) and persists it
 * via `upsertTapeManifest`. ReplaySource recomputes the same hash from
 * `getTapeBounds(sessionId)` at construction time and compares.
 *
 * Why metadata only (not full-content):
 *   Per audit spec — "Tape header with hash of (session_id, tick_count,
 *   first_ts, last_ts); replay verifies on open and on close." The intent is
 *   detecting wholesale tape drift (rows added/removed, session-id collision,
 *   partial-write corruption) — NOT cryptographic content authentication. A
 *   full SHA over millions of tick rows would be expensive enough to nudge
 *   us toward "only run on close" which defeats the open-time check.
 *
 *   This is integrity for reproducibility, not authentication against an
 *   adversary. If we ever need the latter, swap to an HMAC over a streaming
 *   checksum maintained incrementally during recording.
 *
 * Canonical projection notes:
 *   • The order of fields in `serialize` is locked — never reorder, or every
 *     existing tape on every existing user's disk would fail verification on
 *     the next open.
 *   • Field values are coerced to their canonical string form (no trailing
 *     `.0`, no scientific notation) so a Node 18→20 toString shift can't
 *     break hashes silently.
 *   • Empty / zero-count tapes are special-cased: we don't seal a manifest
 *     for them (no rows = nothing to verify). ReplaySource throws on empty
 *     tape construction anyway.
 */
import { createHash } from 'node:crypto'
import type { TapeManifest } from '@shared/types'

export interface ManifestInputs {
  sessionId: string
  tickCount: number
  firstTs:   number
  lastTs:    number
}

/** Serialize the four manifest inputs to a single canonical string. Exported
 *  so the unit test can pin the wire format. */
export function serializeManifestInputs(m: ManifestInputs): string {
  // Pipe-delimited canonical projection. Pipes are not valid in any of the
  // four fields (sessionId is alphanumeric+underscore+hyphen; the three
  // numeric fields are integers). Newline-free so the serialized form fits
  // in a single line for log diffing.
  return [
    'satex:tape:v1',
    m.sessionId,
    String(Math.trunc(m.tickCount)),
    String(Math.trunc(m.firstTs)),
    String(Math.trunc(m.lastTs)),
  ].join('|')
}

/** Hex SHA-256 over the canonical projection. Deterministic, 64-char output. */
export function computeTapeManifestHash(m: ManifestInputs): string {
  return createHash('sha256').update(serializeManifestInputs(m)).digest('hex')
}

/** Verdict from comparing a stored manifest against current bounds. */
export type ManifestVerdict =
  | { status: 'ok';          manifest: TapeManifest }
  | { status: 'no-manifest'; reason: 'never sealed' | 'empty tape' }
  | { status: 'mismatch';    expected: TapeManifest; observed: ManifestInputs; reason: string }

/**
 * Compare stored manifest against current bounds. Pure — no I/O.
 *
 * `mismatch` distinguishes between same-bounds-but-bad-hash (table or row
 * tampering invisible at the bounds level) and bound divergence (rows
 * added/removed). The caller picks the response (log error, hard-fail, etc.)
 * — this function just classifies.
 */
export function verifyTapeManifest(
  stored:   TapeManifest | null,
  observed: ManifestInputs,
): ManifestVerdict {
  if (stored === null) {
    return { status: 'no-manifest', reason: observed.tickCount === 0 ? 'empty tape' : 'never sealed' }
  }
  const expectedHash = computeTapeManifestHash({
    sessionId: stored.sessionId,
    tickCount: stored.tickCount,
    firstTs:   stored.firstTs,
    lastTs:    stored.lastTs,
  })
  if (expectedHash !== stored.manifestHash) {
    // Stored hash doesn't even match stored fields — manifest row itself was
    // corrupted (manual DB edit, swap with another session's row, etc.).
    return {
      status: 'mismatch',
      expected: stored,
      observed,
      reason: 'stored manifest hash does not match its own bound fields (manifest row corrupted)',
    }
  }
  const observedHash = computeTapeManifestHash(observed)
  if (observedHash !== stored.manifestHash) {
    return {
      status: 'mismatch',
      expected: stored,
      observed,
      reason: 'tape bounds drifted from sealed manifest (rows added, removed, or rewritten)',
    }
  }
  // All three of (stored.bounds, observed.bounds, stored.hash) agree.
  if (
    stored.tickCount !== observed.tickCount ||
    stored.firstTs   !== observed.firstTs   ||
    stored.lastTs    !== observed.lastTs
  ) {
    // This branch is theoretically unreachable given the hash matches, but
    // we keep it for defense-in-depth — if the hash function ever degrades
    // (collisions in our small input space), this catches it.
    return {
      status: 'mismatch',
      expected: stored,
      observed,
      reason: 'bound fields disagree despite hash match — possible hash collision',
    }
  }
  return { status: 'ok', manifest: stored }
}
