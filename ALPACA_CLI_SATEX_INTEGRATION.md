# Alpaca CLI ↔ SATEX Integration Guide

**Purpose**: Seamlessly integrate real-time Alpaca market data into SATEX trading terminal via IPC (Inter-Process Communication).

**Architecture**: SATEX (Electron main) → spawns alpaca-stream subprocess → streams NDJSON → IPC to renderer

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ SATEX Electron Main Process                                     │
│  ├─ Market Data Service (alpaca-stream manager)                │
│  ├─ Trading Engine (OrderManager, risk-gates)                  │
│  └─ IPC Bridge → Renderer                                       │
└─────────────────────────────────────────────────────────────────┘
          ↓ spawns
┌─────────────────────────────────────────────────────────────────┐
│ alpaca-stream Child Process                                     │
│  ├─ Polls: alpaca data quotes|bars|trades                     │
│  ├─ Interval: 250ms–1s (configurable)                         │
│  └─ Output: NDJSON stream to stdout                            │
└─────────────────────────────────────────────────────────────────┘
          ↓ NDJSON (real-time)
┌─────────────────────────────────────────────────────────────────┐
│ SATEX Renderer (React)                                          │
│  ├─ MarketDataStore (Zustand)                                 │
│  ├─ ChartPanel (render candles, quotes)                       │
│  └─ OrderPanel (pre-fill bid/ask)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Add Market Data Service to Main Process

**File**: `satex-app/src/main/services/market-data-service.ts` (new)

```typescript
import { spawn, ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';

export interface StreamConfig {
  symbol: string;
  mode: 'quote' | 'bar' | 'trades';
  interval: number;        // milliseconds
  timeframe?: string;      // for bar mode: 1Min, 5Min, etc.
  limit?: number;
}

export interface MarketDataEnvelope {
  timestamp: number;       // Unix microseconds
  symbol: string;
  type: 'quote' | 'bar' | 'trades';
  data: any;
  error?: string;
}

export class MarketDataService extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor(mainWindow: BrowserWindow) {
    super();
    this.mainWindow = mainWindow;
  }

  /**
   * Start a real-time market data stream
   * @param config Stream configuration
   * @returns Cleanup function to stop stream
   */
  public startStream(config: StreamConfig): () => void {
    const streamKey = `${config.symbol}:${config.mode}`;

    // Kill existing stream for this symbol+mode
    if (this.processes.has(streamKey)) {
      this.stopStream(streamKey);
    }

    // Build alpaca-stream command
    const args = [
      '--symbol', config.symbol,
      '--mode', config.mode,
      '--interval', `${config.interval}ms`,
    ];

    if (config.timeframe) {
      args.push('--timeframe', config.timeframe);
    }
    if (config.limit) {
      args.push('--limit', config.limit.toString());
    }

    // Spawn alpaca-stream subprocess
    const proc = spawn('alpaca-stream', args, {
      stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin, pipe stdout/stderr
    });

    let buffer = '';

    // Handle stdout (NDJSON data)
    proc.stdout?.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      
      // Process complete lines, keep incomplete line in buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const envelope: MarketDataEnvelope = JSON.parse(line);
          
          // Log for debugging (optional)
          if (envelope.error) {
            console.warn(`[Market Data] ${streamKey} error:`, envelope.error);
          }

          // Emit event locally
          this.emit('data', { streamKey, ...envelope });

          // Send to renderer via IPC
          if (this.mainWindow) {
            this.mainWindow.webContents.send('MARKET_DATA_UPDATE', {
              streamKey,
              ...envelope,
            });
          }
        } catch (e) {
          console.error(`[Market Data] JSON parse error:`, e, 'line:', line);
        }
      }
    });

    // Handle stderr (errors)
    proc.stderr?.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        console.warn(`[Market Data ${streamKey}] stderr:`, message);
      }
    });

    // Handle process exit
    proc.on('exit', (code, signal) => {
      this.processes.delete(streamKey);
      console.log(`[Market Data] Stream ${streamKey} exited with code ${code}, signal ${signal}`);
    });

    proc.on('error', (err) => {
      this.processes.delete(streamKey);
      console.error(`[Market Data] Stream ${streamKey} error:`, err);
      
      // Notify renderer of critical error
      if (this.mainWindow) {
        this.mainWindow.webContents.send('MARKET_DATA_ERROR', {
          streamKey,
          error: err.message,
        });
      }
    });

    // Store process reference
    this.processes.set(streamKey, proc);

    // Return cleanup function
    return () => this.stopStream(streamKey);
  }

  /**
   * Stop a specific stream
   */
  public stopStream(streamKey: string): void {
    const proc = this.processes.get(streamKey);
    if (proc) {
      proc.kill('SIGTERM');
      this.processes.delete(streamKey);
    }
  }

  /**
   * Stop all streams
   */
  public stopAllStreams(): void {
    for (const [key, proc] of this.processes.entries()) {
      proc.kill('SIGTERM');
    }
    this.processes.clear();
  }

  /**
   * Get list of active streams
   */
  public getActiveStreams(): string[] {
    return Array.from(this.processes.keys());
  }
}

export default MarketDataService;
```

