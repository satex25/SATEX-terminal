# PHASE 5 EXTREME PLANNING SHEET
**Project:** SATEX Trading Terminal  
**Phase:** 5 (Code Hardening → Release)  
**Timeline:** May 1 – June 30, 2026 (8 weeks)  
**Total Effort:** 250 hours (3-person team = ~21 hours/week capacity)  
**Status:** 🟡 Planning → Execution  
**Last Updated:** 2026-05-01  

---

## 📊 EXECUTIVE OVERVIEW

| Dimension | Target | Current | Status |
|-----------|--------|---------|--------|
| **Code Coverage** | 80%+ | 0% | 🔴 |
| **Risk Invariants** | 7/7 tested | 0/7 | 🔴 |
| **Autonomous Gates** | 7/7 tested | 0/7 | 🔴 |
| **Performance** | 10K bars/sec | Unknown | 🟡 |
| **Packaging** | Windows .exe | Not started | 🔴 |
| **Documentation** | Complete + API | 50% | 🟡 |
| **Integration Validation** | All APIs live | 70% | 🟡 |

**Critical Path:** Risk Invariants → Unit Tests → Integration Tests → Electron Packaging → Release  
**Blockers:** None. Go/No-Go: **GO**

---

## 🎯 GANTT CHART (8-Week Timeline)

```
WEEK 1: Code Hardening Sprint (May 1-7)
═════════════════════════════════════════════════════════════════════
Task                                    Mon Tue Wed Thu Fri Sat Sun
─────────────────────────────────────────────────────────────────────
A1. Risk Invariants Audit              [███████████████████] (40h)
A2. Autonomous Gates Unit Tests        [███████████████████] (40h)
A3. Replay Profiling                   [██████████] (20h)
A4. IPC Contract Audit                 [████] (8h)
Subtotal: 108 hours (13.5h/day ÷ 3 = 4.5h/person/day) ✓ Feasible
Status: IN PROGRESS


WEEK 2-3: Testing Build-Out (May 8-21)
═════════════════════════════════════════════════════════════════════
Task                                    Mon Tue Wed Thu Fri Sat Sun
─────────────────────────────────────────────────────────────────────
B1. Service Unit Tests (4 services)    [████████████████████████] (50h)
B2. Integration Tests (flows)          [██████████████████] (40h)
B3. Manual QA Plan & Execution         [█████████████] (30h)
Subtotal: 120 hours (8.6h/day ÷ 3 = 2.9h/person/day) ✓ Feasible
Status: QUEUED


WEEK 4: Electron Packaging (May 22-28)
═════════════════════════════════════════════════════════════════════
Task                                    Mon Tue Wed Thu Fri Sat Sun
─────────────────────────────────────────────────────────────────────
C1. electron-builder Config            [██████████] (20h)
C2. GitHub Actions CI/CD               [██████████] (20h)
C3. Code Signing Setup                 [████████] (15h)
Subtotal: 55 hours (7.9h/day ÷ 3 = 2.6h/person/day) ✓ Feasible
Status: QUEUED


WEEK 5-6: Integration Validation (May 29-Jun 11)
═════════════════════════════════════════════════════════════════════
Task                                    Mon Tue Wed Thu Fri Sat Sun
─────────────────────────────────────────────────────────────────────
D1. ForexFactory Hardening            [████████████] (25h)
D2. Alpaca Validation (paper → live)  [████████████] (25h)
D3. SQLite Persistence Audit          [██████████] (20h)
Subtotal: 70 hours (5h/day ÷ 3 = 1.7h/person/day) ✓ Feasible
Status: QUEUED


WEEK 7: Documentation Sprint (Jun 12-18)
═════════════════════════════════════════════════════════════════════
Task                                    Mon Tue Wed Thu Fri Sat Sun
─────────────────────────────────────────────────────────────────────
E1. CLAUDE.md Final Review             [████████] (12h)
E2. API Docs (IPC channels, methods)  [███████████] (18h)
E3. Deployment Runbook                 [██████████] (15h)
Subtotal: 45 hours (6.4h/day ÷ 3 = 2.1h/person/day) ✓ Feasible
Status: QUEUED


WEEK 8: Release & Validation (Jun 19-30)
═════════════════════════════════════════════════════════════════════
Task                                    Mon Tue Wed Thu Fri Sat Sun
─────────────────────────────────────────────────────────────────────
F1. Pre-Release Validation             [██████████] (15h)
F2. Final Build & Code Signing         [████████] (12h)
F3. GitHub Release & Announcement      [██████] (8h)
Subtotal: 35 hours (5h/day ÷ 3 = 1.7h/person/day) ✓ Feasible
Status: QUEUED
```

