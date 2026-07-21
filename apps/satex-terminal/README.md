# SATEX — Smart Autonomous Trading Experience

An **institutional-grade autonomous trading terminal** for Windows. Real-time market data, multi-asset execution, paper trading, and sub-second crypto candle aggregation—built on Electron, React, TypeScript, and TradingView Lightweight Charts.

**Status:** v0.5.0 · Pre-release (paper trading + simulator mode)  
**License:** MIT  
**Node:** ≥20.19.0

---

## Features

- **Live multi-asset trading** — Equities, futures, crypto, options flow (via Alpaca API)
- **Sub-second crypto candles** — 250ms / 500ms aggregation for BTC, ETH, SOL, and alt pairs
- **Paper trading simulator** — Risk-free backtesting and strategy validation
- **Real-time market data** — Tick-level quotes, OHLCV bars, news catalysts, on-chain metrics
- **Advanced charting** — TradingView Lightweight Charts v5 with multi-timeframe analysis
- **Risk management** — Per-trade position sizing (≤1% equity), daily loss limits, correlation checks
- **Order management** — Limit, market, stop, and stop-limit orders with fill monitoring
- **Data journaling** — Obsidian vault integration for trade-close analytics and self-evaluation
- **Windows-native** — Electron app with native performance; macOS not supported

---

## Quick Start

### Prerequisites