---

## Step 2: Add Market Data Store (Zustand)

**File**: `satex-app/src/renderer/store/market-data.ts` (new)

```typescript
import { create } from 'zustand';
import { ipcRenderer } from 'electron';

export interface Quote {
  ap: number;  // ask price
  as: number;  // ask size
  bp: number;  // bid price
  bs: number;  // bid size
  t: string;   // timestamp
}

export interface Bar {
  t: string;   // timestamp
  o: number;   // open
  h: number;   // high
  l: number;   // low
  c: number;   // close
  v: number;   // volume
  vw?: number; // volume weighted average price
}

export interface MarketDataState {
  // Stream status
  activeStreams: Set<string>;
  
  // Latest data by symbol
  quotes: Map<string, Quote>;
  bars: Map<string, Bar[]>;
  trades: Map<string, any[]>;

  // Errors
  errors: Map<string, string>;

  // Actions
  addQuote: (symbol: string, quote: Quote) => void;
  addBar: (symbol: string, bar: Bar) => void;
  addTrades: (symbol: string, trades: any[]) => void;
  setStreamActive: (streamKey: string, active: boolean) => void;
  setError: (streamKey: string, error: string | null) => void;
  clearError: (streamKey: string) => void;
  reset: () => void;
}

export const useMarketDataStore = create<MarketDataState>((set) => ({
  activeStreams: new Set(),
  quotes: new Map(),
  bars: new Map(),
  trades: new Map(),
  errors: new Map(),

  addQuote: (symbol, quote) =>
    set((state) => {
      const newQuotes = new Map(state.quotes);
      newQuotes.set(symbol, quote);
      return { quotes: newQuotes };
    }),

  addBar: (symbol, bar) =>
    set((state) => {
      const newBars = new Map(state.bars);
      const existing = newBars.get(symbol) || [];
      // Keep last N candles (e.g., 100)
      newBars.set(symbol, [bar, ...existing].slice(0, 100));
      return { bars: newBars };
    }),

  addTrades: (symbol, trades) =>
    set((state) => {
      const newTrades = new Map(state.trades);
      newTrades.set(symbol, trades);
      return { trades: newTrades };
    }),

  setStreamActive: (streamKey, active) =>
    set((state) => {
      const newStreams = new Set(state.activeStreams);
      if (active) {
        newStreams.add(streamKey);
      } else {
        newStreams.delete(streamKey);
      }
      return { activeStreams: newStreams };
    }),

  setError: (streamKey, error) =>
    set((state) => {
      const newErrors = new Map(state.errors);
      if (error) {
        newErrors.set(streamKey, error);
      }
      return { errors: newErrors };
    }),

  clearError: (streamKey) =>
    set((state) => {
      const newErrors = new Map(state.errors);
      newErrors.delete(streamKey);
      return { errors: newErrors };
    }),

  reset: () =>
    set({
      activeStreams: new Set(),
      quotes: new Map(),
      bars: new Map(),
      trades: new Map(),
      errors: new Map(),
    }),
}));

// Initialize IPC listeners
if (typeof window !== 'undefined') {
  ipcRenderer.on('MARKET_DATA_UPDATE', (event, envelope) => {
    const store = useMarketDataStore.getState();
    const { symbol, type, data } = envelope;

    if (type === 'quote') {
      store.addQuote(symbol, data);
    } else if (type === 'bar') {
      store.addBar(symbol, data);
    } else if (type === 'trades') {
      store.addTrades(symbol, data);
    }

    store.clearError(`${symbol}:${type}`);
  });

  ipcRenderer.on('MARKET_DATA_ERROR', (event, { streamKey, error }) => {
    const store = useMarketDataStore.getState();
    store.setError(streamKey, error);
  });
}

export default useMarketDataStore;
```

---

