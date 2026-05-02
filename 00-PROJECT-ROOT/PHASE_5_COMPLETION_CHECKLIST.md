# SATEX Phase 5 Completion Checklist

**Project:** SATEX Autonomous Trading Terminal  
**Current Phase:** Phase 5 (Packaging, Hardening, Release Prep)  
**Target Completion:** June 30, 2026  
**Status:** 🔴 IN PROGRESS (May 1, 2026 baseline)

---

## Overview

This checklist tracks all remaining work for Phase 5 completion. Items are organized by category (Code, Infrastructure, Testing, Documentation, Tools, Integrations). Each item includes:
- **Status:** 🔴 Not Started | 🟡 In Progress | 🟢 Done
- **Owner:** Person responsible (TBD)
- **Est. Hours:** Time estimate
- **Blocking:** Critical path dependencies

---

# A. CORE CODE HARDENING

## A.1 Risk Engine Audit & Testing

### A.1.1 OrderManager Risk Invariants
- [ ] **Invariant #1: Kill Switch** — Verify kill switch arms/disarms correctly, blocks new orders, cancels pending
  - Status: 🔴
  - Test: `src/main/services/__tests__/order-manager.test.ts`
  - Est. Hours: 4
  - Blocking: Release gate
  - Acceptance: Unit test passes, manual trading test confirms blocking

- [ ] **Invariant #2: Buying Power Check** — Verify 2x margin limit enforced
  - Status: 🔴
  - Test: Test submit with buying power exceeded
  - Est. Hours: 3
  - Blocking: Release gate
  
- [ ] **Invariant #3: Position Size Cap (25% per symbol)** — Verify position sized correctly
  - Status: 🔴
  - Test: Submit order that would breach 25% limit
  - Est. Hours: 3
  - Blocking: Release gate

- [ ] **Invariant #4: Daily Loss Limit (-2%)** — Verify hard stop at session loss limit
  - Status: 🔴
  - Test: Run replay with losing trades until -2% reached
  - Est. Hours: 4
  - Blocking: Release gate
  - Note: Must survive replay pause/resume without double-counting loss

- [ ] **Invariant #5: Triggered Orders (SL/TP) Bypass** — Verify SL/TP always executes
  - Status: 🔴
  - Test: Verify SL fills even when daily loss exhausted
  - Est. Hours: 3
  - Blocking: Release gate

- [ ] **Invariant #6: Max Open Positions (3)** — Verify can't exceed 3 positions
  - Status: 🔴
  - Test: Try to open 4th position, verify rejection
  - Est. Hours: 2
  - Blocking: Release gate

- [ ] **Invariant #7: Account Verification (Live)** — Verify live trading blocked until verified
  - Status: 🔴
  - Test: Try to enable live trading, verify gate status, verify order rejection
  - Est. Hours: 3
  - Blocking: Release gate

### A.1.2 AutonomousTrader Decision Gates
- [ ] **Gate #1: Enabled Flag** — Verify signals blocked when disabled
  - Status: 🔴
  - Test: Submit signal with enabled=false, verify rejection
  - Est. Hours: 2

- [ ] **Gate #2: Confidence Threshold (≥0.6)** — Verify low-confidence signals rejected
  - Status: 🔴
  - Test: Mock AIBrain with confidence=0.5, verify rejection reason
  - Est. Hours: 2

- [ ] **Gate #3: Daily Loss Budget** — Verify gate respects daily limit
  - Status: 🔴
  - Test: Set account daily PnL to -2%, submit signal, verify rejection
  - Est. Hours: 2

- [ ] **Gate #4: Position Limit (< 3)** — Verify gate counts open positions correctly
  - Status: 🔴
  - Test: Open 3 positions, send signal, verify rejection
  - Est. Hours: 2

- [ ] **Gate #5: Volatility Sizing** — Verify position size adjusted by ATR
  - Status: 🔴
  - Test: Mock ATR=high, verify size drops, ATR=low, verify size nominal
  - Est. Hours: 3

- [ ] **Gate #6: SL/TP from LearnedEngine** — Verify stops are present
  - Status: 🔴
  - Test: Mock LearnedSL returning null, verify rejection
  - Est. Hours: 2

- [ ] **Gate #7: Risk/Reward Ratio (≥2.5:1)** — Verify poor R/R rejected
  - Status: 🔴
  - Test: Create signal with RR=1.5:1, verify rejection
  - Est. Hours: 2

### A.1.3 LearnedStopLossEngine Validation
- [ ] **Hydration from Trade History** — Verify SL engine loads prior trades correctly
  - Status: 🔴
  - Test: Hydrate with 50 trades, verify win-rate computed, verify SL ranges reasonable
  - Est. Hours: 4
  - Blocking: Replay learning

- [ ] **Adaptive SL Computation (ATR-based)** — Verify SL scales with volatility
  - Status: 🔴
  - Test: Set ATR=1% vs. ATR=5%, verify SL distance adjusts
  - Est. Hours: 3

- [ ] **Trade Outcome Recording** — Verify closed trades persisted to DB
  - Status: 🔴
  - Test: Close trade, verify it appears in getSlTrades(), verify confidence increases
  - Est. Hours: 2

---

## A.2 Data Consistency & IPC Contract

### A.2.1 IPC Channel Validation
- [ ] **IPC Channel Completeness** — Verify all channels in `src/shared/ipc-channels.ts` have handlers
  - Status: 🔴
  - Check: Count channels (should be 25), count handlers in main/index.ts, must match
  - Est. Hours: 2
  - Acceptance: 25/25 handlers present

