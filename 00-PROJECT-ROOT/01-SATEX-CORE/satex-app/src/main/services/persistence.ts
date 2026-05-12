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
import path from 'path'
import { app } from 'electron'
import type {
  Order, SessionRecord, PnlSnapshot, BrainParameter,
  Observation, PatternWeight, LearningCycle, MarketRegime,
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
  db.exec(`
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
      rejection_reason TEXT
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
  `)
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
       limit_price, stop_loss, take_profit, fill_price, source, rejection_reason)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    o.id, sessionId, o.createdAt, o.filledAt ?? null, o.status,
    r.symbol, r.side, r.type, r.quantity,
    r.limitPrice ?? null, r.stopLoss ?? null, r.takeProfit ?? null,
    o.fillPrice ?? null, r.source ?? null, o.rejectionReason ?? null
  )
}

export function listOrders(sessionId: string, limit = 200): Order[] {
  return (openDB().prepare('SELECT * FROM orders WHERE session_id=? ORDER BY created_at DESC LIMIT ?').all(sessionId, limit) as Array<Record<string, unknown>>).map(rowToOrder)
}

export function listAllOrders(limit = 500): Order[] {
  return (openDB().prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>).map(rowToOrder)
}

function rowToOrder(r: Record<string, unknown>): Order {
  return {
    id: String(r['id']),
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

export function countObservations(): number {
  const r = openDB().prepare('SELECT COUNT(*) AS n FROM observations').get() as { n: number } | undefined
  return r?.n ?? 0
}

/** Prune observations older than `cutoffTs`. Returns rows deleted. */
export function pruneObservations(cutoffTs: number): number {
  const r = openDB().prepare('DELETE FROM observations WHERE ts<?').run(cutoffTs)
  return Number(r.changes)
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

export function listLearningCycles(limit = 50): LearningCycle[] {
  return (openDB()
    .prepare('SELECT * FROM learning_log ORDER BY ts DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>)
    .map(r => ({
      ts: Number(r['ts']),
      observationsSeen: Number(r['observations_seen']),
      weightsUpdated: Number(r['weights_updated']),
      avgError: Number(r['avg_error']),
      note: String(r['note'] ?? ''),
    }))
}

export function closeDB(): void {
  _db?.close()
  _db = null
}
