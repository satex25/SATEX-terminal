/**
 * SATEX — SQLite Persistence Layer
 * Uses better-sqlite3 (synchronous). Falls back to in-memory no-op if the
 * native module isn't compiled yet (dev bootstrap or CI).
 *
 * Schema:
 *   sessions   — trading session records
 *   orders     — full order history with request + fill metadata
 *   pnl        — periodic equity snapshots per session
 *   brain      — learned stop-loss / take-profit parameters
 *   watchlist  — user-configured symbol list
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type {
  Order, SessionRecord, PnlSnapshot, BrainParameter,
  Observation, PatternWeight, LearningCycle, MarketRegime,
  TickTapeRow, ReplayBookmark, ReplayableSession, TapeManifest,
  SubSecondCandle,
} from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('persistence')

interface DB {
  prepare(sql: string): Statement
  exec(sql: string): void
  close(): void
}
interface Statement {
  run(...args: unknown[]): { lastInsertRowid: number | bigint; changes: number }
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown[]
}

class NullDB implements DB {
  prepare(_sql: string): Statement {
    return {
      run: () => ({ lastInsertRowid: 0, changes: 0 }),
      get: () => undefined,
      all: () => [],
    }
  }
  exec(_sql: string): void {}
  close(): void {}
}

let _db: DB | null = null

function openDB(): DB {
  if (_db) return _db
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3') as new (p: string, opts?: object) => DB
    const dbPath = path.join(app.getPath('userData'), 'satex.db')
    _db = new BetterSqlite3(dbPath, { verbose: undefined })
    log.info('sqlite opened', { path: dbPath })
    migrate(_db)
    return _db
  } catch (err) {
    log.warn('better-sqlite3 unavailable — using in-memory no-op store', { err: String(err) })
    _db = new NullDB()
    return _db
  }
}

function migrate(db: DB): void {
  // PRAGMA auto_vacuum must be set BEFORE any CREATE TABLE to take effect on
  // a fresh DB. On an existing DB it's a silent no-op (SQLite ignores it
  // unless you also run a full VACUUM, which we deliberately don't do at
  // boot anymore). Net result: brand-new SATEX installs get incremental
  // vacuum from day one; legacy DBs keep auto_vacuum=NONE until a user
  // explicitly triggers a full VACUUM via the manual maintenance IPC.
  db.exec(`
    PRAGMA auto_vacuum=INCREMENTAL;
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS sessions (
      id              TEXT PRIMARY KEY,
      started_at      INTEGER NOT NULL,
      ended_at        INTEGER,
      starting_equity REAL NOT NULL,
      ending_equity   REAL,
      peak_equity     REAL NOT NULL DEFAULT 0,
      trough_equity   REAL NOT NULL DEFAULT 0,
      realized_pnl    REAL NOT NULL DEFAULT 0,
      trade_count     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id              TEXT PRIMARY KEY,
      session_id      TEXT,
      created_at      INTEGER NOT NULL,
      filled_at       INTEGER,
      status          TEXT NOT NULL,
      symbol          TEXT NOT NULL,
      side            TEXT NOT NULL,
      type            TEXT NOT NULL,
      quantity        REAL NOT NULL,
      limit_price     REAL,
      stop_loss       REAL,
      take_profit     REAL,
      fill_price      REAL,
      source          TEXT,
      rejection_reason TEXT,
      -- A4 — correlation id stamped at order creation. NULL only for rows
      -- predating A4; rowToOrder synthesizes "legacy-<id>" for those.
      trace_id        TEXT
    );

    CREATE TABLE IF NOT EXISTS pnl (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id      TEXT NOT NULL,
      timestamp       INTEGER NOT NULL,
      equity          REAL NOT NULL,
      cash            REAL NOT NULL,
      realized_pnl    REAL NOT NULL,
      unrealized_pnl  REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brain (
      key             TEXT NOT NULL,
      symbol          TEXT,
      value           REAL NOT NULL,
      sample_size     INTEGER NOT NULL DEFAULT 0,
      confidence      REAL NOT NULL DEFAULT 0,
      updated_at      INTEGER NOT NULL,
      PRIMARY KEY (key, symbol)
    );

    CREATE TABLE IF NOT EXISTS watchlist (
      position        INTEGER PRIMARY KEY,
      symbol          TEXT NOT NULL UNIQUE
    );

    -- Phase 8: continuous-observer tick-rate log. Append-only time series.
    -- NOT a brain table — Brain SGD is unaffected. This is independent intel.
    CREATE TABLE IF NOT EXISTS observations (
      ts              INTEGER NOT NULL,
      symbol          TEXT NOT NULL,
      last            REAL NOT NULL,
      mid             REAL NOT NULL,
      spread_bps      REAL NOT NULL,
      velocity_bps    REAL NOT NULL,
      ema9            REAL NOT NULL,
      ema21           REAL NOT NULL,
      ema50           REAL NOT NULL,
      rsi14           REAL NOT NULL,
      atr14           REAL NOT NULL,
      vwap            REAL NOT NULL,
      trend_strength  REAL NOT NULL,
      regime          TEXT NOT NULL,
      PRIMARY KEY (ts, symbol)
    );
    CREATE INDEX IF NOT EXISTS idx_obs_symbol_ts ON observations(symbol, ts);
    CREATE INDEX IF NOT EXISTS idx_obs_ts ON observations(ts);

    -- Phase 8: PatternLearner weights — entirely separate from brain table.
    -- Keyed by (feature, regime). The Brain table is never touched by this path.
    CREATE TABLE IF NOT EXISTS pattern_weights (
      feature         TEXT NOT NULL,
      regime          TEXT NOT NULL,
      weight          REAL NOT NULL,
      samples         INTEGER NOT NULL DEFAULT 0,
      updated_at      INTEGER NOT NULL,
      PRIMARY KEY (feature, regime)
    );

    -- Phase 8: audit log for every learning cycle (good and bad).
    CREATE TABLE IF NOT EXISTS learning_log (
      ts                  INTEGER PRIMARY KEY,
      observations_seen   INTEGER NOT NULL,
      weights_updated     INTEGER NOT NULL,
      avg_error           REAL NOT NULL,
      note                TEXT NOT NULL DEFAULT ''
    );

    -- 2026-06-10: Confidence-calibration outcomes (Brier / reliability loop).
    -- One row per closed trade that carried a stated entry confidence.
    -- Read back oldest-first into the CalibrationService rolling window.
    CREATE TABLE IF NOT EXISTS calibration_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          INTEGER NOT NULL,
      symbol      TEXT NOT NULL,
      confidence  REAL NOT NULL,
      win         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_calibration_ts ON calibration_log(ts DESC);

    -- Phase 9: Replay tape. Compressed quote snapshots, append-only.
    -- One row per (session, timestamp_ms, symbol). Recorder writes from live
    -- engine; ReplaySource streams back at controlled speed.
    CREATE TABLE IF NOT EXISTS ticks (
      session_id    TEXT NOT NULL,
      ts            INTEGER NOT NULL,
      symbol        TEXT NOT NULL,
      last          REAL NOT NULL,
      bid           REAL NOT NULL,
      ask           REAL NOT NULL,
      volume        REAL NOT NULL,
      vwap          REAL NOT NULL,
      PRIMARY KEY (session_id, ts, symbol)
    );
    CREATE INDEX IF NOT EXISTS idx_ticks_session_ts ON ticks(session_id, ts);

    -- Phase 9: User bookmarks on the replay scrubber. Independent of trades.
    CREATE TABLE IF NOT EXISTS replay_bookmarks (
      id            TEXT PRIMARY KEY,
      session_id    TEXT NOT NULL,
      ts            INTEGER NOT NULL,
      label         TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bookmarks_session_ts ON replay_bookmarks(session_id, ts);

    -- S1-10: Tape integrity manifest. One row per session, sealed when the
    -- recorder finalizes (or right after historical-day import materializes
    -- its synthetic tape). ReplaySource recomputes bounds + hash at open
    -- time and logs an error on mismatch. Sessions without a manifest open
    -- in "no-manifest" mode (warned but not blocked) so this rollout is
    -- backwards compatible with tapes recorded before the column existed.
    CREATE TABLE IF NOT EXISTS tape_manifest (
      session_id     TEXT PRIMARY KEY,
      manifest_hash  TEXT    NOT NULL,
      tick_count     INTEGER NOT NULL,
      first_ts       INTEGER NOT NULL,
      last_ts        INTEGER NOT NULL,
      sealed_at      INTEGER NOT NULL
    );

    -- A1 (v0.4.4): sub-second crypto candles. One row per sealed bucket.
    -- bucket_ms is 250 or 500 (no other values stored today; column kept open
    -- in case 100ms or 1000ms-but-tighter modes get enabled later). open_ms is
    -- the bucket-start in epoch ms; the close-time = open_ms + bucket_ms.
    -- Live-only — replay tapes do NOT include sub-second candles in v0.4.4.
    -- Retention is enforced application-side via trimSubSecondCandles (NOT a
    -- TRIGGER) so the trim batch can be coalesced with the rolling insert and
    -- a future maintenance VACUUM can reclaim the rows. UNIQUE on
    -- (symbol, bucket_ms, open_ms) lets us INSERT OR REPLACE idempotently on
    -- a re-seal of the same bucket without surfacing constraint errors.
    CREATE TABLE IF NOT EXISTS crypto_subsecond_candles (
      symbol     TEXT    NOT NULL,
      bucket_ms  INTEGER NOT NULL,
      open_ms    INTEGER NOT NULL,
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      PRIMARY KEY (symbol, bucket_ms, open_ms)
    );
    CREATE INDEX IF NOT EXISTS idx_subsec_sym_bucket_ts
      ON crypto_subsecond_candles(symbol, bucket_ms, open_ms DESC);
  `)

  // A4 — idempotent additive migration for orders.trace_id. The CREATE TABLE
  // IF NOT EXISTS above only takes effect on fresh installs; existing
  // databases need ALTER. SQLite ALTER ADD COLUMN throws "duplicate column
  // name" on the second run, which is the success signal — we swallow it.
  // ENOENT-on-table is impossible at this point (we just ran the CREATE).
  try {
    db.exec('ALTER TABLE orders ADD COLUMN trace_id TEXT')
  } catch (e) {
    const msg = String(e)
    if (!/duplicate column/i.test(msg)) {
      log.warn('orders.trace_id migration unexpected error', { err: msg })
    }
  }
  log.info('sqlite schema migrated')
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function insertSession(s: SessionRecord): void {
  const db = openDB()
  db.prepare(`
    INSERT OR REPLACE INTO sessions
      (id, started_at, ended_at, starting_equity, ending_equity, peak_equity, trough_equity, realized_pnl, trade_count)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(s.id, s.startedAt, s.endedAt, s.startingEquity, s.endingEquity, s.peakEquity, s.troughEquity, s.realizedPnl, s.tradeCount)
}

export function updateSession(id: string, patch: Partial<SessionRecord>): void {
  const db = openDB()
  if (patch.startingEquity !== undefined) db.prepare('UPDATE sessions SET starting_equity=? WHERE id=?').run(patch.startingEquity, id)
  if (patch.endedAt !== undefined)      db.prepare('UPDATE sessions SET ended_at=?      WHERE id=?').run(patch.endedAt, id)
  if (patch.endingEquity !== undefined) db.prepare('UPDATE sessions SET ending_equity=? WHERE id=?').run(patch.endingEquity, id)
  if (patch.peakEquity !== undefined)   db.prepare('UPDATE sessions SET peak_equity=?   WHERE id=?').run(patch.peakEquity, id)
  if (patch.troughEquity !== undefined) db.prepare('UPDATE sessions SET trough_equity=? WHERE id=?').run(patch.troughEquity, id)
  if (patch.realizedPnl !== undefined)  db.prepare('UPDATE sessions SET realized_pnl=?  WHERE id=?').run(patch.realizedPnl, id)
  if (patch.tradeCount !== undefined)   db.prepare('UPDATE sessions SET trade_count=?   WHERE id=?').run(patch.tradeCount, id)
}

export function listSessions(limit = 50): SessionRecord[] {
  return (openDB().prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>).map(rowToSession)
}

function rowToSession(r: Record<string, unknown>): SessionRecord {
  return {
    id: String(r['id']),
    startedAt: Number(r['started_at']),
    endedAt: r['ended_at'] != null ? Number(r['ended_at']) : null,
    startingEquity: Number(r['starting_equity']),
    endingEquity: r['ending_equity'] != null ? Number(r['ending_equity']) : null,
    peakEquity: Number(r['peak_equity']),
    troughEquity: Number(r['trough_equity']),
    realizedPnl: Number(r['realized_pnl']),
    tradeCount: Number(r['trade_count']),
  }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export function insertOrder(o: Order, sessionId: string): void {
  const r = o.request
  openDB().prepare(`
    INSERT OR REPLACE INTO orders
      (id, session_id, created_at, filled_at, status, symbol, side, type, quantity,
       limit_price, stop_loss, take_profit, fill_price, source, rejection_reason, trace_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    o.id, sessionId, o.createdAt, o.filledAt ?? null, o.status,
    r.symbol, r.side, r.type, r.quantity,
    r.limitPrice ?? null, r.stopLoss ?? null, r.takeProfit ?? null,
    o.fillPrice ?? null, r.source ?? null, o.rejectionReason ?? null, o.traceId
  )
}

export function listOrders(sessionId: string, limit = 200): Order[] {
  return (openDB().prepare('SELECT * FROM orders WHERE session_id=? ORDER BY created_at DESC LIMIT ?').all(sessionId, limit) as Array<Record<string, unknown>>).map(rowToOrder)
}

export function listAllOrders(limit = 500): Order[] {
  return (openDB().prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>).map(rowToOrder)
}

function rowToOrder(r: Record<string, unknown>): Order {
  const id = String(r['id'])
  return {
    id,
    // A4 — orders predating the trace_id column read as `legacy-<id>` so
    // every Order still has a stable identifier downstream code can rely on
    // without null-checking.
    traceId: r['trace_id'] != null ? String(r['trace_id']) : `legacy-${id}`,
    createdAt: Number(r['created_at']),
    filledAt: r['filled_at'] != null ? Number(r['filled_at']) : undefined,
    status: r['status'] as Order['status'],
    fillPrice: r['fill_price'] != null ? Number(r['fill_price']) : undefined,
    rejectionReason: r['rejection_reason'] != null ? String(r['rejection_reason']) : undefined,
    request: {
      symbol: String(r['symbol']),
      side: r['side'] as 'buy' | 'sell',
      type: r['type'] as 'market' | 'limit' | 'stop',
      quantity: Number(r['quantity']),
      limitPrice: r['limit_price'] != null ? Number(r['limit_price']) : undefined,
      stopLoss: r['stop_loss'] != null ? Number(r['stop_loss']) : undefined,
      takeProfit: r['take_profit'] != null ? Number(r['take_profit']) : undefined,
      source: r['source'] != null ? String(r['source']) : undefined,
    },
  }
}

// ─── PnL Snapshots ───────────────────────────────────────────────────────────

export function insertPnlSnapshot(snap: PnlSnapshot): void {
  openDB().prepare(`
    INSERT INTO pnl (session_id, timestamp, equity, cash, realized_pnl, unrealized_pnl)
    VALUES (?,?,?,?,?,?)
  `).run(snap.sessionId, snap.timestamp, snap.equity, snap.cash, snap.realizedPnl, snap.unrealizedPnl)
}

export function listPnlSnapshots(sessionId: string): PnlSnapshot[] {
  return (openDB().prepare('SELECT * FROM pnl WHERE session_id=? ORDER BY timestamp ASC').all(sessionId) as Array<Record<string, unknown>>).map(r => ({
    sessionId: String(r['session_id']),
    timestamp: Number(r['timestamp']),
    equity: Number(r['equity']),
    cash: Number(r['cash']),
    realizedPnl: Number(r['realized_pnl']),
    unrealizedPnl: Number(r['unrealized_pnl']),
  }))
}

// ─── Brain Parameters ────────────────────────────────────────────────────────

export function upsertBrainParam(p: BrainParameter): void {
  openDB().prepare(`
    INSERT OR REPLACE INTO brain (key, symbol, value, sample_size, confidence, updated_at)
    VALUES (?,?,?,?,?,?)
  `).run(p.key, p.symbol ?? null, p.value, p.sampleSize, p.confidence, p.updatedAt)
}

export function listBrainParams(): BrainParameter[] {
  return (openDB().prepare('SELECT * FROM brain ORDER BY key ASC').all() as Array<Record<string, unknown>>).map(r => ({
    key: String(r['key']),
    symbol: r['symbol'] != null ? String(r['symbol']) : null,
    value: Number(r['value']),
    sampleSize: Number(r['sample_size']),
    confidence: Number(r['confidence']),
    updatedAt: Number(r['updated_at']),
  }))
}

// ─── Confidence calibration (2026-06-10) ─────────────────────────────────────

export function insertCalibrationSample(s: { ts: number; symbol: string; confidence: number; win: boolean }): void {
  openDB().prepare(`
    INSERT INTO calibration_log (ts, symbol, confidence, win)
    VALUES (?,?,?,?)
  `).run(s.ts, s.symbol, s.confidence, s.win ? 1 : 0)
}

/** Keep calibration_log bounded (Observer-flood lesson): retain the newest
 *  `keep` rows, delete the rest. Returns rows deleted. */