- [ ] **IPC Type Safety** — Verify TypeScript catches IPC payload mismatches
  - Status: 🔴
  - Test: Create a test that sends wrong payload type, verify TS error
  - Est. Hours: 2

- [ ] **IPC Error Handling** — Verify IPC handlers gracefully reject bad payloads
  - Status: 🔴
  - Test: Invoke ORDER_SUBMIT with missing symbol, verify error, not crash
  - Est. Hours: 3

- [ ] **IPC Race Conditions** — Verify concurrent IPC calls don't corrupt state
  - Status: 🔴
  - Test: Hammer 100 concurrent ORDER_SUBMIT calls, verify correct fills + sequence
  - Est. Hours: 4
  - Blocking: Load testing

### A.2.2 Quote Merge Logic
- [ ] **Live + Sim Merge** — Verify quotes correctly prioritized (live > sim)
  - Status: 🔴
  - Test: Feed live AAPL, sim BTC, verify AAPL from live, BTC from sim
  - Est. Hours: 3

- [ ] **Quote Deduplication** — Verify same symbol doesn't emit twice per tick
  - Status: 🔴
  - Test: Monitor IPC QUOTES_TICK, count symbols, verify no duplicates
  - Est. Hours: 2

- [ ] **Stale Quote Detection** — Verify stale quotes are logged, not silent
  - Status: 🔴
  - Test: Stop live feed, verify stale warning in console, fallback works
  - Est. Hours: 2

### A.2.3 Order State Machine
- [ ] **Order Lifecycle: pending → filled/rejected** — Verify state transitions valid
  - Status: 🔴
  - Test: Submit order, verify createdAt < filledAt, no backwards time
  - Est. Hours: 2

- [ ] **Order ID Uniqueness** — Verify order IDs never collide
  - Status: 🔴
  - Test: Generate 10K order IDs, verify all unique
  - Est. Hours: 2

- [ ] **Order Rejection Audit Trail** — Verify rejection reasons are clear
  - Status: 🔴
  - Test: Reject for each invariant, verify reason is human-readable
  - Est. Hours: 2

---

## A.3 Persistence & SQLite Hardening

### A.3.1 Database Initialization
- [ ] **Database Schema** — Verify schema creates correctly on first run
  - Status: 🔴
  - Test: Delete satex.db, start app, verify schema present
  - Est. Hours: 2
  - Check: `src/main/services/persistence.ts` schema()

- [ ] **Migration Path** — Verify schema migrations work (if upgrading from v1)
  - Status: 🔴
  - Test: Start with old satex.db, upgrade to v2.0, verify no data loss
  - Est. Hours: 3

- [ ] **Concurrent Access** — Verify SQLite WAL mode prevents locks
  - Status: 🔴
  - Test: Hammer DB with 10 concurrent writes, verify no "database locked" errors
  - Est. Hours: 3

### A.3.2 Order & Trade Persistence
- [ ] **Order Upsert Idempotency** — Verify re-emitting same order creates update, not duplicate
  - Status: 🔴
  - Test: Emit order twice, verify only 1 row in DB
  - Est. Hours: 2

- [ ] **Trade Outcome Recording** — Verify closed trades + outcomes persisted
  - Status: 🔴
  - Test: Close a trade, query DB, verify entry/exit/pnl recorded
  - Est. Hours: 2

- [ ] **Session Start/End** — Verify session rows created + stats updated
  - Status: 🔴
  - Test: Start session, trade, end session, query DB, verify equity snapshots
  - Est. Hours: 2

### A.3.3 Backup & Recovery
- [ ] **Database Backup on Startup** — Verify satex.db.bak created
  - Status: 🔴
  - Test: Start app, check userData folder for .bak file
  - Est. Hours: 2

- [ ] **Restore from Backup** — Verify can recover if DB corrupted
  - Status: 🔴
  - Test: Corrupt satex.db, manually restore from .bak, verify app starts
  - Est. Hours: 2

---

## A.4 Replay Engine Determinism & Learning

### A.4.1 Replay Reproducibility
- [ ] **Deterministic Tick Sequence** — Verify replay same date always produces same trades
  - Status: 🔴
  - Test: Replay 2024-01-15 twice, verify identical trade sequence
  - Est. Hours: 4
  - Blocking: Learning validation

- [ ] **Seeded RNG Usage** — Verify no Math.random() creeps in
  - Status: 🟡 (grep done, but untested at runtime)
  - Grep: `grep -r "Math.random" src/main/services/`
  - Should return 0 results
  - Est. Hours: 1

- [ ] **Deterministic Pause/Resume** — Verify pause doesn't skip bars
  - Status: 🔴
  - Test: Replay, pause at bar 500, resume, verify bar 501 processed next
  - Est. Hours: 3

### A.4.2 Learning Loop
- [ ] **AI Brain Hydration from Replay** — Verify closed trades update brain
  - Status: 🔴
  - Test: Replay 100 bars, verify AIBrain.snapshot() shows win-rate, SL distances
  - Est. Hours: 3

- [ ] **Learning Isolation** — Verify learning=true doesn't affect live trading
  - Status: 🔴
  - Test: Run replay learning=true, then run another replay learning=false, verify separate brain state
  - Est. Hours: 3

