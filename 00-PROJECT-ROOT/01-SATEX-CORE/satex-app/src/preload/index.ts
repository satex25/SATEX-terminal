/**
 * SATEX — Preload Script (contextBridge)
 * Exposes a typed, safe API surface to the renderer.
 * contextIsolation=true means the renderer has NO access to Node APIs.
 * Every capability is explicitly declared here — nothing more is accessible.
 *
 * Renderer accesses: window.satex.<method>
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PushChannel } from '@shared/ipc-channels'
import type {
  Candle, OrderRequest, Quote, Account, Order,
  SystemStatus, IndicatorSnapshot, BrainParameter,
  SessionRecord, PnlSnapshot, AlpacaCredentialsStatus,
  AlpacaModeStatus, AlpacaModeSetRequest,
  CredentialsMaskedStatus, CredentialsSetRequest,
  LlmStatus, LlmConfigSetRequest, AiDecision, CalibrationSnapshot, SelfEvalStatus,
  WireSnapshot,
  LiveModeStatus, LiveModeSetRequest, TacticsStatus,
  ObserverStats, LearnerStats, VaultStats, PatternWeight,
  VaultCheckpointRequest,
  ReplayStatus, ReplayStartRequest, ReplayBookmark, ReplayableSession,
  HistoricalImportRequest, HistoricalImportResult, HistoricalBarsRequest, HistoricalBarsResult,
  AutonomousStatus, AutonomousDecision,
  RegimeSnapshot, RiskGatesSnapshot, MacroSnapshot, SystemLogsTail, DepthSnapshot,
  ClosedTrade, JournalTag, Trade, FeedStatus, UpdateAvailable,
  SubSecondCandle,
  DataSource, DataSourceStatus, DataSourceSetRequest,
} from '@shared/types'
import type { IndicatorSettings } from '@shared/chart-indicators'
import type { WorkspaceState } from '@shared/types'
import type { FundedAccountSnapshot } from '@shared/funded/types'

// ── Typed listener wrapper ─────────────────────────────────────────────────────
function on<T>(channel: PushChannel, cb: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// ── Exposed API ────────────────────────────────────────────────────────────────
const satexApi = {
  // ── Push listeners (main → renderer) ──────────────────────────────────────
  onQuotesTick:         (cb: (quotes: Quote[]) => void)                               => on(IPC.QUOTES_TICK,        cb),
  onCandlesUpdate:      (cb: (data: { symbol: string; candle: Candle; isNew: boolean }) => void) => on(IPC.CANDLES_UPDATE, cb),
  onCandlesBulkReplace: (cb: (data: { symbol: string; candles: Candle[] }) => void)               => on(IPC.CANDLES_BULK_REPLACE, cb),
  onNewsAppend:         (cb: (item: unknown) => void)                                 => on(IPC.NEWS_APPEND,        cb),
  onSystemStatus:       (cb: (status: SystemStatus) => void)                          => on(IPC.SYSTEM_STATUS,      cb),
  onAccountUpdate:      (cb: (account: Account) => void)                              => on(IPC.ACCOUNT_UPDATE,     cb),
  onOrdersUpdate:       (cb: (orders: Order[]) => void)                               => on(IPC.ORDERS_UPDATE,      cb),
  onAutonomousDecision: (cb: (decision: AutonomousDecision) => void)                  => on(IPC.AUTONOMOUS_DECISION,cb),
  onAutonomousStats:    (cb: (s: AutonomousStatus) => void)                           => on(IPC.AUTONOMOUS_STATS,   cb),

  // ── Invoke calls (renderer → main) ────────────────────────────────────────
  subscribe:     (symbols: string[])               => ipcRenderer.invoke(IPC.SUBSCRIBE, symbols),
  submitOrder:   (req: OrderRequest)               => ipcRenderer.invoke(IPC.ORDER_SUBMIT, req) as Promise<{ ok: boolean; orderId?: string; reason?: string }>,
  cancelOrder:   (id: string)                      => ipcRenderer.invoke(IPC.ORDER_CANCEL, id),
  killSwitch:    (arm: boolean)                    => ipcRenderer.invoke(IPC.RISK_KILL, arm),

  getCandles:    (symbol: string, limit?: number)  => ipcRenderer.invoke(IPC.CANDLES_GET, { symbol, limit }) as Promise<Candle[]>,
  getIndicators: (symbol: string)                  => ipcRenderer.invoke(IPC.INDICATORS_GET, symbol) as Promise<IndicatorSnapshot>,
  getWatchlist:  ()                                => ipcRenderer.invoke(IPC.WATCHLIST_GET) as Promise<string[]>,
  setWatchlist:  (symbols: string[])               => ipcRenderer.invoke(IPC.WATCHLIST_SET, symbols),
  getOrdersHistory: (sessionId?: string)           => ipcRenderer.invoke(IPC.ORDERS_HISTORY, sessionId) as Promise<Order[]>,
  getSessions:   ()                                => ipcRenderer.invoke(IPC.SESSIONS_LIST) as Promise<SessionRecord[]>,
  getPnlSnapshots: (sessionId: string)             => ipcRenderer.invoke(IPC.SESSIONS_SNAPSHOTS, sessionId) as Promise<PnlSnapshot[]>,
  getBrainParams: ()                               => ipcRenderer.invoke(IPC.BRAIN_GET) as Promise<BrainParameter[]>,
  getCalibration: ()                               => ipcRenderer.invoke(IPC.CALIBRATION_GET) as Promise<CalibrationSnapshot>,
  getSelfEvalStatus: ()                            => ipcRenderer.invoke(IPC.SELF_EVAL_GET) as Promise<SelfEvalStatus>,
  setSelfEvalEnabled: (enabled: boolean)           => ipcRenderer.invoke(IPC.SELF_EVAL_SET, { enabled }) as Promise<SelfEvalStatus>,
  runSelfEvalNow: ()                               => ipcRenderer.invoke(IPC.SELF_EVAL_RUN) as Promise<{ ok: boolean; reason?: string }>,
  getWire: ()                                      => ipcRenderer.invoke(IPC.WIRE_GET) as Promise<WireSnapshot>,
  setWireEnabled: (enabled: boolean)               => ipcRenderer.invoke(IPC.WIRE_SET, { enabled }) as Promise<WireSnapshot>,
  onWireUpdate: (cb: (s: WireSnapshot) => void)    => on<WireSnapshot>(IPC.WIRE_UPDATE, cb),
  getCredentialsStatus: ()                         => ipcRenderer.invoke(IPC.CREDENTIALS_STATUS) as Promise<AlpacaCredentialsStatus>,
  healthCheck:   ()                                => ipcRenderer.invoke(IPC.HEALTH_CHECK),

  // ── Encrypted credential store (Phase 4) ───────────────────────────────────
  getCredentialsMasked: ()                         => ipcRenderer.invoke(IPC.CREDENTIALS_GET_MASKED) as Promise<CredentialsMaskedStatus>,
  setCredentials: (req: CredentialsSetRequest)     => ipcRenderer.invoke(IPC.CREDENTIALS_SET, req) as Promise<{ ok: boolean; reason?: string }>,
  clearCredentials: ()                             => ipcRenderer.invoke(IPC.CREDENTIALS_CLEAR) as Promise<{ ok: boolean }>,
  getLlmStatus: ()                                 => ipcRenderer.invoke(IPC.LLM_CONFIG_GET) as Promise<LlmStatus>,
  setLlmConfig: (req: LlmConfigSetRequest)         => ipcRenderer.invoke(IPC.LLM_CONFIG_SET, req) as Promise<{ ok: boolean; reason?: string }>,
  reconnectAlpaca: ()                              => ipcRenderer.invoke(IPC.ALPACA_RECONNECT) as Promise<{ ok: boolean; reason?: string }>,

  // ── Live mode (Phase 5) ─────────────────────────────────────────────────────
  getLiveMode: ()                                  => ipcRenderer.invoke(IPC.LIVE_MODE_GET) as Promise<LiveModeStatus>,
  setLiveMode: (req: LiveModeSetRequest)           => ipcRenderer.invoke(IPC.LIVE_MODE_SET, req) as Promise<{ ok: boolean; reason?: string }>,

  // ── Data feed (Simulator ⇄ Live Alpaca data) ────────────────────────────────
  getDataSource: ()                                => ipcRenderer.invoke(IPC.DATA_SOURCE_GET) as Promise<DataSourceStatus>,
  setDataSource: (req: DataSourceSetRequest)       => ipcRenderer.invoke(IPC.DATA_SOURCE_SET, req) as Promise<{ ok: boolean; reason?: string; source?: DataSource }>,

  // ── Alpaca endpoint mode (paper vs live URL) ────────────────────────────────
  getAlpacaMode: ()                                => ipcRenderer.invoke(IPC.ALPACA_MODE_GET) as Promise<AlpacaModeStatus>,
  setAlpacaMode: (req: AlpacaModeSetRequest)       => ipcRenderer.invoke(IPC.ALPACA_MODE_SET, req) as Promise<{ ok: boolean; reason?: string; baseUrl?: string }>,

  // ── Autonomous paper trader (Phase C) ───────────────────────────────────────
  enableAutonomous:     ()                            => ipcRenderer.invoke(IPC.AUTONOMOUS_ENABLE)  as Promise<{ ok: boolean; reason?: string }>,
  disableAutonomous:    ()                            => ipcRenderer.invoke(IPC.AUTONOMOUS_DISABLE) as Promise<{ ok: boolean }>,
  getAutonomousStatus:  ()                            => ipcRenderer.invoke(IPC.AUTONOMOUS_STATUS)  as Promise<AutonomousStatus>,
  getAutonomousRecent:  ()                            => ipcRenderer.invoke(IPC.AUTONOMOUS_RECENT)  as Promise<AutonomousDecision[]>,
  getAutonomousConfig:  ()                            => ipcRenderer.invoke(IPC.AUTONOMOUS_CONFIG_GET) as Promise<Record<string, number>>,
  setAutonomousConfig:  (patch: Partial<Record<
    'intervalMs' | 'confidenceThreshold' | 'notionalPct' | 'minNotional' |
    'maxNotional' | 'cooldownMs' | 'stopAtrMult' | 'takeProfitAtrMult', number
  >>) => ipcRenderer.invoke(IPC.AUTONOMOUS_CONFIG_SET, patch) as Promise<Record<string, number>>,

  // ── AI brain decision (Phase 6) ─────────────────────────────────────────────
  getAiDecision: (symbol: string)                  => ipcRenderer.invoke(IPC.BRAIN_DECISION, symbol) as Promise<AiDecision>,

  // ── MAY-TACTICS (Phase 7) ───────────────────────────────────────────────────
  getTacticsStatus: ()                             => ipcRenderer.invoke(IPC.TACTICS_STATUS) as Promise<TacticsStatus>,
  graduateTactics: ()                              => ipcRenderer.invoke(IPC.TACTICS_GRADUATE) as Promise<{ ok: boolean; reason?: string }>,

  // ── Phase 8: Observer / Learner / Vault ─────────────────────────────────────
  onObserverStats:  (cb: (s: ObserverStats) => void)              => on(IPC.OBSERVER_STATS, cb),
  onLearnerStats:   (cb: (s: LearnerStats) => void)               => on(IPC.LEARNER_STATS,  cb),
  onVaultStats:     (cb: (s: VaultStats) => void)                 => on(IPC.VAULT_STATS,    cb),
  getObserverStats: ()                                            => ipcRenderer.invoke(IPC.OBSERVER_GET)    as Promise<ObserverStats>,
  getLearnerStats:  ()                                            => ipcRenderer.invoke(IPC.LEARNER_GET)     as Promise<LearnerStats>,
  getLearnerWeights:()                                            => ipcRenderer.invoke(IPC.LEARNER_WEIGHTS) as Promise<PatternWeight[]>,
  getVaultStats:    ()                                            => ipcRenderer.invoke(IPC.VAULT_GET)       as Promise<VaultStats>,
  vaultCheckpoint:  (req: VaultCheckpointRequest)                 => ipcRenderer.invoke(IPC.VAULT_CHECKPOINT, req) as Promise<{ ok: boolean; path?: string }>,

  // ── Layout + CSV export ─────────────────────────────────────────────────────
  saveLayout: (payload?: unknown)                  => ipcRenderer.invoke(IPC.LAYOUT_SAVE, payload) as Promise<{ ok: boolean }>,
  exportOrdersCsv: ()                              => ipcRenderer.invoke(IPC.ORDERS_EXPORT_CSV) as Promise<{ ok: boolean; path?: string }>,
  /** C8: dump indicator settings + workspace + watchlist + journal + account
   *  to a JSON file under userData/snapshots. Returns the file path on
   *  success so the renderer can show it in a toast. Credentials excluded. */
  exportSnapshot:  ()                              => ipcRenderer.invoke(IPC.SNAPSHOT_EXPORT) as Promise<{ ok: boolean; path?: string; bytes?: number; reason?: string }>,

  // ── Window controls ────────────────────────────────────────────────────────
  toggleFullscreen: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_FULLSCREEN),
  toggleDevTools:   () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_DEVTOOLS),
  setZoom:  (factor: number) => ipcRenderer.invoke(IPC.WINDOW_SET_ZOOM, factor),
  getZoom:  ()               => ipcRenderer.invoke(IPC.WINDOW_GET_ZOOM) as Promise<number>,

  // ── Phase 10: SATEX Terminal v2 · Black Box ───────────────────────────────
  onRegimeUpdate:    (cb: (s: RegimeSnapshot)     => void) => on(IPC.REGIME_UPDATE,     cb),
  getRegime:         ()                                    => ipcRenderer.invoke(IPC.REGIME_GET) as Promise<RegimeSnapshot>,
  onRiskGatesUpdate: (cb: (s: RiskGatesSnapshot)  => void) => on(IPC.RISK_GATES_UPDATE, cb),
  getRiskGates:      ()                                    => ipcRenderer.invoke(IPC.RISK_GATES_GET) as Promise<RiskGatesSnapshot>,
  onMacroUpdate:     (cb: (s: MacroSnapshot)      => void) => on(IPC.MACRO_UPDATE,      cb),
  getMacro:          ()                                    => ipcRenderer.invoke(IPC.MACRO_GET) as Promise<MacroSnapshot>,
  onLogsTail:        (cb: (s: SystemLogsTail)     => void) => on(IPC.LOGS_TAIL,         cb),
  getLogsTail:       ()                                    => ipcRenderer.invoke(IPC.LOGS_GET) as Promise<SystemLogsTail>,
  onDepthUpdate:     (cb: (s: DepthSnapshot)      => void) => on(IPC.DEPTH_UPDATE,      cb),
  getDepth:          (symbol?: string)                     => ipcRenderer.invoke(IPC.DEPTH_GET, symbol) as Promise<DepthSnapshot>,
  subscribeDepth:    (symbol: string)                      => ipcRenderer.invoke(IPC.DEPTH_SUBSCRIBE, symbol) as Promise<{ ok: boolean }>,

  // ── Tier-1 (D.10, 2026-05-29) — funded-account compliance overlay ──────
  onFundedAccountUpdate: (cb: (s: FundedAccountSnapshot) => void) => on(IPC.FUNDED_ACCOUNT_UPDATE, cb),
  getFundedAccount:      ()                                       => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_GET) as Promise<FundedAccountSnapshot>,
  setFundedAccountProfile: (profileId: string | null)             => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_SET_PROFILE, { profileId }) as Promise<{ ok: boolean; reason?: string }>,
  clearFundedAccount:    ()                                       => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_CLEAR) as Promise<{ ok: boolean }>,
  triggerFundedFlat:     (reason: string)                         => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_TRIGGER_FLAT, { reason }) as Promise<{ ok: true }>,
  advanceFundedPhase:    (phase: 'combine' | 'funded' | 'activated') => ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_ADVANCE_PHASE, { phase }) as Promise<{ ok: boolean; reason?: string }>,

  // ── Replay engine (Phase 9) ────────────────────────────────────────────────
  replay: {
    onStatus:    (cb: (s: ReplayStatus) => void) => on(IPC.REPLAY_STATUS, cb),
    listSessions: ()                                 => ipcRenderer.invoke(IPC.REPLAY_SESSIONS)    as Promise<ReplayableSession[]>,
    start:        (req: ReplayStartRequest)          => ipcRenderer.invoke(IPC.REPLAY_START, req)  as Promise<{ ok: boolean; reason?: string }>,
    stop:         ()                                 => ipcRenderer.invoke(IPC.REPLAY_STOP)        as Promise<{ ok: boolean }>,
    pause:        ()                                 => ipcRenderer.invoke(IPC.REPLAY_PAUSE)       as Promise<{ ok: boolean }>,
    resume:       ()                                 => ipcRenderer.invoke(IPC.REPLAY_RESUME)      as Promise<{ ok: boolean }>,
    seek:         (ts: number)                       => ipcRenderer.invoke(IPC.REPLAY_SEEK, ts)    as Promise<{ ok: boolean }>,
    setSpeed:     (speed: number)                    => ipcRenderer.invoke(IPC.REPLAY_SET_SPEED, speed) as Promise<{ ok: boolean; speed: number }>,
    addBookmark:  (label: string)                    => ipcRenderer.invoke(IPC.REPLAY_BOOKMARK_ADD, label) as Promise<ReplayBookmark | null>,
    deleteBookmark: (id: string)                     => ipcRenderer.invoke(IPC.REPLAY_BOOKMARK_DEL, id) as Promise<{ ok: boolean }>,
    listBookmarks: (sessionId: string)               => ipcRenderer.invoke(IPC.REPLAY_BOOKMARKS, sessionId) as Promise<ReplayBookmark[]>,
    getStatus:    ()                                 => ipcRenderer.invoke(IPC.REPLAY_STATUS_GET)  as Promise<ReplayStatus>,
    importHistorical: (req: HistoricalImportRequest) => ipcRenderer.invoke(IPC.REPLAY_IMPORT_HISTORICAL, req) as Promise<HistoricalImportResult>,
    deleteSession:    (sessionId: string)            => ipcRenderer.invoke(IPC.REPLAY_DELETE_SESSION, sessionId) as Promise<{ ok: boolean; reason?: string }>,
  },

  // Replay-free historical bars for the chart's off-hours backfill (see
  // MARKET_HISTORICAL_BARS). Returns one symbol's day of OHLC bars directly —
  // no replay session, so the chart can show the last NY session without the
  // Replay workspace taking over.
  getHistoricalBars: (req: HistoricalBarsRequest) => ipcRenderer.invoke(IPC.MARKET_HISTORICAL_BARS, req) as Promise<HistoricalBarsResult>,

  // ── Chart-indicator toggle persistence (Phase 11) ───────────────────────────
  indicators: {
    getSettings: ()                              => ipcRenderer.invoke(IPC.INDICATOR_SETTINGS_GET)      as Promise<IndicatorSettings>,
    setSettings: (next: IndicatorSettings)       => ipcRenderer.invoke(IPC.INDICATOR_SETTINGS_SET, next) as Promise<IndicatorSettings>,
    getPriorDayHlc: (symbol: string)             => ipcRenderer.invoke(IPC.INDICATOR_PRIOR_DAY_HLC, symbol) as Promise<{ high: number; low: number; close: number; date: string } | null>,
  },

  // ── Workspace state persistence (Phase 12) ──────────────────────────────────
  workspace: {
    getState: ()                                 => ipcRenderer.invoke(IPC.WORKSPACE_STATE_GET)      as Promise<WorkspaceState>,
    setState: (next: WorkspaceState)             => ipcRenderer.invoke(IPC.WORKSPACE_STATE_SET, next) as Promise<WorkspaceState>,
  },

  // ── Footprint trade stream (P0-1) ──────────────────────────────────────────
  /** Subscribe to raw Trade events. Batched per market tick. Forwarder for
   *  the renderer's footprintStore + DeltaStrip / FootprintOverlay. */
  onTradesTick: (cb: (trades: Trade[]) => void) => on<Trade[]>(IPC.TRADES_TICK, cb),

  // ── Per-asset-class feed status (B3, 2026-05-18) ───────────────────────────
  /** Subscribe to feed-status transitions. The renderer uses this to render a
   *  SIM badge on quotes that come from synthetic seeds rather than a live
   *  broker feed. Diff-gated in the engine — only fires on class transition. */
  onFeedStatusUpdate: (cb: (s: FeedStatus) => void) => on<FeedStatus>(IPC.FEED_STATUS_UPDATE, cb),

  // ── CSP violation report (B9, 2026-05-19) ──────────────────────────────────
  /** Fire-and-forget — the renderer's `securitypolicyviolation` listener
   *  shapes a subset of the SecurityPolicyViolationEvent and ships it here
   *  so the main process can log to the rotating file sink. Callers should
   *  NOT await — the resolution carries no information they need. */
  reportCspViolation: (report: {
    blockedURI?: string; violatedDirective?: string; effectiveDirective?: string;
    sourceFile?: string; lineNumber?: number; columnNumber?: number;
    sample?: string; documentURI?: string;
  }) => ipcRenderer.invoke(IPC.CSP_VIOLATION_REPORT, report) as Promise<{ ok: true }>,

  // ── Auto-update (S1-9, 2026-05-19) ─────────────────────────────────────────
  /** Subscribe to update notifications. Fires twice per detected update —
   *  once when electron-updater confirms a newer version exists (downloaded:
   *  false, button still disabled in the toast), once when the binary finishes
   *  downloading (downloaded: true, button enables). */
  onUpdateAvailable: (cb: (u: UpdateAvailable) => void) => on<UpdateAvailable>(IPC.UPDATE_AVAILABLE, cb),
  /** Trigger quit-and-install. Safe to call only after `downloaded:true` has
   *  been observed; the main-side handler delegates to electron-updater which
   *  no-ops if the binary hasn't actually landed yet. */
  installUpdate:     () => ipcRenderer.invoke(IPC.UPDATE_INSTALL) as Promise<void>,

  // ── A1 sub-second crypto candles (v0.4.4, 2026-05-19) ──────────────────────
  /** Subscribe to bucket-seal events. Crypto-only — equity / index / future
   *  symbols never fire on this channel. The renderer's subsecondStore
   *  appends the bar to its (symbol, bucketMs) ring; ChartPanel reads from
   *  there when the user picks a 250ms / 500ms timeframe. */
  onSubsecondCandlesUpdate: (cb: (c: SubSecondCandle) => void) =>
    on<SubSecondCandle>(IPC.SUBSECOND_CANDLES_UPDATE, cb),
  /** Hydration fetch — called on chart mount / timeframe switch to populate
   *  the series before live seals start arriving. Returns ascending-time
   *  order. Empty array means either no ticks have ever arrived for that
   *  (symbol, bucketMs) pair, or the symbol isn't a crypto asset. */
  getSubsecondCandles: (symbol: string, bucketMs: number, limit: number) =>
    ipcRenderer.invoke(IPC.SUBSECOND_CANDLES_GET, { symbol, bucketMs, limit }) as Promise<SubSecondCandle[]>,

  /** Sprint 2 — Per-symbol preferred default bucket for sub-second crypto
   *  candles. Read on Settings modal open + chart mount so the UI reflects
   *  the user's persisted choice. Empty `{}` when nothing has been configured
   *  (engine uses 250ms internal default). */
  getSubsecondPrefs: () =>
    ipcRenderer.invoke(IPC.SUBSECOND_PREFS_GET) as Promise<Record<string, 250 | 500>>,
  /** Sprint 2 — set the preferred default bucket for one crypto symbol. The
   *  engine fans out to disk write-through internally; the renderer should
   *  treat the resolved value (a fresh full-prefs map) as the new source of
   *  truth and refresh its local mirror from it. */
  setSubsecondPref: (symbol: string, bucketMs: 250 | 500) =>
    ipcRenderer.invoke(IPC.SUBSECOND_PREFS_SET, { symbol, bucketMs }) as Promise<Record<string, 250 | 500>>,

  // ── Funded account programme (P-021) ────────────────────────────────────────
  /** Subscribe to funded-account state pushes. Emitted on every engine tick
   *  and on all funded-account transitions (MLL move, EOD close, flat). */
  onFundedAccountUpdate: (cb: (s: import('@shared/funded/types').FundedAccountSnapshot) => void) =>
    on<import('@shared/funded/types').FundedAccountSnapshot>(IPC.FUNDED_ACCOUNT_UPDATE, cb),
  /** Seed the fundedAccountStore on mount (post-subscribe pattern). */
  getFundedAccount: () =>
    ipcRenderer.invoke(IPC.FUNDED_ACCOUNT_UPDATE) as Promise<import('@shared/funded/types').FundedAccountSnapshot | null>,
  /** Emergency flatten — force-close all positions and cancel pending orders.
   *  The reason string is written to the audit log. */
  triggerFundedFlat: (reason: string) =>
    ipcRenderer.invoke(IPC.FUNDED_TRIGGER_FLAT, reason) as Promise<{ ok: boolean; reason?: string }>,

  // ── Trading journal (P0-2) ─────────────────────────────────────────────────
  journal: {
    /** Stream of closed-trade records — one event per position close. */
    onTradeClosed: (cb: (t: ClosedTrade) => void) => on<ClosedTrade>(IPC.TRADE_CLOSED, cb),
    /** Hydrate the panel with whatever is in the engine's in-memory ring. */
    getClosed:     ()                              => ipcRenderer.invoke(IPC.CLOSED_TRADES_GET) as Promise<ClosedTrade[]>,
    /** Attach a lesson + emotion tag to a closed trade (post-exit prompt). */
    reflect:       (req: { id: string; lesson: string; emotionTag?: JournalTag }) =>
                     ipcRenderer.invoke(IPC.JOURNAL_REFLECT, req) as Promise<ClosedTrade | null>,
  },
}

contextBridge.exposeInMainWorld('satex', satexApi)

// Type export for renderer usage (TypeScript augmentation of `window`)
export type SatexAPI = typeof satexApi
