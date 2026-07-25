/**
 * SATEX-RS oracle — corpus→scratch-DB importer.
 *
 * RS-UP-1 / RS-1.3 slice 2. `ReplaySource` streams a tape out of the `ticks`
 * table, so a corpus JSONL file has to become database rows before the engine
 * can replay it. That is the easy half.
 *
 * The half that matters is refusing to look like it worked. `persistence.ts`
 * degrades to a `NullDB` when `better-sqlite3` will not load: `run()` reports
 * zero changes, `all()` returns `[]`, and nothing throws. Import under that
 * store and every surface reads healthy — `insertTickBatch` returns
 * `rows.length` whatever happened, so the importer would report 35,658 rows
 * written over a table containing none. `ReplaySource`'s constructor would
 * then throw "no tape rows", or worse, a future caller would capture a golden
 * of zero records and CI would compare two empty streams and call them equal.
 * That is the P-097 false-green class, and this module is where it is stopped.
 *
 * Three checks stand between an import and a capture, in increasing strength:
 *
 *   1. The database file carries a real `SQLite format 3` header.
 *   2. Bounds **read back out of the store** match the tape that went in — a
 *      behavioral check no no-op store can pass.
 *   3. When the corpus header carries the manifest hash sealed at recording
 *      time, the hash recomputed from the imported bounds must equal it. This
 *      is fidelity: the rows now in the table describe the same tape the
 *      recorder sealed, not a subset that survived a prune.
 *
 * Check 3 is the P-143 lesson made executable. The engine's 48-hour retention
 * prune had already eaten 49 of 50 tapes while their manifests went on
 * claiming 13.06 M ticks against 35,658 survivors.
 */
import type { SessionRecord, TapeManifest, TickTapeRow } from '@shared/types'
import { computeTapeManifestHash } from '../../src/main/services/tape-integrity'
import type { CorpusTape } from './corpus'
import { sqliteFileIsReal } from './electron-stub'

/** The slice of `persistence.ts` the importer needs. */
export interface PersistenceApi {
  insertSession(s: SessionRecord): void
  insertTickBatch(rows: TickTapeRow[]): number
  getTapeBounds(sessionId: string): { firstTs: number | null; lastTs: number | null; count: number }
  upsertTapeManifest(m: TapeManifest): void
  getTapeManifest(sessionId: string): TapeManifest | null
}

/** What an import produced, for the capture's provenance record. */
export interface ImportResult {
  readonly sessionId: string
  /** Rows handed to the store. */
  readonly rowsWritten: number
  /** Bounds read back *out* of the store afterwards. */
  readonly bounds: { firstTs: number | null; lastTs: number | null; count: number }
  /** Manifest hash sealed over the imported bounds. */
  readonly manifestHash: string
  /** True/false when the corpus carried a recorded hash; null when it did not. */
  readonly manifestMatchedRecording: boolean | null
}

/** Rows per INSERT transaction. Keeps a 35k-row tape off one giant statement. */
const BATCH_SIZE = 5_000

/**
 * Imports a validated corpus tape into the sandbox database.
 *
 * `dbFile` is the path `persistence.ts` will have opened
 * (`userData/satex.db`); it is passed in rather than derived so the caller
 * stays the single owner of sandbox layout.
 */
export function importCorpusTape(
  tape: CorpusTape,
  db: PersistenceApi,
  opts: { dbFile: string },
): ImportResult {
  const { header, rows } = tape
  const sessionId = header.sessionId

  // A session row must exist first: `listReplayableSessions` INNER JOINs
  // sessions against ticks, so tape rows without one are invisible to every
  // replay-selection surface.
  db.insertSession({
    id: sessionId,
    startedAt: header.sessionRow.startedAt,
    endedAt: header.sessionRow.endedAt,
    startingEquity: header.sessionRow.startingEquity,
    endingEquity: header.sessionRow.endingEquity,
    peakEquity: header.sessionRow.startingEquity,
    troughEquity: header.sessionRow.startingEquity,
    realizedPnl: header.sessionRow.realizedPnl,
    tradeCount: header.sessionRow.tradeCount,
  })

  let rowsWritten = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch: TickTapeRow[] = rows.slice(i, i + BATCH_SIZE).map(r => ({
      sessionId,
      ts: r.ts,
      symbol: r.symbol,
      last: r.last,
      bid: r.bid,
      ask: r.ask,
      volume: r.volume,
      vwap: r.vwap,
    }))
    rowsWritten += db.insertTickBatch(batch)
  }

  // ── Check 1: the store is backed by a real file ───────────────────────────
  // Deliberately after the first writes: the file does not exist until
  // `openDB()` runs, and `openDB()` is lazy.
  if (!sqliteFileIsReal(opts.dbFile)) {
    throw new Error(
      `oracle importer: ${opts.dbFile} is not a SQLite database after import — ` +
      'better-sqlite3 did not load and persistence degraded to its no-op store (P-097 class)',
    )
  }

  // ── Check 2: what went in reads back out ──────────────────────────────────
  const bounds = db.getTapeBounds(sessionId)
  if (bounds.count !== rows.length || bounds.firstTs !== header.firstTs || bounds.lastTs !== header.lastTs) {
    throw new Error(
      `oracle importer: wrote ${rows.length} rows spanning ${header.firstTs}..${header.lastTs} ` +
      `but the store read back count=${bounds.count} first=${String(bounds.firstTs)} last=${String(bounds.lastTs)} — ` +
      'the write did not land (NullDB / no-op store, P-097 class)',
    )
  }

  // ── Check 3: fidelity against the seal the recorder wrote ─────────────────
  const manifestHash = computeTapeManifestHash({
    sessionId,
    tickCount: bounds.count,
    firstTs: header.firstTs,
    lastTs: header.lastTs,
  })
  let manifestMatchedRecording: boolean | null = null
  const recorded = header.liveTapeManifest
  if (recorded) {
    manifestMatchedRecording = recorded.manifestHash === manifestHash
    if (!manifestMatchedRecording) {
      throw new Error(
        `oracle importer: manifest mismatch — imported tape hashes to ${manifestHash} but the ` +
        `corpus records manifest hash ${recorded.manifestHash}; the rows in the database are not the tape that was sealed ` +
        '(rows lost or rewritten between recording and export; cf. the P-143 retention prune)',
      )
    }
  }

  // Seal against the imported bounds so `ReplaySource`'s open-time check
  // returns `ok` rather than warning `no-manifest` — one less non-deterministic
  // log line and one more verified precondition.
  db.upsertTapeManifest({
    sessionId,
    manifestHash,
    tickCount: bounds.count,
    firstTs: header.firstTs,
    lastTs: header.lastTs,
    // Fixed rather than `Date.now()`: a wall-clock value here would be a
    // nondeterministic byte inside a run the whole point of which is
    // reproducibility. Anchored to the tape's own start.
    sealedAt: header.lastTs,
  })

  return { sessionId, rowsWritten, bounds, manifestHash, manifestMatchedRecording }
}
