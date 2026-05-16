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
  NEWS_APPEND:        'satex:news:append',
  SYSTEM_STATUS:      'satex:system:status',
  ACCOUNT_UPDATE:     'satex:account:update',
  ORDERS_UPDATE:      'satex:orders:update',
  INDICATORS_UPDATE:  'satex:indicators:update',
  BRAIN_UPDATE:       'satex:brain:update',
  AUTONOMOUS_DECISION:'satex:autonomous:decision',
  LOG_EVENT:          'satex:log:event',

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

  // Credentials / health
  CREDENTIALS_STATUS: 'satex:credentials:status',
  CREDENTIALS_GET_MASKED: 'satex:credentials:getMasked',
  CREDENTIALS_SET:    'satex:credentials:set',
  CREDENTIALS_CLEAR:  'satex:credentials:clear',
  BAIDU_GET_MASKED:   'satex:baidu:getMasked',
  BAIDU_SET:          'satex:baidu:set',
  ALPACA_RECONNECT:   'satex:alpaca:reconnect',
  HEALTH_CHECK:       'satex:health:check',

  // Live-mode interlock
  LIVE_MODE_GET:      'satex:liveMode:get',
  LIVE_MODE_SET:      'satex:liveMode:set',

  // Alpaca endpoint mode (paper vs live URL)
  ALPACA_MODE_GET:    'satex:alpacaMode:get',
  ALPACA_MODE_SET:    'satex:alpacaMode:set',

  // AI brain
  BRAIN_DECISION:     'satex:brain:decision',
  BRAIN_OUTCOME:      'satex:brain:outcome',

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
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export const PUSH_CHANNELS = [
  IPC.QUOTES_TICK,
  IPC.CANDLES_UPDATE,
  IPC.NEWS_APPEND,
  IPC.SYSTEM_STATUS,
  IPC.ACCOUNT_UPDATE,
  IPC.ORDERS_UPDATE,
  IPC.INDICATORS_UPDATE,
  IPC.BRAIN_UPDATE,
  IPC.AUTONOMOUS_DECISION,
  IPC.LOG_EVENT,
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
] as const

export type PushChannel = (typeof PUSH_CHANNELS)[number]