## Step 3: Wire into Main Process

**File**: `satex-app/src/main/index.ts` (add to existing)

```typescript
import MarketDataService from './services/market-data-service';

// In your createWindow or app.whenReady handler:

let marketDataService: MarketDataService | null = null;

export function createMainWindow() {
  const mainWindow = new BrowserWindow({ /* ... */ });

  // Initialize market data service
  marketDataService = new MarketDataService(mainWindow);

  // IPC handlers for market data control
  ipcMain.handle('MARKET_DATA_START', (event, config) => {
    if (!marketDataService) throw new Error('Market data service not initialized');
    const cleanup = marketDataService.startStream(config);
    return { success: true };
  });

  ipcMain.handle('MARKET_DATA_STOP', (event, streamKey) => {
    if (!marketDataService) throw new Error('Market data service not initialized');
    marketDataService.stopStream(streamKey);
    return { success: true };
  });

  ipcMain.handle('MARKET_DATA_GET_STREAMS', () => {
    if (!marketDataService) return [];
    return marketDataService.getActiveStreams();
  });

  // Cleanup on app quit
  app.on('before-quit', () => {
    if (marketDataService) {
      marketDataService.stopAllStreams();
    }
  });

  return mainWindow;
}
```

---

## Step 4: Create React Hook for Streams

**File**: `satex-app/src/renderer/hooks/use-market-stream.ts` (new)

```typescript
import { useEffect } from 'react';
import { ipcRenderer } from 'electron';
import { useMarketDataStore } from '../store/market-data';

export interface UseMarketStreamOptions {
  symbol: string;
  mode: 'quote' | 'bar' | 'trades';
  interval?: number;      // default: 500
  timeframe?: string;     // for bar mode
  autoStart?: boolean;    // default: true
}

export function useMarketStream(options: UseMarketStreamOptions) {
  const { symbol, mode, interval = 500, timeframe, autoStart = true } = options;
  const streamKey = `${symbol}:${mode}`;

  const { activeStreams, quotes, bars, trades, errors, setStreamActive, setError, clearError } =
    useMarketDataStore();

  const isActive = activeStreams.has(streamKey);
  const error = errors.get(streamKey);
  const quote = quotes.get(symbol);
  const barData = bars.get(symbol) || [];
  const tradeData = trades.get(symbol) || [];

  useEffect(() => {
    if (!autoStart) return;

    // Start stream
    ipcRenderer.invoke('MARKET_DATA_START', {
      symbol,
      mode,
      interval,
      timeframe,
    }).then(() => {
      setStreamActive(streamKey, true);
      clearError(streamKey);
    }).catch((err) => {
      setError(streamKey, err.message);
    });

    // Cleanup on unmount
    return () => {
      ipcRenderer.invoke('MARKET_DATA_STOP', streamKey).catch(console.error);
      setStreamActive(streamKey, false);
    };
  }, [symbol, mode, interval, timeframe, autoStart]);

  const start = async () => {
    try {
      await ipcRenderer.invoke('MARKET_DATA_START', {
        symbol,
        mode,
        interval,
        timeframe,
      });
      setStreamActive(streamKey, true);
      clearError(streamKey);
    } catch (err) {
      setError(streamKey, (err as Error).message);
      throw err;
    }
  };

  const stop = async () => {
    try {
      await ipcRenderer.invoke('MARKET_DATA_STOP', streamKey);
      setStreamActive(streamKey, false);
    } catch (err) {
      console.error('Failed to stop stream:', err);
      throw err;
    }
  };

  return {
    isActive,
    error,
    data: mode === 'quote' ? quote : mode === 'bar' ? barData : tradeData,
    start,
    stop,
  };
}

export default useMarketStream;
```

---

## Step 5: Use in Chart Component

**File**: `satex-app/src/renderer/components/ChartPanel.tsx` (example)