- [ ] **Confidence Growth** — Verify confidence increases with sample size
  - Status: 🔴
  - Test: Replay with 10 trades vs. 100 trades, verify confidence rises with sample
  - Est. Hours: 2

### A.4.3 Replay Performance
- [ ] **Throughput: 8K → 10K bars/sec** — Profile + optimize
  - Status: 🔴
  - Measure: Time replay 100K bars, compute bars/sec
  - Current: ~8K bars/sec (target: 10K)
  - Optimization: Batch SQLite writes (every 10 trades), reduce renderer updates
  - Est. Hours: 6
  - Blocking: Release performance gate

- [ ] **Memory Stability** — Verify memory doesn't leak during long replay
  - Status: 🔴
  - Test: Replay 1M bars, monitor heap, verify <1GB sustained
  - Est. Hours: 4

---

## A.5 Live Trading Execution Safety

### A.5.1 AlpacaLiveTrading Gates
- [ ] **5-Gate Activation Flow** — Verify all 5 gates work in sequence
  - Status: 🔴
  - Gates:
    1. Min deposit ($100)
    2. Account verified
    3. Risk acknowledged
    4. 2FA enabled (if required)
    5. Alpaca account valid
  - Test: Run through activation manually, verify gates respected
  - Est. Hours: 4

- [ ] **Live Order Submission** — Verify real orders sent to Alpaca
  - Status: 🔴
  - Test: Enable live, submit $100 order (small), verify fills on Alpaca dashboard
  - Est. Hours: 3
  - Blocking: Paper to live transition
  - ⚠️ Requires real Alpaca keys, small test amount

- [ ] **Order Cancellation on Live** — Verify pending orders cancel correctly
  - Status: 🔴
  - Test: Submit live order, cancel before fill, verify cancellation on Alpaca
  - Est. Hours: 2

### A.5.2 Live Account Reconciliation
- [ ] **Balance Sync** — Verify SATEX equity matches Alpaca equity
  - Status: 🔴
  - Test: After live trade, compare OrderManager equity vs. Alpaca account equity, should match
  - Est. Hours: 2

- [ ] **Position Sync** — Verify open positions match Alpaca
  - Status: 🔴
  - Test: Check OrderManager positions vs. Alpaca positions
  - Est. Hours: 2

---

---

# B. ELECTRON PACKAGING & DISTRIBUTION

## B.1 electron-builder Configuration

### B.1.1 Build Configuration (electron-builder.yml)
- [ ] **Windows .exe Installer** — electron-builder generates signed installer
  - Status: 🔴
  - File: `satex-app/electron-builder.yml`
  - Required fields:
    - `appId`: "com.satex.app"
    - `productName`: "SATEX"
    - `win.certificateFile`: Path to code-signing cert (self-signed OK for now)
    - `win.certificatePassword`: From env or store
  - Test: `npm run pack:win`, verify .exe created in dist/
  - Est. Hours: 4
  - Blocking: Release build

### B.1.2 Build Artifact Management
- [ ] **dist/ folder cleanup** — Verify old builds don't clutter
  - Status: 🔴
  - Action: Add `dist/` to .gitignore, verify clean before each build
  - Est. Hours: 1

- [ ] **Build artifact versioning** — Verify build timestamp in filename
  - Status: 🔴
  - Config: `electron-builder.yml` should output `SATEX-2.0.0-setup.exe`
  - Est. Hours: 1

---

## B.2 Auto-Updates (electron-updater)

### B.2.1 Update Server Setup
- [ ] **Update Server (GitHub Releases or custom)** — Decide hosting
  - Status: 🔴
  - Option A: GitHub Releases (free, built-in)
    - [ ] Create release tag `v2.0.0` with .exe + .yml
    - [ ] Verify electron-updater finds it
  - Option B: Custom S3 bucket
    - [ ] Create S3 bucket, upload .exe + .yml
    - [ ] Configure SATEX to check S3 endpoint
  - Decision: GitHub Releases (simpler, free)
  - Est. Hours: 4
  - Blocking: Auto-update feature

### B.2.2 Auto-Update Code
- [ ] **Update Check on Startup** — Verify electron-updater boots on app start
  - Status: 🔴
  - Code: Add to `src/main/index.ts` (after wireServices)
  - Checks server, downloads diff if available, prompts user
  - Est. Hours: 3

- [ ] **Update Progress UI** — Renderer shows download % + install prompt
  - Status: 🔴
  - IPC channel: `UPDATE_PROGRESS` (main → renderer)
  - Show: "Update available: 42% downloaded... Install?"
  - Est. Hours: 3

- [ ] **Rollback on Crash** — If new version crashes, revert to previous
  - Status: 🔴
  - electron-updater feature (automatic)
  - Test: Auto-update to bad version, verify app still starts (old version)
  - Est. Hours: 2

---

## B.3 Code Signing & Security

### B.3.1 Windows Code Signing
- [ ] **Obtain Code Signing Certificate** — Sigma free cert or self-signed test cert
  - Status: 🔴
  - Option A: Sigma free cert (recommended for open-source)
    - [ ] Apply at https://www.sigmadeltech.com/free-ev-code-signing/
    - [ ] Wait for approval (~3–5 days)
    - [ ] Download .pfx, store securely (not in repo)
  - Option B: Self-signed cert (dev only)
    - [ ] `makecert.exe` to generate .pfx
    - [ ] Use in CI/CD
  - Decision: Sigma free cert for release
  - Est. Hours: 1 (waiting) + 1 (setup)
  - Blocking: Release build security