**Legend:** `[███]` = allocated time per week | Numbers = total hours for task

---

## 📋 DETAILED TASK BREAKDOWN

### CATEGORY A: CORE CODE HARDENING (108 hours) 
**Owner:** Lead Engineer  
**Dependency:** None  
**Block:** B1, B2, B3

#### A1. Risk Invariants Audit & Unit Tests (40h)
- **Task:** Write Vitest suite for all 7 OrderManager invariants
  - ✓ No negative balances
  - ✓ Max 5 concurrent orders
  - ✓ Stop-loss ≥ entry
  - ✓ Take-profit > entry
  - ✓ Risk % ≤ account equity
  - ✓ Position size limits
  - ✓ Margin requirements
- **Acceptance Criteria:**
  - 7 test files, 1 per invariant
  - 100% code coverage for OrderManager
  - All tests pass on CI
  - Test execution < 1s
- **Files:** `src/main/services/__tests__/order-manager.test.ts`
- **Effort:** 40h (5h per invariant + setup)

#### A2. Autonomous Gates Unit Tests (40h)
- **Task:** Write Vitest suite for all 7 AutonomousTrader gates
  - ✓ Risk/reward ratio check
  - ✓ Market regime validation
  - ✓ Position concentration limits
  - ✓ Learned stop-loss optimization
  - ✓ Entry signal confidence
  - ✓ Volatility thresholds
  - ✓ Trading hours check
- **Acceptance Criteria:**
  - 7 test files, 1 per gate
  - 100% code coverage for AutonomousTrader
  - All tests pass on CI
  - Test execution < 1.5s
- **Files:** `src/main/services/__tests__/autonomous-trader.test.ts`
- **Effort:** 40h (5h per gate + setup)

#### A3. Replay Profiling (20h)
- **Task:** Measure replay throughput, identify bottlenecks
  - Run 100K bar replay (1 month of 1-min bars)
  - Measure bars/sec, CPU%, memory
  - Profile SQLite writes
  - Profile UI updates (20Hz)
  - Optimize batch sizes (target: 10 trades per commit)
- **Acceptance Criteria:**
  - Throughput ≥ 10K bars/sec
  - CPU < 40%
  - Memory stable (< 500MB delta)
  - Report: bottleneck + 3 optimization recommendations
- **Files:** `scripts/replay-profiler.ts`
- **Effort:** 20h

#### A4. IPC Contract Audit (8h)
- **Task:** Verify all 25 IPC channels documented + tested
  - Count handlers in main/index.ts
  - Verify channel names match CLAUDE.md
  - Type safety check (no `any` in contracts)
  - Document missing channels
- **Acceptance Criteria:**
  - 25/25 channels documented
  - 0 type errors in IPC contracts
  - All handlers have error boundaries
- **Files:** `main/index.ts`, `src/ipc/contracts.ts`
- **Effort:** 8h

---

### CATEGORY B: TESTING & QA (120 hours)
**Owner:** QA Lead  
**Dependency:** A1, A2, A3, A4  
**Blocks:** C1, C2, C3, D1, D2, D3

#### B1. Service Unit Tests (50h)
- **Task:** Write comprehensive Vitest suites for 4 core services
  - **LearnedSL Service** (15h):
    - Trailing stop logic
    - Win rate learning
    - Dynamic adjustment
  - **IndicatorManager Service** (15h):
    - SMA/EMA/RSI calculations
    - Caching behavior
    - Data freshness
  - **QuoteBuffer Service** (10h):
    - Tick ordering
    - Duplicate handling
    - Replay vs. live modes
  - **AccountManager Service** (10h):
    - Position tracking
    - P&L calculations
    - Margin requirements
- **Acceptance Criteria:**
  - 80%+ coverage for each service
  - All tests run in < 5s total
  - No flaky tests (run 3x)
