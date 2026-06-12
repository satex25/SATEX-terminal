/**
 * SATEX — IPC Channel Registry
 * Every channel name is declared here. Both processes import IPC and use
 * fields by name. Ad-hoc inline strings are forbidden.
 * Convention: satex:<domain>:<action>
 *   Push (main→renderer): noun forms (:tick, :update)
 *   Invoke (renderer→main): verb forms (:submit, :get)
 */
export const IPC = {
  // ── Push: main → renderer ─────────────────────────────────────────────────
  QUOTES_TICK:        'satex:quotes:tick',
  CANDLES_UPDATE:     'satex:candles:update',
  /** Bulk-replace the candle history for a single symbol in ONE event.
   *  Used by ReplaySource.warmup so the renderer can swap in a full day
   *  of historical bars without processing per-candle updates (which
   *  wedges the renderer at hundreds of thousands of events). The live
   *  tick path stays on CANDLES_UPDATE for low-latency single-bar
   *  appends. */
  CANDLES_BULK_REPLACE: 'satex:candles:bulkReplace',
  NEWS_APPEND:        'satex:news:append',
  SYSTEM_STATUS:      'satex:system:status',
  ACCOUNT_UPDATE:     'satex:account:update',
  ORDERS_UPDATE:      'satex:orders:update',
  AUTONOMOUS_DECISION:'satex:autonomous:decision',

  // ── Invoke: renderer → main ───────────────────────────────────────────────
  // Subscription
  SUBSCRIBE:          'satex:subscribe',

  // Orders
  ORDER_SUBMIT:       'satex:order:submit',
  ORDER_CANCEL:       'satex:order:cancel',

  // Risk
  RISK_KILL:          'satex:risk:kill',

  // Market data
  CANDLES_GET:        'satex:candles:get',
  INDICATORS_GET:     'satex:indicators:get',

  // Watchlist
  WATCHLIST_GET:      'satex:watchlist:get',
  WATCHLIST_SET:      'satex:watchlist:set',

  // Orders history
  ORDERS_HISTORY:     'satex:orders:history',

  // Sessions / PnL
  SESSIONS_LIST:      'satex:sessions:list',
  SESSIONS_SNAPSHOTS: 'satex:sessions:snapshots',

  // Brain / learned params
  BRAIN_GET:          'satex:brain:get',
  CALIBRATION_GET:    'satex:calibration:get',
  SELF_EVAL_GET:      'satex:selfeval:get',
  SELF_EVAL_SET:      'satex:selfeval:set',
  SELF_EVAL_RUN:      'satex:selfeval:run',

  // THE WIRE — live world-news desk (main-side RSS poller)
  WIRE_GET:           'satex:wire:get',
  WIRE_SET:           'satex:wire:set',
  WIRE_UPDATE:        'satex:wire:update',

  // Credentials / health
  CREDENTIALS_STATUS: 'satex:credentials:status',
  CREDENTIALS_GET_MASKED: 'satex:credentials:getMasked',
  CREDENTIALS_SET:    'satex:credentials:set',
  CREDENTIALS_CLEAR:  'satex:credentials:clear',
  LLM_CONFIG_GET:     'satex:llm:getStatus',
  LLM_CONFIG_SET:     'satex:llm:set',
  ALPACA_RECONNECT:   'satex:alpaca:reconnect',
  HEALTH_CHECK:       'satex:health:check',

  // Live-mode interlock
  LIVE_MODE_GET:      'satex:liveMode:get',
  LIVE_MODE_SET:      'satex:liveMode:set',

  // Alpaca endpoint mode (paper vs live URL)
  ALPACA_MODE_GET:    'satex:alpacaMode:get',
  ALPACA_MODE_SET:    'satex:alpacaMode:set',

  // Data feed (Simulator ⇄ Live Alpaca data)
  DATA_SOURCE_GET:    'satex:dataSource:get',
  DATA_SOURCE_SET:    'satex:dataSource:set',

  // Replay-free historical bars for the chart's off-hours backfill. Fetches a
  // single day's OHLC bars for one symbol and returns them directly — no tape,
  // no replay session, no workspace takeover (cf. REPLAY_IMPORT_HISTORICAL).
  MARKET_HISTORICAL_BARS: 'satex:market:historicalBars',

  // AI brain
  BRAIN_DECISION:     'satex:brain:decision',

  // MAY-TACTICS
  TACTICS_STATUS:     'satex:tactics:status',
  TACTICS_GRADUATE:   'satex:tactics:graduate',

  // Layout / export
  LAYOUT_SAVE:        'satex:layout:save',
  ORDERS_EXPORT_CSV:  'satex:orders:exportCsv',

  // Window
  WINDOW_TOGGLE_FULLSCREEN: 'satex:window:toggleFullscreen',
  WINDOW_TOGGLE_DEVTOOLS:   'satex:window:toggleDevTools',
  WINDOW_SET_ZOOM:    'satex:window:setZoom',
  WINDOW_GET_ZOOM:    'satex:window:getZoom',

  // Autonomous paper trader (Phase C, 2026-05-13)
  // Push (main → renderer)
  AUTONOMOUS_STATS:   'satex:autonomous:stats',
  // Invoke (renderer → main)
  AUTONOMOUS_ENABLE:      'satex:autonomous:enable',
  AUTONOMOUS_DISABLE:     'satex:autonomous:disable',
  AUTONOMOUS_STATUS:      'satex:autonomous:status',
  AUTONOMOUS_RECENT:      'satex:autonomous:recent',
  AUTONOMOUS_CONFIG_GET:  'satex:autonomous:configGet',
  AUTONOMOUS_CONFIG_SET:  'satex:autonomous:configSet',

  // ── Phase 8: Continuous Observer / PatternLearner / Vault ─────────────────
  // Push (main → renderer)
  OBSERVER_STATS:     'satex:observer:stats',
  LEARNER_STATS:      'satex:learner:stats',
  VAULT_STATS:        'satex:vault:stats',
  // Invoke (renderer → main)
  OBSERVER_GET:       'satex:observer:get',
  LEARNER_GET:        'satex:learner:get',
  LEARNER_WEIGHTS:    'satex:learner:weights',
  VAULT_GET:          'satex:vault:get',
  VAULT_CHECKPOINT:   'satex:vault:checkpoint',

  // ── Phase 9: Replay engine ───────────────────────────────────────────────
  // Push (main → renderer)
  REPLAY_STATUS:      'satex:replay:status',
  // Invoke (renderer → main)
  REPLAY_SESSIONS:    'satex:replay:sessions',
  REPLAY_START:       'satex:replay:start',
  REPLAY_STOP:        'satex:replay:stop',
  REPLAY_PAUSE:       'satex:replay:pause',
  REPLAY_RESUME:      'satex:replay:resume',
  REPLAY_SEEK:        'satex:replay:seek',
  REPLAY_SET_SPEED:   'satex:replay:setSpeed',
  REPLAY_BOOKMARK_ADD:'satex:replay:bookmark:add',
  REPLAY_BOOKMARK_DEL:'satex:replay:bookmark:del',
  REPLAY_BOOKMARKS:   'satex:replay:bookmarks',
  REPLAY_STATUS_GET:  'satex:replay:get',
  REPLAY_IMPORT_HISTORICAL: 'satex:replay:importHistorical',
  REPLAY_DELETE_SESSION:    'satex:replay:deleteSession',

  // ── Phase 10: SATEX Terminal v2 · Black Box ──────────────────────────────
  // Push (main → renderer)
  REGIME_UPDATE:      'satex:regime:update',
  RISK_GATES_UPDATE:  'satex:riskGates:update',
  MACRO_UPDATE:       'satex:macro:update',
  LOGS_TAIL:          'satex:logs:tail',
  DEPTH_UPDATE:       'satex:depth:update',
  // Invoke (renderer → main)
  REGIME_GET:         'satex:regime:get',
  RISK_GATES_GET:     'satex:riskGates:get',
  MACRO_GET:          'satex:macro:get',
  LOGS_GET:           'satex:logs:get',
  DEPTH_GET:          'satex:depth:get',
  DEPTH_SUBSCRIBE:    'satex:depth:subscribe',

  // ── Phase 11: Chart-indicator toggle persistence ─────────────────────────
  // Invoke (renderer → main)
  INDICATOR_SETTINGS_GET:  'satex:indicators:settingsGet',
  INDICATOR_SETTINGS_SET:  'satex:indicators:settingsSet',
  /** Returns the prior trading-day H/L/C for a symbol (Pivot Points indicator).
   *  Null when the symbol is non-equity, Alpaca is offline, or no eligible
   *  bar is available yet. */
  INDICATOR_PRIOR_DAY_HLC: 'satex:indicators:priorDayHlc',

  // ── Phase 12: Workspace state persistence ────────────────────────────────
  /** Returns persisted WorkspaceState — last workspace, Quad symbols,
   *  last chart symbol. App hydrates these once on mount. */
  WORKSPACE_STATE_GET: 'satex:workspace:stateGet',
  WORKSPACE_STATE_SET: 'satex:workspace:stateSet',

  // ── P0-2: Trading journal — closed-trade stream + reflection persistence ─
  /** Push: emitted whenever a position closes (entry+exit pair completes). */
  TRADE_CLOSED:       'satex:journal:tradeClosed',
  /** Invoke: hydrate the JournalPanel with recent closed trades on mount. */
  CLOSED_TRADES_GET:  'satex:journal:closedTradesGet',
  /** Invoke: attach a lesson + optional emotion tag to a closed trade. The
   *  vault writer appends a reflection block to the trade-close markdown
   *  if the vault is enabled. */
  JOURNAL_REFLECT:    'satex:journal:reflect',

  // ── P0-1: Footprint chart — per-trade tick stream ────────────────────────
  /** Push: raw Trade[] batches from the active MarketDataSource. The renderer
   *  feeds these into a per-symbol FootprintAggregator for the DeltaStrip /
   *  FootprintOverlay components. */
  TRADES_TICK:        'satex:footprint:tradesTick',

  // ── C8 — Snapshot export ─────────────────────────────────────────────────
  /** Invoke: collects indicator settings, workspace state, watchlist, recent
   *  closed trades + account snapshot into one JSON blob, writes it to
   *  `<userData>/snapshots/satex-snapshot-<ISO>.json`, returns the absolute
   *  path. Import path intentionally NOT exposed in this rev — restoring
   *  partial state safely requires a separate confirmation UX. */
  SNAPSHOT_EXPORT:    'satex:snapshot:export',

  // ── B3 (2026-05-18) — Per-asset-class feed status ────────────────────────
  /** Push: { equity: 'live'|'simulator'|'off', futures: 'live'|'synthetic',
   *  crypto: 'live'|'off' }. Renderer's WatchlistPanel reads this to render a
   *  SIM badge on symbols whose quotes are synthetic-seed rather than from a
   *  live broker feed. Diff-gated — only fires when a class transitions. */
  FEED_STATUS_UPDATE: 'satex:feed:statusUpdate',

  // ── B9 (2026-05-19) — CSP violation reporting ────────────────────────────
  /** Invoke (renderer → main, fire-and-forget): the renderer's global
   *  `securitypolicyviolation` listener forwards each event here so the main
   *  process can log it via the rotating file sink. Without this, CSP
   *  violations show only as silent renderer console messages and never
   *  reach the on-disk forensic log. Defense-in-depth: a future XSS
   *  attempt (via injected news/AI content) will leave an audit trail. */
  CSP_VIOLATION_REPORT: 'satex:security:cspViolation',

  // ── S1-9 (2026-05-19) — Auto-update status ────────────────────────────────
  /** Push: { available: boolean, version?: string }. Notifies renderer when
   *  an update is ready to install. Renderer shows a toast and restart prompt. */
  UPDATE_AVAILABLE: 'satex:update:available',
  /** Invoke (renderer → main): trigger quit-and-install when user clicks
   *  the update prompt. Only works after update-downloaded event. */
  UPDATE_INSTALL: 'satex:update:install',

  // ── A1 (v0.4.4, 2026-05-19) — sub-second crypto candles ───────────────────
  /** Push: SubSecondCandle. Emitted on every bucket seal from the engine's
   *  SubSecondAggregator. Renderer's subsecondStore appends to the in-memory
   *  ring keyed by (symbol, bucketMs). Crypto-only — equities never fire
   *  on this channel. */
  SUBSECOND_CANDLES_UPDATE: 'satex:a1:subsecondCandlesUpdate',
  /** Invoke (renderer → main, { symbol, bucketMs, limit }): hydrate the
   *  series on chart mount / timeframe switch before live seals start
   *  flowing. Returns SubSecondCandle[] in ascending time order. */
  SUBSECOND_CANDLES_GET: 'satex:a1:subsecondCandlesGet',
  /** Invoke (renderer → main): returns Record<symbol, 250|500> of the user's
   *  per-symbol preferred default bucket. Crypto-only (sanitizer drops non-
   *  crypto entries) — equity / index / future have no sub-second feed so a
   *  pref for them would never be consulted. Empty object when nothing has
   *  been configured (engine falls back to 250ms internal default). */
  SUBSECOND_PREFS_GET: 'satex:a1:subsecondPrefsGet',
  /** Invoke (renderer → main, { symbol, bucketMs }): set the preferred default
   *  bucket for one crypto symbol. Validates payload via SubsecondPrefsSetReq
   *  (literal-union {250,500}). Engine rejects non-crypto symbols silently.
   *  Returns the full post-update prefs map so the renderer can refresh its
   *  local mirror without a follow-up GET. Disk write-through happens via the
   *  engine's onSubsecondPrefChanged listener wired in main. */
  SUBSECOND_PREFS_SET: 'satex:a1:subsecondPrefsSet',
} as const

