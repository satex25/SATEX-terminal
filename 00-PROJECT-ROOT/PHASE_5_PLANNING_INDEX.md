# PHASE 5 PLANNING SYSTEM — MASTER INDEX

**Project:** SATEX Trading Terminal  
**Phase:** 5 (Code Hardening → Release)  
**Timeline:** May 1 – June 30, 2026 (8 weeks)  
**Total Effort:** 250 hours (3-person team)  
**Status:** 🟢 Ready for Execution  

---

## 📚 DOCUMENT HIERARCHY

```
00-PROJECT-ROOT/
├── PHASE_5_EXTREME_PLAN.md
│   ├─ 8-week Gantt chart (ASCII + detailed)
│   ├─ 6 task categories (A–F) with breakdowns
│   ├─ Dependency graph & critical path
│   ├─ 6 Go/No-Go gates with criteria
│   ├─ Risk register (6 major risks)
│   └─ Resource allocation matrix
│
├── PHASE_5_PLANNING_QUICK_START.md  ← YOU START HERE
│   ├─ Next immediate steps (assign roles, create board)
│   ├─ Weekly workflow (Friday standups)
│   ├─ Critical timeline highlights
│   ├─ Go/No-Go decision template
│   └─ Troubleshooting guide
│
├── PROGRESS_TRACKING.json  ← DATA SOURCE (machine-readable)
│   ├─ All 30+ tasks (A1–F3) with IDs, hours, acceptance criteria
│   ├─ Weekly burndown targets
│   ├─ Resource allocation
│   ├─ Gate definitions & criteria
│   └─ Risk register (detailed)
│
├── WEEKLY_STANDUP_TEMPLATE.md  ← COPY EVERY FRIDAY
│   ├─ Burndown summary table
│   ├─ Completed this week (checklist)
│   ├─ In progress (table)
│   ├─ Blockers & risks (details)
│   ├─ Next week outlook
│   └─ Metrics (coverage, performance, schedule)
│
├── PHASE_5_PLANNING_INDEX.md  ← YOU ARE HERE
│   └─ Quick navigation to all planning docs
│
├── CLAUDE.md (existing, polish in E1)
│   └─ Developer guide (commands, patterns, reference)
│
├── PHASE_5_COMPLETION_CHECKLIST.md (existing, reference)
│   └─ 250-hour breakdown (different format from EXTREME_PLAN)
│
└── .github/
    └── PHASE_5_GITHUB_PROJECTS_TEMPLATE.json
        ├─ GitHub Projects board config (5 views)
        ├─ 6 milestones (= 6 gates)
        ├─ ~30 issue templates (A1–F3)
        └─ Custom fields for tracking

scripts/
├── generate-weekly-report.ts  ← AUTO-GENERATES REPORTS
│   ├─ Reads PROGRESS_TRACKING.json
│   ├─ Calculates burndown
│   ├─ Outputs markdown report
│   └─ Saves to reports/ dir
│
└── [TBD in Week 4]
    ├─ replay-profiler.ts (A3)
    ├─ backup.ts (D3)
    └─ ci-scripts/ (C2)
```

---

## 🎯 QUICK NAVIGATION

### I want to…

**…understand the whole plan**
→ Read [PHASE_5_EXTREME_PLAN.md](PHASE_5_EXTREME_PLAN.md) (executive summary + Gantt)

**…get started TODAY (assign roles, create board)**
→ Follow [PHASE_5_PLANNING_QUICK_START.md](PHASE_5_PLANNING_QUICK_START.md) (4 immediate steps)

**…find a specific task (hours, owner, acceptance criteria)**
→ Search [PROGRESS_TRACKING.json](PROGRESS_TRACKING.json) by task ID (A1, B3, etc.)

**…file a weekly standup (Friday 4 PM)**
→ Copy [WEEKLY_STANDUP_TEMPLATE.md](WEEKLY_STANDUP_TEMPLATE.md), fill in actuals

**…check current burndown status**
→ Run `npm run report:weekly` (generates Markdown)

**…understand gates & blockers**
→ See "GO/NO-GO GATES" in PHASE_5_EXTREME_PLAN.md

**…troubleshoot a blocker (replay slow, test flaky, etc.)**
→ See "IF YOU GET STUCK" section in QUICK_START.md

**…set up GitHub Projects board**
→ Import [.github/PHASE_5_GITHUB_PROJECTS_TEMPLATE.json](.github/PHASE_5_GITHUB_PROJECTS_TEMPLATE.json)

**…understand task dependencies**
→ See "DEPENDENCY GRAPH" in PHASE_5_EXTREME_PLAN.md

---

## 📊 THE 5 KEY NUMBERS

