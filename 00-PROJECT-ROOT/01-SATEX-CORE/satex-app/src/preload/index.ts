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
  CredentialsMaskedStatus, CredentialsSetRequest,
  AnthropicMaskedStatus, AiDecision,
  LiveModeStatus, LiveModeSetRequest, TacticsStatus,
} from '@shared/types'

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
  onNewsAppend:         (cb: (item: unknown) => void)                                 => on(IPC.NEWS_APPEND,        cb),
  onSystemStatus:       (cb: (status: SystemStatus) => void)                          => on(IPC.SYSTEM_STATUS,      cb),
  onAccountUpdate:      (cb: (account: Account) => void)                              => on(IPC.ACCOUNT_UPDATE,     cb),
  onOrdersUpdate:       (cb: (orders: Order[]) => void)                               => on(IPC.ORDERS_UPDATE,      cb),
  onLogEvent:           (cb: (entry: unknown) => void)                                => on(IPC.LOG_EVENT,          cb),
  onAutonomousDecision: (cb: (decision: unknown) => void)                             => on(IPC.AUTONOMOUS_DECISION,cb),

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
  getCredentialsStatus: ()                         => ipcRenderer.invoke(IPC.CREDENTIALS_STATUS) as Promise<AlpacaCredentialsStatus>,
  healthCheck:   ()                                => ipcRenderer.invoke(IPC.HEALTH_CHECK),

  // ── Encrypted credential store (Phase 4) ───────────────────────────────────
  getCredentialsMasked: ()                         => ipcRenderer.invoke(IPC.CREDENTIALS_GET_MASKED) as Promise<CredentialsMaskedStatus>,
  setCredentials: (req: CredentialsSetRequest)     => ipcRenderer.invoke(IPC.CREDENTIALS_SET, req) as Promise<{ ok: boolean; reason?: string }>,
  clearCredentials: ()                             => ipcRenderer.invoke(IPC.CREDENTIALS_CLEAR) as Promise<{ ok: boolean }>,
  getAnthropicMasked: ()                           => ipcRenderer.invoke(IPC.ANTHROPIC_GET_MASKED) as Promise<AnthropicMaskedStatus>,
  setAnthropicKey: (key: string)                   => ipcRenderer.invoke(IPC.ANTHROPIC_SET, key) as Promise<{ ok: boolean; reason?: string }>,
  reconnectAlpaca: ()                              => ipcRenderer.invoke(IPC.ALPACA_RECONNECT) as Promise<{ ok: boolean; reason?: string }>,

  // ── Live mode (Phase 5) ─────────────────────────────────────────────────────
  getLiveMode: ()                                  => ipcRenderer.invoke(IPC.LIVE_MODE_GET) as Promise<LiveModeStatus>,
  setLiveMode: (req: LiveModeSetRequest)           => ipcRenderer.invoke(IPC.LIVE_MODE_SET, req) as Promise<{ ok: boolean; reason?: string }>,

  // ── AI brain decision (Phase 6) ─────────────────────────────────────────────
  getAiDecision: (symbol: string)                  => ipcRenderer.invoke(IPC.BRAIN_DECISION, symbol) as Promise<AiDecision>,

  // ── MAY-TACTICS (Phase 7) ───────────────────────────────────────────────────
  getTacticsStatus: ()                             => ipcRenderer.invoke(IPC.TACTICS_STATUS) as Promise<TacticsStatus>,
  graduateTactics: ()                              => ipcRenderer.invoke(IPC.TACTICS_GRADUATE) as Promise<{ ok: boolean; reason?: string }>,

  // ── Layout + CSV export ─────────────────────────────────────────────────────
  saveLayout: (payload?: unknown)                  => ipcRenderer.invoke(IPC.LAYOUT_SAVE, payload) as Promise<{ ok: boolean }>,
  exportOrdersCsv: ()                              => ipcRenderer.invoke(IPC.ORDERS_EXPORT_CSV) as Promise<{ ok: boolean; path?: string }>,

  // ── Window controls ────────────────────────────────────────────────────────
  toggleFullscreen: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_FULLSCREEN),
  toggleDevTools:   () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_DEVTOOLS),
  setZoom:  (factor: number) => ipcRenderer.invoke(IPC.WINDOW_SET_ZOOM, factor),
  getZoom:  ()               => ipcRenderer.invoke(IPC.WINDOW_GET_ZOOM) as Promise<number>,
}

contextBridge.exposeInMainWorld('satex', satexApi)

// Type export for renderer usage (TypeScript augmentation of `window`)
export type SatexAPI = typeof satexApi
