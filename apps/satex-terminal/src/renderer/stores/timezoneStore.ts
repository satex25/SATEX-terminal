/**
 * SATEX — Timezone store (v0.6 · selectable local clock).
 *
 * Drives the user-selectable *local* clock in the TopBar + Macro strip. UTC is
 * the fixed trading anchor and is never configurable here — this store only
 * governs the second, local clock the operator picks from the top trading
 * centers.
 *
 * The catalog is the ten most trading-relevant zones (exchange hubs), each with
 * a canonical IANA id (DST handled by the runtime via `Intl`) and a stable,
 * DST-agnostic 3-letter code shown on the compact clock. Frankfurt/Eurex is
 * represented by `Europe/Berlin` — the canonical zone Frankfurt links to
 * (identical CET/CEST rules), which every ICU build resolves (some ICU builds,
 * including the one Vitest runs under, don't resolve the `Europe/Frankfurt`
 * link).
 *
 * Persistence mirrors themeStore: renderer-side `localStorage` only. The clock
 * zone is a pure presentation preference — no Vault file, no main-process IPC.
 * The store does NOT format time itself; that's useClocks' job (which reads the
 * selected id). Keeping formatting out of the store keeps it env-agnostic and
 * trivially testable. See [[themeStore]] for the pattern.
 */
import { create } from 'zustand'

export interface TradingZone {
  /** Canonical IANA zone id — fed to Intl for DST-correct formatting. */
  id:     string
  /** Stable 3-letter code shown on the compact clock (DST-agnostic). */
  code:   string
  /** Full label for the Settings picker. */
  label:  string
  /** Primary exchange(s) — context in the picker. */
  market: string
}

/**
 * The ten most trading-relevant zones, ordered west → east by UTC offset. The
 * compact `code` is the exchange city (unambiguous across DST, unlike raw tz
 * abbreviations where e.g. Chicago and Shanghai both read "CST").
 */
export const TRADING_TIMEZONES: readonly TradingZone[] = [
  { id: 'America/New_York', code: 'NY',  label: 'New York',   market: 'NYSE · NASDAQ (ET)' },
  { id: 'America/Chicago',  code: 'CHI', label: 'Chicago',    market: 'CME · CBOT (CT)' },
  { id: 'Europe/London',    code: 'LON', label: 'London',     market: 'LSE · FX (GMT/BST)' },
  { id: 'Europe/Berlin',    code: 'FRA', label: 'Frankfurt',  market: 'Eurex · Xetra (CET/CEST)' },
  { id: 'Asia/Dubai',       code: 'DXB', label: 'Dubai',      market: 'DFM · DGCX (GST)' },
  { id: 'Asia/Singapore',   code: 'SGP', label: 'Singapore',  market: 'SGX (SGT)' },
  { id: 'Asia/Hong_Kong',   code: 'HKG', label: 'Hong Kong',  market: 'HKEX (HKT)' },
  { id: 'Asia/Shanghai',    code: 'SHA', label: 'Shanghai',   market: 'SSE · SZSE (CST)' },
  { id: 'Asia/Tokyo',       code: 'TYO', label: 'Tokyo',      market: 'TSE · OSE (JST)' },
  { id: 'Australia/Sydney', code: 'SYD', label: 'Sydney',     market: 'ASX (AEST/AEDT)' },
] as const

export type TimezoneId = (typeof TRADING_TIMEZONES)[number]['id']
const ZONE_IDS: readonly string[] = TRADING_TIMEZONES.map((z) => z.id)
/** Chicago (CT) — preserves the historical CST clock behavior on first boot. */
const DEFAULT_ZONE: TimezoneId = 'America/Chicago'
const STORAGE_KEY = 'satex.timezone'

/** Look up a zone's presentation code; falls back to the id's last segment. */
export function zoneCode(id: string): string {
  return TRADING_TIMEZONES.find((z) => z.id === id)?.code
    ?? id.split('/').pop()?.slice(0, 3).toUpperCase()
    ?? 'LOC'
}

function readPersistedZone(): TimezoneId {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY)
    if (raw && ZONE_IDS.includes(raw)) return raw as TimezoneId
  } catch { /* sandboxed renderer / headless test — fall through to default */ }
  return DEFAULT_ZONE
}

function persistZone(id: TimezoneId): void {
  try { window.localStorage?.setItem(STORAGE_KEY, id) }
  catch { /* best-effort; in-memory state is the source of truth */ }
}

interface TimezoneStoreState {
  timezone: TimezoneId
  setTimezone: (id: TimezoneId) => void
}

export const useTimezoneStore = create<TimezoneStoreState>((set, get) => ({
  timezone: readPersistedZone(),
  setTimezone: (id) => {
    if (!ZONE_IDS.includes(id)) return
    if (get().timezone === id) return
    set({ timezone: id })
    persistZone(id)
  },
}))
