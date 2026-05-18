/**
 * SATEX — Runtime IPC payload schemas (S0-8 · 2026-05-16).
 *
 * Zod validators for every IPC channel that accepts a payload. The renderer is
 * sandboxed (contextIsolation:true, nodeIntegration:false), but a compromised
 * renderer (XSS via injected news/AI content) could still call window.satex.*
 * with hostile shapes. Type annotations in main/index.ts are erased at compile
 * time and provide zero runtime defense. These schemas are the wall.
 *
 * Convention: every schema is named <Action>Req and exported alongside an
 * inferred type alias. Wrap each handler in main/index.ts with the `validated`
 * helper there.
 */
import { z } from 'zod'

// ── Primitive enums + reusables ────────────────────────────────────────────
const OrderSideS = z.enum(['buy', 'sell'])
const OrderTypeS = z.enum(['market', 'limit', 'stop'])
const AccountModeS = z.enum(['paper', 'live'])
const FeedS = z.enum(['iex', 'sip'])
const JournalTagS = z.enum(['planned', 'breakout', 'fade', 'scalp', 'swing', 'revenge', 'FOMO'])
const EmaPeriodS = z.union([z.literal(9), z.literal(21), z.literal(50), z.literal(200)])
const WorkspaceS = z.enum(['Trade', 'Focus', 'Markets', 'Replay', 'Quad'])
const HistoricalTimeframeS = z.enum(['1Min', '1Hour'])
const VaultScopeS = z.enum(['session', 'trade', 'tactics', 'brain', 'observer', 'manual'])

/** Symbols are short alphanumeric tickers (NVDA, ES, BTC-USD, etc.). Cap at
 *  16 to allow for futures continuation suffixes like `ESZ5` and crypto pairs
 *  like `BTC/USDT`. Empty rejected. */
const SymbolS = z.string().min(1).max(16).regex(/^[A-Za-z0-9._/-]+$/, 'invalid symbol characters')

/** A finite positive number. Used for quantities, prices, caps. Rejects 0,
 *  Infinity, NaN — none of which are valid sizes or prices. */
const PositiveFiniteS = z.number().positive().finite()
const NonNegativeFiniteS = z.number().nonnegative().finite()
const FiniteIntS = z.number().int().finite()

// ── Orders ──────────────────────────────────────────────────────────────────
// `.strict()` rejects unknown fields rather than silently stripping them.
// Defense-in-depth alongside the `triggeredBy` removal (adversarial finding
// C1, 2026-05-16): a renderer trying to inject `triggeredBy:'stop-loss'`
// to bypass the kill-switch / stale-quote / market-hours gates now gets a
// "Unrecognized key" error instead of a silently-stripped field.
export const OrderSubmitReq = z.object({
  id: z.string().optional(),
  symbol: SymbolS,
  side: OrderSideS,
  type: OrderTypeS,
  quantity: PositiveFiniteS,
  limitPrice: PositiveFiniteS.optional(),
  stopLoss: PositiveFiniteS.optional(),
  takeProfit: PositiveFiniteS.optional(),
  source: z.string().max(64).optional(),
  tags: z.array(JournalTagS).max(16).optional(),
  conviction: z.number().int().min(1).max(10).optional(),
}).strict()
export type OrderSubmitReq = z.infer<typeof OrderSubmitReq>

export const OrderCancelReq = z.string().min(1).max(128)
export type OrderCancelReq = z.infer<typeof OrderCancelReq>

// ── Risk ────────────────────────────────────────────────────────────────────
export const KillSwitchReq = z.boolean()
export type KillSwitchReq = z.infer<typeof KillSwitchReq>

// ── Market data ─────────────────────────────────────────────────────────────
export const CandlesGetReq = z.object({
  symbol: SymbolS,
  limit: z.number().int().positive().max(100_000).optional(),
})
export type CandlesGetReq = z.infer<typeof CandlesGetReq>

export const SymbolOnlyReq = SymbolS
export type SymbolOnlyReq = z.infer<typeof SymbolOnlyReq>

/** Symbol-or-omitted — used by depth/window handlers that accept undefined. */
export const OptionalSymbolReq = SymbolS.optional()
export type OptionalSymbolReq = z.infer<typeof OptionalSymbolReq>

export const SubscribeReq = z.array(SymbolS).max(256)
export type SubscribeReq = z.infer<typeof SubscribeReq>

// ── Watchlist ───────────────────────────────────────────────────────────────
export const WatchlistSetReq = z.array(SymbolS).max(256)
export type WatchlistSetReq = z.infer<typeof WatchlistSetReq>

// ── Sessions ────────────────────────────────────────────────────────────────
export const SessionIdReq = z.string().min(1).max(128)
export type SessionIdReq = z.infer<typeof SessionIdReq>

export const OptionalSessionIdReq = z.string().min(1).max(128).optional()
export type OptionalSessionIdReq = z.infer<typeof OptionalSessionIdReq>

// ── Credentials ─────────────────────────────────────────────────────────────
export const CredentialsSetReq = z.object({
  keyId: z.string().min(1).max(256),
  secretKey: z.string().min(1).max(512),
  feed: FeedS,
  mode: AccountModeS.optional(),
})
export type CredentialsSetReq = z.infer<typeof CredentialsSetReq>

export const BaiduSetReq = z.string().min(1).max(512)
export type BaiduSetReq = z.infer<typeof BaiduSetReq>