- **Files:** `src/main/services/__tests__/*.test.ts`
- **Effort:** 50h

#### B2. Integration Tests (40h)
- **Task:** Test critical flows end-to-end
  - Quote → Fill → Position → Account (15h)
  - Replay determinism (10h)
  - Error recovery (10h)
  - State persistence (5h)
- **Acceptance Criteria:**
  - 5 integration test suites
  - Each suite runs in < 2s
  - Error cases covered
  - State verified before/after
- **Files:** `src/__tests__/integration/*.test.ts`
- **Effort:** 40h

#### B3. Manual QA Plan (30h)
- **Task:** Plan + execute manual testing
  - 20 test cases (Figma checklist)
  - UI responsiveness at 20Hz
  - Paper trading dry run (1 week)
  - Error recovery scenarios
  - Performance benchmarks
- **Acceptance Criteria:**
  - Test plan document (format: Figma)
  - Bug log (GitHub issues)
  - Sign-off from QA lead
- **Files:** `03-DOCUMENTATION/QA_TEST_PLAN.md`, GitHub Issues
- **Effort:** 30h

---

### CATEGORY C: ELECTRON PACKAGING (55 hours)
**Owner:** DevOps/Build Engineer  
**Dependency:** B1, B2  
**Blocks:** D1, D2, D3, E1, E2, E3

#### C1. electron-builder Config (20h)
- **Task:** Configure Windows packaging
  - Create `electron-builder.yml`
  - Dist config (output .exe)
  - File associations (none required)
  - Auto-updater config (GitHub releases)
  - Code signing (placeholder)
- **Acceptance Criteria:**
  - `npm run pack:win` builds .exe
  - .exe size < 200MB
  - Installer works on fresh Windows 11
- **Files:** `electron-builder.yml`, `package.json` (build scripts)
- **Effort:** 20h

#### C2. GitHub Actions CI/CD (20h)
- **Task:** Set up automated workflows
  - Lint on PR (ESLint)
  - Type check on PR (tsc)
  - Unit tests on PR
  - Build .exe on main branch merge
  - GitHub release automation
- **Acceptance Criteria:**
  - All workflows defined in `.github/workflows/`
  - Builds trigger on git events
  - Artifacts uploaded to GitHub
- **Files:** `.github/workflows/*.yml`
- **Effort:** 20h

#### C3. Code Signing Setup (15h)
- **Task:** Obtain & configure code signing certificate
  - Use Sigma free cert (open-source)
  - Configure electron-builder for signing
  - Test signed .exe on clean machine
  - Document renewal process
- **Acceptance Criteria:**
  - Signed .exe passes Windows Defender
  - Certificate valid for 1 year minimum
  - Renewal process documented
- **Files:** `electron-builder.yml` (signing config)
- **Effort:** 15h

---

### CATEGORY D: INTEGRATIONS & VALIDATION (70 hours)
**Owner:** Integration Engineer  
**Dependency:** C1, C2, C3  
**Blocks:** E1, E2, E3, F1, F2, F3

#### D1. ForexFactory Hardening (25h)
- **Task:** Audit + strengthen ForexFactory adapter
  - Add graceful fallback (no internet → use cached)
  - Add retry logic (3x with exponential backoff)
  - Add circuit breaker (stop pinging if unavailable)
  - Error logging (debug why fetch failed)
  - Unit tests for all error paths
- **Acceptance Criteria:**
  - 0 uncaught exceptions on network failure
  - Fallback uses 24h-old cache if available
  - Circuit breaker re-tests every 5 min
  - 100% error path coverage
- **Files:** `src/main/integrations/forexfactory-adapter.ts`
- **Effort:** 25h

#### D2. Alpaca Validation (25h)
- **Task:** Validate paper + live trading
  - Paper trading dry run (1 week)
    - Enable paper mode in config
    - Run autonomous trader live (monitored)
    - Log all trades + fills
    - Verify order execution
  - Live trading gating
    - Add `LIVE_TRADING_ENABLED` env flag
    - Add account value check (live only if > $1000)
    - Add confirmation dialog before live toggle
  - Document paper → live checklist
- **Acceptance Criteria:**
  - Paper trades execute 100% successfully
  - Live toggle gated + logged
  - Checklist signed off by user