| Metric | Value | Why It Matters |
|--------|-------|----------------|
| **Total Hours** | 250h | 3-person team × 8 weeks × ~10h/week |
| **Weekly Capacity** | ~33h | 250h ÷ 8 weeks |
| **Per-Person Load** | 83h | 250h ÷ 3 people (feasible over 8 weeks) |
| **Task Count** | 30+ | A1–A4, B1–B3, C1–C3, D1–D3, E1–E3, F1–F3 |
| **Gate Count** | 6 | One per week (except weeks 2–3 = 1 gate) |

---

## 🗓️ THE 6 GATES (CRITICAL DATES)

| Gate | Date | Category | Decision |
|------|------|----------|----------|
| **Gate 1** | May 7 (Fri) | A: Code Hardening | All 4 tasks (A1–A4) done → **GO** or delay 1 week |
| **Gate 2** | May 21 (Fri) | B: Testing & QA | All 3 tasks (B1–B3) done → **GO** or delay 1 week |
| **Gate 3** | May 28 (Fri) | C: Electron Packaging | All 3 tasks (C1–C3) done → **GO** or delay 1 week |
| **Gate 4** | Jun 11 (Fri) | D: Integrations & Validation | All 3 tasks (D1–D3) done → **GO** or delay 1 week |
| **Gate 5** | Jun 18 (Fri) | E: Documentation | All 3 tasks (E1–E3) done → **GO** or delay 1 week |
| **Gate 6** | Jun 30 (Fri) | F: Release & Validation | All 3 tasks (F1–F3) done → **🚀 RELEASE LIVE** |

---

## 👥 ROLE ASSIGNMENTS (UPDATE THESE TODAY)

| Role | Hours | Categories | Status |
|------|-------|-----------|--------|
| **Lead Engineer** | 77h | A (hardening), E1 (docs) | [ ] ASSIGN |
| **QA Lead** | 98h | B (testing), E2 (API docs) | [ ] ASSIGN |
| **DevOps/Build** | 58h | C (packaging) | [ ] ASSIGN |
| **Integration Eng** | 70h | D (validation) | [ ] ASSIGN |
| **Tech Writer** | 15h | E3 (runbook) | [ ] ASSIGN |
| **Release Manager** | 23h | F (release) | [ ] ASSIGN |

**Action:** Update names in [PROGRESS_TRACKING.json](PROGRESS_TRACKING.json) > `resources` section

---

## 🔄 WEEKLY WORKFLOW (EVERY FRIDAY @ 4 PM)

1. **Generate Report** (5 min)
   ```bash
   npm run report:weekly
   # Output: reports/weekly-report-[date].md
   ```

2. **Update GitHub Projects** (10 min)
   - Close DONE issues
   - Move IN_PROGRESS → done if applicable
   - Update burndown custom field

3. **Fill Standup** (20 min)
   - Copy [WEEKLY_STANDUP_TEMPLATE.md](WEEKLY_STANDUP_TEMPLATE.md)
   - Fill in hours, blockers, next week
   - Attach report

4. **Make Gate Decision** (15 min, if applicable)
   - Check if all criteria met
   - Vote: Go/No-Go
   - Update [PROGRESS_TRACKING.json](PROGRESS_TRACKING.json) gate status

5. **Share with Team** (5 min)
   - Post standup to Slack
   - Announce next week priorities
   - Tag owners of next category

---

## ⚡ CRITICAL DEPENDENCIES

**Cannot start Category X until Category Y is done:**

```
A (Hardening) 
    ↓
    B (Testing)
         ↓
         C (Packaging)
              ↓
              D (Integrations)
                   ↓
                   E (Documentation)
                        ↓
                        F (Release)
```

**Parallel work possible:**
- A & any part of B (while A finishing)
- C & none (blocked on B)
- D & none (blocked on C)
- E & none (blocked on C)
- F & none (blocked on E)

**Critical path:** 8 weeks (no slack anywhere)

---

## 📈 SUCCESS METRICS

**By Gate 1 (May 7):**
- [ ] Replay ≥ 10K bars/sec (or identified optimization)
- [ ] 7/7 risk invariants tested
- [ ] 7/7 autonomous gates tested
- [ ] 25/25 IPC channels audited

**By Gate 2 (May 21):**
- [ ] 80%+ code coverage
- [ ] All service tests pass
- [ ] All integration tests pass
- [ ] 20 manual test cases signed off

**By Gate 3 (May 28):**
- [ ] .exe builds successfully
- [ ] CI/CD workflows running
- [ ] Code signing cert obtained

**By Gate 4 (Jun 11):**
- [ ] ForexFactory 0 uncaught exceptions
- [ ] Paper trading 1 week successful
- [ ] SQLite recovery tested

**By Gate 5 (Jun 18):**
- [ ] CLAUDE.md peer-reviewed
- [ ] API docs complete + tested
- [ ] Runbook tested