### B.3.2 Build Signing
- [ ] **Sign .exe Before Release** — electron-builder must sign output
  - Status: 🔴
  - Config: `electron-builder.yml`
    ```yaml
    win:
      certificateFile: path/to/cert.pfx
      certificatePassword: ${CERTIFICATE_PASSWORD}
    ```
  - Test: Run `npm run pack:win`, verify .exe has valid signature
  - Est. Hours: 2

- [ ] **SmartScreen Trust** — Warn that unrecognized publisher for first release OK
  - Status: 🔴
  - Mitigation: Explain in release notes that SmartScreen will improve after 50+ downloads
  - Est. Hours: 0 (docs only)

---

---

# C. TESTING & QA

## C.1 Unit Testing (Vitest)

### C.1.1 Service Coverage
- [ ] **OrderManager tests** — Verify all 7 invariants in isolation
  - Status: 🔴
  - File: `src/main/services/__tests__/order-manager.test.ts`
  - Tests needed:
    - Submit valid buy order → filled
    - Submit order exceeding buying power → rejected
    - Submit order after kill switch → rejected
    - Position size > 25% → rejected
    - Daily loss at -2% → reject new entry, allow SL
    - (repeat for all 7 invariants)
  - Target coverage: 95%
  - Est. Hours: 8

- [ ] **AutonomousTrader tests** — Verify all 7 gates
  - Status: 🔴
  - File: `src/main/services/__tests__/autonomous-trader.test.ts`
  - Mocks: AIBrain (confidence), OrderManager (account state)
  - Est. Hours: 6

- [ ] **LearnedStopLossEngine tests** — Verify SL computation
  - Status: 🔴
  - File: `src/main/services/__tests__/learned-sl-engine.test.ts`
  - Tests: Hydrate trades, compute SL, verify ATR scaling
  - Est. Hours: 4

- [ ] **Indicators tests** — Pure function tests (VWAP, EMA, RSI, ATR)
  - Status: 🔴
  - File: `src/main/services/__tests__/indicators.test.ts`
  - Test each indicator with known inputs vs. expected outputs
  - Est. Hours: 5

- [ ] **MarketSimulator tests** — Verify GBM path, fill logic
  - Status: 🔴
  - File: `src/main/services/__tests__/market-data.test.ts`
  - Test: Seeded RNG determinism, price bounds (GBM stays positive)
  - Est. Hours: 4

- [ ] **AIBrain tests** — Verify parameter caching + hydration
  - Status: 🔴
  - File: `src/main/services/__tests__/ai-brain.test.ts`
  - Test: Register default, hydrate from DB, snapshot
  - Est. Hours: 3

### C.1.2 React Component Tests
- [ ] **Memoization verification** — Verify React.memo prevents unnecessary re-renders
  - Status: 🔴
  - Test file: `src/renderer/components/__tests__/memoization.test.tsx`
  - Tool: React Testing Library + render spy
  - Est. Hours: 4

- [ ] **Zustand hook tests** — Verify selectors don't over-subscribe
  - Status: 🔴
  - Test: useAccount selector, verify only Account updates trigger re-render
  - Est. Hours: 3

---

## C.2 Integration Testing

### C.2.1 End-to-End Trading Flow
- [ ] **Paper Trading Flow: Quote → Order → Fill → Position → Account**
  - Status: 🔴
  - Test steps:
    1. Simulator generates AAPL quote $150
    2. Submit buy market order 10 AAPL @ $150
    3. Verify order filled
    4. Verify position created (qty=10, entry=$150)
    5. Verify account updated (equity down by $1500)
    6. Verify PnL displays correctly
  - Est. Hours: 6
  - Blocking: Release gate

- [ ] **Kill Switch Flow**
  - Status: 🔴
  - Test:
    1. Submit 3 pending orders
    2. Trip kill switch
    3. Verify pending orders cancelled
    4. Verify new orders rejected
    5. Verify kill switch can be disarmed
  - Est. Hours: 3

- [ ] **Autonomous Gate Flow**
  - Status: 🔴
  - Test:
    1. Create signal with confidence=0.8
    2. Route through AutonomousTrader
    3. Verify all 7 gates pass/fail correctly
    4. Verify order submitted (if approved) or rejected (if denied)
  - Est. Hours: 4

### C.2.2 Replay Integration
- [ ] **Replay Determinism Test**
  - Status: 🔴
  - Test:
    1. Replay 2024-01-15 at 10x speed
    2. Record trades + order sequence
    3. Replay same date again
    4. Verify identical trade sequence + equity curve
  - Est. Hours: 4
  - Blocking: Release gate

- [ ] **Replay Learning Test**
  - Status: 🔴
  - Test:
    1. Snapshot AIBrain before replay (empty)
    2. Run replay with learning=true
    3. Close 50 trades
    4. Snapshot AIBrain after (should have win-rate, SL params)
    5. Verify confidence > 0
  - Est. Hours: 4

### C.2.3 Data Consistency
- [ ] **Quote-to-DB Flow**
  - Status: 🔴
  - Test:
    1. Trade for 5 minutes
    2. Export order history to CSV
    3. Verify CSV has all trades
    4. Verify timestamps monotonic
    5. Verify PnL recalculation matches OrderManager
  - Est. Hours: 3

---

## C.3 Manual / Exploratory Testing