```typescript
import React from 'react';
import { useMarketStream } from '../hooks/use-market-stream';

export function ChartPanel({ symbol }: { symbol: string }) {
  // Start quote stream (500ms interval)
  const { isActive: quoteActive, data: quote, error: quoteError } =
    useMarketStream({
      symbol,
      mode: 'quote',
      interval: 500,
      autoStart: true,
    });

  // Start bar stream (1s interval)
  const { isActive: barActive, data: barData, error: barError } =
    useMarketStream({
      symbol,
      mode: 'bar',
      interval: 1000,
      timeframe: '1Min',
      autoStart: true,
    });

  return (
    <div className="chart-panel">
      <h2>{symbol}</h2>
      
      <div className="status">
        <span className={quoteActive ? 'active' : 'inactive'}>
          Quote: {quoteActive ? '🟢 Live' : '⚫ Idle'}
        </span>
        <span className={barActive ? 'active' : 'inactive'}>
          Bars: {barActive ? '🟢 Live' : '⚫ Idle'}
        </span>
      </div>

      {quoteError && <div className="error">Quote error: {quoteError}</div>}
      {barError && <div className="error">Bar error: {barError}</div>}

      {quote && (
        <div className="quote">
          <span>Bid: ${quote.bp.toFixed(2)}</span>
          <span>Ask: ${quote.ap.toFixed(2)}</span>
        </div>
      )}

      {barData.length > 0 && (
        <div className="chart">
          {/* Render TradingView chart with barData */}
          <Chart data={barData} />
        </div>
      )}
    </div>
  );
}
```

---

## Step 6: Environmental Checks

Verify `alpaca` and `alpaca-stream` are in the system PATH.

**In main process initialization**:
```typescript
import { exec } from 'child_process';

async function verifyAlpacaCLI() {
  return new Promise((resolve) => {
    exec('alpaca version', (error, stdout) => {
      if (error) {
        console.warn('[Alpaca CLI] Not found in PATH. Market data streams will fail.');
        resolve(false);
      } else {
        console.log('[Alpaca CLI] Version:', stdout.trim());
        resolve(true);
      }
    });
  });
}

// Call during startup
app.on('ready', async () => {
  await verifyAlpacaCLI();
  createMainWindow();
});
```

---

## Testing the Integration

### Manual Test (Developer)
```powershell
# Terminal 1: Start SATEX
cd satex-app
npm start

# Terminal 2: Monitor IPC
npm run ipc:monitor

# In SATEX UI: Open ChartPanel for AAPL
# Should see real-time quotes updating every 500ms
# Should see bars updating every 1s
```

### Unit Test (Jest)
```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { ChartPanel } from './ChartPanel';
import * as ipcRenderer from 'electron';

jest.mock('electron', () => ({
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

test('ChartPanel starts market data streams', async () => {
  const mockInvoke = jest.fn().mockResolvedValue(undefined);
  (ipcRenderer.ipcRenderer.invoke as jest.Mock) = mockInvoke;

  render(<ChartPanel symbol="AAPL" />);

  await waitFor(() => {
    expect(mockInvoke).toHaveBeenCalledWith('MARKET_DATA_START', expect.objectContaining({
      symbol: 'AAPL',
      mode: 'quote',
    }));
  });
});
```

---

## Performance Tuning

### Typical Latency
- API call: 50–150ms
- JSON parse: <1ms
- IPC send: <1ms
- React re-render: 5–20ms
- **Total**: ~100–200ms per update

### Optimization Tips
1. **Increase poll interval** for less critical data (e.g., bars → 2s instead of 1s)
2. **Debounce re-renders** in React components (use `useCallback`)
3. **Limit bar history** to last 100 candles (not 1000+)
4. **Monitor subprocess memory** — should stay <20MB per stream

---

## Troubleshooting

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| Streams don't start | `alpaca-stream` not in PATH | Add to PATH: `go install ./cmd/stream` |
| IPC errors | Main ↔ Renderer mismatch | Ensure Zod schemas match on both sides |
| High latency | API rate limits hit | Increase interval (e.g., 2s for bars) |
| Memory leak | Streams not stopping on unmount | Ensure cleanup functions are called |
| Stale data | Old bar candle persists | Refresh on symbol change: clear store |

---

## Summary

**Files Created**:
- `src/main/services/market-data-service.ts` — subprocess + IPC orchestration
- `src/renderer/store/market-data.ts` — Zustand state management
- `src/renderer/hooks/use-market-stream.ts` — React hook for consumption
- `src/main/index.ts` — IPC handler registration

**Data Flow**:
1. Component calls `useMarketStream({ symbol: 'AAPL', mode: 'quote' })`
2. Hook sends IPC `MARKET_DATA_START` to main process
3. Main spawns `alpaca-stream --symbol AAPL --mode quote`
4. Stream polls `alpaca data quotes` every 500ms
5. Subprocess emits NDJSON to main
6. Main forwards each envelope via IPC `MARKET_DATA_UPDATE`
7. Hook receives via Zustand, component re-renders

**Result**: Real-time market data with <200ms latency, zero-dependency integration.