export function pruneCalibrationLog(keep = 2_000): number {
  const res = openDB().prepare(`
    DELETE FROM calibration_log WHERE id NOT IN
      (SELECT id FROM calibration_log ORDER BY ts DESC, id DESC LIMIT ?)
  `).run(keep)
  return Number(res?.changes ?? 0)
}

/** Most-recent `limit` outcomes, returned oldest→newest for window replay. */
export function listCalibrationSamples(limit = 200): Array<{ ts: number; symbol: string; confidence: number; win: boolean }> {
  return (openDB().prepare('SELECT ts, symbol, confidence, win FROM calibration_log ORDER BY ts DESC, id DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>)
    .map(r => ({ ts: Number(r['ts']), symbol: String(r['symbol']), confidence: Number(r['confidence']), win: Number(r['win']) === 1 }))
    .reverse()
}

// ─── Watchlist ───────────────────────────────────────────────────────────────

export function getWatchlist(): string[] {
  return (openDB().prepare('SELECT symbol FROM watchlist ORDER BY position ASC').all() as Array<Record<string, unknown>>).map(r => String(r['symbol']))
}

export function setWatchlist(symbols: string[]): void {
  const db = openDB()
  db.exec('DELETE FROM watchlist')
  const stmt = db.prepare('INSERT INTO watchlist (position, symbol) VALUES (?,?)')
  symbols.forEach((sym, i) => stmt.run(i, sym))
}

// ─── Phase 8: Observations (append-only time series) ─────────────────────────

/** Batch insert observations in a single transaction. Returns rows written. */
export function insertObservations(rows: Observation[]): number {
  if (rows.length === 0) return 0
  const db = openDB()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO observations
      (ts, symbol, last, mid, spread_bps, velocity_bps,
       ema9, ema21, ema50, rsi14, atr14, vwap, trend_strength, regime)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  // better-sqlite3 exposes .transaction; gracefully degrade for NullDB.
  type TxDB = DB & { transaction?: <T extends (...args: unknown[]) => unknown>(fn: T) => T }
  const txDb = db as TxDB
  const exec = (): void => {
    for (const o of rows) {
      stmt.run(
        o.ts, o.symbol, o.last, o.mid, o.spreadBps, o.velocityBps,
        o.ema9, o.ema21, o.ema50, o.rsi14, o.atr14, o.vwap, o.trendStrength, o.regime
      )
    }
  }
  if (typeof txDb.transaction === 'function') (txDb.transaction(exec))()
  else exec()
  return rows.length
}

export function listObservations(symbol: string, sinceTs: number, limit = 1000): Observation[] {
  return (openDB()
    .prepare('SELECT * FROM observations WHERE symbol=? AND ts>=? ORDER BY ts ASC LIMIT ?')
    .all(symbol, sinceTs, limit) as Array<Record<string, unknown>>)
    .map(rowToObservation)
}

function rowToObservation(r: Record<string, unknown>): Observation {
  return {
    ts: Number(r['ts']),
    symbol: String(r['symbol']),
    last: Number(r['last']),
    mid: Number(r['mid']),
    spreadBps: Number(r['spread_bps']),
    velocityBps: Number(r['velocity_bps']),
    ema9: Number(r['ema9']),
    ema21: Number(r['ema21']),
    ema50: Number(r['ema50']),
    rsi14: Number(r['rsi14']),
    atr14: Number(r['atr14']),
    vwap: Number(r['vwap']),
    trendStrength: Number(r['trend_strength']),
    regime: String(r['regime']) as MarketRegime,
  }
}

// ─── Phase 8: Pattern weights (separate from brain table) ────────────────────

export function upsertPatternWeight(w: PatternWeight): void {
  openDB().prepare(`
    INSERT OR REPLACE INTO pattern_weights (feature, regime, weight, samples, updated_at)
    VALUES (?,?,?,?,?)
  `).run(w.feature, w.regime, w.weight, w.samples, w.updatedAt)
}

export function listPatternWeights(): PatternWeight[] {
  return (openDB()
    .prepare('SELECT * FROM pattern_weights ORDER BY feature, regime')
    .all() as Array<Record<string, unknown>>)
    .map(r => ({
      feature: String(r['feature']),
      regime: String(r['regime']) as MarketRegime,
      weight: Number(r['weight']),
      samples: Number(r['samples']),
      updatedAt: Number(r['updated_at']),
    }))
}

// ─── Phase 8: Learning cycle audit log ───────────────────────────────────────

export function insertLearningCycle(c: LearningCycle): void {
  openDB().prepare(`
    INSERT OR REPLACE INTO learning_log (ts, observations_seen, weights_updated, avg_error, note)
    VALUES (?,?,?,?,?)
  `).run(c.ts, c.observationsSeen, c.weightsUpdated, c.avgError, c.note)
}

// ─── Phase 9: Replay tape (ticks) ────────────────────────────────────────────

/** Batch-insert tape rows in a single transaction. Returns rows written. */
export function insertTickBatch(rows: TickTapeRow[]): number {
  if (rows.length === 0) return 0
  const db = openDB()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO ticks
      (session_id, ts, symbol, last, bid, ask, volume, vwap)
    VALUES (?,?,?,?,?,?,?,?)
  `)
  type TxDB = DB & { transaction?: <T extends (...args: unknown[]) => unknown>(fn: T) => T }
  const txDb = db as TxDB
  const exec = (): void => {
    for (const r of rows) {
      stmt.run(r.sessionId, r.ts, r.symbol, r.last, r.bid, r.ask, r.volume, r.vwap)
    }
  }
  if (typeof txDb.transaction === 'function') (txDb.transaction(exec))()
  else exec()
  return rows.length
}

/** Page through tape rows in [fromTs, toTs] ordered by ts asc. */
export function readTapeRange(
  sessionId: string, fromTs: number, toTs: number, limit = 5000,
): TickTapeRow[] {
  return (openDB()
    .prepare(`
      SELECT * FROM ticks
      WHERE session_id=? AND ts>=? AND ts<=?
      ORDER BY ts ASC
      LIMIT ?
    `)
    .all(sessionId, fromTs, toTs, limit) as Array<Record<string, unknown>>)
    .map(rowToTick)
}

/** Inclusive (firstTs, lastTs, count) bounds for a session's tape. */
export function getTapeBounds(sessionId: string): {
  firstTs: number | null; lastTs: number | null; count: number
} {
  const r = openDB().prepare(`
    SELECT MIN(ts) AS first_ts, MAX(ts) AS last_ts, COUNT(*) AS cnt
    FROM ticks WHERE session_id=?
  `).get(sessionId) as { first_ts: number | null; last_ts: number | null; cnt: number } | undefined
  return {
    firstTs: r?.first_ts ?? null,
    lastTs:  r?.last_ts ?? null,
    count:   r?.cnt ?? 0,
  }
}

/** Distinct symbols recorded for a session — used by ReplaySource on warm-up. */
export function getTapeSymbols(sessionId: string): string[] {
  return (openDB()
    .prepare('SELECT DISTINCT symbol FROM ticks WHERE session_id=? ORDER BY symbol')
    .all(sessionId) as Array<Record<string, unknown>>)
    .map(r => String(r['symbol']))
}

/** Sessions that have at least one recorded tick, joined with session metadata. */
export function listReplayableSessions(limit = 50): ReplayableSession[] {
  return (openDB()
    .prepare(`
      SELECT
        s.id           AS session_id,
        s.started_at   AS started_at,
        s.ended_at     AS ended_at,
        s.realized_pnl AS realized_pnl,
        t.cnt          AS tick_count,
        t.symbol_count AS symbol_count,
        t.first_ts     AS first_ts,
        t.last_ts      AS last_ts
      FROM sessions s
      INNER JOIN (
        SELECT
          session_id,
          COUNT(*)                       AS cnt,
          COUNT(DISTINCT symbol)         AS symbol_count,
          MIN(ts)                        AS first_ts,
          MAX(ts)                        AS last_ts
        FROM ticks
        GROUP BY session_id
      ) t ON t.session_id = s.id
      ORDER BY s.started_at DESC
      LIMIT ?
    `)
    .all(limit) as Array<Record<string, unknown>>)
    .map(r => {
      const firstTs = r['first_ts'] != null ? Number(r['first_ts']) : null
      const lastTs  = r['last_ts']  != null ? Number(r['last_ts'])  : null
      return {
        sessionId:   String(r['session_id']),
        startedAt:   Number(r['started_at']),
        endedAt:     r['ended_at']     != null ? Number(r['ended_at']) : null,
        realizedPnl: Number(r['realized_pnl'] ?? 0),
        tickCount:   Number(r['tick_count'] ?? 0),
        symbols:     Number(r['symbol_count'] ?? 0),
        firstTickTs: firstTs,
        lastTickTs:  lastTs,
        durationMs:  firstTs != null && lastTs != null ? Math.max(0, lastTs - firstTs) : 0,
      }
    })
}

function rowToTick(r: Record<string, unknown>): TickTapeRow {
  return {
    sessionId: String(r['session_id']),
    ts:        Number(r['ts']),
    symbol:    String(r['symbol']),
    last:      Number(r['last']),
    bid:       Number(r['bid']),
    ask:       Number(r['ask']),
    volume:    Number(r['volume']),
    vwap:      Number(r['vwap']),
  }
}

// ─── Phase 9: Replay bookmarks ───────────────────────────────────────────────

export function insertBookmark(b: ReplayBookmark): void {
  openDB().prepare(`
    INSERT OR REPLACE INTO replay_bookmarks (id, session_id, ts, label, created_at)
    VALUES (?,?,?,?,?)
  `).run(b.id, b.sessionId, b.ts, b.label, b.createdAt)
}

export function deleteBookmark(id: string): void {
  openDB().prepare('DELETE FROM replay_bookmarks WHERE id=?').run(id)
}

export function listBookmarks(sessionId: string): ReplayBookmark[] {
  return (openDB()
    .prepare('SELECT * FROM replay_bookmarks WHERE session_id=? ORDER BY ts ASC')
    .all(sessionId) as Array<Record<string, unknown>>)
    .map(r => ({
      id:        String(r['id']),
      sessionId: String(r['session_id']),
      ts:        Number(r['ts']),
      label:     String(r['label']),
      createdAt: Number(r['created_at']),
    }))
}

/** Wipe every tape row for a session — used when discarding a historical
 *  import. Live trading sessions should never be passed here. */
export function deleteTapeForSession(sessionId: string): number {
  const db = openDB()
  // Drop the manifest first so a half-deleted state can't leave an
  // integrity-pass row pointing at a fully-empty tape.
  db.prepare('DELETE FROM tape_manifest WHERE session_id=?').run(sessionId)
  const r = db.prepare('DELETE FROM ticks WHERE session_id=?').run(sessionId)
  return Number(r.changes)
}

// ─── A1 (v0.4.4) — sub-second crypto candles ────────────────────────────────
//
// One row per sealed bucket. INSERT OR REPLACE on (symbol, bucket_ms, open_ms)
// makes the seal idempotent — the aggregator can re-emit a corrected bucket
// on a late-arriving tick without surfacing a constraint error. Retention is
// application-side via trimSubSecondCandles, called from the aggregator after
// each insert to keep the per-(symbol, bucket_ms) row count bounded.

export function insertSubSecondCandle(c: SubSecondCandle): void {
  openDB().prepare(`
    INSERT OR REPLACE INTO crypto_subsecond_candles
      (symbol, bucket_ms, open_ms, open, high, low, close, volume)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(c.symbol, c.bucketMs, c.openMs, c.open, c.high, c.low, c.close, c.volume)
}

/** Returns the most-recent `limit` candles for a (symbol, bucketMs) pair in
 *  ascending time order (oldest → newest). Renderer's lightweight-charts
 *  setData expects ascending time so we do the reverse here, not at the call
 *  site. */
export function getSubSecondCandles(symbol: string, bucketMs: number, limit: number): SubSecondCandle[] {
  const rows = openDB().prepare(`
    SELECT symbol, bucket_ms, open_ms, open, high, low, close, volume
    FROM crypto_subsecond_candles
    WHERE symbol = ? AND bucket_ms = ?
    ORDER BY open_ms DESC
    LIMIT ?
  `).all(symbol, bucketMs, limit) as Array<Record<string, unknown>>
  return rows.map(r => ({
    symbol:   String(r['symbol']),
    bucketMs: Number(r['bucket_ms']),
    openMs:   Number(r['open_ms']),
    open:     Number(r['open']),
    high:     Number(r['high']),
    low:      Number(r['low']),
    close:    Number(r['close']),
    volume:   Number(r['volume']),
  })).reverse()
}

/** Trim the (symbol, bucketMs) series to the most-recent `keep` rows, dropping
 *  any older. v0.4.4 A1 Sprint 3 — called from `SubsecondRetentionWorker` once
 *  per minute (was called inline from the aggregator's sealBucket hot path in
 *  Sprint 1; lifted out so the per-tick path stays write-only). Idempotent.
 *  Returns the number of rows deleted. */
export function trimSubSecondCandles(symbol: string, bucketMs: number, keep: number): number {
  // Subquery picks the (keep+1)th most-recent open_ms; everything older
  // than that gets dropped. Faster than COUNT-then-DELETE because SQLite
  // only walks the (symbol, bucket_ms) slice once via the existing index.
  const r = openDB().prepare(`
    DELETE FROM crypto_subsecond_candles
    WHERE symbol = ? AND bucket_ms = ?
      AND open_ms < (
        SELECT open_ms FROM crypto_subsecond_candles
        WHERE symbol = ? AND bucket_ms = ?
        ORDER BY open_ms DESC
        LIMIT 1 OFFSET ?
      )
  `).run(symbol, bucketMs, symbol, bucketMs, keep)
  return Number(r.changes)
}

/** A1 Sprint 3 — list every distinct (symbol, bucket_ms) pair that has rows in
 *  the sub-second table. The retention worker iterates this on each cycle so
 *  trim covers series from prior sessions too (the table is flat across
 *  sessions — no session_id column). Bounded by the universe size × {250,500},
 *  so the SELECT DISTINCT walks at most ~36 rows even with a year of data and
 *  is satisfied by the existing `idx_subsec_sym_bucket_ts` index. */
export function getAllSubSecondSeries(): Array<{ symbol: string; bucketMs: number }> {
  const rows = openDB().prepare(`
    SELECT DISTINCT symbol, bucket_ms
    FROM crypto_subsecond_candles
    ORDER BY symbol, bucket_ms
  `).all() as Array<Record<string, unknown>>
  return rows.map((r) => ({
    symbol:   String(r['symbol']),
    bucketMs: Number(r['bucket_ms']),
  }))
}

// ─── S1-10 — Tape integrity manifest ────────────────────────────────────────

/** Insert or replace the integrity manifest for a recorded tape. */
export function upsertTapeManifest(m: TapeManifest): void {
  openDB().prepare(`
    INSERT OR REPLACE INTO tape_manifest
      (session_id, manifest_hash, tick_count, first_ts, last_ts, sealed_at)
    VALUES (?,?,?,?,?,?)
  `).run(m.sessionId, m.manifestHash, m.tickCount, m.firstTs, m.lastTs, m.sealedAt)
}

/** Returns null when no manifest exists (backwards compat for tapes recorded
 *  before S1-10 shipped). */
export function getTapeManifest(sessionId: string): TapeManifest | null {
  const r = openDB().prepare(`
    SELECT session_id, manifest_hash, tick_count, first_ts, last_ts, sealed_at
    FROM tape_manifest WHERE session_id=?
  `).get(sessionId) as Record<string, unknown> | undefined
  if (!r) return null
  return {
    sessionId:    String(r['session_id']),
    manifestHash: String(r['manifest_hash']),
    tickCount:    Number(r['tick_count']),
    firstTs:      Number(r['first_ts']),
    lastTs:       Number(r['last_ts']),
    sealedAt:     Number(r['sealed_at']),
  }
}

/**
 * Bounded-retention prune for the tape table.
 *
 * Deletes tick rows older than `maxAgeMs` from now. Sessions remain in the
 * `sessions` table (cheap metadata) so historical PnL and trade counts stay
 * intact — only the bulky tick-level tape gets pruned. Returns the number
 * of rows deleted.
 *
 * Sized to keep overnight sessions usable: at ~30 MB/h, a 7-day window caps
 * the DB at roughly 5 GB worst case. Default retention is 7 days but the
 * caller picks the value so it stays explicit.
 */
export function pruneOldTicks(maxAgeMs: number): number {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return 0
  const cutoff = Date.now() - maxAgeMs
  const r = openDB().prepare('DELETE FROM ticks WHERE ts < ?').run(cutoff)
  const pruned = Number(r.changes)
  if (pruned > 0) {
    // VACUUM is expensive — defer to incremental_vacuum if pragma is set, else
    // skip. SQLite reclaims space lazily, that's fine.
    try { openDB().exec('PRAGMA incremental_vacuum') } catch { /* ignore */ }
  }
  return pruned
}

export function deleteBookmarksForSession(sessionId: string): number {
  const r = openDB().prepare('DELETE FROM replay_bookmarks WHERE session_id=?').run(sessionId)
  return Number(r.changes)
}

export function deleteSessionRow(sessionId: string): number {
  const r = openDB().prepare('DELETE FROM sessions WHERE id=?').run(sessionId)
  return Number(r.changes)
}

/**
 * Path on disk for the SATEX database, or null if the no-op fallback is active
 * (no Electron app available — typically test contexts).
 */
function dbPath(): string | null {
  try { return path.join(app.getPath('userData'), 'satex.db') }
  catch { return null }
}

/** Current on-disk size of the database file in bytes. 0 when missing. */
function dbSizeBytes(): number {
  const p = dbPath()
  if (!p) return 0
  try { return fs.statSync(p).size }
  catch { return 0 }
}

/**
 * Delete tick rows belonging to sessions older than the cutoff. Async + chunked
 * so the main thread stays responsive while big sessions are pruned.
 *
 * Why chunked: a single `DELETE FROM ticks WHERE session_id=?` on a 1 M-row
 * session blocks the synchronous better-sqlite3 call for ~2-5 s. With IPC,
 * frame timers, and the tick recorder all sharing the main thread, that
 * shows up as user-visible lag during the maintenance window. By limiting
 * each DELETE to `chunkSize` rows (default 10 000 → ~30-80 ms per call) and
 * yielding via `setImmediate` between chunks, the event loop continues to
 * drain between bites.
 *
 * Why session-id-based: uses the existing `idx_ticks_session_ts` covering
 * index (leading column = session_id) so both the LIMIT subquery and the
 * rowid IN delete are index-driven — orders of magnitude faster than the
 * timestamp-only `pruneOldTicks` on multi-GB DBs that lack `idx_ticks_ts`.
 *
 * Stock SQLite doesn't support `DELETE … LIMIT` without
 * SQLITE_ENABLE_UPDATE_DELETE_LIMIT, so we approximate via
 * `DELETE … WHERE rowid IN (SELECT rowid … LIMIT N)` which works on every
 * better-sqlite3 build.
 *
 * Sessions metadata stays intact (cheap rows in `sessions`) so historical
 * PnL and trade counts survive the prune. Returns how much was deleted.
 */
async function pruneOldSessionTicks(
  cutoffMs: number,
  chunkSize = 10_000,
): Promise<{ sessionsAffected: number; rowsDeleted: number }> {
  if (!Number.isFinite(cutoffMs) || cutoffMs <= 0) {
    return { sessionsAffected: 0, rowsDeleted: 0 }
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) chunkSize = 10_000
  const db = openDB()
  const oldSessions = db
    .prepare('SELECT id FROM sessions WHERE started_at < ?')
    .all(cutoffMs) as Array<{ id: string }>
  if (oldSessions.length === 0) return { sessionsAffected: 0, rowsDeleted: 0 }

  const chunkStmt = db.prepare(
    'DELETE FROM ticks WHERE rowid IN (SELECT rowid FROM ticks WHERE session_id = ? LIMIT ?)',
  )

  let rowsDeleted = 0
  for (const s of oldSessions) {
    try {
      // Drain this session's tape in chunks. Stop when DELETE reports 0
      // changes — either the session is empty or it never had ticks.
      while (true) {
        const changes = Number(chunkStmt.run(s.id, chunkSize).changes)
        if (changes === 0) break
        rowsDeleted += changes
        // Yield to the event loop. setImmediate runs in the macrotask phase
        // AFTER I/O callbacks, so the tick recorder + IPC handlers get a
        // turn before the next DELETE chunk fires.
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    } catch (e) {
      log.warn('chunked per-session prune failed', { sessionId: s.id, err: String(e) })
    }
  }
  return { sessionsAffected: oldSessions.length, rowsDeleted }
}

/**
 * Background DB maintenance — fire-and-forget, fully off the boot critical
 * path. Replaces the pre-2026-05-16 synchronous `compactIfLarge` call that
 * locked the main process for 20-30s on multi-GB DBs (and cascaded into the
 * renderer dom-ready watchdog firing).
 *
 * Schedule of work, on a `setTimeout(delayMs).unref()` so it never holds the
 * process alive past shutdown:
 *   1. Prune tick rows from sessions older than `pruneOlderThanMs`.
 *   2. Run `PRAGMA incremental_vacuum` to release freed pages.
 *      (No-op on legacy DBs where auto_vacuum=NONE — safe.)
 *   3. Log the before/after size delta so trends are visible in the rotating
 *      file log.
 *
 * All steps wrapped in try/catch — maintenance failures must NEVER take down
 * the trading engine. The full-file VACUUM that physically shrinks a legacy
 * DB is deliberately NOT run here; that requires the manual maintenance
 * IPC (which warns the user about the lock duration).
 */
export function scheduleBackgroundMaintenance(opts: {
  delayMs?: number
  pruneOlderThanMs?: number
  chunkSize?: number
} = {}): void {
  const delayMs = opts.delayMs ?? 30_000
  const pruneOlderThanMs = opts.pruneOlderThanMs ?? 7 * 24 * 60 * 60 * 1000
  const chunkSize = opts.chunkSize ?? 10_000

  const run = async (): Promise<void> => {
    const startedAt = Date.now()
    try {
      const beforeMb = Math.round(dbSizeBytes() / 1024 / 1024)
      log.info('background db maintenance starting', {
        beforeMb, pruneOlderThanHours: pruneOlderThanMs / 3_600_000, chunkSize,
      })
      const cutoff = Date.now() - pruneOlderThanMs
      let pruned = { sessionsAffected: 0, rowsDeleted: 0 }
      try { pruned = await pruneOldSessionTicks(cutoff, chunkSize) }
      catch (e) { log.warn('chunked session-tick prune failed', { err: String(e) }) }
      try { openDB().exec('PRAGMA incremental_vacuum') }
      catch (e) { log.warn('incremental_vacuum failed', { err: String(e) }) }
      const afterMb = Math.round(dbSizeBytes() / 1024 / 1024)
      log.info('background db maintenance complete', {
        beforeMb, afterMb, reclaimedMb: beforeMb - afterMb,
        sessionsPruned: pruned.sessionsAffected,
        rowsDeleted: pruned.rowsDeleted,
        durationMs: Date.now() - startedAt,
      })
    } catch (e) {
      log.error('background db maintenance crashed', { err: String(e), stack: (e as Error)?.stack })
    }
  }

  const t = setTimeout(() => { void run() }, delayMs)
  // Unref so a pending maintenance timer doesn't keep the Electron process
  // alive after the user closes the window.
  if (typeof (t as { unref?: () => void }).unref === 'function') {
    (t as { unref: () => void }).unref()
  }
  log.info('background db maintenance scheduled', { delayMs, pruneOlderThanMs, chunkSize })
}

/**
 * Graceful shutdown:
 *   1. Force a WAL checkpoint with TRUNCATE so the -wal sidecar file shrinks
 *      back to 0 bytes (otherwise it can accumulate during heavy write loads).
 *   2. Close the connection.
 *
 * Both steps wrapped in try/catch — we never want shutdown to throw and
 * orphan the engine in a half-closed state.
 */
export function closeDB(): void {
  if (!_db) return
  try {
    _db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    log.info('WAL checkpoint TRUNCATE complete on shutdown')
  } catch (err) {
    log.warn('WAL checkpoint failed', { err: String(err) })
  }
  try { _db.close() }
  catch (err) { log.warn('DB close failed', { err: String(err) }) }
  _db = null
}