### C.3.1 UI Responsiveness
- [ ] **20Hz Update Flow** — Verify no jank during quote flood
  - Status: 🔴
  - Test:
    - Monitor FPS during active trading (DevTools → Performance)
    - Target: 60 FPS sustained, <1 frame drop per second
    - If <60 FPS: profile component re-renders, add React.memo
  - Est. Hours: 4

- [ ] **Chart Responsiveness** — TradingView chart smooth during updates
  - Status: 🔴
  - Test: 50 quotes/sec, verify chart renders smoothly
  - Est. Hours: 2

### C.3.2 Live Trading Dry Run
- [ ] **Live Trading Gate Activation** — Manually walk through 5-gate flow
  - Status: 🔴
  - Test:
    1. Enable live trading in UI
    2. Verify each gate (deposit, verification, risk ack, 2FA, account valid)
    3. Submit small $50 limit order
    4. Monitor Alpaca for 5 min, verify order lives
    5. Cancel order
  - ⚠️ Requires real Alpaca keys + test account
  - Est. Hours: 1 (real-time, not dev time)

- [ ] **Live Account Reconciliation** — Verify equity matches Alpaca
  - Status: 🔴
  - After live trade: compare SATEX equity vs. Alpaca API equity
  - Should match within $1 (rounding)
  - Est. Hours: 1

### C.3.3 Error Scenarios
- [ ] **Alpaca Connection Loss** — Graceful fallback to simulator
  - Status: 🔴
  - Test: Disconnect WiFi while app running, verify simulator continues, reconnect restores live
  - Est. Hours: 2

- [ ] **Corrupted Database** — Graceful recovery
  - Status: 🔴
  - Test: Corrupt satex.db, start app, verify backup restores
  - Est. Hours: 1

- [ ] **Out of Memory** — Graceful degradation during long replay
  - Status: 🔴
  - Test: Replay 1M bars, monitor heap, verify OOM is caught + logged, not crash
  - Est. Hours: 2

---

---

# D. INTEGRATIONS & EXTERNAL SERVICES

## D.1 ForexFactory Adapter Hardening

### D.1.1 Connection & Error Handling
- [ ] **Localhost :8080 Availability Check** — Verify graceful fallback if unavailable
  - Status: 🔴
  - Current: Assumes server on localhost:8080
  - Issue: If server not running, app hangs or crashes
  - Fix:
    - [ ] Add 5-second connection timeout
    - [ ] If unavailable, log warning + set calendar context to empty (TRADE recommendation, no events)
    - [ ] Retry every 30 seconds
  - Code file: `src/main/services/forexfactory-adapter.ts`
  - Est. Hours: 3

- [ ] **HTTP Error Handling** — Verify 5xx, 404, timeout handled
  - Status: 🔴
  - Test: Mock ForexFactory server returning 500, verify app doesn't crash
  - Est. Hours: 2

- [ ] **Polling Reliability** — Verify polling continues even if one request fails
  - Status: 🔴
  - Test: Server returns error on tick 5, verify polling resumes on tick 6
  - Est. Hours: 2

### D.1.2 Data Validation
- [ ] **Calendar Event Schema Validation** — Verify events have required fields
  - Status: 🔴
  - Check: imminentEvent, upcomingEvents[], tradeRecommendation, volatilityMultiplier
  - Reject malformed responses
  - Est. Hours: 2

- [ ] **Volatility Multiplier Bounds** — Verify multiplier is 0.5–2.0
  - Status: 🔴
  - Clamp to range if outside
  - Est. Hours: 1

---

## D.2 Alpaca Integration Validation

### D.2.1 Paper Trading Mode
- [ ] **Paper Account Detection** — Verify account type is "paper"
  - Status: 🔴
  - Test: Log in with paper account, verify status shows "paper", not "live"
  - Est. Hours: 1

- [ ] **Quote Feed** — Verify Alpaca quotes flowing in real-time
  - Status: 🔴
  - Test: Monitor DevTools console, verify QUOTES_TICK events from Alpaca (not sim)
  - Est. Hours: 2

- [ ] **Bar Backfill** — Verify LiveCandleBuffer backfills correctly
  - Status: 🔴
  - Test: Check LiveCandleBuffer startup log, verify "10 symbols backfilled"
  - Est. Hours: 2

### D.2.2 Live Trading Mode
- [ ] **Live Keys Validation** — Verify APCA_LIVE_API_KEY_ID present + valid
  - Status: 🔴
  - Test: Try to enable live trading without keys, verify rejection
  - Test: With keys, verify handshake succeeds
  - Est. Hours: 2

- [ ] **Order Routing** — Verify orders go to Alpaca, not simulated
  - Status: 🔴
  - Test: Enable live, submit $50 order, verify appears in Alpaca dashboard within 1 sec
  - Est. Hours: 2

- [ ] **Fill Notifications** — Verify Alpaca fills propagate back to SATEX
  - Status: 🔴
  - Test: Submit live order, manually fill in Alpaca dashboard, verify SATEX updates
  - Est. Hours: 2

---

## D.3 Polygon.io Integration (Future Readiness)

### D.3.1 Code Exists, Not Yet Wired
- [ ] **Review polygon-data-mcp** — Understand what it provides
  - Status: 🔴
  - Check: `02-INTEGRATIONS/polygon-data-mcp/`
  - Understand: Real-time options data? News sentiment? Alternative data?
  - Decision: Phase 6 feature (post-release)
  - Est. Hours: 2 (discovery)