**By Gate 6 (Jun 30):**
- [ ] Type check: 0 errors
- [ ] Lint: 0 errors
- [ ] Tests: 100% pass
- [ ] Build: succeeds
- [ ] .exe signed & uploaded
- [ ] GitHub release posted

---

## 🚨 RISK WATCH LIST

| Risk | Severity | Trigger | Action |
|------|----------|---------|--------|
| Replay < 10K bars/sec | 🔴 HIGH | Week 1 A3 fails | Stop, profile, optimize (1–2 day delay) |
| Missing IPC channels | 🟡 MEDIUM | Week 2 B2 fails | Audit + add missing handlers |
| Code signing delays | 🟡 MEDIUM | Week 4 C3 blocked | Apply cert Week 1, fallback to self-sign |
| Alpaca paper → live risk | 🔴 HIGH | Week 5 D2 fails | Extend paper dry-run, add more gating |
| Test flakiness | 🟡 MEDIUM | Week 2 B1 failures | Fix isolation, run 3x, use deterministic mocks |
| Documentation drift | 🟢 LOW | Week 7 E1 issues | Test all examples, grep code |

---

## 📁 AUTOMATED TOOLS

### GitHub Actions Workflows (To Create Week 4)
```
.github/workflows/
├── lint.yml          (ESLint on PR)
├── test.yml          (Unit tests on PR)
├── typecheck.yml     (tsc on PR)
├── build.yml         (Build .exe on main merge)
├── update-progress.yml (Daily: sync to GitHub Projects)
└── release.yml       (Auto-release on version tag)
```

### Scripts (Utility)
```
scripts/
├── generate-weekly-report.ts     (Run: npm run report:weekly)
├── replay-profiler.ts            (Run: npm run profile:replay, Week 1 A3)
└── backup.ts                     (Run: npm run db:backup, Week 5 D3)
```

### Reporting (Manual)
```
reports/
├── weekly-report-2026-05-01.md   (auto-generated)
├── weekly-report-2026-05-08.md   (auto-generated)
├── standup-week-1-2026-05-01.md  (manual, copy template)
└── standup-week-2-2026-05-08.md  (manual, copy template)
```

---

## 🎓 PHILOSOPHY: "EXTREME PLANNING"

This planning system is built on 5 principles:

1. **Transparency** — Every task has: hours, owner, acceptance criteria, files
2. **Accountability** — Weekly standups + gate decisions + GitHub tracking
3. **Flexibility** — If blocked, adjust plan (1-week contingency per gate)
4. **Automation** — Reports auto-generated; reduce manual overhead
5. **Simplicity** — 250 hours = 6 categories = 30 tasks = 6 gates = 8 weeks

---

## 📞 HOW TO USE THIS INDEX

**Day 1 (May 1):**
1. Read [PHASE_5_PLANNING_QUICK_START.md](PHASE_5_PLANNING_QUICK_START.md) (20 min)
2. Assign roles in [PROGRESS_TRACKING.json](PROGRESS_TRACKING.json)
3. Create GitHub Projects board from template
4. Post Week 1 kickoff to Slack

**Weeks 1–8 (Every Friday):**
1. Run `npm run report:weekly` (auto-generates burndown)
2. Copy [WEEKLY_STANDUP_TEMPLATE.md](WEEKLY_STANDUP_TEMPLATE.md)
3. Fill in actual hours + blockers
4. Post to Slack + GitHub

**Every 2 Weeks:**
1. Review [PHASE_5_EXTREME_PLAN.md](PHASE_5_EXTREME_PLAN.md) for next category
2. Preview dependencies & risks
3. Prepare owners for upcoming work

**At Each Gate (Fridays):**
1. Check all criteria in [PROGRESS_TRACKING.json](PROGRESS_TRACKING.json)
2. Make Go/No-Go decision
3. Update gate status
4. Announce next week

---

## 📖 RELATED DOCUMENTS

- **[CLAUDE.md](CLAUDE.md)** — Developer guide (commands, architecture, patterns)
- **[PHASE_5_COMPLETION_CHECKLIST.md](PHASE_5_COMPLETION_CHECKLIST.md)** — 250-hour breakdown (alternative format)
- **[SATEX_ARCHITECTURAL_DESIGN.md](../outputs/SATEX_ARCHITECTURAL_DESIGN.md)** — Architecture deep-dive
- **[.github/PHASE_5_GITHUB_PROJECTS_TEMPLATE.json](.github/PHASE_5_GITHUB_PROJECTS_TEMPLATE.json)** — Board template

---

**Version:** 1.0  
**Created:** 2026-05-01  
**Owner:** Lead Engineer  
**Status:** Ready for Execution  

🚀 **Let's ship Phase 5! Start with [PHASE_5_PLANNING_QUICK_START.md](PHASE_5_PLANNING_QUICK_START.md).**