// Runtime array kept solely for the PushChannel type derivation below — the
// literal-union approach via `(typeof X)[number]` is the standard TypeScript
// idiom for keeping the type in sync with a single source of truth.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PUSH_CHANNELS = [
  IPC.QUOTES_TICK,
  IPC.CANDLES_UPDATE,
  IPC.CANDLES_BULK_REPLACE,
  IPC.NEWS_APPEND,
  IPC.SYSTEM_STATUS,
  IPC.ACCOUNT_UPDATE,
  IPC.ORDERS_UPDATE,
  IPC.AUTONOMOUS_DECISION,
  IPC.OBSERVER_STATS,
  IPC.LEARNER_STATS,
  IPC.VAULT_STATS,
  IPC.REPLAY_STATUS,
  IPC.AUTONOMOUS_STATS,
  IPC.REGIME_UPDATE,
  IPC.RISK_GATES_UPDATE,
  IPC.MACRO_UPDATE,
  IPC.LOGS_TAIL,
  IPC.DEPTH_UPDATE,
  IPC.TRADE_CLOSED,
  IPC.TRADES_TICK,
  IPC.FEED_STATUS_UPDATE,
  IPC.UPDATE_AVAILABLE,
  IPC.SUBSECOND_CANDLES_UPDATE,
  IPC.WIRE_UPDATE,
] as const

export type PushChannel = (typeof PUSH_CHANNELS)[number]