### D.3.2 Defer to Phase 6
- [ ] **Document Integration Plan** — Add to CLAUDE.md
  - Status: 🔴
  - Add section: "Polygon.io Integration (Phase 6 Roadmap)"
  - Describe what to do, when, how
  - Est. Hours: 1

---

## D.4 Python Agents Bridge (Future Readiness)

### D.4.1 Code Exists, Not Yet Wired
- [ ] **Review agents-framework** — Understand Polymarket signal generation
  - Status: 🔴
  - Check: `02-INTEGRATIONS/agents-framework/`
  - Understand: What signals does it generate? How often?
  - Decision: Phase 6 feature
  - Est. Hours: 2 (discovery)

### D.4.2 Defer to Phase 6
- [ ] **Document Integration Plan** — Add to CLAUDE.md
  - Status: 🔴
  - Add section: "Polymarket Agents Integration (Phase 6 Roadmap)"
  - Est. Hours: 1

---

---

# E. DOCUMENTATION & KNOWLEDGE

## E.1 CLAUDE.md (Developer Guide)
- [ ] **CLAUDE.md Created** ✅ (Already done)
  - Status: 🟢 DONE
  - File: `00-PROJECT-ROOT/CLAUDE.md`
  - Includes: Architecture, commands, patterns, rules, extensions

## E.2 Architectural Design Document
- [ ] **SATEX_ARCHITECTURAL_DESIGN.md** ✅ (Already done)
  - Status: 🟢 DONE
  - File: outputs folder
  - Includes: High-level design, risk engine deep dive, scale analysis, roadmap

## E.3 API Documentation (Optional but Recommended)
- [ ] **IPC Contract Documentation** — Document all 25 channels
  - Status: 🔴
  - File: `00-PROJECT-ROOT/IPC_CHANNELS.md`
  - For each channel:
    - Direction (main → renderer or vice versa)
    - Payload type
    - Example
    - Error handling
  - Est. Hours: 4

- [ ] **Service API Docs** — OrderManager, AutonomousTrader, ReplayRunner
  - Status: 🔴
  - File: `00-PROJECT-ROOT/SERVICE_API.md`
  - For each service: public methods, inputs, outputs, invariants
  - Est. Hours: 4

## E.4 Deployment & Operations
- [ ] **Deployment Runbook** — Step-by-step release procedure
  - Status: 🔴
  - File: `00-PROJECT-ROOT/DEPLOYMENT.md`
  - Includes:
    1. Version bump (package.json, CHANGELOG)
    2. Build: `npm run pack:win`
    3. Code sign .exe
    4. Create GitHub release
    5. Upload .exe + .yml (for auto-update)
    6. Announce release notes
  - Est. Hours: 2

- [ ] **Troubleshooting Guide** — Common issues + fixes
  - Status: 🔴
  - File: `00-PROJECT-ROOT/TROUBLESHOOTING.md`
  - Issues:
    - Alpaca connection fails
    - SQLite locked errors
    - Replay hangs
    - Memory leak symptoms
    - High latency during replay
  - Solutions for each
  - Est. Hours: 3

## E.5 Release Notes
- [ ] **CHANGELOG** — Document Phase 5 work
  - Status: 🔴
  - File: `00-PROJECT-ROOT/CHANGELOG.md`
  - Format:
    ```
    ## [2.0.0] - 2026-06-30
    ### Added
    - Auto-updates via electron-updater
    - Windows code signing (Sigma cert)
    - Comprehensive risk testing (7 invariants, 7 gates)
    
    ### Fixed
    - ForexFactory graceful fallback
    - Replay throughput optimization (10K bars/sec)
    - Memory leak in replay pause/resume
    
    ### Changed
    - SQLite batch writes (10 trades/batch)
    - ReactDOMServer removed from renderer
    ```
  - Est. Hours: 2

---

---

# F. TOOLS & INFRASTRUCTURE

## F.1 Figma Integration (Phase 5 Prep, not implementation)

### F.1.1 Assessment
- [ ] **Figma Tools Available** — Verify all Figma MCPs loaded
  - Status: 🔴
  - Check: System reminder for available Figma tools
  - Expected: get_design_context, get_code_connect_suggestions, add_code_connect_map, etc.
  - Est. Hours: 1 (inventory)

- [ ] **Current Design System Status** — Audit existing Tailwind tokens
  - Status: 🔴
  - Task: Extract Tailwind config, identify design tokens (colors, spacing, typography)
  - File: `satex-app/tailwind.config.js` (may not exist; may be inline)
  - Est. Hours: 2

### F.1.2 Design System Extraction
- [ ] **Extract Tailwind Tokens** — Centralize design tokens
  - Status: 🔴
  - Create: `satex-app/tailwind.config.ts` with all tokens
  - Include: Colors (brand, alerts, charts), spacing (8px grid), typography (font sizes, weights)
  - Test: Build app, verify visual no change
  - Est. Hours: 3

- [ ] **Component Inventory** — Document all React components
  - Status: 🔴
  - Audit: `src/renderer/components/`
  - List: QuotePanel, OrderPanel, ChartPanel, etc. with props
  - Est. Hours: 3

