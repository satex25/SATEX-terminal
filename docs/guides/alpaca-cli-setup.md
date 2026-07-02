# Alpaca CLI — Installation & Real-Time Integration Guide

**Status**: Verified folder location: `C:\Users\User\mc4\cli-main\cli-main`  
**Project Type**: Go 1.24.0 | OpenAPI-driven | Agent-first CLI  
**Purpose**: Unified CLI for Alpaca Trading API (stocks, crypto, market data, account management)

---

## Prerequisites

### System Requirements
- **Windows 10+** or macOS/Linux
- **Go 1.24.0** or higher ([download](https://golang.org/dl/))
- **Git** (for version info in build)
- **Make** (optional, for build automation)

### Verify Go Installation

```powershell
go version
# Expected output: go version go1.24.0 windows/amd64 (or higher)
```

---

## Installation Steps

### Step 1: Install Go (if not already installed)

**Windows PowerShell (Administrator)**:
```powershell
# Download Go 1.24.0+ from https://golang.org/dl/
# Or use Scoop (if installed)
scoop install go

# Verify
go version
```

### Step 2: Navigate to CLI Directory & Install

```powershell
cd C:\Users\User\mc4\cli-main\cli-main

# Install the binary globally to your GOPATH/bin
go install -ldflags "-s -w" ./cmd/alpaca

# This installs the `alpaca` command to: 
# C:\Users\User\AppData\Local\go\bin\alpaca.exe (default GOPATH)

# Verify installation
alpaca version
```

### Step 3: Add to PATH (if needed)

If `alpaca` is not recognized globally:

```powershell
# Check current GOBIN
go env GOBIN

# Add to PATH via PowerShell
[Environment]::SetEnvironmentVariable("Path", "$env:Path;$(go env GOBIN)", "User")
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" + [System.Environment]::GetEnvironmentVariable("Path","Machine")

# Verify
alpaca version
```

---

## Verify Build & Tests

### Run Linter & Type Checks
```powershell
cd C:\Users\User\mc4\cli-main\cli-main

# Install lint dependencies (first time only)
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest

# Run checks
make check    # Runs: lint + test + build
```

### Run Unit Tests
```powershell
make test
```

### Run Integration Tests (requires Alpaca API credentials)
```powershell
# Set Alpaca test credentials
$env:ALPACA_TEST_API_KEY = "your-api-key"
$env:ALPACA_TEST_SECRET_KEY = "your-secret-key"

# Or use OAuth token
$env:ALPACA_TEST_ACCESS_TOKEN = "your-access-token"

# Run integration tests
make test-integration
```

---

## Authentication Setup

### Option 1: OAuth (Paper Trading — Recommended)

```powershell
alpaca profile login

# Opens browser for OAuth authorization
# Credentials stored in: %USERPROFILE%\.config\alpaca\profiles\
```

### Option 2: API Key (Paper or Live)

```powershell
alpaca profile login --api-key

# Prompts for:
# - API Key
# - Secret Key
# - (optional) Choose live vs paper endpoint
```

### Option 3: Environment Variables (CI/Automation)

```powershell
$env:ALPACA_API_KEY = "PK..."
$env:ALPACA_SECRET_KEY = "..."

alpaca account get  # Uses env vars, no stored credentials
```

---

## Real-Time Data Strategy

### Current Limitation
The Alpaca CLI uses **request/response** pattern. Long-lived WebSocket streams (SSE) are **not natively supported** in the CLI's fetch/JSON model.

### Solution: Polling Loop for Real-Time Data

For **sub-second real-time updates**, implement a polling wrapper around the CLI. Two approaches:

#### Approach A: PowerShell Polling Loop (Simple)

```powershell
# Watch AAPL bars every 500ms
while ($true) {
    $bars = alpaca data bars --symbol AAPL --timeframe 1Min --limit 1 | ConvertFrom-Json
    Write-Host "$(Get-Date -Format 'HH:mm:ss.fff'): $(($bars[0].c)) | Vol: $(($bars[0].v))"
    Start-Sleep -Milliseconds 500
}
```

#### Approach B: Go Extension (Recommended for SATEX Integration)

Create a **wrapper binary** that:
1. Spawns `alpaca` CLI for quote/bar snapshots
2. Polls on a configurable interval (250ms, 500ms, 1s)
3. Streams output to stdout as structured JSON
4. Integrates directly with SATEX's IPC layer

**File**: `C:\Users\User\mc4\cli-main\cli-main\cmd\stream\main.go`

```go
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os/exec"
	"time"
)

func main() {
	symbol := flag.String("symbol", "AAPL", "Stock symbol")
	interval := flag.Duration("interval", 500*time.Millisecond, "Poll interval (250ms, 500ms, 1s)")
	flag.Parse()

	ticker := time.NewTicker(*interval)
	defer ticker.Stop()

	for range ticker.C {
		// Call: alpaca data quotes --symbol AAPL --limit 1 --csv=false
		cmd := exec.Command("alpaca", "data", "quotes", "--symbol", *symbol, "--limit", "1")
		output, err := cmd.Output()
		if err != nil {
			fmt.Printf(`{"error":"%v"}`+"\n", err)
			continue
		}

		// Emit with timestamp
		var quote interface{}
		json.Unmarshal(output, &quote)
		envelope := map[string]interface{}{
			"timestamp": time.Now().UnixMicro(),
			"symbol":    *symbol,
			"data":      quote,
		}
		if data, err := json.Marshal(envelope); err == nil {
			fmt.Println(string(data))
		}
	}
}
```

**Build & run**:
```powershell
go build -o bin/alpaca-stream.exe ./cmd/stream
.\bin\alpaca-stream.exe -symbol BTC -interval 250ms
```

**Output** (live, 250ms intervals):
```json
{"timestamp":1718601234567890,"symbol":"BTC","data":{"ap":67234.50,"as":2.5,"bp":67233.25,"bs":1.8}}
{"timestamp":1718601234817890,"symbol":"BTC","data":{"ap":67235.00,"as":3.2,"bp":67233.75,"bs":2.1}}
...
```

---

## Integration with SATEX

### IPC Contract (TypeScript/Electron)

If SATEX needs real-time market data from the CLI:

**Electron Main Process** (`satex-app/src/main/`):
```typescript
import { spawn } from 'child_process';

export function startAlpacaStream(symbol: string, interval: number) {
  const proc = spawn('alpaca-stream.exe', [
    '--symbol', symbol,
    '--interval', `${interval}ms`
  ]);

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        try {
          const quote = JSON.parse(line);
          mainWindow.webContents.send('MARKET_DATA_UPDATE', quote);
        } catch (e) {
          console.error('Parse error:', e);
        }
      }
    }
  });

  return () => proc.kill(); // Cleanup function
}
```

**Renderer (React)**:
```typescript
useEffect(() => {
  ipcRenderer.on('MARKET_DATA_UPDATE', (event, quote) => {
    setLatestQuote(quote); // Triggers re-render
  });

  return () => ipcRenderer.removeAllListeners('MARKET_DATA_UPDATE');
}, []);
```

---

## Quick Start Commands

### Account & Trading
```powershell
# Check account
alpaca account get

# Submit market order
alpaca order submit --symbol AAPL --side buy --qty 10 --type market

# List open positions
alpaca position list

# Cancel all open orders
alpaca order cancel-all
```

### Market Data
```powershell
# Get latest quote
alpaca data quotes --symbol AAPL --limit 1

# Get 1-min bars (last 50)
alpaca data bars --symbol AAPL --timeframe 1Min --limit 50

# Get crypto bars
alpaca data bars --symbol BTCUSD --timeframe 1Min --limit 100

# Screen for top movers
alpaca data movers --direction up --limit 10
```

### Watchlists
```powershell
# Create watchlist
alpaca watchlist create --name "My Stocks" --symbols AAPL,TSLA,MSFT

# List watchlists
alpaca watchlist list

# Add symbols
alpaca watchlist add --name "My Stocks" --symbols GOOGL,META
```

---

## Troubleshooting

### Issue: `alpaca: command not found`
**Solution**: Go binary not in PATH. Run:
```powershell
go install ./cmd/alpaca
# Then verify: alpaca version
```

### Issue: `401 Unauthorized` on data commands
**Solution**: Credentials not set. Run:
```powershell
alpaca profile login
# Then: alpaca account get  (verify it works)
```

### Issue: Integration test failures
**Solution**: Paper API not initialized or credentials expired.
```powershell
alpaca doctor
# Shows: API connectivity, auth status, available account balance
```

---

## Architecture Notes

- **OpenAPI-driven**: All commands auto-generated from `api/specs/*.json`
- **Agent-first**: No interactive prompts, all parameters explicit flags
- **JSON output**: All data commands return structured JSON (supports `--csv`, `--jq`)
- **No streaming natively**: Use polling wrapper for real-time data (Approach B above)
- **Paper-safe by default**: OAuth restricted to paper trading; live requires API keys

---

## Next Steps

1. **Verify**: Run `alpaca version` and `alpaca account get` ✓
2. **Test**: Run `make test-integration` with real Alpaca credentials
3. **Stream**: Implement `alpaca-stream` wrapper for real-time data feeds
4. **Integrate**: Wire into SATEX IPC layer (if needed)

---

**Installed**: `C:\Users\User\AppData\Local\go\bin\alpaca.exe` (or system `GOBIN`)  
**Repo**: `C:\Users\User\mc4\cli-main\cli-main`  
**Config**: `%USERPROFILE%\.config\alpaca\profiles\`