- **Node.js** 20.19.0 or higher ([install](https://nodejs.org))
- **npm** (comes with Node)
- **Windows** (macOS build target not supported)

### Installation

```bash
# Clone the repo
git clone https://github.com/satex25/SATEX-terminal.git
cd satex/apps/satex-terminal

# Install dependencies
npm install

# Start development server (live reload)
npm run dev
```

The Electron app opens automatically. Hot-reload is enabled for faster iteration.

---

## Development Workflow

### The Four Gates

Before you commit or open a PR, all four gates must pass:

```bash
npm run typecheck   # TypeScript type checking
npm run lint        # ESLint static analysis
npm test            # Vitest unit tests (669 test cases)
npm run knip        # Unused code detection
```

**Pre-commit hook enforces the first two.** CI enforces all four on every push/PR.

### Common Tasks

```bash
# Development
npm run dev              # Start Electron dev server
npm test -- --watch     # Run tests in watch mode
npm run lint -- --fix   # Auto-fix linting issues

# Building
npm run build           # Compile assets for distribution
npm run pack:win        # Build signed Windows installer (requires cert)

# Debugging
npm run backtest        # Run the nightly self-eval backtest
```

### Working on Features

1. **Branch from master:** `git checkout -b feat/P-NNN-description origin/master`
2. **Make changes** — code passes all four gates locally
3. **Commit with clarity** — describe the *what* and *why*
4. **Open a PR** — link to the issue; CI must pass
5. **Merge** — one approval + all gates green

See `AGENTS.md` for the full workflow.

---

## Architecture

### Core Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Electron 43 + Node 20.19 |
| **UI Framework** | React 19 + TypeScript 6.0 |
| **State** | Zustand (not Redux) |
| **Charting** | TradingView Lightweight Charts v5 |
| **Data** | WebSocket + REST (Alpaca API) |
| **Database** | SQLite (better-sqlite3) + Obsidian vault |
| **IPC** | Electron IPC (Zod-validated) |

### Key Concepts

- **Broker Abstraction** — Pluggable broker interface (`OrderRouter`, `MarketDataSource`, `AccountSyncer`, `SymbolResolver`)
- **Data-Feed Switch** — Toggle between live Alpaca and paper simulator at runtime
- **Multi-Agent Engine** — Specialized subagents for risk, execution, analysis, learning
- **Sub-Second Aggregator** — Real-time candle aggregation for crypto (250ms / 500ms buckets)
- **Self-Eval Loop** — Nightly backtest + trade-close journaling for strategy refinement

See `CLAUDE.md` for architecture invariants and design decisions.

---

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Alpaca API keys (paper trading)
ALPACA_API_KEY=your_api_key_here
ALPACA_API_SECRET=your_api_secret_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Optional: custom paths
SATEX_VAULT_ROOT=C:\Users\YourName\Vault
# SATEX_SIMULATOR_24_7 is now a no-op — the simulator streams 24/7 by default (inert since 2026-07-16)
```

See `.env.local.example` for the full template.

### Vault Integration

SATEX can journal trades to an Obsidian vault for long-term analysis:

1. **Create or link a vault** — point `SATEX_VAULT_ROOT` to it
2. **Enable journaling** — trades will materialize as `.md` notes in `Vault/Trades/`
3. **Review insights** — analyze loss-learnings via `Vault/Bases/` second-brain layer

---

## Release Checklist

Before shipping a release, see `docs/release-checklists/release-procedure.md`:

- [ ] All four gates pass locally and on CI
- [ ] CHANGELOG.md updated with version and date
- [ ] Code signing certificate in place (`CSC_LINK` + `CSC_KEY_PASSWORD`)
- [ ] Smoke tests pass (45–60 min checklist)
- [ ] GitHub Release created with signed `.exe` + checksums
- [ ] Auto-update toast verified (if applicable)

---

## Trading Safety

⚠️ **This terminal executes real trades on live capital (Alpaca paper account during dev).** Safety is non-negotiable:

- **Per-trade risk:** ≤1% of session equity (hard-coded, not overridable)
- **Daily loss limit:** ≤2% of session equity (auto-halt)
- **Order routing:** Only via `AlpacaBrokerSession` — no direct API calls
- **Risk gates:** Cannot be bypassed; `RISK-AGENT` veto is final
- **Credentials:** API keys stored in `safeStorage`, never in logs or code

See `SATEX Constitution` in the project instructions for the full safety charter.

---

## Documentation

| Document | Purpose |
|----------|---------|
| `CLAUDE.md` | Architecture, invariants, design decisions |
| `AGENTS.md` | Development workflow, branching, gates, troubleshooting |
| `CHANGELOG.md` | Release history and version notes |
| `docs/design/` | Technical design docs and specs |
| `docs/release-checklists/` | Release and smoke-test procedures |

---

## Contributing

1. **Read AGENTS.md** — understand the workflow
2. **Read CLAUDE.md** — understand the architecture
3. **Run the four gates locally** — typecheck, lint, test, knip
4. **Open a PR** with a clear title and description
5. **Wait for CI + one approval** — then merge

Issues marked `good first issue` are a great place to start.

---

## Troubleshooting

### "Module not found" or build errors

```bash
npm install
npm run rebuild:native  # Rebuild native modules (better-sqlite3)
```

### "All four gates must pass before commit"

```bash
npm run typecheck && npm run lint  # Fix issues
git add .
git commit -m "..."
```

### Tests fail locally but pass on CI

Check Node version:

```bash
node --version  # should be 20.19.x
```

Reinstall dependencies:

```bash
rm -rf node_modules package-lock.json
npm install
```

See `AGENTS.md` **Troubleshooting** for more.

---

## Support & Feedback

- **Bug report?** File an issue with steps to reproduce, environment, and logs
- **Feature request?** Open an issue with acceptance criteria
- **Design question?** Start a discussion in GitHub Discussions
- **Security issue?** Do not file a public issue — contact the maintainers

---

## License

SATEX is licensed under the **MIT License**. See `LICENSE` for details.

**Copyright (c) 2026 SATEX Engineering**

---

## Credits

- **TradingView** — Lightweight Charts library
- **Alpaca** — Market data and execution API
- **Electron** — Desktop app runtime
- **React & TypeScript** — UI framework and type safety
- **Zustand** — State management

---

**Latest Release:** [v0.5.0](https://github.com/satex25/SATEX-terminal/releases/tag/v0.5.0)  
**Repository:** [satex25/SATEX-terminal](https://github.com/satex25/SATEX-terminal)  
**Last Updated:** 2026-06-12
