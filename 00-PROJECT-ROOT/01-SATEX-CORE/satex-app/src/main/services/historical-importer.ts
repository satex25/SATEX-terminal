/**
 * SATEX — Historical Day Importer (Phase 9 extension)
 *
 * Fetches Alpaca historical bars for an arbitrary US-market calendar day and
 * materializes them into the `ticks` tape as a synthetic session. The replay
 * engine plays it back unchanged — same scrubber, speed controls, bookmarks.
 *
 * Tape shape
 * ----------
 * Each bar is expanded into FOUR synthetic ticks walking the OHLC pattern:
 *
 *     open   ─ at bar.time
 *     high   ─ at bar.time + Δ
 *     low    ─ at bar.time + 2Δ
 *     close  ─ at bar.time + 3Δ
 *
 *   where Δ = barSpanMs / 4. The order is chosen so the close-to-next-open
 *   transition is monotonic in the most common case (rising bar: O<H, L<C;
 *   falling bar: O<H, L<C still). Real intra-bar paths can be more chaotic,
 *   but at chart-aggregation granularity this is indistinguishable.
 *
 * Idempotence
 * -----------
 * A session id `hist_<date>_<tf>_<sym-hash>` deterministically maps a request
 * to its tape. Re-importing the same (date, symbols, timeframe) is a no-op
 * unless we explicitly clear the old session first (`replace = true`).
 */
import type { AlpacaClient } from './alpaca'
import {
  HISTORICAL_BARS_FALLBACK_SYMBOLS,
  REPLAY_MIN_SPEED,
} from '@shared/constants'
import type {
  HistoricalImportRequest, HistoricalImportResult, HistoricalTimeframe,
  TickTapeRow, SessionRecord,
} from '@shared/types'
import * as db from './persistence'
import { createLogger } from './logger'
import { computeTapeManifestHash } from './tape-integrity'

void REPLAY_MIN_SPEED  // re-exported for sibling modules; silences unused-import in some build configs

const log = createLogger('historical-importer')

const TF_SPAN_MS: Record<HistoricalTimeframe, number> = {
  '1Min':  60_000,
  '1Hour': 3_600_000,
}

/** Subticks emitted per bar — matches the OHLC walk pattern. */
const SUBTICKS_PER_BAR = 4

export class HistoricalImporter {
  constructor(private readonly alpaca: AlpacaClient | null) {}

  /** Synthetic universe (and order) used when caller passes no symbols. */
  defaultSymbols(): string[] { return [...HISTORICAL_BARS_FALLBACK_SYMBOLS] }

  async import(req: HistoricalImportRequest): Promise<HistoricalImportResult> {
    if (!this.alpaca || !this.alpaca.isConfigured) {
      return {
        ok: false,
        reason: 'No Alpaca credentials — open Settings and paste your paper key/secret first.',
      }
    }

    // ── Validate request ────────────────────────────────────────────────────
    const dateValidation = validateDate(req.date)
    if (!dateValidation.ok) return { ok: false, reason: dateValidation.reason }

    const symbols = (req.symbols && req.symbols.length > 0 ? req.symbols : this.defaultSymbols())
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0)
    if (symbols.length === 0) return { ok: false, reason: 'Select at least one symbol.' }
    if (symbols.length > 16) return { ok: false, reason: 'Cap is 16 symbols per import.' }

    const tf: HistoricalTimeframe = req.timeframe ?? '1Min'
    if (!(tf in TF_SPAN_MS)) return { ok: false, reason: `Unsupported timeframe: ${tf}` }

    // ── Build deterministic session id; idempotent re-imports ───────────────
    const sessionId = makeSessionId(req.date, tf, symbols)
    const existing = db.getTapeBounds(sessionId)
    if (existing.count > 0) {
      log.info('historical session already imported — reusing', { sessionId, ticks: existing.count })
      return {
        ok: true, sessionId, tickCount: existing.count,
        symbolsImported: db.getTapeSymbols(sessionId),
        skipped: [],
      }
    }

    // ── Fetch bars per symbol ───────────────────────────────────────────────
    // US regular session window in UTC. Alpaca returns whatever it has inside
    // the window; weekends/holidays produce an empty list, which we surface.
    const startIso = `${req.date}T13:00:00Z`   // ~09:00 ET in winter, ~08:00 in summer
    const endIso   = `${req.date}T21:30:00Z`   // ~16:30 ET — covers full session

    const tapeRows: TickTapeRow[] = []
    const imported: string[] = []
    const skipped:  string[] = []
    const span = TF_SPAN_MS[tf]
    const dt = Math.floor(span / SUBTICKS_PER_BAR)

