/**
 * Characterization coverage for the SQLite persistence layer (P-094, final pick)
 * + regression pins for the brain NULL-PK upsert defect (P-113).
 *
 * persistence.ts is OFF the trading-safety perimeter: it stores sessions,
 * orders history, pnl snapshots, learning state, replay tape, and sub-second
 * candles. It routes no orders, gates no risk, and arms nothing. Risk limits
 * are not read from or written to this module.
 *
 * What this suite locks in (beyond straight CRUD round-trips):
 *   1. SCHEMA TRUTH — a fresh DB migrates to exactly 13 tables in WAL mode,
 *      and the orders.trace_id ALTER migration is idempotent across reopens.
 *   2. P-113 — `upsertBrainParam({ symbol: null })` must REPLACE, not append.
 *      SQLite composite-PK NULLs are pairwise distinct, so the original
 *      INSERT OR REPLACE appended a fresh row per call — 8 rows per
 *      Brain.learn() forever (unbounded growth) — and Brain.initialize()
 *      only restored the newest value by accident of PK-index scan order.
 *      Pins: 3 global upserts ⇒ 1 row, newest wins; migrate() dedups legacy
 *      duplicate rows keeping the newest write per key.
 *   3. LEGACY SYNTHESIS — orders rows predating trace_id read back as
 *      `legacy-<id>`, never null.
 *   4. DEGENERATE GUARDS — pruneOldTicks(NaN/0/negative) deletes nothing;
 *      trimSubSecondCandles with rows ≤ keep deletes nothing (LIMIT/OFFSET
 *      subquery returns no cutoff ⇒ `open_ms < NULL` matches no rows).
 *   5. NullDB FALLBACK — when Electron's app.getPath throws, every read
 *      returns its empty-shape default and every write no-throws. QUIRK
 *      pinned loudly: batch writers report rows.length as "written" even on
 *      the no-op store.
 *
 * Harness: the subject resolves its driver via a bare `require('better-sqlite3')`
 * inside openDB()'s try/catch. Under vitest's ESM transform that reference
 * resolves through the global scope, so we stub `globalThis.require` with a
 * `createRequire`-backed shim. On CI / operator hardware the shim resolves the
 * repo's own native build. In Linux sandboxes whose mounted node_modules carry
 * a Windows .node binary (CONSTITUTION §2.9), point SATEX_TEST_BETTER_SQLITE3
 * at a directory containing a Linux better-sqlite3 build; without it the
 * subject falls back to NullDB and the real-DB assertions fail loudly rather
 * than false-greening (P-097 law).
 * Module singleton discipline mirrors self-eval-store.test.ts /
 * alpaca-mode.test.ts: `vi.resetModules()` + dynamic import per case; only
 * `electron` is mocked; real filesystem + real SQLite on a per-test temp dir.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { SessionRecord, Order, Observation, TickTapeRow, SubSecondCandle } from '@shared/types'

const ctx = vi.hoisted(() => ({ userData: '', throwOnGetPath: false }))
vi.mock('electron', () => ({
  app: {
    getPath: (_k: string) => {
      if (ctx.throwOnGetPath) throw new Error('app unavailable (test)')
      return ctx.userData
    },
  },
}))

const nodeRequire = createRequire(import.meta.url)
function loadBetterSqlite3(): unknown {
  const override = process.env.SATEX_TEST_BETTER_SQLITE3
  if (override) return nodeRequire(override)
  return nodeRequire('better-sqlite3')
}
vi.stubGlobal('require', (id: string) => (id === 'better-sqlite3' ? loadBetterSqlite3() : nodeRequire(id)))

type RawStatement = {
  run: (...a: unknown[]) => { changes: number }
  get: (...a: unknown[]) => unknown
  all: (...a: unknown[]) => unknown[]
}
type RawDB = {
  prepare: (s: string) => RawStatement
  exec: (s: string) => void
  close: () => void
  pragma: (s: string, o?: { simple?: boolean }) => unknown
}
const BetterSqlite3 = loadBetterSqlite3() as new (p: string) => RawDB
const dbFile = (): string => path.join(ctx.userData, 'satex.db')
const rawOpen = (): RawDB => new BetterSqlite3(dbFile())

type Persistence = typeof import('./persistence')
let db: Persistence

async function loadModule(): Promise<Persistence> {
  vi.resetModules()
  return import('./persistence')
}

beforeEach(async () => {
  ctx.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'satex-p113-'))
  ctx.throwOnGetPath = false
  db = await loadModule()
})

afterEach(() => {
  db.closeDB()
  fs.rmSync(ctx.userData, { recursive: true, force: true })
})

const session = (id = 's1', over: Partial<SessionRecord> = {}): SessionRecord => ({
  id, startedAt: 1_000, endedAt: null, startingEquity: 100_000, endingEquity: null,
  peakEquity: 100_500, troughEquity: 99_500, realizedPnl: 0, tradeCount: 0, ...over,
})

const order = (id = 'o1', over: Partial<Order> = {}): Order => ({
  id, traceId: `tr-${id}`, createdAt: 5_000, status: 'filled', fillPrice: 101.5,
  request: { symbol: 'AAPL', side: 'buy', type: 'market', quantity: 10 },
  ...over,
})

const obs = (ts: number, symbol = 'AAPL'): Observation => ({
  ts, symbol, last: 100, mid: 100.05, spreadBps: 1, velocityBps: 2,
  ema9: 99, ema21: 98, ema50: 97, rsi14: 55, atr14: 1.2, vwap: 99.5,
  trendStrength: 0.4, regime: 'trending_up' as Observation['regime'],
})

const tick = (sessionId: string, ts: number, symbol = 'AAPL'): TickTapeRow => ({
  sessionId, ts, symbol, last: 100, bid: 99.9, ask: 100.1, volume: 500, vwap: 99.8,
})

const candle = (openMs: number, over: Partial<SubSecondCandle> = {}): SubSecondCandle => ({
  symbol: 'BTC/USD', bucketMs: 250, openMs, open: 1, high: 2, low: 0.5, close: 1.5, volume: 3, ...over,
})

describe('schema + migration', () => {
  it('migrates a fresh DB to exactly 13 tables in WAL mode', () => {
    db.listSessions()  // forces openDB + migrate
    const raw = rawOpen()
    const tables = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as Array<{ name: string }>
    expect(tables.map(t => t.name)).toEqual([
      'brain', 'calibration_log', 'crypto_subsecond_candles', 'learning_log',
      'observations', 'orders', 'pattern_weights', 'pnl', 'replay_bookmarks',
      'sessions', 'tape_manifest', 'ticks', 'watchlist',
    ])
    expect(tables).toHaveLength(13)
    expect(raw.pragma('journal_mode', { simple: true })).toBe('wal')
    raw.close()
  })

  it('re-running migration on an existing DB is idempotent (trace_id ALTER swallowed) and data survives', async () => {
    db.insertSession(session('keep'))
    db.closeDB()
    db = await loadModule()
    expect(db.listSessions().map(s => s.id)).toEqual(['keep'])
  })
})

describe('sessions', () => {
  it('insert + list round-trips, newest started_at first, null endedAt preserved', () => {
    db.insertSession(session('a', { startedAt: 1_000 }))
    db.insertSession(session('b', { startedAt: 2_000, endedAt: 3_000, endingEquity: 101_000 }))
    const rows = db.listSessions()
    expect(rows.map(s => s.id)).toEqual(['b', 'a'])
    expect(rows[1].endedAt).toBeNull()
    expect(rows[1].endingEquity).toBeNull()
    expect(rows[0].endedAt).toBe(3_000)
  })

  it('insert with an existing id replaces the row (INSERT OR REPLACE)', () => {
    db.insertSession(session('a', { realizedPnl: 0 }))
    db.insertSession(session('a', { realizedPnl: 42 }))
    const rows = db.listSessions()
    expect(rows).toHaveLength(1)
    expect(rows[0].realizedPnl).toBe(42)
  })

  it('updateSession applies only the provided patch fields', () => {
    db.insertSession(session('a'))
    db.updateSession('a', { endedAt: 9_000, endingEquity: 105_000, tradeCount: 7 })
    const [s] = db.listSessions()
    expect(s.endedAt).toBe(9_000)
    expect(s.endingEquity).toBe(105_000)
    expect(s.tradeCount).toBe(7)
    expect(s.startingEquity).toBe(100_000)  // untouched
  })

  it('listSessions respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) db.insertSession(session(`s${i}`, { startedAt: i }))
    expect(db.listSessions(2)).toHaveLength(2)
  })

  it('deleteSessionRow removes exactly the named session and reports 1 change', () => {
    db.insertSession(session('a'))
    db.insertSession(session('b'))
    expect(db.deleteSessionRow('a')).toBe(1)
    expect(db.deleteSessionRow('missing')).toBe(0)
    expect(db.listSessions().map(s => s.id)).toEqual(['b'])
  })
})

describe('orders', () => {
  it('insert + listOrders round-trips the full request/fill shape, newest first, session-scoped', () => {
    db.insertOrder(order('o1', { createdAt: 1_000 }), 'sess-A')
    db.insertOrder(order('o2', {
      createdAt: 2_000, status: 'rejected', fillPrice: undefined, rejectionReason: 'gate 3',
      request: { symbol: 'MSFT', side: 'sell', type: 'limit', quantity: 5, limitPrice: 400, stopLoss: 390, takeProfit: 420, source: 'manual' },
    }), 'sess-A')
    db.insertOrder(order('other'), 'sess-B')
    const rows = db.listOrders('sess-A')
    expect(rows.map(o => o.id)).toEqual(['o2', 'o1'])
    const o2 = rows[0]
    expect(o2.status).toBe('rejected')
    expect(o2.rejectionReason).toBe('gate 3')
    expect(o2.fillPrice).toBeUndefined()
    expect(o2.request).toEqual({ symbol: 'MSFT', side: 'sell', type: 'limit', quantity: 5, limitPrice: 400, stopLoss: 390, takeProfit: 420, source: 'manual' })
    expect(rows[1].traceId).toBe('tr-o1')
  })

  it('listAllOrders spans sessions with a limit', () => {
    db.insertOrder(order('o1', { createdAt: 1 }), 'A')
    db.insertOrder(order('o2', { createdAt: 2 }), 'B')
    db.insertOrder(order('o3', { createdAt: 3 }), 'C')
    expect(db.listAllOrders(2).map(o => o.id)).toEqual(['o3', 'o2'])
  })

  it('rows predating trace_id read back as legacy-<id>, never null (A4 contract)', () => {
    db.listSessions()  // force migrate
    const raw = rawOpen()
    raw.prepare(`INSERT INTO orders (id, session_id, created_at, status, symbol, side, type, quantity, trace_id)
                 VALUES ('old1','S',10,'filled','AAPL','buy','market',1,NULL)`).run()
    raw.close()
    const [o] = db.listOrders('S')
    expect(o.traceId).toBe('legacy-old1')
  })
})

describe('pnl snapshots', () => {
  it('round-trips per session in ascending timestamp order', () => {
    db.insertPnlSnapshot({ sessionId: 'S', timestamp: 2_000, equity: 101, cash: 50, realizedPnl: 1, unrealizedPnl: 0.5 })
    db.insertPnlSnapshot({ sessionId: 'S', timestamp: 1_000, equity: 100, cash: 50, realizedPnl: 0, unrealizedPnl: 0 })
    db.insertPnlSnapshot({ sessionId: 'other', timestamp: 1_500, equity: 7, cash: 7, realizedPnl: 0, unrealizedPnl: 0 })
    const rows = db.listPnlSnapshots('S')
    expect(rows.map(r => r.timestamp)).toEqual([1_000, 2_000])
    expect(rows[1]).toEqual({ sessionId: 'S', timestamp: 2_000, equity: 101, cash: 50, realizedPnl: 1, unrealizedPnl: 0.5 })
  })
})

describe('brain parameters — P-113 regression pins', () => {
  const param = (value: number, sampleSize: number, updatedAt: number, symbol: string | null = null) => ({
    key: 'ema_stack', symbol, value, sampleSize, confidence: 0.5, updatedAt,
  })

  it('P-113: repeated global (symbol:null) upserts REPLACE — one row, newest value wins', () => {
    db.upsertBrainParam(param(0.40, 1, 100))
    db.upsertBrainParam(param(0.41, 2, 200))
    db.upsertBrainParam(param(0.42, 3, 300))
    const rows = db.listBrainParams()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ key: 'ema_stack', symbol: null, value: 0.42, sampleSize: 3, confidence: 0.5, updatedAt: 300 })
  })

  it('per-symbol upserts replace via the real PK, and null/per-symbol rows coexist per key', () => {
    db.upsertBrainParam(param(0.1, 1, 100))
    db.upsertBrainParam(param(0.2, 1, 100, 'AAPL'))
    db.upsertBrainParam(param(0.3, 2, 200, 'AAPL'))
    const rows = db.listBrainParams()
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.symbol === 'AAPL')?.value).toBe(0.3)
    expect(rows.find(r => r.symbol === null)?.value).toBe(0.1)
  })

  it('P-113: migrate() dedups legacy NULL-symbol duplicates keeping the newest write per key', async () => {
    db.listSessions()  // force migrate on the fresh DB
    const raw = rawOpen()
    const ins = raw.prepare('INSERT INTO brain (key, symbol, value, sample_size, confidence, updated_at) VALUES (?,?,?,?,?,?)')
    ins.run('vwap_side', null, 0.20, 1, 0.1, 100)
    ins.run('vwap_side', null, 0.21, 2, 0.2, 200)
    ins.run('vwap_side', null, 0.22, 3, 0.3, 300)  // newest write — must survive
    ins.run('rsi_mid', null, 0.15, 9, 0.9, 50)     // single row — must survive
    raw.close()
    db.closeDB()
    db = await loadModule()  // reopen ⇒ migrate() runs its dedup on the legacy rows
    const rows = db.listBrainParams()
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.key === 'vwap_side')).toEqual({ key: 'vwap_side', symbol: null, value: 0.22, sampleSize: 3, confidence: 0.3, updatedAt: 300 })
    expect(rows.find(r => r.key === 'rsi_mid')?.value).toBe(0.15)
  })
})

describe('confidence calibration log', () => {
  it('listCalibrationSamples returns the newest `limit` outcomes oldest→newest with boolean win', () => {
    for (let i = 1; i <= 5; i++) db.insertCalibrationSample({ ts: i * 100, symbol: 'AAPL', confidence: 0.5 + i / 100, win: i % 2 === 0 })
    const rows = db.listCalibrationSamples(3)
    expect(rows.map(r => r.ts)).toEqual([300, 400, 500])
    expect(rows.map(r => r.win)).toEqual([false, true, false])
  })

  it('pruneCalibrationLog keeps the newest N rows and returns the deleted count', () => {
    for (let i = 1; i <= 6; i++) db.insertCalibrationSample({ ts: i, symbol: 'X', confidence: 0.5, win: true })
    expect(db.pruneCalibrationLog(4)).toBe(2)
    expect(db.listCalibrationSamples(100).map(r => r.ts)).toEqual([3, 4, 5, 6])
    expect(db.pruneCalibrationLog(4)).toBe(0)  // idempotent
  })
})

describe('watchlist', () => {
  it('setWatchlist replaces wholesale and getWatchlist returns position order', () => {
    db.setWatchlist(['TSLA', 'AAPL', 'NVDA'])
    expect(db.getWatchlist()).toEqual(['TSLA', 'AAPL', 'NVDA'])
    db.setWatchlist(['SPY'])
    expect(db.getWatchlist()).toEqual(['SPY'])
    db.setWatchlist([])
    expect(db.getWatchlist()).toEqual([])
  })
})

describe('observations (append-only time series)', () => {
  it('batch insert returns rows written and round-trips via since-filter', () => {
    expect(db.insertObservations([obs(100), obs(200), obs(300)])).toBe(3)
    const rows = db.listObservations('AAPL', 200)
    expect(rows.map(r => r.ts)).toEqual([200, 300])
    expect(rows[0]).toEqual(obs(200))
  })

  it('empty batch short-circuits to 0 without touching the DB', () => {
    expect(db.insertObservations([])).toBe(0)
  })

  it('re-inserting the same (ts, symbol) replaces rather than throwing (INSERT OR REPLACE)', () => {
    db.insertObservations([obs(100)])
    const changed = { ...obs(100), last: 999 }
    expect(db.insertObservations([changed])).toBe(1)
    expect(db.listObservations('AAPL', 0)).toHaveLength(1)
    expect(db.listObservations('AAPL', 0)[0].last).toBe(999)
  })
})

describe('pattern weights + learning log', () => {
  it('upsertPatternWeight replaces on (feature, regime) and lists in feature,regime order', () => {
    db.upsertPatternWeight({ feature: 'f2', regime: 'ranging' as never, weight: 0.5, samples: 1, updatedAt: 10 })
    db.upsertPatternWeight({ feature: 'f1', regime: 'trending_up' as never, weight: 0.1, samples: 1, updatedAt: 10 })
    db.upsertPatternWeight({ feature: 'f1', regime: 'trending_up' as never, weight: 0.9, samples: 2, updatedAt: 20 })
    const rows = db.listPatternWeights()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ feature: 'f1', regime: 'trending_up', weight: 0.9, samples: 2, updatedAt: 20 })
  })

  it('insertLearningCycle writes one row keyed by ts and replaces on the same ts', () => {
    db.insertLearningCycle({ ts: 111, observationsSeen: 10, weightsUpdated: 3, avgError: 0.2, note: 'first' })
    db.insertLearningCycle({ ts: 111, observationsSeen: 12, weightsUpdated: 4, avgError: 0.1, note: 'replaced' })
    const raw = rawOpen()
    const rows = raw.prepare('SELECT * FROM learning_log').all() as Array<Record<string, unknown>>
    raw.close()
    expect(rows).toHaveLength(1)
    expect(rows[0]['note']).toBe('replaced')
    expect(rows[0]['observations_seen']).toBe(12)
  })
})

describe('replay tape (ticks)', () => {
  it('insertTickBatch + readTapeRange round-trips with inclusive bounds and a limit', () => {
    expect(db.insertTickBatch([tick('S', 100), tick('S', 200), tick('S', 300), tick('other', 150)])).toBe(4)
    const rows = db.readTapeRange('S', 100, 300)
    expect(rows.map(r => r.ts)).toEqual([100, 200, 300])
    expect(rows[0]).toEqual(tick('S', 100))
    expect(db.readTapeRange('S', 100, 300, 2)).toHaveLength(2)
    expect(db.readTapeRange('S', 101, 299).map(r => r.ts)).toEqual([200])
  })

  it('empty batch short-circuits to 0', () => {
    expect(db.insertTickBatch([])).toBe(0)
  })

  it('getTapeBounds reports {null,null,0} for an unknown session and real bounds otherwise', () => {
    expect(db.getTapeBounds('missing')).toEqual({ firstTs: null, lastTs: null, count: 0 })
    db.insertTickBatch([tick('S', 100), tick('S', 300)])
    expect(db.getTapeBounds('S')).toEqual({ firstTs: 100, lastTs: 300, count: 2 })
  })

  it('getTapeSymbols returns the distinct sorted symbol set for the session', () => {
    db.insertTickBatch([tick('S', 1, 'NVDA'), tick('S', 2, 'AAPL'), tick('S', 3, 'NVDA')])
    expect(db.getTapeSymbols('S')).toEqual(['AAPL', 'NVDA'])
  })

  it('listReplayableSessions joins tape stats onto session metadata and skips tickless sessions', () => {
    db.insertSession(session('with-tape', { startedAt: 2_000, realizedPnl: 5 }))
    db.insertSession(session('no-tape', { startedAt: 3_000 }))
    db.insertTickBatch([tick('with-tape', 100, 'AAPL'), tick('with-tape', 500, 'MSFT')])
    const rows = db.listReplayableSessions()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      sessionId: 'with-tape', startedAt: 2_000, endedAt: null, realizedPnl: 5,
      tickCount: 2, symbols: 2, firstTickTs: 100, lastTickTs: 500, durationMs: 400,
    })
  })

  it('deleteTapeForSession drops the manifest first and reports tick rows deleted', () => {
    db.insertTickBatch([tick('S', 1), tick('S', 2)])
    db.upsertTapeManifest({ sessionId: 'S', manifestHash: 'h', tickCount: 2, firstTs: 1, lastTs: 2, sealedAt: 9 })
    expect(db.deleteTapeForSession('S')).toBe(2)
    expect(db.getTapeManifest('S')).toBeNull()
    expect(db.getTapeBounds('S').count).toBe(0)
  })
})

describe('replay bookmarks', () => {
  it('insert/list/delete round-trip in ts order, scoped by session', () => {
    db.insertBookmark({ id: 'b2', sessionId: 'S', ts: 200, label: 'later', createdAt: 1 })
    db.insertBookmark({ id: 'b1', sessionId: 'S', ts: 100, label: 'earlier', createdAt: 1 })
    db.insertBookmark({ id: 'bx', sessionId: 'other', ts: 150, label: 'x', createdAt: 1 })
    expect(db.listBookmarks('S').map(b => b.id)).toEqual(['b1', 'b2'])
    db.deleteBookmark('b1')
    expect(db.listBookmarks('S').map(b => b.id)).toEqual(['b2'])
  })

  it('deleteBookmarksForSession wipes only that session and returns the count', () => {
    db.insertBookmark({ id: 'b1', sessionId: 'S', ts: 1, label: 'a', createdAt: 1 })
    db.insertBookmark({ id: 'b2', sessionId: 'S', ts: 2, label: 'b', createdAt: 1 })
    db.insertBookmark({ id: 'bx', sessionId: 'other', ts: 3, label: 'c', createdAt: 1 })
    expect(db.deleteBookmarksForSession('S')).toBe(2)
    expect(db.listBookmarks('other')).toHaveLength(1)
  })
})

describe('tape manifest', () => {
  it('upsert round-trips and getTapeManifest is null when absent (pre-S1-10 tapes)', () => {
    expect(db.getTapeManifest('S')).toBeNull()
    const m = { sessionId: 'S', manifestHash: 'abc', tickCount: 10, firstTs: 1, lastTs: 99, sealedAt: 123 }
    db.upsertTapeManifest(m)
    expect(db.getTapeManifest('S')).toEqual(m)
    db.upsertTapeManifest({ ...m, manifestHash: 'def' })
    expect(db.getTapeManifest('S')?.manifestHash).toBe('def')
  })
})

describe('sub-second crypto candles', () => {
  it('re-sealing the same (symbol,bucket,open) bucket replaces idempotently', () => {
    db.insertSubSecondCandle(candle(1_000))
    db.insertSubSecondCandle(candle(1_000, { close: 9 }))
    const rows = db.getSubSecondCandles('BTC/USD', 250, 10)
    expect(rows).toHaveLength(1)
    expect(rows[0].close).toBe(9)
  })

  it('getSubSecondCandles returns the newest `limit` buckets in ascending time order', () => {
    for (const t of [3_000, 1_000, 2_000, 4_000]) db.insertSubSecondCandle(candle(t))
    expect(db.getSubSecondCandles('BTC/USD', 250, 3).map(c => c.openMs)).toEqual([2_000, 3_000, 4_000])
    expect(db.getSubSecondCandles('BTC/USD', 500, 10)).toEqual([])  // bucket isolation
  })

  it('trimSubSecondCandles QUIRK (pinned): retains keep+1 rows — the (keep+1)th-newest is the strict `<` cutoff and survives', () => {
    // Docstring says "trim to the most-recent `keep` rows"; the OFFSET-based
    // cutoff actually deletes only rows strictly OLDER than the (keep+1)th,
    // so the series stabilizes at keep+1 rows. Retention overshoot of one
    // 250/500 ms bucket — harmless, but pinned so a future "fix" is deliberate.
    for (const t of [1_000, 2_000, 3_000, 4_000, 5_000]) db.insertSubSecondCandle(candle(t))
    expect(db.trimSubSecondCandles('BTC/USD', 250, 3)).toBe(1)
    expect(db.getSubSecondCandles('BTC/USD', 250, 10).map(c => c.openMs)).toEqual([2_000, 3_000, 4_000, 5_000])
    expect(db.trimSubSecondCandles('BTC/USD', 250, 3)).toBe(0)   // stable thereafter
    expect(db.trimSubSecondCandles('BTC/USD', 250, 99)).toBe(0)  // keep ≥ rows ⇒ NULL cutoff ⇒ no-op
  })

  it('getAllSubSecondSeries lists distinct (symbol, bucketMs) pairs sorted', () => {
    db.insertSubSecondCandle(candle(1_000))
    db.insertSubSecondCandle(candle(2_000))
    db.insertSubSecondCandle(candle(1_000, { symbol: 'ETH/USD', bucketMs: 500 }))
    expect(db.getAllSubSecondSeries()).toEqual([
      { symbol: 'BTC/USD', bucketMs: 250 },
      { symbol: 'ETH/USD', bucketMs: 500 },
    ])
  })
})

describe('retention + maintenance', () => {
  it('pruneOldTicks guards degenerate inputs (NaN / 0 / negative ⇒ 0 deleted)', () => {
    db.insertTickBatch([tick('S', 1)])
    expect(db.pruneOldTicks(Number.NaN)).toBe(0)
    expect(db.pruneOldTicks(0)).toBe(0)
    expect(db.pruneOldTicks(-5)).toBe(0)
    expect(db.getTapeBounds('S').count).toBe(1)
  })

  it('pruneOldTicks deletes rows older than the age window and keeps the rest', () => {
    const now = Date.now()
    db.insertTickBatch([tick('S', now - 10 * 60_000), tick('S', now - 30_000)])
    expect(db.pruneOldTicks(60_000)).toBe(1)
    expect(db.getTapeBounds('S').count).toBe(1)
  })

  it('scheduleBackgroundMaintenance prunes old-session tapes chunked while recent sessions survive', async () => {
    const now = Date.now()
    db.insertSession(session('old', { startedAt: now - 10 * 60_000 }))
    db.insertSession(session('new', { startedAt: now - 1_000 }))
    db.insertTickBatch([tick('old', now - 10 * 60_000), tick('old', now - 10 * 60_000 + 1), tick('new', now - 500)])
    db.scheduleBackgroundMaintenance({ delayMs: 0, pruneOlderThanMs: 60_000, chunkSize: 1 })
    await vi.waitFor(() => {
      expect(db.getTapeBounds('old').count).toBe(0)
    }, { timeout: 5_000, interval: 100 })
    expect(db.getTapeBounds('new').count).toBe(1)
    expect(db.listSessions().map(s => s.id)).toContain('old')  // metadata survives the prune
  })
})

describe('closeDB lifecycle', () => {
  it('closeDB is idempotent and a later call transparently reopens', () => {
    db.insertSession(session('a'))
    db.closeDB()
    db.closeDB()  // second close: no throw
    expect(db.listSessions().map(s => s.id)).toEqual(['a'])  // reopened lazily
  })

  it('closeDB checkpoints the WAL sidecar away on shutdown (absent or zero bytes)', () => {
    db.insertSession(session('a'))
    const wal = `${dbFile()}-wal`
    expect(fs.existsSync(wal)).toBe(true)
    db.closeDB()
    expect(!fs.existsSync(wal) || fs.statSync(wal).size === 0).toBe(true)
  })
})

describe('NullDB fallback (Electron app unavailable)', () => {
  beforeEach(async () => {
    ctx.throwOnGetPath = true
    db = await loadModule()
  })

  it('reads return empty-shape defaults and writes never throw', () => {
    expect(() => db.insertSession(session('a'))).not.toThrow()
    expect(() => db.upsertBrainParam({ key: 'k', symbol: null, value: 1, sampleSize: 1, confidence: 0, updatedAt: 1 })).not.toThrow()
    expect(() => db.setWatchlist(['A'])).not.toThrow()
    expect(db.listSessions()).toEqual([])
    expect(db.listBrainParams()).toEqual([])
    expect(db.getWatchlist()).toEqual([])
    expect(db.getTapeBounds('S')).toEqual({ firstTs: null, lastTs: null, count: 0 })
    expect(db.getTapeManifest('S')).toBeNull()
    expect(db.pruneCalibrationLog(10)).toBe(0)
    expect(db.pruneOldTicks(1_000)).toBe(0)
    expect(db.deleteTapeForSession('S')).toBe(0)
  })

  it('QUIRK (pinned, do not "fix" silently): batch writers report rows.length even on the no-op store', () => {
    expect(db.insertObservations([obs(1)])).toBe(1)
    expect(db.insertTickBatch([tick('S', 1)])).toBe(1)
  })
})
