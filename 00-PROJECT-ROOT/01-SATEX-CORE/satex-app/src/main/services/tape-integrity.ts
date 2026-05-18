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
  | { status: 'ok';           manifest: TapeManifest }
  | { status: 'ok-extended';  manifest: TapeManifest; extraTicks: number; extraSpanMs: number }
  | { status: 'no-manifest';  reason: 'never sealed' | 'empty tape' }
  | { status: 'mismatch';     expected: TapeManifest; observed: ManifestInputs; reason: string }

/**
 * Compare stored manifest against current bounds. Pure — no I/O.
 *
 * Three positive outcomes:
 *   • `ok`           — observed bounds match the stored manifest exactly. Either
 *                      the manifest was sealed at session-stop and nothing has
 *                      moved since, or a rolling seal happened to land at the
 *                      tape's current tail.
 *   • `ok-extended`  — the tape was legitimately appended after the stored
 *                      seal: same firstTs, tickCount grew, lastTs grew (or
 *                      stayed equal). This is the normal "crash-mid-session +
 *                      a few flushes between last reseal and crash" pattern
 *                      that the periodic-reseal work (2026-05-18) was designed
 *                      to recover from. Coverage of the integrity hash is
 *                      over [firstTs..stored.lastTs] only; the extra tail
 *                      (extraTicks, extraSpanMs) is reported but not hashed.
 *   • `mismatch`     — every other shape: firstTs drifted, tickCount shrank,
 *                      lastTs moved backward, stored hash doesn't match its
 *                      own bound fields, etc.
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
  // Stored row is self-consistent. Now classify observed-vs-stored shape.
  const sessionDrifted    = stored.sessionId !== observed.sessionId
  const startDrifted      = stored.firstTs   !== observed.firstTs
  const ticksShrank       = observed.tickCount < stored.tickCount
  const endMovedBack      = observed.lastTs   < stored.lastTs
  // Append-only invariant: tickCount strictly grows when new rows are inserted.
  // If tickCount is unchanged but lastTs changed (either direction), the only
  // explanation is that an existing row's timestamp was rewritten — corruption.
  const sameCountDifferentEnd = observed.tickCount === stored.tickCount
                             && observed.lastTs    !== stored.lastTs
  if (sessionDrifted || startDrifted || ticksShrank || endMovedBack || sameCountDifferentEnd) {
    return {
      status: 'mismatch',
      expected: stored,
      observed,
      reason: 'tape bounds drifted from sealed manifest (rows removed, start rewritten, last-ts moved backward, or row timestamp rewritten)',
    }
  }
  // Either an exact match (stop-time seal, or rolling seal that happens to be
  // at current tail) or an extension (rolling seal followed by N more flushes).
  const exactMatch = observed.tickCount === stored.tickCount
                  && observed.lastTs    === stored.lastTs
  if (exactMatch) {
    return { status: 'ok', manifest: stored }
  }
  return {
    status: 'ok-extended',
    manifest: stored,
    extraTicks:  observed.tickCount - stored.tickCount,
    extraSpanMs: observed.lastTs    - stored.lastTs,
  }
}