    for (const symbol of symbols) {
      try {
        const bars = await this.alpaca.getBars(symbol, tf, startIso, endIso)
        if (bars.length === 0) {
          skipped.push(symbol)
          continue
        }
        let cumVol = 0
        for (const b of bars) {
          const t0 = b.time * 1000
          const points: Array<[number, number]> = [
            [t0,            b.open],
            [t0 + dt,       b.high],
            [t0 + 2 * dt,   b.low],
            [t0 + 3 * dt,   b.close],
          ]
          const perTickVol = Math.max(1, Math.floor(b.volume / SUBTICKS_PER_BAR))
          const vwapRef = (b.high + b.low + b.close) / 3
          for (const [ts, px] of points) {
            cumVol += perTickVol
            tapeRows.push({
              sessionId, ts, symbol,
              last: px,
              bid:  px * (1 - 0.0001),
              ask:  px * (1 + 0.0001),
              volume: cumVol,
              vwap: vwapRef,
            })
          }
        }
        imported.push(symbol)
      } catch (err) {
        log.warn('historical bars fetch failed', { symbol, err: String(err) })
        skipped.push(symbol)
      }
    }

    if (tapeRows.length === 0) {
      return {
        ok: false,
        reason: `No bars returned for ${req.date} — markets were likely closed or the date is too recent for the free IEX feed.`,
        skipped,
      }
    }

    // Sort by ts ascending — replay reader expects monotonic order per session.
    tapeRows.sort((a, b) => a.ts - b.ts || a.symbol.localeCompare(b.symbol))

    // ── Materialize: ticks first, then synthetic session row ────────────────
    const firstTs = tapeRows[0]!.ts
    const lastTs  = tapeRows[tapeRows.length - 1]!.ts
    const written = db.insertTickBatch(tapeRows)
    const sessionRow: SessionRecord = {
      id: sessionId,
      startedAt: firstTs,
      endedAt:   lastTs,
      startingEquity: 0,
      endingEquity:   0,
      peakEquity:     0,
      troughEquity:   0,
      realizedPnl:    0,
      tradeCount:     0,
    }
    db.insertSession(sessionRow)

    // S1-10 — seal an integrity manifest for the freshly-imported tape so
    // ReplaySource can verify it the same way it does for live recordings.
    // Re-imports hit the `existing.count > 0` early-return above so we only
    // seal once per (date, tf, symbols) tuple.
    try {
      const manifestInputs = { sessionId, tickCount: written, firstTs, lastTs }
      db.upsertTapeManifest({
        ...manifestInputs,
        manifestHash: computeTapeManifestHash(manifestInputs),
        sealedAt:     Date.now(),
      })
    } catch (err) {
      log.warn('historical tape manifest seal failed', { sessionId, err: String(err) })
    }

    log.info('historical import complete', {
      sessionId, ticks: written, symbols: imported.length, skipped: skipped.length,
      date: req.date, tf,
    })

    return {
      ok: true,
      sessionId,
      tickCount: written,
      symbolsImported: imported,
      skipped,
    }
  }

  /** Permanently delete a session's tape rows + bookmarks + session row.
   *  Use only for `hist_*` sessions — live sessions hold trading history. */
  deleteSession(sessionId: string): { ok: boolean; reason?: string } {
    if (!sessionId.startsWith('hist_')) {
      return { ok: false, reason: 'Refusing to delete a non-historical session.' }
    }
    db.deleteTapeForSession(sessionId)
    db.deleteBookmarksForSession(sessionId)
    db.deleteSessionRow(sessionId)
    return { ok: true }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function validateDate(date: string): { ok: boolean; reason?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: 'Date must be YYYY-MM-DD.' }
  const d = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(d.getTime()))  return { ok: false, reason: 'Invalid date.' }
  const now = new Date()
  if (d.getTime() > now.getTime()) return { ok: false, reason: 'Date is in the future.' }
  // 0 = Sunday, 6 = Saturday — Alpaca returns no bars on weekends.
  const dow = d.getUTCDay()
  if (dow === 0 || dow === 6) return { ok: false, reason: 'Weekends have no US-stock data.' }
  return { ok: true }
}

/** Deterministic session id. Same (date, tf, symbols-set) → same id. */
function makeSessionId(date: string, tf: HistoricalTimeframe, symbols: string[]): string {
  const symHash = [...new Set(symbols)].sort().join('-').toLowerCase()
  return `hist_${date}_${tf.toLowerCase()}_${symHash}`
}
