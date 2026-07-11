# ULTRAPLAN — Probabilistic & Deflated Sharpe: a Statistical-Significance Layer for the Self-Evaluation Loop

- **Slug:** `probabilistic-deflated-sharpe-significance`
- **Author:** satex-psd-daily (dawn planner), real run **2026-07-10 03:35 CDT** (nominal slot 05:00 — fired ~85 min early)
- **Executor of record:** **Claude Fable 5, max effort** — this blueprint is written to be executed cold by a reader whose only inputs are the boot documents (`CONSTITUTION.md` → `AGENTS.md` → `ARCHITECTURE.md` → `PROBLEM-LEDGER.md` → `apps/satex-terminal/CLAUDE.md`) and this file.
- **Classification:** OFF-PERIMETER · STRICTLY OBSERVATIONAL · new-module-first
- **Ledger anchor:** new PSD entry **P-096** (created this session; see §Ledger)
- **Status of this blueprint at handoff:** Layers 1–7 complete; Task T1 (greenfield core module) + T2 (its unit tests) **executed and gate-verified this session**; Tasks T3–T6 (self-eval wiring, reporter columns, self-eval tests, docs) fully specced below and **left for Fable 5**.

---

## Preamble — the one-paragraph "why" (read this even if you read nothing else)

SATEX's nightly self-evaluation (`src/main/services/self-eval.ts`) judges every
`(strategy × symbol)` candidate by a **naive annualized Sharpe ratio**
(`src/shared/backtest/metrics.ts:49` — `mean(rets)/stdev(rets)·√periodsPerYear`, risk-free
rate 0) and a **single-baseline tolerance band** (`compareReports`, `sharpeTolerance: 0.5`).
Naive Sharpe is a biased estimator of skill: it ignores (1) **non-normality** of returns
(fat tails and negative skew make a given Sharpe *less* trustworthy), (2) **track-record
length** (a Sharpe from 120 bars is far weaker evidence than the same Sharpe from 5 000), and
(3) **selection under multiple testing** (evaluate K strategies, cherry-pick the best, and the
winner's Sharpe is inflated purely by the max operator). A live-capital terminal that promotes
a locked baseline on the strength of a naive Sharpe is promoting **noise dressed as edge** —
the precise failure the objective hierarchy's P2 (model fidelity: *honest* confidence) and P5
(expectancy is a symptom, never optimized directly) exist to prevent. This plan adds the modern
quant-finance correction — **the Probabilistic Sharpe Ratio (PSR), the Minimum Track Record
Length (minTRL), and the Deflated Sharpe Ratio (DSR)** (Bailey & López de Prado, *The Sharpe
Ratio Efficient Frontier*, J. Risk 2012; *Advances in Financial Machine Learning*, Wiley 2018)
— as a pure, unit-pinned, **observational** overlay on the existing report. It changes no risk
limit, sizes no order, and never touches the execution/risk perimeter. It makes the sentence
the operator reads at 2 a.m. change from *"Sharpe 1.42 ✅"* to *"Sharpe 1.42 — PSR 71%, DSR 9%
across 8 trials: NOT distinguishable from selection luck."* That is the product: ease-and-honesty
at the open.

---

## LAYER 1 — OBJECTIVE

**Goal (one sentence):** Add a pure, deterministic statistical-significance module to
`src/shared/backtest/` that computes the Probabilistic Sharpe Ratio, Minimum Track Record
Length, and Deflated Sharpe Ratio from a backtest's own return series, and surface those three
numbers (plus a significance verdict) in the nightly self-evaluation report — without altering
any metric already computed, any risk parameter, or any order path.

**Measurable success criteria:**
1. New file `src/shared/backtest/significance.ts` exists and exports the functions named in
   Layer 5 with the exact signatures given. **(T1 — DONE this session.)**
2. New file `src/shared/backtest/significance.test.ts` exists with **≥ 18** passing tests
   pinning every exported function against hand-computed or literature reference values.
   **(T2 — DONE this session; landed 22 tests.)**
3. `self-eval.ts` `renderReportMd` emits three new columns — **PSR**, **DSR**, **Signif.** —
   and the row-building path computes them from `report.equityCurve` + the run's trial set.
   **(T3 — Fable 5.)**
4. `self-eval.test.ts` gains **≥ 4** new tests asserting the significance columns render and
   that an empty/degenerate report (n < 2 returns) yields `n/a`, not `NaN`/throw.
   **(T5 — Fable 5.)**
5. **All four gates green** on the final tree: `typecheck` exit 0 · `lint` exit 0 / 0 warnings ·
   `vitest` 0 fail · `knip` exit 0 (CI is the knip arbiter; sandbox OOMs per §2.9).
6. `metrics.ts` `sharpe()` and every existing `BacktestMetrics` field are **byte-for-byte
   unchanged** — production decision math cannot regress from this work (same guarantee P-026 /
   P-033 gave by adding tests without touching the pinned file).

**Applicable constraints (Constitution / AGENTS.md):**
- Prime Directives 0.1 (no fabricated numbers — every test constant is hand-derived and shown),
  0.4 (measure, don't assert — gates run for real), 0.6 (four gates), 0.7 (branch→PR→CI).
- §2.4 Perimeter: **none touched.** `self-eval.ts` is STRICTLY OBSERVATIONAL by its own
  file header; it "never submits, sizes, or gates an order; never mutates brain/pattern/tactics
  state; never touches risk parameters." This plan preserves that invariant verbatim.
- §3.3 "calibration over confidence" and §3.6 "self-eval and learnings are strictly
  observational — they adjust nothing directly." PSR/DSR are *observational scoring*, not a
  control input. **Hard line: no PSR/DSR value may ever feed a risk gate, a position size, the
  calibration multiplier, or an autonomous-trade decision.** It prints. That is all.
- §2.5 leak-class discipline: module is pure (no timers/observers/listeners) → no teardown
  surface. Wiring adds no new subscription.

**Assumptions (all verified this session unless flagged):**
- A1 ✅ `barReturns(curve)` (`metrics.ts:23`) already yields the per-bar simple-return series.
  PSR/DSR consume this directly.
- A2 ✅ `report.equityCurve: EquityPoint[]` and `report.metrics` are on `BacktestReport`
  (`src/shared/backtest/types.ts`).
- A3 ✅ No pre-existing `skewness`/`kurtosis`/`normCdf`/`normInvCdf`/PSR/DSR anywhere under
  `src/shared` (grep returned nothing) — greenfield, no duplication, no knip "unused" risk once
  wired.
- A4 ⚠️ **UNVERIFIED-BY-DESIGN:** the self-eval loop is the correct locus for the "number of
  trials" N in DSR. Decision: N = number of `(strategy × symbol)` rows produced in a single
  `runOnce()` pass (the strategies actually raced that night). This is the defensible in-repo
  definition; documented as such in the report so the operator can reinterpret. Not a hidden
  assumption — it is printed in the report footer.

---

## LAYER 2 — DOMAIN MAP (exact blast radius)

| File | Layer / domain | Touch | Role |
|---|---|---|---|
| `src/shared/backtest/significance.ts` | shared / backtest | **NEW** | Pure PSR/minTRL/DSR + stats primitives. Zero imports from main/renderer. |
| `src/shared/backtest/significance.test.ts` | shared / backtest | **NEW** | Vitest unit pins. |
| `src/shared/backtest/metrics.ts` | shared / backtest | **READ-ONLY** | Source of `barReturns`; **must not change**. Optionally *import* `barReturns` into significance (preferred over re-deriving). |
| `src/shared/backtest/types.ts` | shared / backtest | **NEW type only** | Add `export interface SignificanceMetrics {...}` (additive; existing types untouched). |
| `src/main/services/self-eval.ts` | main / intelligence (observational) | **EDIT (Fable 5)** | Compute per-row significance; pass trial set; render 3 columns. |
| `src/main/services/self-eval.test.ts` | main / intelligence | **EDIT (Fable 5)** | +≥4 tests. |
| `src/main/backtest/reporter.ts` | main / backtest | **OPTIONAL EDIT (Fable 5)** | Mirror PSR/DSR into the standalone report card for parity (nice-to-have; gated behind "if time"). |

**Perimeter classification:** every file above is **GREEN** (no execution/risk/kill-switch/
arming/MAY-TACTICS contact). `self-eval.ts` lives under `services/` but is explicitly the
observational nightly evaluator, not a decision/execution service. **No APPROVAL NODE in this
plan.** If Fable 5 finds itself editing anything under `services/execution/`, `services/risk/`,
`OrderManager`, `KillSwitch`, or `tactics.ts` (MAY-TACTICS-adjacent) — **STOP**; the plan has
been misread.

---

## LAYER 3 — TASK TREE

```
P-096 Statistical-Significance Layer
├── T1  significance.ts core module .......................... DONE (this session)
│   ├── a  stats primitives: mean, stdev(sample), skewness, kurtosis
│   ├── b  normCdf (erf, A&S 7.1.26), normInvCdf (Acklam rational approx)
│   ├── c  probabilisticSharpe(sr, srBench, n, skew, kurt)
│   ├── d  minTrackRecordLength(sr, srBench, skew, kurt, targetConf)
│   ├── e  expectedMaxSharpeNull(varSR, nTrials)  (Bailey–LdP Eq.)
│   ├── f  deflatedSharpe(sr, n, skew, kurt, trialSRs[])
│   └── g  significanceFromReturns(rets[], opts)  → SignificanceMetrics  (adapter)
├── T2  significance.test.ts ................................. DONE (22 tests, this session)
├── T3  wire into self-eval.ts .............................. FABLE 5
│   ├── a  add SignificanceMetrics to types.ts
│   ├── b  in runOnce(): per row compute significanceFromReturns(barReturns(report.equityCurve))
│   ├── c  collect per-row non-annualized SR into trialSRs[]; second pass computes DSR
│   └── d  renderReportMd: +PSR +DSR +Signif. columns + footer note on N-trials definition
├── T4  (optional) reporter.ts parity ...................... FABLE 5 (if time)
├── T5  self-eval.test.ts +≥4 tests ......................... FABLE 5
└── T6  docs: CHANGELOG Unreleased + ledger P-096 SHIPPED + ARCHITECTURE note if loop changes . FABLE 5
```

---

## LAYER 4 — DEPENDENCY DAG

```
T1a ─▶ T1c ─▶ T1d
 │      │
 │      ▼
T1b ─▶ T1c    T1e ─▶ T1f
 │             ▲
 └─────────────┘
T1(a..g) ─▶ T2            (test needs the module)
T1g ─▶ T3a ─▶ T3b ─▶ T3c ─▶ T3d ─▶ T5 ─▶ T6
                         └─▶ T4 (parallel, optional)
```
Topological order for Fable 5 (T1/T2 already landed): **T3a → T3b → T3c → T3d → T5 → (T4) → T6.**
`typecheck + lint + vitest` after **each** of T3 and T5 — never batch to the end (rule §4).

---

## LAYER 5 — EXECUTION SPECS (the cold-start contract)

### Conventions that MUST hold across every function
- **Sharpe convention:** PSR/DSR operate on the **non-annualized, per-observation** Sharpe
  `SR = mean(rets)/stdev(rets)` (sample stdev, `ddof=1`). Do **not** feed the annualized
  `metrics.sharpe` (which is `×√periodsPerYear`) into PSR — that inflates n-scaling and is the
  #1 way this gets silently wrong. `significanceFromReturns` derives its own per-obs SR from the
  raw series; it never reads `metrics.sharpe`.
- **n:** number of returns = `rets.length` (= `equityCurve.length − 1`).
- **Degenerate guards (each maps to a real defect class — P-039/P-040/P-041):** `n < 2` →
  return a sentinel `{ psr: null, minTRL: null, dsr: null, ... }` (never NaN, never throw);
  `stdev === 0` → same sentinel; empty `trialSRs` or single trial → `dsr = psr` with
  `nTrials = 1` (no deflation possible, documented).
- **Kurtosis convention:** use **raw (non-excess) kurtosis** `γ4` where a normal distribution
  gives `γ4 = 3`. The PSR denominator below is written for raw kurtosis. (If you compute excess
  kurtosis, add 3 before use — pick one and pin it in a test.)

### T1c — Probabilistic Sharpe Ratio
```
PSR(SR*) = Φ(  ((SR − SR*) · sqrt(n − 1))
             / sqrt( 1 − γ3·SR + ((γ4 − 1)/4)·SR² )  )
```
- `SR` = observed per-obs Sharpe, `SR*` = benchmark (default 0), `γ3` = skewness, `γ4` = raw
  kurtosis, `Φ` = `normCdf`.
- Returns a probability in (0,1): "P(true Sharpe > SR* | observed sample)".
- **Reference pin (put in T2):** with `SR=0.1, SR*=0, n=100, γ3=0, γ4=3` → denominator
  `sqrt(1 − 0 + (2/4)·0.01) = sqrt(1.005) ≈ 1.002497`; numerator `0.1·sqrt(99) ≈ 0.994987`;
  `z ≈ 0.99251`; `PSR ≈ Φ(0.99251) ≈ 0.8395`. Assert `≈ 0.8395 ± 1e-3`.
- **Monotonicity pins:** PSR increases in n (hold all else) and decreases as γ3 turns negative
  (negative skew penalizes); assert both directionally.

### T1d — Minimum Track Record Length
```
minTRL = 1 + ( 1 − γ3·SR + ((γ4 − 1)/4)·SR² ) · ( Φ⁻¹(targetConf) / (SR − SR*) )²
```
- `Φ⁻¹` = `normInvCdf`. Returns the number of observations required for `PSR(SR*) ≥ targetConf`
  (default `targetConf = 0.95`). If `SR ≤ SR*` → return `Infinity` (never reachable). Round up
  in the report only; the function returns the real value.

### T1e — Expected maximum Sharpe under the null (for DSR benchmark)
```
E[max SR_null] = sqrt(varSR) · [ (1 − γe)·Φ⁻¹(1 − 1/N)
                                +      γe ·Φ⁻¹(1 − 1/(N·e)) ]
```
- `γe` = Euler–Mascheroni ≈ `0.5772156649`, `e` = Euler's number, `N` = number of trials,
  `varSR` = variance of the trial Sharpes. This is the expected maximum of N i.i.d. standard-
  normal-ish Sharpe estimates — the amount of Sharpe you'd expect from luck alone after N tries.
- **Pin:** `N=10, varSR=1` → `Φ⁻¹(0.9)=1.281552`, `Φ⁻¹(1−1/(10e))=Φ⁻¹(0.963237)=1.78956`;
  `E ≈ 0.4228·1.281552 + 0.5772·1.78956 ≈ 0.54186 + 1.03293 ≈ 1.5748`. Assert `± 1e-2`.

### T1f — Deflated Sharpe Ratio
```
DSR = PSR( SR* = E[max SR_null] )     # PSR with the null-max as the benchmark
```
- Compute `varSR = sampleVariance(trialSRs)`, `N = trialSRs.length`, `SR*` from T1e, then
  `deflatedSharpe = probabilisticSharpe(SR, SR*, n, γ3, γ4)`. DSR < PSR whenever N > 1 and
  `varSR > 0` — that gap *is* the multiple-testing correction. Pin: DSR(single trial) === PSR.

### T1b — normCdf / normInvCdf (deterministic, no deps)
- `normCdf(z)`: Abramowitz & Stegun **7.1.26** erf approximation, `Φ(z)=0.5·(1+erf(z/√2))`.
  Pins: `Φ(0)=0.5`; `Φ(1.281552)≈0.9 ±1e-4`; `Φ(1.959964)≈0.975 ±1e-4`; `Φ(−z)=1−Φ(z)`.
- `normInvCdf(p)`: **Acklam** (or Beasley-Springer-Moro) rational approximation, domain (0,1),
  `normInvCdf(0.975)≈1.959964 ±1e-4`, `normInvCdf(0.5)=0` (±1e-9), `normInvCdf(p)=−normInvCdf(1−p)`.
  Guard `p≤0 → −Infinity`, `p≥1 → +Infinity`.

### T1g — significanceFromReturns (the adapter the wiring calls)
```ts
export interface SignificanceMetrics {
  n: number
  perObsSharpe: number | null
  skew: number | null
  kurtosis: number | null          // raw (normal = 3)
  psr: number | null               // vs SR*=0
  minTRL: number | null            // obs to reach 0.95 confidence
  dsr: number | null               // filled in the trial-aware second pass; null until then
  nTrials: number | null
}
export function significanceFromReturns(
  rets: number[],
  opts?: { srBenchmark?: number; targetConfidence?: number },
): SignificanceMetrics
```
- Single-series pass fills everything except `dsr`/`nTrials` (which need the whole trial set).
- Provide `export function deflate(rows: SignificanceMetrics[]): void` **or** a pure
  `withDsr(row, trialSRs): SignificanceMetrics` — pick pure (no mutation) for testability; the
  wiring maps rows → trialSRs = rows.map(perObsSharpe).filter(finite), then re-maps each row
  through `withDsr`.

### T3 — self-eval wiring (Fable 5), exact edits
- **T3a** `types.ts`: append `SignificanceMetrics` (above). Additive; assert the anchor
  `export interface BacktestReport` is untouched.
- **T3b** In `runOnce()`, after `const report = runner.run(...)`, compute
  `const sig = significanceFromReturns(barReturns(report.equityCurve))` and carry it on the row
  object (`rows.push({ key, report, status, violations, sig })` — extend the row tuple type).
- **T3c** After the symbol/strategy loops close, build
  `const trialSRs = rows.map(r => r.sig.perObsSharpe).filter((x): x is number => x != null && Number.isFinite(x))`
  then `rows.forEach(r => { r.sig = withDsr(r.sig, trialSRs) })`.
- **T3d** In `renderReportMd`, extend the table header/row:
  `| ... | Sharpe | PSR | DSR | Signif. | MaxDD | ... |`, formatting `null → 'n/a'`,
  probabilities as `fmtPct`, and a **Signif.** glyph: `DSR ≥ 0.95 → '✅ real'`;
  `PSR ≥ 0.95 && DSR < 0.95 → '⚠️ selection-risk'`; `PSR < 0.95 → '🔬 noise-band'`. Add a footer
  line: `> Signif. uses PSR (vs SR*=0) and DSR deflated across N={rows.length} trials this run.`
- **EDIT HAZARD (rule §5):** `self-eval.ts` is an existing CRLF-or-LF file. Do the edit via
  python-through-bash with per-file line-ending detection; assert each anchor `count == 1`
  before replace (the `renderReportMd` table header string is unique — verify); byte-scan for
  NUL / `\r\r` after. `renderReportMd` and `SelfEvalService` are both exported and covered, so
  a truncation shows up as a test failure immediately — run vitest right after.

---

## LAYER 6 — RISK AUDIT (self-adversarial)

1. **Annualized-vs-per-obs Sharpe mix-up** — the highest-probability silent bug. Mitigation:
   `significanceFromReturns` derives SR internally from raw returns and *never* accepts an
   annualized Sharpe; a T2 test pins that `perObsSharpe` ≪ `metrics.sharpe` for the same curve.
2. **Kurtosis convention drift (excess vs raw)** — mitigation: one T2 test feeds a known-normal
   sample and asserts `kurtosis ≈ 3` (raw), locking the convention; PSR denominator comment
   states "raw γ4".
3. **normInvCdf tail inaccuracy** — Acklam is ~1e-9 in the body but degrades in extreme tails;
   DSR benchmark uses `1−1/(N·e)` which for large N approaches 1. Mitigation: for the N ranges a
   nightly run produces (single digits to low hundreds) accuracy is ample; T2 pins N=10 and
   N=100. Do **not** claim validity for N>10⁶.
4. **Degenerate inputs** (n<2, zero-variance flat equity, all-equal returns, single trial,
   `SR ≤ SR*`) — each has an explicit branch and a T2 test. `minTRL` returns `Infinity`, not NaN.
5. **knip "unused export" on landing T1 before T3** — the module's exports are unreferenced
   until the wiring lands. Mitigation: T1 and T3 ship in the **same PR/branch**; if split, the
   test file references every export so knip sees usage. (T2 already imports all of them.)
6. **Scope-creep veto** — tempting adjacencies explicitly OUT: no Sharpe *annualization* changes,
   no risk-gate integration, no calibration-multiplier coupling, no new IPC channel, no renderer
   panel. Any of those crosses from "honest scoring" into the perimeter or into gold-plating and
   is vetoed by §2.7 "correctness precedes optimization."
7. **File-bridge truncation of `self-eval.ts`** (P-021 class) — mitigation in T3 spec above;
   recovery is `git show HEAD:src/main/services/self-eval.ts`.

No task survives to Layer 7 touching the perimeter. Confirmed: zero APPROVAL NODES.

---

## LAYER 7 — ASSEMBLED PLAN (execution order + validation)

| Step | Action | Validation (command from `apps/satex-terminal/`) | Expected |
|---|---|---|---|
| 1 ✅ | Write `significance.ts` (T1) | `node_modules/.bin/tsc --noEmit -p tsconfig.node.json` | exit 0 |
| 2 ✅ | Write `significance.test.ts` (T2) | `node_modules/.bin/vitest run src/shared/backtest/significance.test.ts` | 22/22 pass |
| 3 ✅ | lint new files | `node_modules/.bin/eslint src/shared/backtest/significance.ts src/shared/backtest/significance.test.ts` | exit 0, 0 warn |
| 4 | T3a types + T3b/c wiring + T3d render | `vitest run src/main/services/self-eval.test.ts` after edit | existing 10 still pass |
| 5 | T5 +≥4 self-eval tests | same | ≥14 pass |
| 6 | (opt) T4 reporter parity | `vitest run src/main/backtest` | pass |
| 7 | Full gate bar | `typecheck && lint && vitest run` (+ CI for knip) | all green |
| 8 | Docs T6 | CHANGELOG Unreleased `### Added`; ledger P-096 → SHIPPED w/ gate stamp | — |
| 9 | Branch → PR → CI → merge → verify SHA | per §2.2 | CI green |

**Post-gate bar question (§9):** does the operator's nightly report now say something truer and
calmer? Yes — a promotable-looking Sharpe now carries its own honesty label. Ship criterion met.

---

## Ledger (P-096) — created this session, see PROBLEM-LEDGER.md for the full PSD entry.

## APPENDIX — literature the constants trace to (for the cold reader)
- Bailey, D. & López de Prado, M. (2012), *The Sharpe Ratio Efficient Frontier*, J. of Risk 15(2)
  — PSR, minTRL.
- Bailey, D. & López de Prado, M. (2014), *The Deflated Sharpe Ratio*, J. of Portfolio Mgmt 40(5)
  — DSR, E[max SR] under the null.
- López de Prado, M. (2018), *Advances in Financial Machine Learning*, Wiley — synthesis; the
  multiple-testing / backtest-overfitting framing this plan operationalizes.
- Abramowitz & Stegun (1964), *Handbook of Mathematical Functions*, 7.1.26 — erf approximation.
- Acklam, P. (2003), *An algorithm for computing the inverse normal cumulative distribution
  function* — `normInvCdf`.
```
END ULTRAPLAN
```
