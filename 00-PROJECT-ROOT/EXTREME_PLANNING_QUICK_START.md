# PHASE 5 EXTREME PLANNING — QUICK START GUIDE

**Status:** 🟢 Ready for Execution  
**Date:** May 1, 2026  
**Timeline:** 8 weeks (May 1 – June 30)  
**Total Effort:** 250 hours

---

## 📚 Documentation Structure

Your complete planning system consists of **5 interconnected documents**:

1. **[PHASE_5_EXTREME_PLAN.md](PHASE_5_EXTREME_PLAN.md)** ← START HERE
   - 8-week Gantt chart
   - 6 detailed task categories (A–F)
   - Dependency graph
   - Go/No-Go gates
   - Risk register

2. **[PROGRESS_TRACKING.json](PROGRESS_TRACKING.json)** ← DATA SOURCE
   - Machine-readable task list
   - Burndown tracking
   - Resource allocation
   - Gate criteria

3. **[WEEKLY_STANDUP_TEMPLATE.md](WEEKLY_STANDUP_TEMPLATE.md)** ← WEEKLY REPORT
   - Copy this template every Friday
   - Fill in actual hours burned
   - Update blocker status
   - Gate progress

4. **[.github/PHASE_5_GITHUB_PROJECTS_TEMPLATE.json](.github/PHASE_5_GITHUB_PROJECTS_TEMPLATE.json)** ← GITHUB INTEGRATION
   - Import this into GitHub Projects
   - Auto-track issues on board
   - Milestones = gates

5. **[scripts/generate-weekly-report.ts](../scripts/generate-weekly-report.ts)** ← AUTOMATION
   - Auto-generates burndown reports
   - Syncs with PROGRESS_TRACKING.json
   - Outputs markdown for sharing

---

## 🚀 IMMEDIATE NEXT STEPS (TODAY)

### Step 1: Assign Roles
Open **PROGRESS_TRACKING.json**, find `resources` section:

```json
{
  "role": "Lead Engineer",
  "assignedHours": 77,
  "status": "UNASSIGNED"  // ← CHANGE THIS
}
```

Update with actual names:
- [ ] **Lead Engineer** (77h): [Name]
- [ ] **QA Lead** (98h): [Name]
- [ ] **DevOps/Build Engineer** (58h): [Name]
- [ ] **Integration Engineer** (70h): [Name]
- [ ] **Tech Writer** (15h): [Name]
- [ ] **Release Manager** (23h): [Name]

### Step 2: Create GitHub Projects Board
1. Go to https://github.com/[your-org]/[satex-repo]/projects
2. Click **New project** → **Table** layout
3. Import from **[.github/PHASE_5_GITHUB_PROJECTS_TEMPLATE.json](.github/PHASE_5_GITHUB_PROJECTS_TEMPLATE.json)**
4. Create **6 milestones** matching the 6 gates
5. Add **6 labels**: `critical`, `unit-test`, `integration`, `packaging`, `documentation`, `release`

### Step 3: Create GitHub Issues (Batch)
Option A: Manual (fast)
```bash
# Create 30+ issues from template
# Use GitHub CLI:
cd 00-PROJECT-ROOT
gh issue create --title "A1.1: Risk Invariant #1 Unit Tests" \
  --body "See PROGRESS_TRACKING.json for acceptance criteria" \
  --assignee [lead-engineer] \
  --milestone "Gate 1: Code Hardening" \
  --label critical,unit-test
```

Option B: Automated (see `scripts/` for bulk import)

### Step 4: Kick Off Week 1
Send to team (Slack/Email):

```
🚀 PHASE 5 KICKOFF — WEEK 1 (May 1-7)

Goal: Code Hardening Sprint
Timeline: 1 week
Effort: 108 hours (4.5h/person/day)
Owner: Lead Engineer

🎯 THIS WEEK:
[ ] A1: Risk Invariants Unit Tests (40h) — ALL 7 invariants
[ ] A2: Autonomous Gates Unit Tests (40h) — ALL 7 gates
[ ] A3: Replay Profiling (20h) — target 10K bars/sec
[ ] A4: IPC Contract Audit (8h) — verify 25 channels

📅 Gate 1 Decision: Friday, May 7 @ 4 PM
✅ Go → Week 2 Testing starts
❌ No-Go → Extended debugging (impact: 1-week delay)

📊 Progress: Report weekly on Fridays using WEEKLY_STANDUP_TEMPLATE.md
```

---

## 📊 WEEKLY WORKFLOW (Every Friday)

### 1. Generate Burndown Report (10 min)
```bash
npm run report:weekly
# Outputs: reports/weekly-report-[date].md
```

