/**
 * SATEX — Macro Calendar Service (Phase 10 · Black Box)
 *
 * Curated macro & earnings event feed. Static catalog of recurring events
 * (FOMC, CPI, NFP, BoE, ECB, EIA crude, treasury auctions, big-tech earnings)
 * keyed to UTC time-of-day for the next trading week.
 *
 * Renderer's MacroStripPanel renders the next 12h window. Service recomputes
 * + pushes every 60s. `actual` results are filled by an explicit setter
 * (`reportActual`) callable from main when a print lands — we deliberately
 * don't scrape live feeds here; that's a future Phase 10.5 hookup.
 */
import type { MacroEvent, MacroImpact, MacroSnapshot } from '@shared/types'
import { isInBlackout, type BlackoutResult } from './blackout-window'
import { createLogger } from './logger'

const log = createLogger('macro')

export type MacroListener = (snap: MacroSnapshot) => void

/** UTC time-of-day for an event, plus its day-of-week (1=Mon..5=Fri).
 *  `dayOfWeek: null` ⇒ daily / every weekday. */
interface Template {
  id:         string
  hour:       number
  minute:     number
  dayOfWeek:  number | null
  label:      string
  cons:       string
  impact:     MacroImpact
}

/** Curated weekly cadence. Times are UTC. Real-world macro calendars change
 *  weekly; this gives a Black Box-faithful constant ribbon when no live feed
 *  is wired. The reportActual setter lets future hookups overlay realized
 *  prints on top. */
const TEMPLATES: Template[] = [
  // Daily / weekday events
  { id: 'london-open',  hour:  7, minute:  0, dayOfWeek: null, label: 'LONDON · cash open',          cons: '—',         impact: 'low'  },
  { id: 'ecb-fix',      hour: 13, minute:  0, dayOfWeek: null, label: 'ECB · FX fixing',             cons: '—',         impact: 'low'  },
  { id: 'us-open',      hour: 13, minute: 30, dayOfWeek: null, label: 'NYSE · cash open',            cons: '—',         impact: 'low'  },
  { id: 'us-close',     hour: 20, minute:  0, dayOfWeek: null, label: 'NYSE · cash close',           cons: '—',         impact: 'low'  },
  // Weekday-specific
  { id: 'cpi-mom',      hour: 13, minute: 30, dayOfWeek: 3, label: 'US CPI · m/m',                  cons: '+0.20%',    impact: 'high' },
  { id: 'fed-williams', hour: 14, minute: 30, dayOfWeek: 3, label: 'Fed Williams · NY',             cons: '—',         impact: 'med'  },
  { id: 'eia-crude',    hour: 15, minute:  0, dayOfWeek: 3, label: 'EIA Crude Stocks',              cons: '−1.8MM',    impact: 'med'  },
  { id: 'auction-30y',  hour: 18, minute:  0, dayOfWeek: 3, label: '30Y Auction · $22B',            cons: '—',         impact: 'med'  },
  { id: 'nfp',          hour: 13, minute: 30, dayOfWeek: 5, label: 'US Non-Farm Payrolls',          cons: '+185k',     impact: 'high' },
  { id: 'unemp',        hour: 13, minute: 30, dayOfWeek: 5, label: 'US Unemployment Rate',          cons: '4.1%',      impact: 'high' },
  { id: 'boe-mann',     hour: 14, minute:  0, dayOfWeek: 4, label: 'BoE Mann speech',               cons: '—',         impact: 'low'  },
  { id: 'jobless',      hour: 13, minute: 30, dayOfWeek: 4, label: 'US Initial Jobless Claims',     cons: '215k',      impact: 'med'  },
  { id: 'retail',       hour: 13, minute: 30, dayOfWeek: 2, label: 'US Retail Sales · m/m',         cons: '+0.30%',    impact: 'high' },
  { id: 'pmi',          hour: 14, minute: 45, dayOfWeek: 1, label: 'US Mfg PMI · flash',            cons: '50.4',      impact: 'med'  },
  { id: 'ppi',          hour: 13, minute: 30, dayOfWeek: 4, label: 'US PPI · m/m',                  cons: '+0.20%',    impact: 'med'  },
  // Earnings — AMC = After Market Close (21:00 UTC ≈ 5pm ET)
  { id: 'nvda-earn',    hour: 21, minute:  0, dayOfWeek: 3, label: 'NVDA · Q3 Earnings',            cons: 'EPS $0.74', impact: 'high' },
  { id: 'aapl-earn',    hour: 21, minute:  0, dayOfWeek: 4, label: 'AAPL · Q4 Earnings',            cons: 'EPS $2.39', impact: 'high' },
  { id: 'msft-earn',    hour: 21, minute:  0, dayOfWeek: 2, label: 'MSFT · Q1 Earnings',            cons: 'EPS $3.12', impact: 'high' },
]

/** Synthetic ribbon-fill events used when the real template calendar produces
 *  fewer than 6 events in the 12h window (e.g. overnight / weekend hours).
 *  Offsets are hours-from-now so the strip always shows motion. */