### F.1.3 Figma Library Creation (Phase 6 Prep)
- [ ] **Design Figma Component Library** — Create Figma file with components
  - Status: 🔴
  - Action: New Figma file "SATEX Design System"
  - Create: Atomic components (Button, Input, Card), composite components (OrderPanel, ChartPanel)
  - Map variants (size, state, theme)
  - Est. Hours: 8
  - **Defer to Phase 6** (post-release)

### F.1.4 Code Connect Setup (Phase 6)
- [ ] **Map React Components to Figma** — Use Code Connect MCP
  - Status: 🔴
  - Action: For each Figma component, add Code Connect annotation
  - Link: Figma node ID → React component source location
  - Test: Figma component shows "View code" link
  - Est. Hours: 4
  - **Defer to Phase 6**

---

## F.2 CI/CD Automation (GitHub Actions)

### F.2.1 Build Pipeline
- [ ] **GitHub Actions Workflow** — Automate build on push
  - Status: 🔴
  - File: `.github/workflows/build.yml`
  - Triggers: Push to main, PR opens
  - Steps:
    1. Install dependencies
    2. Run `npm run typecheck`
    3. Run `npm run lint`
    4. Run `npm run test`
    5. Build: `npm run pack:win` (on main only)
    6. Upload artifact (Windows .exe)
  - Est. Hours: 4

- [ ] **Test on Push** — Fail if tests don't pass
  - Status: 🔴
  - Config: GitHub Actions branch protection rule
  - Require: CI passes before merge to main
  - Est. Hours: 1

### F.2.2 Release Pipeline
- [ ] **Auto-Create Release** — Tag v2.0.0, auto-upload .exe
  - Status: 🔴
  - Workflow: `.github/workflows/release.yml`
  - Trigger: Tag created (e.g., `git tag v2.0.0`)
  - Steps:
    1. Build (npm run pack:win)
    2. Sign .exe
    3. Generate .yml (for auto-update)
    4. Create GitHub release
    5. Upload .exe + .yml
  - Est. Hours: 6

---

## F.3 Development Tools & Debugging

### F.3.1 Local Development Setup
- [ ] **Dev Environment Validation** — npm install works, no peer dependency conflicts
  - Status: 🔴
  - Test: Fresh clone, `npm install`, `npm run dev`
  - Should start Electron + Vite dev server
  - Est. Hours: 1

- [ ] **.env Template** — Create .env.example for developers
  - Status: 🔴
  - File: `satex-app/.env.example`
  - Contents:
    ```env
    # Alpaca (optional)
    APCA_API_KEY_ID=sk_test_...
    APCA_API_SECRET_KEY=...
    
    # Alpaca live (optional)
    APCA_LIVE_API_KEY_ID=...
    APCA_LIVE_API_SECRET_KEY=...
    
    # Enable autonomous trading
    ENABLE_AUTONOMOUS_TRADING=1
    ```
  - Est. Hours: 1

### F.3.2 Debugging Tools
- [ ] **Devtools Integration** — Ctrl+Shift+I opens DevTools
  - Status: 🔴 (likely already working)
  - Test: Press Ctrl+Shift+I during dev, verify DevTools opens
  - Est. Hours: 0.5

- [ ] **React DevTools** — React profiler visible in DevTools
  - Status: 🔴
  - May need: react-devtools package
  - Est. Hours: 1 (if needed)

- [ ] **Logging Level Control** — Env var to enable debug logging
  - Status: 🔴
  - Add: `process.env.DEBUG=1` enables verbose logs
  - Implement: Wrap console.log with `if (process.env.DEBUG) console.log(...)`
  - Est. Hours: 2

---

---

# G. FINAL VALIDATION & RELEASE

## G.1 Pre-Release Checklist

### G.1.1 Code Quality
- [ ] **Type Checking Passes** — `npm run typecheck` has 0 errors
  - Status: 🔴
  - Est. Hours: 0 (verify only)

- [ ] **Linting Passes** — `npm run lint` has 0 errors
  - Status: 🔴
  - Est. Hours: 0 (verify only)

- [ ] **All Tests Pass** — `npm run test` has 0 failures
  - Status: 🔴
  - Target coverage: 80%+
  - Est. Hours: 0 (verify only)

- [ ] **No Console Errors** — App boots with clean console (no red errors in DevTools)
  - Status: 🔴
  - Warnings OK, errors NOT OK
  - Est. Hours: 0.5 (QA manual verification)

### G.1.2 Functionality Verification
- [ ] **Paper Trading Works** — Can submit orders, see fills
  - Status: 🔴
  - Test: 5-minute trading session
  - Est. Hours: 0.5

- [ ] **Autonomous Trading Works (if enabled)** — Signals route through gates
  - Status: 🔴
  - Test: Enable autonomous, monitor for 10 minutes
  - Verify at least 1 signal fires
  - Est. Hours: 1

- [ ] **Replay Works** — Can start/pause/resume historical session
  - Status: 🔴
  - Test: Replay 2024-01-15, verify trades, pause/resume works
  - Est. Hours: 1

- [ ] **Live Trading Gated** — Live orders only work after 5-gate activation
  - Status: 🔴
  - Test: Try live without activation → rejected
  - Activate → works
  - Est. Hours: 0.5

### G.1.3 Performance Validation
- [ ] **Latency Baseline** — Quote-to-fill <50ms (measure with DevTools timeline)
  - Status: 🔴
  - Est. Hours: 2

- [ ] **Memory Footprint** — Idle <500MB, active <1GB
  - Status: 🔴
  - Tool: DevTools → Memory → heap snapshot
  - Est. Hours: 1

