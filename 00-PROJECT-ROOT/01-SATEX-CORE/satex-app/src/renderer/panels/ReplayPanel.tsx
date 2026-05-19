/**
 * SATEX — Replay Panel (Phase 9)
 *
 * Mission control for the tape-replay engine. Two source modes:
 *
 *   • "My Sessions" — pick a SATEX-recorded session from the dropdown.
 *   • "Historical Day" — fetch Alpaca bars for an arbitrary US calendar day
 *     and materialize them into the same tape table, then play them back.
 *     Lives behind window.satex.replay.importHistorical.
 *
 * The actual time-warping, pause/resume, scrubber, and SQLite tape paging
 * live in `main/services/replay-source.ts` and `main/core/trading-engine.ts`
 * — this panel is a thin controller surface.
 *
 * Keyboard shortcuts when the panel has focus:
 *   Space = play/pause · ← → = ±5 s seek · [ ] = speed step · B = bookmark
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  REPLAY_MIN_SPEED, REPLAY_MAX_SPEED, REPLAY_DEFAULT_SPEED,
  HISTORICAL_BARS_FALLBACK_SYMBOLS, UNIVERSE,
} from '@shared/constants'
import type {
  ReplayBookmark, ReplayStatus, ReplayableSession,
  HistoricalImportRequest, HistoricalTimeframe,
} from '@shared/types'

const SPEED_PILLS = [0.5, 1, 2, 5, 10, 30, 100] as const

type SourceMode = 'sessions' | 'historical'

// Eligible historical-import symbols: only US equities / indices / ETFs from
// the universe. Futures and crypto are deliberately excluded — Alpaca's
// equity-bars endpoint doesn't cover them on the free IEX feed.
const HISTORICAL_ELIGIBLE_SYMBOLS = UNIVERSE
  .filter(u => u.assetClass === 'equity' || u.assetClass === 'index')
  .map(u => u.symbol)

function todayIsoDate(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function defaultHistoricalDate(): string {
  // Nudge default to the most recent weekday so the picker lands on a session
  // that probably has bars (today might still be in-session or weekend).
  const d = new Date()
  d.setDate(d.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function fmtTime(ts: number | null): string {
  if (ts == null || !Number.isFinite(ts)) return '—'
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

function fmtDateTime(ts: number | null): string {
  if (ts == null || !Number.isFinite(ts)) return '—'
  const d = new Date(ts)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })} · ${d.toLocaleTimeString('en-US', { hour12: false })}`
}

function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return h > 0 ? `${h}h ${m}m ${ss}s` : m > 0 ? `${m}m ${ss}s` : `${ss}s`
}

function isHistoricalId(id: string | null | undefined): boolean {
  return !!id && id.startsWith('hist_')
}

export function ReplayPanel() {
  const [sourceMode, setSourceMode] = useState<SourceMode>('sessions')

  // Sessions / playback
  const [sessions,  setSessions]  = useState<ReplayableSession[]>([])
  const [sessId,    setSessId]    = useState<string>('')
  const [status,    setStatus]    = useState<ReplayStatus | null>(null)
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [notice,    setNotice]    = useState<string | null>(null)
  const [scrub,     setScrub]     = useState<number | null>(null)
  const [bookLabel, setBookLabel] = useState('')

  // Historical importer state
  const [histDate,    setHistDate]    = useState<string>(defaultHistoricalDate())
  const [histTf,      setHistTf]      = useState<HistoricalTimeframe>('1Min')
  const [histSymbols, setHistSymbols] = useState<string[]>(() => [...HISTORICAL_BARS_FALLBACK_SYMBOLS])
  const [importing,   setImporting]   = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)

  // ── Bootstrap: subscribe to status, fetch sessions ──
  useEffect(() => {
    let cancelled = false
    void window.satex?.replay?.listSessions().then(s => { if (!cancelled) setSessions(s) }).catch(() => {})
    void window.satex?.replay?.getStatus().then(s => {
      if (cancelled) return
      setStatus(s)
      if (s.sessionId && s.mode !== 'recording' && !sessId) setSessId(s.sessionId)
    }).catch(() => {})
    const unsub = window.satex?.replay?.onStatus(s => setStatus(s))
    return () => { cancelled = true; unsub?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Refresh session list when replay stops (a fresh tape may exist) ──
  useEffect(() => {
    if (status?.mode === 'recording') {
      void window.satex?.replay?.listSessions().then(setSessions).catch(() => {})
    }
  }, [status?.mode])

  const active = status?.mode === 'playing' || status?.mode === 'paused'
  const activeSessionId = active ? status?.sessionId ?? null : null

  // Filter sessions per the active tab so the picker only shows one source kind.
  const filteredSessions = useMemo(() => {
    return sessions.filter(s =>
      sourceMode === 'historical' ? isHistoricalId(s.sessionId) : !isHistoricalId(s.sessionId)
    )
  }, [sessions, sourceMode])

  // Reset the picker when the user flips tabs (active replay is unaffected).
  useEffect(() => {
    if (active) return
    if (sessId && !filteredSessions.some(s => s.sessionId === sessId)) setSessId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode])

  const tape = useMemo(() => {
    if (active && status) {
      return {
        startTs: status.tapeStartTs ?? 0,
        endTs:   status.tapeEndTs   ?? 0,
        cursorTs: status.cursorTs ?? 0,
      }
    }
    const s = sessions.find(x => x.sessionId === sessId)
    return s
      ? { startTs: s.firstTickTs ?? 0, endTs: s.lastTickTs ?? 0, cursorTs: s.firstTickTs ?? 0 }
      : null
  }, [active, status, sessions, sessId])

  const progress = useMemo(() => {
    if (scrub != null) return scrub
    if (status?.progress != null) return status.progress
    return 0
  }, [scrub, status?.progress])

  // ── Transport ──
  async function start(speed = REPLAY_DEFAULT_SPEED): Promise<void> {
    if (!sessId) { setError('Pick a recorded session first'); return }
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await window.satex?.replay?.start({ sessionId: sessId, speed })
      if (!res?.ok) setError(res?.reason ?? 'Replay start failed')
    } finally { setBusy(false) }
  }
  async function stop():   Promise<void> { setBusy(true); try { await window.satex?.replay?.stop()   } finally { setBusy(false) } }
  async function pause():  Promise<void> { setBusy(true); try { await window.satex?.replay?.pause()  } finally { setBusy(false) } }
  async function resume(): Promise<void> { setBusy(true); try { await window.satex?.replay?.resume() } finally { setBusy(false) } }

  async function setSpeed(s: number): Promise<void> {
    if (!active) return
    await window.satex?.replay?.setSpeed(s)
  }

  async function seekTo(ts: number): Promise<void> {
    if (!active) return
    await window.satex?.replay?.seek(ts)
  }

  async function jumpBookmark(b: ReplayBookmark): Promise<void> { await seekTo(b.ts) }

  async function addBookmark(): Promise<void> {
    if (!active) return
    await window.satex?.replay?.addBookmark(bookLabel.trim() || `@ ${fmtTime(status?.cursorTs ?? null)}`)
    setBookLabel('')
  }

  async function delBookmark(id: string): Promise<void> {
    await window.satex?.replay?.deleteBookmark(id)
  }

  function onScrubChange(e: React.ChangeEvent<HTMLInputElement>): void {
    setScrub(parseFloat(e.target.value))
  }
  function onScrubCommit(): void {
    if (scrub == null || !tape) return
    const ts = tape.startTs + scrub * Math.max(1, tape.endTs - tape.startTs)
    void seekTo(ts)
    setScrub(null)
  }

  // ── Historical import ──
  function toggleHistSymbol(sym: string): void {
    setHistSymbols(cur => cur.includes(sym) ? cur.filter(s => s !== sym) : [...cur, sym])
  }
  function pickHistDefaults(): void { setHistSymbols([...HISTORICAL_BARS_FALLBACK_SYMBOLS]) }
  function clearHistSymbols(): void { setHistSymbols([]) }

  async function runImport(): Promise<void> {
    if (importing) return
    if (histSymbols.length === 0) { setError('Pick at least one symbol'); return }
    setImporting(true); setError(null); setNotice(null)
    try {
      const req: HistoricalImportRequest = {
        date: histDate, symbols: histSymbols, timeframe: histTf,
      }
      const res = await window.satex?.replay?.importHistorical(req)
      if (!res?.ok) {
        setError(res?.reason ?? 'Import failed')
        return
      }
      const sessionList = await window.satex?.replay?.listSessions()
      setSessions(sessionList ?? [])
      if (res.sessionId) setSessId(res.sessionId)
      const skipped = (res.skipped ?? []).length
      setNotice(
        `Imported ${(res.tickCount ?? 0).toLocaleString()} ticks across ${(res.symbolsImported ?? []).length} symbols`
        + (skipped > 0 ? ` · ${skipped} skipped (no data on this date)` : '')
      )
    } catch (e) {
      setError(String(e))
    } finally {
      setImporting(false)
    }
  }

  async function deleteHistoricalSession(id: string): Promise<void> {
    if (!isHistoricalId(id)) return
    if (!window.confirm(`Delete imported session ${id}? Tape rows are wiped permanently.`)) return
    setBusy(true)
    try {
      const res = await window.satex?.replay?.deleteSession(id)
      if (!res?.ok) { setError(res?.reason ?? 'Delete failed'); return }
      const sessionList = await window.satex?.replay?.listSessions()
      setSessions(sessionList ?? [])
      if (sessId === id) setSessId('')
    } finally { setBusy(false) }
  }

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent): void => {
      if (!el.contains(document.activeElement) && document.activeElement !== el) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (!active && e.key !== ' ' && e.key !== 'Enter') return
      if (e.key === ' ') {
        e.preventDefault()
        if (!active) { void start(); return }
        void (status?.mode === 'paused' ? resume() : pause())
      } else if (e.key === 'ArrowLeft' && tape) {
        e.preventDefault()
        void seekTo(Math.max(tape.startTs, (status?.cursorTs ?? tape.startTs) - 5_000))
      } else if (e.key === 'ArrowRight' && tape) {
        e.preventDefault()
        void seekTo(Math.min(tape.endTs, (status?.cursorTs ?? tape.startTs) + 5_000))
      } else if (e.key === '[' || e.key === ']') {
        e.preventDefault()
        const cur = status?.speed ?? REPLAY_DEFAULT_SPEED
        const idx = SPEED_PILLS.findIndex(s => s >= cur)
        const next = e.key === '[' ? SPEED_PILLS[Math.max(0, idx - 1)] : SPEED_PILLS[Math.min(SPEED_PILLS.length - 1, idx + 1)]
        if (next != null) void setSpeed(next)
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        void addBookmark()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, status?.mode, status?.cursorTs, status?.speed, tape])

  // ── Render ──
  const totalDuration = tape ? tape.endTs - tape.startTs : 0
  const elapsed = tape && status?.cursorTs ? status.cursorTs - tape.startTs : 0
  const modePill = status?.mode ?? 'idle'

  return (
    <div className="replay-shell" ref={wrapRef} tabIndex={0}>
      {/* ── Source-mode tabs ─────────────────────────────────────── */}
      <div className="replay-tabs" role="tablist">
        <button
          type="button" role="tab"
          className={`replay-tab${sourceMode === 'sessions' ? ' on' : ''}`}
          aria-selected={sourceMode === 'sessions'}
          onClick={() => setSourceMode('sessions')}
        >
          My Sessions
        </button>
        <button
          type="button" role="tab"
          className={`replay-tab${sourceMode === 'historical' ? ' on' : ''}`}
          aria-selected={sourceMode === 'historical'}
          onClick={() => setSourceMode('historical')}
        >
          Historical Day
        </button>
        <span className="replay-tabs-spacer" />
        <span className={`replay-mode mode-${modePill}`}>{modePill.toUpperCase()}</span>
      </div>

      {/* ── Source-specific picker ───────────────────────────────── */}
      {sourceMode === 'sessions' ? (
        <div className="replay-top">
          <label className="replay-pick">
            <span className="lbl">Recorded session</span>
            <select
              className="replay-select"
              value={sessId}
              disabled={active || busy}
              onChange={e => setSessId(e.target.value)}
              aria-label="Recorded session"
            >
              <option value="">{filteredSessions.length === 0 ? 'No SATEX tape recorded yet' : 'Select session…'}</option>
              {filteredSessions.map(s => (
                <option key={s.sessionId} value={s.sessionId}>
                  {fmtDateTime(s.startedAt)} · {fmtDuration(s.durationMs)} · {s.tickCount.toLocaleString()} ticks
                </option>
              ))}
            </select>
          </label>
          <ReplayClocks status={status} tapeStart={tape?.startTs ?? null} totalDuration={totalDuration} elapsed={elapsed} />
        </div>
      ) : (
        <HistoricalImporterRow
          date={histDate} setDate={setHistDate}
          tf={histTf} setTf={setHistTf}
          symbols={histSymbols}
          eligibleSymbols={HISTORICAL_ELIGIBLE_SYMBOLS}
          onToggleSymbol={toggleHistSymbol}
          onPickDefaults={pickHistDefaults}
          onClearSymbols={clearHistSymbols}
          onImport={runImport}
          importing={importing}
          maxDate={todayIsoDate()}
          existingHistSessions={filteredSessions}
          selectedSession={sessId}
          onSelectSession={setSessId}
          onDeleteSession={deleteHistoricalSession}
          disabled={active}
        />
      )}

      {/* ── Scrubber ──────────────────────────────────────────────── */}
      <div className="replay-scrub" aria-label="Tape scrubber">
        <div className="replay-track">
          <div className="replay-fill" style={{ width: `${(progress * 100).toFixed(2)}%` }} />
          {(status?.bookmarks ?? []).map(b => {
            if (!tape || tape.endTs <= tape.startTs) return null
            const pct = ((b.ts - tape.startTs) / (tape.endTs - tape.startTs)) * 100
            return (
              <button
                key={b.id}
                type="button"
                className="replay-bookmark-tick"
                style={{ left: `${pct.toFixed(2)}%` }}
                onClick={() => void jumpBookmark(b)}
                title={`${b.label} · ${fmtTime(b.ts)}`}
                aria-label={`Jump to bookmark ${b.label}`}
              />
            )
          })}
        </div>
        <input
          type="range"
          className="replay-range"
          min={0} max={1} step={0.0005}
          value={progress}
          disabled={!active}
          onChange={onScrubChange}
          onMouseUp={onScrubCommit}
          onKeyUp={onScrubCommit}
          aria-label="Replay position"
        />
      </div>

      {/* ── Transport ──────────────────────────────────────────────── */}
      <div className="replay-transport">
        {!active ? (
          <button type="button" className="replay-btn primary" disabled={busy || !sessId} onClick={() => void start()}>
            ▶ Play
          </button>
        ) : status?.mode === 'paused' ? (
          <button type="button" className="replay-btn primary" disabled={busy} onClick={() => void resume()}>
            ▶ Resume
          </button>
        ) : (
          <button type="button" className="replay-btn warn" disabled={busy} onClick={() => void pause()}>
            ❚❚ Pause
          </button>
        )}
        <button type="button" className="replay-btn danger" disabled={busy || !active} onClick={() => void stop()}>
          ■ Stop · Return to Live
        </button>

        <div className="replay-speeds" role="group" aria-label="Playback speed">
          {SPEED_PILLS.map(s => (
            <button
              key={s}
              type="button"
              className={`replay-speed${(status?.speed ?? REPLAY_DEFAULT_SPEED) === s ? ' on' : ''}`}
              disabled={!active || s < REPLAY_MIN_SPEED || s > REPLAY_MAX_SPEED}
              onClick={() => void setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* ── Bookmarks ──────────────────────────────────────────────── */}
      <div className="replay-bookmarks">
        <form
          className="replay-bookmark-form"
          onSubmit={e => { e.preventDefault(); void addBookmark() }}
        >
          <input
            type="text"
            className="replay-bookmark-input"
            placeholder={active ? 'Bookmark label · press B' : 'Start playback to bookmark'}
            value={bookLabel}
            disabled={!active}
            onChange={e => setBookLabel(e.target.value)}
            aria-label="Bookmark label"
          />
          <button type="submit" className="replay-btn small" disabled={!active}>
            + Bookmark
          </button>
        </form>
        <ul className="replay-bookmark-list scrollbar-thin">
          {(status?.bookmarks ?? []).length === 0 ? (
            <li className="replay-bookmark-empty">No bookmarks yet · press B during playback</li>
          ) : (status?.bookmarks ?? []).map(b => (
            <li key={b.id} className="replay-bookmark-row">
              <button type="button" className="replay-bookmark-jump" onClick={() => void jumpBookmark(b)} title="Seek to bookmark">
                <span className="mono">{fmtTime(b.ts)}</span>
                <span className="lbl">{b.label}</span>
              </button>
              <button type="button" className="replay-bookmark-del" onClick={() => void delBookmark(b.id)} aria-label="Delete bookmark">×</button>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Footer + messages ─────────────────────────────────────── */}
      <footer className="replay-footer">
        {status?.autoPausedReason && (
          <span
            className="replay-foot-msg warn"
            title={
              status.autoPausedReason === 'wall-clock-backjump'
                ? 'System clock jumped backward (NTP correction). Replay paused so the cursor does not re-read drained rows. Click ▶ Resume above to continue.'
                : status.autoPausedReason === 'suspend-detected'
                  ? 'Wall clock jumped forward more than 5 seconds (laptop suspend or scheduler stall). Replay paused so the cursor does not silently skip past tape rows. Click ▶ Resume above to continue.'
                  : `Replay paused: ${status.autoPausedReason}`
            }
          >
            Auto-paused: {
              status.autoPausedReason === 'wall-clock-backjump' ? 'wall-clock backjump'
              : status.autoPausedReason === 'suspend-detected' ? 'suspend detected'
              : status.autoPausedReason
            } · use ▶ Resume to continue
          </span>
        )}
        {error  && <span className="replay-foot-msg err">{error}</span>}
        {notice && !error && <span className="replay-foot-msg ok">{notice}</span>}
        {!error && !notice && !status?.autoPausedReason && active && status?.sessionId && (
          <span className="replay-foot-msg ok">
            {isHistoricalId(activeSessionId) ? 'Replaying historical day' : 'Replaying live tape'}{' '}
            {activeSessionId?.slice(0, 16)} · {(status.emittedTicks ?? 0).toLocaleString()} ticks emitted
          </span>
        )}
        <span className="replay-shortcuts">SPACE play/pause · ← → seek 5s · [ ] speed · B bookmark</span>
      </footer>
    </div>
  )
}

// ── Subcomponent: clocks row (reused across both source modes) ─────────────
function ReplayClocks({
  status, tapeStart, totalDuration, elapsed,
}: {
  status: ReplayStatus | null
  tapeStart: number | null
  totalDuration: number
  elapsed: number
}) {
  return (
    <div className="replay-clocks">
      <div className="replay-clock">
        <span className="lbl">CURSOR</span>
        <span className="val mono">{fmtTime(status?.cursorTs ?? tapeStart ?? null)}</span>
      </div>
      <div className="replay-clock">
        <span className="lbl">ELAPSED</span>
        <span className="val mono">{fmtDuration(elapsed)}</span>
      </div>
      <div className="replay-clock">
        <span className="lbl">TOTAL</span>
        <span className="val mono">{fmtDuration(totalDuration)}</span>
      </div>
      <div className="replay-clock">
        <span className="lbl">SPEED</span>
        <span className="val mono">{(status?.speed ?? REPLAY_DEFAULT_SPEED).toFixed(1)}×</span>
      </div>
    </div>
  )
}

// ── Subcomponent: historical importer ──────────────────────────────────────
function HistoricalImporterRow({
  date, setDate, tf, setTf,
  symbols, eligibleSymbols, onToggleSymbol, onPickDefaults, onClearSymbols,
  onImport, importing, maxDate,
  existingHistSessions, selectedSession, onSelectSession, onDeleteSession,
  disabled,
}: {
  date: string; setDate: (s: string) => void
  tf: HistoricalTimeframe; setTf: (t: HistoricalTimeframe) => void
  symbols: string[]
  eligibleSymbols: string[]
  onToggleSymbol: (s: string) => void
  onPickDefaults: () => void
  onClearSymbols: () => void
  onImport: () => void
  importing: boolean
  maxDate: string
  existingHistSessions: ReplayableSession[]
  selectedSession: string
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => Promise<void>
  disabled: boolean
}) {
  return (
    <div className="replay-hist">
      <div className="replay-hist-row">
        <label className="replay-pick">
          <span className="lbl">Date · US session</span>
          <input
            type="date"
            className="replay-select replay-date"
            value={date}
            max={maxDate}
            disabled={disabled || importing}
            onChange={e => setDate(e.target.value)}
            aria-label="Historical session date"
          />
        </label>
        <label className="replay-pick">
          <span className="lbl">Timeframe</span>
          <select
            className="replay-select"
            value={tf}
            disabled={disabled || importing}
            onChange={e => setTf(e.target.value as HistoricalTimeframe)}
            aria-label="Bar timeframe"
          >
            <option value="1Min">1-minute bars</option>
            <option value="1Hour">1-hour bars</option>
          </select>
        </label>
        <button
          type="button"
          className="replay-btn primary"
          onClick={onImport}
          disabled={disabled || importing || symbols.length === 0}
          title="Fetch Alpaca bars and materialize into the tape"
        >
          {importing ? 'Importing…' : '⤓ Fetch Day'}
        </button>
      </div>

      <div className="replay-hist-symbols">
        <div className="replay-hist-symhead">
          <span className="lbl">Symbols ({symbols.length})</span>
          <button type="button" className="replay-link" onClick={onPickDefaults} disabled={disabled || importing}>defaults</button>
          <span className="replay-link-sep">·</span>
          <button type="button" className="replay-link" onClick={onClearSymbols} disabled={disabled || importing}>clear</button>
        </div>
        <div className="replay-symchips">
          {eligibleSymbols.map(s => {
            const on = symbols.includes(s)
            return (
              <button
                key={s}
                type="button"
                className={`replay-symchip${on ? ' on' : ''}`}
                onClick={() => onToggleSymbol(s)}
                disabled={disabled || importing}
                aria-pressed={on}
              >
                {s}
              </button>
            )
          })}
        </div>
      </div>

      {existingHistSessions.length > 0 && (
        <div className="replay-hist-cache">
          <span className="lbl">Already imported</span>
          <ul className="replay-hist-cache-list scrollbar-thin">
            {existingHistSessions.map(s => (
              <li key={s.sessionId} className={`replay-hist-cache-row${selectedSession === s.sessionId ? ' on' : ''}`}>
                <button
                  type="button"
                  className="replay-hist-cache-pick"
                  onClick={() => onSelectSession(s.sessionId)}
                  disabled={disabled}
                  title="Select for playback"
                >
                  <span className="mono">{s.sessionId.replace(/^hist_/, '')}</span>
                  <span className="meta">{s.tickCount.toLocaleString()} ticks · {s.symbols} sym</span>
                </button>
                <button
                  type="button"
                  className="replay-hist-cache-del"
                  onClick={() => void onDeleteSession(s.sessionId)}
                  disabled={disabled}
                  aria-label={`Delete ${s.sessionId}`}
                  title="Delete imported tape"
                >×</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