const SYNTH_FILL: Array<{ offsetH: number; label: string; cons: string; impact: MacroImpact }> = [
  { offsetH: 0.75, label: 'Block tape · institutional cross', cons: '$1.2B',   impact: 'med'  },
  { offsetH: 1.75, label: 'DXY pulse · session check',         cons: '—',       impact: 'low'  },
  { offsetH: 3.00, label: 'Treasury bid · 10Y demand',         cons: '—',       impact: 'med'  },
  { offsetH: 4.50, label: 'Asia open · TSE rotation',          cons: '—',       impact: 'med'  },
  { offsetH: 6.50, label: 'Crypto vol · BTC realized σ',       cons: '—',       impact: 'low'  },
  { offsetH: 8.50, label: 'EU pre-open · DAX futures',         cons: '—',       impact: 'low'  },
  { offsetH: 10.5, label: 'London prep · order book skew',     cons: '—',       impact: 'low'  },
]

/** Expand templates to concrete dated events covering [now, now + horizonH].
 *  Always returns 6 events: real ones first, then synthetic ribbon-fill so the
 *  6-slot strip is never sparse during off-hours / weekends. */
function expand(now: Date, horizonH: number): MacroEvent[] {
  const horizonMs = horizonH * 3600 * 1000
  const horizonEnd = new Date(now.getTime() + horizonMs)
  const out: MacroEvent[] = []
  // Look 1 day before to 2 days after horizon to catch close-by events
  const startDay = new Date(now); startDay.setUTCHours(0, 0, 0, 0)
  startDay.setUTCDate(startDay.getUTCDate() - 1)
  for (let d = 0; d < 4; d++) {
    const day = new Date(startDay); day.setUTCDate(day.getUTCDate() + d)
    const dow = day.getUTCDay()
    const isWeekend = dow === 0 || dow === 6
    for (const t of TEMPLATES) {
      // Weekday filter
      if (t.dayOfWeek !== null && t.dayOfWeek !== dow) continue
      if (t.dayOfWeek === null && isWeekend)           continue
      const evt = new Date(day); evt.setUTCHours(t.hour, t.minute, 0, 0)
      if (evt < now || evt > horizonEnd) continue
      out.push({
        id:     `${t.id}-${evt.toISOString().slice(0, 10)}`,
        tsUtc:  evt.toISOString(),
        label:  t.label,
        cons:   t.cons,
        actual: '—',
        impact: t.impact,
      })
    }
  }
  // Pad with synthetic ribbon-fill so the panel always shows 6 slots
  for (const s of SYNTH_FILL) {
    if (out.length >= 6) break
    const ts = new Date(now.getTime() + s.offsetH * 3600 * 1000)
    const id = `synth-${Math.round(s.offsetH * 10)}`
    out.push({
      id, tsUtc: ts.toISOString(),
      label: s.label, cons: s.cons, actual: '—', impact: s.impact,
    })
  }
  out.sort((a, b) => a.tsUtc.localeCompare(b.tsUtc))
  // Cap at 6 — Black Box panel layout shows 6 slots
  return out.slice(0, 6)
}

export class MacroCalendarService {
  private snapshot: MacroSnapshot | null = null
  private listeners: Set<MacroListener> = new Set()
  private timer: NodeJS.Timeout | null = null
  /** Actual-result overrides set via `reportActual(id, value)`. */
  private actuals: Map<string, string> = new Map()
  /** Horizon hours covered by the snapshot. Matches MacroStrip "NEXT 12H" header. */
  private horizonHours = 12

  start(): void {
    if (this.timer) return
    this.recompute()
    this.timer = setInterval(() => this.recompute(), 60_000)
    log.info('macro service started', { horizonH: this.horizonHours, eventCount: this.snapshot?.events.length ?? 0 })
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  get(): MacroSnapshot {
    if (!this.snapshot) this.recompute()
    return this.snapshot!
  }

  onUpdate(fn: MacroListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Set the realized print for a scheduled event. Triggers a push. */
  reportActual(id: string, actual: string): void {
    this.actuals.set(id, actual)
    this.recompute()
  }

  /** True iff any event of the given impact levels falls inside ±windowMs
   *  of `nowMs`. Pure delegation to blackout-window — wrapped here so
   *  consumers don't need to know the MacroCalendarService's internal
   *  snapshot shape. Tier-1 D.3. */
  checkBlackout(nowMs: number, impacts: MacroImpact[], windowMs: number): BlackoutResult {
    if (!this.snapshot) this.recompute()
    return isInBlackout(nowMs, this.snapshot!.events, impacts, windowMs)
  }

  private recompute(): void {
    const now = new Date()
    const events = expand(now, this.horizonHours).map(e => ({
      ...e,
      actual: this.actuals.get(e.id) ?? e.actual,
    }))
    this.snapshot = {
      events,
      horizonHours: this.horizonHours,
      computedAt:   Date.now(),
    }
    for (const fn of this.listeners) fn(this.snapshot)
  }
}