- [ ] **Replay Throughput** — 10K+ bars/sec
  - Status: 🔴
  - Test: Replay 100K bars, measure elapsed time
  - Est. Hours: 1

### G.1.4 Documentation Verification
- [ ] **CLAUDE.md Complete** — Covers dev setup, commands, architecture, rules
  - Status: 🔴
  - Est. Hours: 0 (verify only)

- [ ] **Architectural Design Doc Complete** — High-level + deep dives
  - Status: 🔴
  - Est. Hours: 0 (verify only)

- [ ] **Deployment Runbook Complete** — Step-by-step release instructions
  - Status: 🔴
  - Est. Hours: 0 (verify only)

---

## G.2 Release Build & Deployment

### G.2.1 Final Build
- [ ] **Perform Final Build** — `npm run pack:win`
  - Status: 🔴
  - Output: satex-app/dist/SATEX-2.0.0-setup.exe
  - Verify:
    - [ ] File size reasonable (~300MB)
    - [ ] Installer runs (don't install, just test wizard)
    - [ ] Installer cancellable
  - Est. Hours: 1

### G.2.2 Code Signing
- [ ] **Sign Final .exe** — electron-builder auto-signs if cert configured
  - Status: 🔴
  - Verify signature: Right-click .exe → Properties → Digital Signatures
  - Should show "Verified" + certificate issuer
  - Est. Hours: 1

### G.2.3 GitHub Release
- [ ] **Create Release Tag** — `git tag v2.0.0`, push to GitHub
  - Status: 🔴
  - Est. Hours: 0.5

- [ ] **Upload Artifacts** — .exe + auto-update .yml to GitHub Releases
  - Status: 🔴
  - Manual upload or GitHub Actions automation
  - Est. Hours: 0.5

- [ ] **Write Release Notes** — Describe features, fixes, known issues
  - Status: 🔴
  - Include: Installation instructions, upgrade guide, breaking changes
  - Est. Hours: 1

### G.2.4 Announce
- [ ] **Announce on GitHub** — Issues, discussions, social media
  - Status: 🔴
  - Message: "SATEX 2.0.0 released! Download from [link]"
  - Est. Hours: 0.5

---

## G.3 Post-Release Monitoring

### G.3.1 User Feedback
- [ ] **Issue Triage** — Monitor GitHub issues for bugs
  - Status: 🔴
  - Frequency: Daily first week, weekly after
  - Action: Fix critical bugs immediately, defer minor to Phase 6

### G.3.2 Telemetry (Phase 6)
- [ ] **Error Tracking** — Sentry or similar (future)
  - Status: 🔴
  - Defer to Phase 6
  - Idea: Capture unhandled exceptions, log to server

---

---

# SUMMARY & CRITICAL PATH

## Timeline Estimate (May 1 – June 30, 2026)

| Category | Est. Hours | Owner | Critical Path |
|----------|-----------|-------|----------------|
| **A. Code Hardening** | 95 | Dev | ✅ YES |
| **B. Packaging** | 20 | Dev | ✅ YES |
| **C. Testing** | 60 | QA/Dev | ✅ YES |
| **D. Integrations** | 15 | Dev | ⚠️ Partial |
| **E. Documentation** | 20 | Dev | ✅ YES |
| **F. Tools** | 30 | Dev | ⚠️ Partial |
| **G. Release** | 10 | Dev | ✅ YES |
| **TOTAL** | **250 hours** | 2–3 devs | 8–10 weeks |

**Allocation (3-person team, 8 weeks):**
- Dev 1: Code hardening (A), Packaging (B), some docs
- Dev 2: Testing (C), Integration validation (D)
- Dev 3: Documentation (E), Tools/CI (F), Release (G)

**Risks:**
1. **Code signing delays** — Sigma cert approval (3–5 days waiting) → mitigate with self-signed early
2. **Test flakiness** — Replay determinism hard to debug → allocate buffer time
3. **Alpaca API changes** — Assume stable, but monitor changelogs
4. **Memory leaks** — Require deep profiling → allocate 1 week buffer

---

## Next Steps (Starting May 1)

1. **Week 1:** Code hardening sprint (A.1–A.5)
   - [ ] Audit risk invariants, write unit tests
   - [ ] Verify IPC contract completeness
   - [ ] Profile replay throughput

2. **Week 2–3:** Testing (C.1–C.3)
   - [ ] Build test suite (unit + integration)
   - [ ] Manual QA (UI responsiveness, live trading dry run)

3. **Week 4:** Packaging & CI/CD (B + F.2)
   - [ ] electron-builder config
   - [ ] GitHub Actions pipelines
   - [ ] Code signing setup

4. **Week 5–6:** Integration validation (D)
   - [ ] ForexFactory hardening
   - [ ] Alpaca reconciliation tests
   - [ ] Polygon/agents discovery

5. **Week 7:** Documentation (E)
   - [ ] Complete CLAUDE.md (already started)
   - [ ] Deployment runbook
   - [ ] Release notes

6. **Week 8:** Final validation & release (G)
   - [ ] Pre-release checklist
   - [ ] Build + sign .exe
   - [ ] GitHub release

---

**Document:** PHASE_5_COMPLETION_CHECKLIST.md  
**Version:** 1.0  
**Last Updated:** 2026-05-01  
**Next Review:** 2026-05-15 (mid-phase checkpoint)