- **Files:** `.env.example`, `src/main/index.ts` (gating), `docs/LIVE_TRADING_CHECKLIST.md`
- **Effort:** 25h

#### D3. SQLite Persistence Audit (20h)
- **Task:** Audit database reliability
  - Backup strategy (daily .db backups)
  - Recovery testing (restore from backup)
  - Concurrent access safety (WAL mode check)
  - Migration strategy (schema versioning)
  - Data validation (integrity checks on startup)
- **Acceptance Criteria:**
  - Backup runs daily, < 100MB each
  - Recovery tested (corrupted DB → restore)
  - WAL mode enabled in config
  - Schema version auto-migrates
  - Startup integrity check passes
- **Files:** `src/main/db/persistence.ts`, `scripts/backup.ts`
- **Effort:** 20h

---

### CATEGORY E: DOCUMENTATION (45 hours)
**Owner:** Tech Writer / Lead  
**Dependency:** C1, C2, C3  
**Blocks:** F1, F2, F3

#### E1. CLAUDE.md Final Review (12h)
- **Task:** Polish + validate developer guide
  - Review all sections (project structure, commands, patterns)
  - Update with Phase 5 learnings
  - Add missing symbol/indicator docs
  - Test all code examples
  - Add troubleshooting section
- **Acceptance Criteria:**
  - Every command runs without error
  - All code examples compile
  - Troubleshooting covers top 10 issues
  - Peer review sign-off
- **Files:** `00-PROJECT-ROOT/CLAUDE.md`
- **Effort:** 12h

#### E2. API Docs (IPC Channels, Service Methods) (18h)
- **Task:** Document all public APIs
  - IPC channels (25 channels, input/output types)
  - Service methods (public methods per service)
  - Event types (all emitted events)
  - Error codes (all error types)
  - Usage examples (3-5 per API)
- **Acceptance Criteria:**
  - Docs match actual code (verified by grep)
  - Examples copy-paste executable
  - All types documented
- **Files:** `03-DOCUMENTATION/API_REFERENCE.md`
- **Effort:** 18h

#### E3. Deployment Runbook (15h)
- **Task:** Write step-by-step release guide
  - Pre-release checklist (tests pass, coverage ok)
  - Build procedure (npm run pack:win)
  - Code signing step
  - GitHub release creation
  - Auto-update verification
  - Rollback procedure
  - Post-release validation
- **Acceptance Criteria:**
  - 10+ steps, each with expected output
  - Runbook tested 1x (dry run)
  - Error recovery documented
- **Files:** `03-DOCUMENTATION/DEPLOYMENT_RUNBOOK.md`
- **Effort:** 15h

---

### CATEGORY F: RELEASE & VALIDATION (35 hours)
**Owner:** Release Manager  
**Dependency:** E1, E2, E3  
**Blocks:** None

#### F1. Pre-Release Validation (15h)
- **Task:** Final sanity checks before release
  - Type check: `npm run typecheck` (0 errors)
  - Lint: `npm run lint` (0 errors)
  - Unit tests: `npm run test` (100% pass)
  - Build: `npm run build` (succeeds)
  - .exe signing: Verify certificate
  - README: Check links, accuracy
- **Acceptance Criteria:**
  - All checks pass
  - No warnings
  - Build log clean
- **Effort:** 15h

#### F2. Final Build & Code Signing (12h)
- **Task:** Build final .exe, sign, verify
  - Checkout release commit
  - `npm run pack:win`
  - Verify .exe size, architecture
  - Code sign with Sigma cert
  - Test on clean Windows 11 VM
  - Upload to GitHub releases
- **Acceptance Criteria:**
  - .exe available at GitHub
  - Unsigned binary hash documented
  - Signed binary hash documented
  - Windows Defender scan passes
- **Effort:** 12h

#### F3. Release Announcement (8h)
- **Task:** Announce release, update docs
  - GitHub release notes (highlights, changelog)
  - Update satex-app README with download link
  - Update CLAUDE.md with release version
  - Post announcement (if applicable)
- **Acceptance Criteria:**
  - Release notes complete
  - Download link live
  - No broken docs links
- **Effort:** 8h

---

## 🔗 DEPENDENCY GRAPH

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 5 CRITICAL PATH                                       │
└─────────────────────────────────────────────────────────────┘

