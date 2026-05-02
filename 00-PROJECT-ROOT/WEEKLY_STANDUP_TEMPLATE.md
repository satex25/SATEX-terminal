# Weekly Standup Report — PHASE 5 EXTREME PLAN

**Week:** [N of 8]  
**Reporting Period:** [Mon] – [Fri]  
**Report Date:** [Date]  
**Attendees:** Lead Engineer, QA Lead, DevOps, Integration Engineer, Tech Writer, Release Manager  

---

## 📊 BURNDOWN SUMMARY

| Metric | Target | Actual | Variance | Status |
|--------|--------|--------|----------|--------|
| **Hours Completed** | [HH] | [HH] | [±HH] | 🟢/🟡/🔴 |
| **Tasks Closed** | [N] | [N] | [±N] | 🟢/🟡/🔴 |
| **Blockers** | 0 | [N] | — | 🟢/🟡/🔴 |
| **Code Coverage** | [%] | [%] | [±%] | 🟢/🟡/🔴 |

---

## ✅ COMPLETED THIS WEEK

### Category A: Core Code Hardening
- [ ] **A1.1** Risk Invariant #1 (No Negative Balances)
- [ ] **A1.2** Risk Invariant #2 (Max 5 Concurrent Orders)
- [ ] **A1.3** Risk Invariant #3 (SL ≥ Entry)
- [ ] **A1.4** Risk Invariant #4 (TP > Entry)
- [ ] **A1.5** Risk Invariant #5 (Risk % ≤ Equity)
- [ ] **A1.6** Risk Invariant #6 (Position Size Limits)
- [ ] **A1.7** Risk Invariant #7 (Margin Requirements)
- [ ] **A2.1–A2.7** Autonomous Gates (list each if started)
- [ ] **A3.1** Replay Profiling (100K bars)
- [ ] **A4.1** IPC Contract Audit (25 channels)

### Category B: Testing & QA
- [ ] **B1.1** LearnedSL Service Tests
- [ ] **B1.2** IndicatorManager Service Tests
- [ ] **B1.3** QuoteBuffer Service Tests
- [ ] **B1.4** AccountManager Service Tests
- [ ] **B2.1–B2.4** Integration Tests (flows)
- [ ] **B3.1–B3.5** Manual QA (test cases 1-5 of 20)

### Category C: Electron Packaging
- [ ] **C1.1–C1.3** electron-builder Config
- [ ] **C2.1–C2.5** GitHub Actions CI/CD
- [ ] **C3.1–C3.3** Code Signing Setup

### Category D: Integrations & Validation
- [ ] **D1.1–D1.5** ForexFactory Hardening
- [ ] **D2.1–D2.3** Alpaca Validation (paper dry-run)
- [ ] **D3.1–D3.5** SQLite Persistence Audit

### Category E: Documentation
- [ ] **E1.1–E1.5** CLAUDE.md Final Review
- [ ] **E2.1–E2.5** API Docs (IPC channels, service methods)
- [ ] **E3.1–E3.7** Deployment Runbook

### Category F: Release & Validation
- [ ] **F1.1–F1.6** Pre-Release Validation
- [ ] **F2.1–F2.4** Final Build & Code Signing
- [ ] **F3.1–F3.3** Release Announcement

---

## 🚧 IN PROGRESS

| Task ID | Task | Owner | % Done | ETA |
|---------|------|-------|--------|-----|
| A1.1 | Risk Invariant #1 Unit Tests | [Name] | 50% | [Day] |
| A3.1 | Replay Profiling | [Name] | 25% | [Day] |
| — | — | — | — | — |

---

## 🔴 BLOCKERS & RISKS

### Blocking Issues
| Issue | Impact | Owner | Mitigation | ETA |
|-------|--------|-------|------------|-----|
| [Example: Vitest setup] | A1 blocked | [Name] | [Plan] | [Date] |
| — | — | — | — | — |

### Emerging Risks
| Risk | Severity | Likelihood | Mitigation | Owner |
|------|----------|-----------|-----------|-------|
| [Example: Replay < 10K bars/sec] | 🔴 HIGH | 30% | Profile Week 1 | [Name] |
| — | — | — | — | — |

---

## 📝 NOTES & DECISIONS

### Technical Decisions
- **[Decision]:** [Rationale & owner approval]
- **[Decision]:** [Rationale & owner approval]

### Process Updates
- **[Update]:** [What changed & why]
- **[Update]:** [What changed & why]

### Upcoming Priority Shifts
- **[Week N+1]:** [Focus area], estimated [HH]h
- **[Week N+2]:** [Focus area], estimated [HH]h

---

## 📅 NEXT WEEK OUTLOOK

| Task | Owner | Estimate | Risk |
|------|-------|----------|------|
| **A1 Completion** | Lead Eng | 15h remaining | LOW |
| **A2 Start** | Lead Eng | 40h | MEDIUM |
| **A3 Profiling** | Lead Eng | 20h | MEDIUM |
| **A4 IPC Audit** | Lead Eng | 8h | LOW |
| — | — | — | — |

---

## 🟢 GO/NO-GO GATE STATUS

### Current Gate (Gate [N])
- **Target Date:** [Date]
- **Acceptance Criteria:**
  - [ ] [Criterion 1]
  - [ ] [Criterion 2]
  - [ ] [Criterion 3]
- **Status:** 🟢 ON TRACK / 🟡 AT RISK / 🔴 BLOCKED
- **Decision:** [TBD @ [Date]] or [GO/NO-GO]

---

## 📊 METRICS

### Code Quality
- **Test Coverage:** [%] (target: 80%+)
- **Lint Errors:** [N] (target: 0)
- **Type Errors:** [N] (target: 0)
- **Test Pass Rate:** [%] (target: 100%)

### Performance
- **Replay Throughput:** [K bars/sec] (target: 10K+)
- **UI Responsiveness:** [FPS @ 20Hz] (target: 60 FPS)
- **Memory Usage:** [MB] (target: < 500MB delta)

### Delivery
- **Hours Burned:** [HH] / [HH] planned (target: 95-105%)
- **Schedule Variance:** [±days] (target: ±0)

---

## 📋 ACTION ITEMS

| Item | Owner | Due | Status |
|------|-------|-----|--------|
| [Action] | [Name] | [Date] | ⬜ TODO / 🟦 IN PROGRESS / ✅ DONE |
| [Action] | [Name] | [Date] | ⬜ TODO / 🟦 IN PROGRESS / ✅ DONE |

---

## 📎 ATTACHMENTS

- Build log: `logs/build-[date].log`
- Test report: `reports/test-[date].html`
- Performance profile: `reports/replay-profile-[date].json`
- Bug log: GitHub Issues link

---

**Prepared By:** [Name]  
**Reviewed By:** [Lead Engineer]  
**Next Standup:** [Date], [Time], [Location/Link]  