### 2. Fill Standup Template (30 min)
```bash
cp WEEKLY_STANDUP_TEMPLATE.md reports/standup-week-[N]-[date].md
# Edit:
# - Hours completed vs. planned
# - Blockers & risks
# - Next week priorities
# - Gate progress
```

### 3. Update GitHub Projects
```bash
# Close DONE issues
# Move IN_PROGRESS issues to next week
# Update burndown custom field
```

### 4. Share with Team (5 min)
Post to Slack:
```
📊 WEEK N STANDUP
Hours: [XX]/[YY] (XX%)
Status: 🟢 ON TRACK / 🟡 AT RISK / 🔴 BEHIND
Blockers: [N] active
Next week: [Priority] [Task]
```

---

## 🎯 CRITICAL TIMELINE

### Week 1: Code Hardening (May 1–7)
```
Mon 5/1:  A1 + A2 start (unit tests)
Tue 5/2:  A3 start (profiling)
Wed 5/3:  A1 + A2 midpoint check
Thu 5/4:  A3 bottleneck analysis
Fri 5/7:  GATE 1 DECISION ← Critical
```
**Gate 1 Go/No-Go Criteria:**
- ✅ A1 complete (7/7 invariants tested)
- ✅ A2 complete (7/7 gates tested)
- ✅ A3 complete (≥10K bars/sec)
- ✅ A4 complete (25/25 IPC channels)

### Week 2–3: Testing (May 8–21)
```
Mon 5/8:  B1 + B2 start (service tests)
Wed 5/10: B3 start (manual QA plan)
Fri 5/17: Midpoint check (50% coverage target)
Fri 5/21: GATE 2 DECISION ← Critical
```

### Week 4: Packaging (May 22–28)
```
Mon 5/22: C1 + C2 start (electron-builder)
Wed 5/24: C3 start (code signing)
Fri 5/28: GATE 3 DECISION ← Critical
```

### Week 5–6: Integrations (May 29–Jun 11)
```
Mon 5/29: D1 + D2 start (ForexFactory, Alpaca)
Wed 6/4:  D2 paper trading dry-run begins (1 week)
Fri 6/11: GATE 4 DECISION ← Critical
```

### Week 7: Documentation (Jun 12–18)
```
Mon 6/12: E1 + E2 + E3 start (docs)
Fri 6/18: GATE 5 DECISION ← Critical
```

### Week 8: Release (Jun 19–30)
```
Mon 6/19: F1 pre-release validation
Thu 6/23: F2 final build & signing
Fri 6/30: F3 release announcement
         🚀 LIVE
```

---

## 📈 TRACKING YOUR PROGRESS

### Manual (Weekly)
1. Update PROGRESS_TRACKING.json
   - Change task `status` from TODO → IN_PROGRESS → DONE
   - Update `weeklyBurndown[week].actualHours`
   - Update gate `decision` field
2. Run `npm run report:weekly`
3. Post report to team

### Automated (CI/CD)
- GitHub Actions syncs issues → burndown (if configured)
- `.github/workflows/update-progress.yml` runs daily
- Reports auto-generated & posted to Slack

---

## 🚦 GO/NO-GO DECISION TEMPLATE

**Use this at each gate decision (Fridays at 4 PM):**

```markdown
## GATE [N] DECISION — [Date]

**Target:** Gate [N]: [Gate Name]  
**Date:** [Fri Date]  
**Attendees:** [Roles]

### Acceptance Criteria Status
- [✅/❌] Criterion 1: [Description]
- [✅/❌] Criterion 2: [Description]
- [✅/❌] Criterion 3: [Description]

### Vote
- Lead Engineer: [GO/NO-GO]
- QA Lead: [GO/NO-GO]
- Release Manager: [GO/NO-GO]

### Decision
**🟢 GO** → Week [N+1] starts Monday  
**🔴 NO-GO** → [Mitigation: extended debugging + retry]

### Sign-Off
Approved by: [Lead Engineer] @ [Time] on [Date]
```

---

## 📊 KEY METRICS TO TRACK

**Every Friday:**
- [ ] Hours burned vs. planned (target: 95–105%)
- [ ] Test coverage (target: 80%+)
- [ ] Build success rate (target: 100%)
- [ ] Active blockers (target: ≤ 1)
- [ ] On-time gate decisions (target: 100%)

**Every 2 Weeks:**
- [ ] Schedule variance (target: ±0 days)
- [ ] Code quality (lint errors, type errors)
- [ ] Performance metrics (replay throughput, memory)

---

## 🆘 IF YOU GET STUCK