// ── Live mode ───────────────────────────────────────────────────────────────
// `confirmPhrase` removed 2026-05-16 (adversarial finding C6). The renderer-
// supplied string was bypassable by any code running in-process (XSS via
// news content, AI brain output, devtools console). Live-mode enable now
// requires a click in a native Electron modal that the renderer cannot
// reach — see main/index.ts handler. `.strict()` rejects unknown fields
// for defense-in-depth so a stale renderer trying to send `confirmPhrase`
// gets an explicit error rather than a silent strip.
export const LiveModeSetReq = z.object({
  enabled: z.boolean(),
  notionalCap: NonNegativeFiniteS.max(1_000_000),
}).strict()
export type LiveModeSetReq = z.infer<typeof LiveModeSetReq>

// ── Alpaca endpoint mode ────────────────────────────────────────────────────
export const AlpacaModeSetReq = z.object({ mode: AccountModeS })
export type AlpacaModeSetReq = z.infer<typeof AlpacaModeSetReq>

// ── AI brain ────────────────────────────────────────────────────────────────
export const BrainDecisionReq = SymbolS
export type BrainDecisionReq = z.infer<typeof BrainDecisionReq>

// ── Autonomous trader ───────────────────────────────────────────────────────
/** Patch is a partial config: any subset of the known AutonomousConfig fields.
 *  Engine clamps to safe ranges (autonomous-trader.ts setConfig).
 *
 *  2026-05-18 — was `z.record(z.string(), z.number().finite())`, which accepted
 *  unbounded key counts. Combined with the 1MB IPC payload cap, a hostile
 *  renderer could pin the main process on Map insert/iterate work via a
 *  config patch with ~50k spurious keys. The `.strict()` allowlist drops
 *  unknown keys at the boundary; every value is a finite number. Keep this
 *  in sync with AutonomousConfig in services/autonomous-trader.ts. */
export const AutonomousConfigSetReq = z.object({
  intervalMs:           z.number().finite().optional(),
  confidenceThreshold:  z.number().finite().optional(),
  notionalPct:          z.number().finite().optional(),
  minNotional:          z.number().finite().optional(),
  maxNotional:          z.number().finite().optional(),
  cooldownMs:           z.number().finite().optional(),
  stopAtrMult:          z.number().finite().optional(),
  takeProfitAtrMult:    z.number().finite().optional(),
}).strict()
export type AutonomousConfigSetReq = z.infer<typeof AutonomousConfigSetReq>

// ── Vault ───────────────────────────────────────────────────────────────────
export const VaultCheckpointReq = z.object({
  reason: z.string().min(1).max(512),
  scope: VaultScopeS,
  detail: z.string().max(4096).optional(),
})
export type VaultCheckpointReq = z.infer<typeof VaultCheckpointReq>

// ── Replay ──────────────────────────────────────────────────────────────────
export const ReplayStartReq = z.object({
  sessionId: z.string().min(1).max(128),
  fromTs: FiniteIntS.optional(),
  speed: z.number().finite().positive().max(1000).optional(),
})
export type ReplayStartReq = z.infer<typeof ReplayStartReq>

export const ReplaySeekReq = FiniteIntS
export type ReplaySeekReq = z.infer<typeof ReplaySeekReq>

export const ReplaySpeedReq = z.number().finite().positive().max(1000)
export type ReplaySpeedReq = z.infer<typeof ReplaySpeedReq>

export const ReplayBookmarkAddReq = z.string().min(1).max(128)
export type ReplayBookmarkAddReq = z.infer<typeof ReplayBookmarkAddReq>

export const ReplayBookmarkDelReq = z.string().min(1).max(128)
export type ReplayBookmarkDelReq = z.infer<typeof ReplayBookmarkDelReq>

export const HistoricalImportReq = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  symbols: z.array(SymbolS).min(1).max(64),
  timeframe: HistoricalTimeframeS,
})
export type HistoricalImportReq = z.infer<typeof HistoricalImportReq>

// ── Indicator settings ──────────────────────────────────────────────────────
export const IndicatorSettingsSetReq = z.object({
  version: z.literal(1),
  enabled: z.object({
    'ema':           z.boolean(),
    'rsi':           z.boolean(),
    'double-top':    z.boolean(),
    'double-bottom': z.boolean(),
    'fibonacci':     z.boolean(),
    'pivot-points':  z.boolean(),
  }),
  emaPeriods: z.array(EmaPeriodS).min(1).max(4),
  rsiPeriod: z.number().int().min(2).max(200),
  fibLookback: z.number().int().min(5).max(1000),
})
export type IndicatorSettingsSetReq = z.infer<typeof IndicatorSettingsSetReq>

// ── Workspace state ─────────────────────────────────────────────────────────
export const WorkspaceStateSetReq = z.object({
  version: z.literal(1),
  workspace: WorkspaceS,
  quadSymbols: z.array(SymbolS).length(4),
  chartSymbol: SymbolS,
})
export type WorkspaceStateSetReq = z.infer<typeof WorkspaceStateSetReq>

// ── Trading journal ─────────────────────────────────────────────────────────
export const JournalReflectReq = z.object({
  id: z.string().min(1).max(128),
  lesson: z.string().max(1024),
  emotionTag: JournalTagS.optional(),
})
export type JournalReflectReq = z.infer<typeof JournalReflectReq>

// ── Layout / window ─────────────────────────────────────────────────────────
/** LayoutSave currently no-ops on the engine side; accept any object so we
 *  don't break callers when the contract solidifies. Reject scalars (would
 *  indicate the renderer is sending the wrong shape entirely). */
export const LayoutSaveReq = z.record(z.string(), z.unknown()).nullable().optional()
export type LayoutSaveReq = z.infer<typeof LayoutSaveReq>

export const WindowZoomReq = z.number().finite().min(0.25).max(4.0)
export type WindowZoomReq = z.infer<typeof WindowZoomReq>
