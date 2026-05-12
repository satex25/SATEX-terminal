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
  ANTHROPIC_GET_MASKED: 'satex:anthropic:getMasked',
  ANTHROPIC_SET:      'satex:anthropic:set',
  ALPACA_RECONNECT:   'satex:alpaca:reconnect',
  HEALTH_CHECK:       'satex:health:check',

  // Live-mode interlock
  LIVE_MODE_GET:      'satex:liveMode:get',
  LIVE_MODE_SET:      'satex:liveMode:set',

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

  // Autonomous (future)
  AUTONOMOUS_ENABLE:  'satex:autonomous:enable',
  AUTONOMOUS_DISABLE: 'satex:autonomous:disable',
  AUTONOMOUS_STATUS:  'satex:autonomous:status',
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
] as const

export type PushChannel = (typeof PUSH_CHANNELS)[number]