### Replay < 10K bars/sec (Week 1)
**Risk:** Blocks testing & profiling gate  
**Action:** Stop, profile NOW. Then pick best optimization:
1. Batch SQLite writes (every 10 trades vs. 1)
2. Defer UI updates (render every 100ms vs. 1ms)
3. Optimize indicator calculations (cache results)
**Impact:** 1–2 day delay if needed

### Missing IPC channels (Week 1)
**Risk:** Integration tests fail  
**Action:** Run audit script:
```bash
grep -r "ipc.handle\|ipc.invoke" src/ | wc -l
# Should match 25 channels in CLAUDE.md
```

### Test failures (Week 2–3)
**Risk:** Blocks packaging gate  
**Action:** Create GitHub issue, tag @QA-Lead
**Rule:** Flaky tests run 3x. If 2/3 pass, fix isolation.

### Code signing delays (Week 4)
**Risk:** Blocks release  
**Action:** Apply for Sigma cert NOW (Week 1).  
**Fallback:** Self-sign for internal release.

### Live trading risk (Week 5–6)
**Risk:** Highest severity  
**Action:** Paper dry-run 1+ week. Pre-release validation must include:
- [ ] Paper trading 100% successful
- [ ] Live toggle gated (env flag)
- [ ] Confirmation dialog mandatory
- [ ] Account minimum ($1K) enforced

---

## 📁 FILE CHECKLIST

**At project root (C:\Users\User\mc4\00-PROJECT-ROOT\):**
- [ ] CLAUDE.md (existing, polish in E1)
- [ ] PHASE_5_COMPLETION_CHECKLIST.md (existing, reference)
- [ ] PHASE_5_EXTREME_PLAN.md ← **NEW** (this week)
- [ ] PROGRESS_TRACKING.json ← **NEW** (this week)
- [ ] WEEKLY_STANDUP_TEMPLATE.md ← **NEW** (this week)
- [ ] EXTREME_PLANNING_QUICK_START.md ← **YOU ARE HERE**

**.github/:**
- [ ] PHASE_5_GITHUB_PROJECTS_TEMPLATE.json ← **NEW**
- [ ] workflows/lint.yml (create Week 4)
- [ ] workflows/test.yml (create Week 4)
- [ ] workflows/build.yml (create Week 4)

**scripts/:**
- [ ] generate-weekly-report.ts ← **NEW** (utility)
- [ ] replay-profiler.ts (create Week 1 A3)
- [ ] backup.ts (create Week 5 D3)

---

## 🎓 BEST PRACTICES

### Daily (For Each Owner)
1. Review your assigned tasks in GitHub Projects
2. Update status (TODO → IN_PROGRESS → DONE)
3. If blocked, comment on issue immediately
4. Post standup (10s: what done, what next, blockers?)

### Weekly (Friday 4 PM Standup)
1. Generate report: `npm run report:weekly`
2. Calculate hours burned
3. Assess gate readiness
4. Make Go/No-Go decision
5. Communicate next week priorities

### When Blocked
1. **Document** on GitHub issue (comment w/ error, context)
2. **Escalate** to owner (ping @Lead-Engineer or @QA-Lead)
3. **Don't wait** — address today, not next Friday
4. **Mitigation** — if expected 2+ days, adjust plan

### Test Coverage Mindset
- **Target:** 80%+ (only ~20% of code is hard to test)
- **Strategy:** Unit tests for logic, mocks for I/O
- **Tools:** Vitest (fast, deterministic), not Jest (slower)
- **Rule:** No test → bug will happen in prod

### Integration Testing Strategy
- **Quote → Fill → Position → Account** (happy path)
- **Replay determinism** (same data = same trades)
- **Error recovery** (network failure → graceful fallback)
- **State persistence** (SQLite recovery from corruption)

---

## ✅ CHECKLIST: YOU'RE READY WHEN…

- [ ] All 6 roles assigned (names in PROGRESS_TRACKING.json)
- [ ] GitHub Projects board created (6 views, 6 milestones)
- [ ] Week 1 issues created & assigned (A1–A4)
- [ ] Team kickoff Slack posted (with due dates)
- [ ] Lead Engineer has profiler script ready (A3)
- [ ] CLAUDE.md shared with team (reference)
- [ ] Scripts installed (npm run report:weekly works)
- [ ] First standup scheduled (Friday 4 PM, weekly)

---

## 📞 SUPPORT

**Questions about planning?** → See PHASE_5_EXTREME_PLAN.md  
**Questions about a specific task?** → Check PROGRESS_TRACKING.json  
**Questions about progress?** → Run `npm run report:weekly`  
**Questions about gates?** → See "GO/NO-GO DECISION TEMPLATE" above  

---

**Ready to execute? Start with Week 1: Core Hardening (May 1–7). Good luck! 🚀**