WEEK 1                WEEK 2-3              WEEK 4             WEEK 5-6
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ A1: Risk Tests   │─→│ B1: Service Tests│─→│ C1: Builder Config│─→│ D1: ForexFactory │
│ A2: Gate Tests   │─→│ B2: Integration  │─→│ C2: GitHub CI/CD  │─→│ D2: Alpaca Val   │
│ A3: Profiling    │  │ B3: Manual QA    │  │ C3: Code Signing  │  │ D3: SQLite Audit │
│ A4: IPC Audit    │  │                  │  │                   │  │                  │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
       108h                 120h                   55h                  70h
       4.5h/p/d            2.9h/p/d              2.6h/p/d             1.7h/p/d
       CRITICAL            CRITICAL              CRITICAL             CRITICAL

WEEK 7                WEEK 8
┌──────────────────┐ ┌──────────────────┐
│ E1: Docs Polish  │─→│ F1: Pre-Release  │
│ E2: API Docs     │─→│ F2: Final Build  │
│ E3: Runbook      │  │ F3: Announce     │
└──────────────────┘ └──────────────────┘
       45h                   35h
     2.1h/p/d              1.7h/p/d
     CRITICAL              CRITICAL
```

**Critical Path Length:** 8 weeks (no parallelization possible)  
**Earliest Finish Date:** June 30, 2026  
**Slack per Phase:** 0 weeks (tight schedule)

---

## 👥 RESOURCE ALLOCATION

| Role | Name | Weeks 1-4 | Weeks 5-6 | Weeks 7-8 | Total |
|------|------|-----------|-----------|-----------|-------|
| **Lead Engineer** | TBD | 40h (A1-A4) | 25h (D1) | 12h (E1) | 77h |
| **QA Lead** | TBD | 60h (B1-B3) | 20h (D3) | 18h (E2) | 98h |
| **DevOps/Build** | TBD | — | 50h (C1-C3) | 8h (F3) | 58h |
| **Integration Eng** | TBD | — | — | 25h (D2) | 25h |
| **Tech Writer** | TBD | — | — | 15h (E3) | 15h |
| **Release Manager** | TBD | — | — | 23h (F1-F2) | 23h |

**Total:** 250 hours ÷ 3 people = 83.3 hours each (tight but feasible over 8 weeks)

---

## ⚠️ RISK REGISTER

| Risk | Severity | Mitigation | Owner |
|------|----------|-----------|-------|
| **Replay bottleneck > 10K bars/sec** | 🔴 HIGH | Profiling Week 1 identifies issue; batch optimization in hand | Lead Eng |
| **Missing IPC channels in contract** | 🟡 MEDIUM | Audit Week 1 + grep scan documents all 25 | Lead Eng |
| **Code signing cert approval delays** | 🟡 MEDIUM | Apply for Sigma cert Week 1, fallback to self-sign | DevOps |
| **Alpaca paper → live transition risk** | 🔴 HIGH | 1-week paper dry-run + gating + confirmation dialog | Integ Eng |
| **Test flakiness (SQLite, timing)** | 🟡 MEDIUM | Vitest isolation, deterministic mocks, 3x test runs | QA Lead |
| **Documentation drift** | 🟢 LOW | Examples tested in E1 & E2; grep checks | Tech Writer |

---

## ✅ GO/NO-GO GATES

### Gate 1: End of Week 1 (May 7) — Code Hardening
- ✓ A1 complete (7/7 risk invariants tested)
- ✓ A2 complete (7/7 autonomous gates tested)
- ✓ A3 complete (replay ≥ 10K bars/sec)
- ✓ A4 complete (25/25 IPC channels audited)
- **Decision:** Go → Week 2-3 testing starts

### Gate 2: End of Week 3 (May 21) — Testing Complete
- ✓ B1 complete (80%+ coverage, all tests pass)
- ✓ B2 complete (5 integration suites, deterministic)
- ✓ B3 complete (20 manual test cases, sign-off)
- **Decision:** Go → Week 4 packaging starts

### Gate 3: End of Week 4 (May 28) — Packaging Ready
- ✓ C1 complete (.exe builds, size < 200MB)
- ✓ C2 complete (CI/CD workflows active)
- ✓ C3 complete (code signing cert obtained)
- **Decision:** Go → Week 5-6 validation starts

### Gate 4: End of Week 6 (June 11) — Integrations Validated
- ✓ D1 complete (ForexFactory robust, 0 uncaught exceptions)
- ✓ D2 complete (paper trading validated, live gated)
- ✓ D3 complete (SQLite backups, recovery tested)
- **Decision:** Go → Week 7 docs sprint

### Gate 5: End of Week 7 (June 18) — Documentation Complete
- ✓ E1 complete (CLAUDE.md peer-reviewed)
- ✓ E2 complete (API docs, examples tested)
- ✓ E3 complete (runbook tested)
- **Decision:** Go → Week 8 release

### Gate 6: End of Week 8 (June 30) — RELEASE
- ✓ F1 complete (pre-release validation all pass)
- ✓ F2 complete (.exe signed, uploaded)
- ✓ F3 complete (release notes, links live)
- **Decision:** 🚀 RELEASE LIVE

**Go/No-Go Criteria:** All gates must pass. If blocked at any gate, pivot to 1-week extension + retesting.

---

## 📈 PROGRESS TRACKING

### Weekly Burndown Target (250h total)
```
Week 1: 108h ▓▓▓▓▓▓▓▓▓▓▓▓ (43% complete)
Week 2: 120h ▓▓▓▓▓▓▓▓▓▓ (91% complete)
Week 3: 120h ▓▓▓▓▓▓▓▓▓▓ (91% complete)
Week 4:  55h ▓▓▓▓▓ (22% complete)
Week 5:  70h ▓▓▓▓▓▓ (28% complete)
Week 6:  70h ▓▓▓▓▓▓ (28% complete)
Week 7:  45h ▓▓▓▓ (18% complete)
Week 8:  35h ▓▓▓ (14% complete)
────────────────────────────────────
Total: 250h ▓▓▓▓▓▓▓▓▓▓ (100%)
```

### Status Reporting
**Frequency:** Weekly standup (Fridays, 4 PM)  
**Format:** Per-category checkpoint
- % Complete (actual vs. planned)
- Blockers (any gate risk?)
- Next week priorities

**Dashboards:** TBD (Spreadsheet or GitHub Projects)

---

## 🔧 AUTOMATION & TOOLING

### Pre-Built Scripts (Ready to Use)

1. **Weekly Report Generator** → `scripts/weekly-report.sh`
   - Runs `npm run test`, counts pass/fail
   - Measures code coverage
   - Generates progress delta vs. plan
   - Outputs Markdown table for standup

2. **Pre-Commit Hook** → `.git/hooks/pre-commit`
   - Run lint on staged files
   - Run type check
   - Block commits with errors

3. **CI/CD Pipeline** → `.github/workflows/`
   - Run tests on PR (pass/fail gate)
   - Auto-build .exe on main branch merge
   - Post test results to PR

4. **Integration Test Suite** → `src/__tests__/integration/`
   - Quote → Fill → Position → Account
   - Replay determinism
   - Error recovery

---

## 📚 SUPPORTING DOCUMENTS

- **CLAUDE.md** — Developer guide (already exists)
- **PHASE_5_COMPLETION_CHECKLIST.md** — Task-by-task checklist (already exists)
- **SATEX_ARCHITECTURAL_DESIGN.md** — Architecture deep-dive (already exists)
- **WEEKLY_STANDUP_TEMPLATE.md** — Standup format (new, see below)

---

## 🎬 NEXT IMMEDIATE ACTIONS

### TODAY (May 1)
- [ ] Assign roles (Lead Eng, QA, DevOps, etc.)
- [ ] Create GitHub Projects board (track A1-F3)
- [ ] Kick off A1 (Risk Invariants)

### THIS WEEK (May 1-7)
- [ ] A1: Risk Invariants unit tests (all 7)
- [ ] A2: Autonomous Gates unit tests (all 7)
- [ ] A3: Replay profiling (target: 10K bars/sec)
- [ ] A4: IPC contract audit (verify 25 channels)

### GATE 1 DECISION (May 7)
- [ ] All A tasks complete → Go/No-Go decision

---

**Plan Owner:** Lead Engineer  
**Last Review:** 2026-05-01  
**Next Review:** 2026-05-08 (post-Gate-1)  
