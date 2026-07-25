# RS-0.6 — Determinism Audit of the TS Replay Path

```
[TASK]     RS-UP-1 / RS-0.6 (read-only sweep; zero engine edits)
[LEDGER]   P-139
[MEASURED] 2026-07-24 against master @ 332f99e (post-P-135 adoption)
[METHOD]   grep -rn "Date.now|Math.random|new Date(" src/main src/shared (non-test)
           = 223 hits, 100% classified below; + timer/async review of the replay
           drive path (58 setTimeout/setInterval sites, decision-relevant ones named)
[SCOPE]    What the RS-1.3 golden-capture driver will boot: engine in replay mode,
           headless. Renderer excluded (never runs in the driver).
```

## Verdict (the R3 tripwire, answered in week 1)

**TS replay as-is is NOT decision-deterministic — but it is fully salvageable at the
driver level, without engine edits.** Three structural facts drive the verdict:

1. **The decision path is timer-driven, not tick-driven.**
   `autonomous-trader.ts:131` schedules `runCycle()` via `setTimeout(intervalMs)`;
   simulated fills land via `setTimeout(slip.delayMs)` / `setTimeout(50)`
   (`trading-engine.ts:1249,1254`); the funded overlay ticks on a 60 s interval
   (`trading-engine.ts:742`). Under wall-clock replay, the tick index at which a
   decision or fill lands **races the pump speed** — two runs produce different
   goldens. Classification: **(c)**, resolved only by a fake-timer harness.
2. **Replay pacing is wall-anchored.** `replay-source.ts:387,392` maps the replay
   cursor as `anchorReplayTs + (Date.now() − anchorWallTs) × speed`, and the pump
   itself is `setInterval(tick, tickMs)` (`:324`). Deterministic only under a
   virtual clock.
3. **Candle bucketing uses wall time, not tick time.** `live-candle-buffer.ts:41,111,183`
   buckets via `bucketFor(Date.now())` — at any replay speed ≠ 1× (or across a
   wall-day boundary) buckets diverge from the recorded session's. **(c)** under
   wall clock; deterministic under a virtual clock pinned to the recorded timeline.

**Prescribed remedy (feeds RS-0.7 / RS-1.3):** the golden-capture driver runs the
engine under **installed fake timers + faked `Date`** (e.g. `@sinonjs/fake-timers`,
driver-level install — zero engine edits), advancing virtual time in lockstep with
the recorded tick timestamps. Under that harness:
- every `Date.now()` / `new Date()` site below returns recorded-timeline time
  → all category-(b) sites become deterministic **for free**;
- every decision-relevant timer fires at a deterministic virtual instant strictly
  ordered against tick application → the category-(c) races collapse;
- double-run determinism (RS-1.3's CI proof) becomes a meaningful test of residual
  nondeterminism (iteration order, async interleaving) rather than of timer luck.

**Residual (c) risks to watch at RS-1.3:** V8 microtask interleaving of
`fireAndForget` async writes (expected deterministic given identical event
sequence — the double-run hash proves it either way); network-touching services
must be absent/inert in the driver's construction path (they are live-gated —
verified per-file below); `id-generator.ts` randomness (below) must be seeded or
golden-normalized — **operator ruling needed at RS-1.3** (recommend: normalize IDs
in goldens; IDs are identity, not behavior).

## Pre-existing injection seams (the codebase already half-agrees)

| Seam | Site | Note |
|---|---|---|
| Seeded PRNG (mulberry32) | `services/rng.ts` | "No Math.random in the simulator path. Same seed → identical tick stream." Sim is determinism-first by design. |
| `ctx.nowMs ?? Date.now()` | `order-manager.ts:62,285` | The perimeter's tz-aware checks already accept an injected clock. |
| `deps.now?.() ?? Date.now()` | `self-eval.ts:177,192,264` · `wire-feed.ts:157,172` | Deps-injected clock pattern. |
| `now: Date = new Date()` params | `shared/market-hours.ts:49,67,75,89,107` | Pure functions of the passed date. |
| Injected wall clock | `alpaca-reconnect.ts:36-38` ("Injected for tests") | |
| `now` passed in | `eod-flatten.ts:70` · `funded-account.ts:188` (deps) · `health-signals.ts` (values passed in) | |
| `now: () => Date.now()` composition | `trading-engine.ts:1556` → `composeIntelSnapshot` | The wrapper pattern RS-0.7 generalizes. |

## Classification table — 223/223 sites

**(a)** deterministic/irrelevant under replay (unreachable, display-only, telemetry,
or pure function of passed args) · **(b)** needs injection — feeds decisions, L2
state, or L3 artifacts; neutralized wholesale by the driver-level fake clock ·
**(c)** genuine nondeterminism as-is (timer/pacing races) — requires the fake-timer
harness, not merely a clock value.

### src/main/core/trading-engine.ts — 45 hits
| Lines | Class | Why |
|---|---|---|
| 213, 1647, 2175, 2533 | a | uptime/startedAt telemetry (status display) |
| 218, 2677 | — | comments |
| 602–604 | b | bootstrap backfill window from wall clock; "works in every data mode" — under replay the window is wrong-day; fake clock pins it (and ReplaySource serves no bars — inert but stamps flow to L3 logs) |
| 864–877 | b | session-end stamps → db + vault (L3 byte parity) |
| 1024, 1035, 1051, 1088, 1161 | b | **funded overlay clock** (`new Date()` into snapshot/flatten/EOD) — gate verdicts are Oracle L1 |
| 1140, 1184 | b | ref-price staleness age + `nowMs` into gate context — L1-relevant |
| 1210 | b | position `openedAt` → L2 open-position table |
| 1556 | a | `composeIntelSnapshot` seam; read-only intel display |
| 1661–1663 | a | health tick-rate window (telemetry) |
| 1823–1824 | b | replay bookmark stamps → L3 artifacts |
| 2019–2033 | b | brain warmup candle window from wall clock (same class as 602) |
| 2110–2113, 2164–2166 | a | tick-rate rolling window (status) |
| 2310–2350 | b | **simulator-bracket synthetic fills**: `createdAt/filledAt/closedAt/holdMs` → L1 fill events + L2 trade records |
| 2548 | a | 24 h news-prune cutoff (display feed) |
| 2572, 2596 | a | seeded demo news stamps (display) |
| 2630 | b | backfill ISO window (class of 602) |
| 2683, 2693, 2701 | a | `synthBackfill` — presentation-only per docblock ("never feeds the brain/learner"); live keep-alive path |
| **Timers** 1249, 1254 | **c** | **sim-fill delivery via setTimeout — the decision-critical race** |
| Timer 742 (`fundedTick` 60 s) | c | funded EOD/MLL checks race the pump |
| Timers 556, 558 | a | account/clock sync — live-session-gated, absent under replay |
| Timers 566, 688, 773, 778, 781, 788, 1760, 1992, 2073 | a/b | status broadcasts + vault checkpoints + prunes — display/L3 cadence; deterministic under fake timers, excluded from L1/L2 |

### src/main/services — data plane
| File:lines | Class | Why |
|---|---|---|
| replay-source.ts:304 | a | staleness telemetry |
| replay-source.ts:387, 392, 531 | **c** | wall-anchored cursor + NTP guard — pacing law; virtual clock required |
| replay-source.ts timer :324 | c | wall-paced pump interval |
| tick-recorder.ts:104–106, 208, 244 | b | seal/flush stamps → recording metadata (L3; format is a contract) |
| tick-recorder.ts:161 | b | `fallbackNow` when a quote lacks a timestamp — stamps recorded data |
| market-data.ts:93, 155, 167, 177, 221, 247 | b | simulator tick/candle stamps from wall clock (sim-mode goldens need the fake clock; corpus replay uses recorded ticks) |
| live-candle-buffer.ts:41, 111, 183 | **c** | wall-clock bucketing (verdict §3) |
| depth-feed.ts:89–92 | a | cosmetic depth shimmer (display) — verify no brain depth-feature wiring before L1.F changes this |
| depth-feed.ts:138 | b | `computedAt` in snapshot (L2-adjacent if depth reaches intel snapshots) |
| historical-importer.ts:178, 247–249, 276–278 | a | operator-invoked import windows; not in the replay drive path |
| edgar.ts:112–193, macro-calendar.ts:79–173, regime.ts:182–299 | a | aux feeds — network/schedule-gated, inert headless; regime utcHour is live-regime only (verify inert at RS-1.3 construction) |
| wire-feed.ts:157, 172 | a | deps.now seam, display feed |
| subsecond-telemetry.ts:48–92, subsecond-retention.ts:100–110 | a | telemetry windows/durations |
| market-observer.ts:81, 174 | b | observer checkpoint stamps → L3 vault files |

### src/main/services — broker plane (live-only under the driver: constructed but idle)
| File:lines | Class | Why |
|---|---|---|
| alpaca.ts:72–93 (rate limiter), 480–544, 627–679 (reconnect/backoff), 200, 511, 523, 660 (idle detection) | a | live-session machinery, unreachable in replay mode |
| alpaca.ts:185–187, 787 | b | broker-timestamp fallbacks to `Date.now()` — stamps data if live parsing fails (fixture tests at RS-7.7 pin this) |
| alpaca.ts:306, 412 | a | parse of broker-provided times (pure) |
| alpaca.ts:749 | b | `nowMs` into order flow context |
| alpaca/account-syncer.ts:54, 73 · alpaca/order-router.ts:84, 116 | b | `openedAt/observedAt/acceptedAt` stamps → L2 account state (live/fixture path) |
| live-market.ts:106–107 | a | parse of broker clock payload |
| alpaca-reconnect.ts:36–38 | a | documented injected-clock seam |
| broker/account-syncer.ts:20 | — | comment (staleness contract doc) |

### src/main/services — intelligence & perimeter
| File:lines | Class | Why |
|---|---|---|
| brain.ts:148, 178 | b | decision stamps (`generatedAt`) → L1 decision objects carry them |
| calibration.ts:118, 143 | b | outcome-record + snapshot stamps → L2 checkpoint fields |
| pattern-learner.ts:117 | b | learning-record stamp |
| tactics.ts:98, 124 | b | outcome history `ts` + store stamp → graduation evidence records |
| autonomous-trader.ts:143–256 | b | decision stamps + **cooldown arithmetic on wall ms** — L1-relevant; deterministic under fake clock |
| autonomous-trader.ts timer :131 | **c** | decision cycle on setTimeout (verdict §1) |
| self-eval.ts:76, 104, 177, 192, 213, 264–265 | a/b | deps.now seam; nightly schedule inert headless (timer never fires under driver unless advanced); report stamps L3 |
| order-manager.ts:62, 285, 334 | b | ctx.nowMs seam + funded `flatBy` check — L1 gate verdicts |
| order-manager.ts:105, 167, 378, 391, 520 | b | session/order/fill/position stamps → L1 lifecycle + L2 state |
| risk-gates.ts:196, 332, 483 | b | position age, funded snapshot clock, `computedAt` → L1/L2 |
| eod-flatten.ts:70 | a | pure probe of passed `now` |
| funded-account.ts:188, 200 · funded-account-store.ts:132 | b | snapshot clock via deps + store stamps |
| kill-switch-store.ts:64–66, 80 | a | tmp-file name entropy (never in content) + state stamp (L3 contract file — stamp is (b) for byte parity: fake clock covers) |
| live-mode.ts:45, 62 | b | arming-state stamps (L3 contract) |
| id-generator.ts:8–9 | b | **ts+random order/trade IDs — golden normalization or seeding ruling needed (RS-1.3)** |
| daily-pnl-ledger.ts:45–52 | b | date key from trade data (good) + `updatedAt` stamps |

### persistence, vault, logging, backtest, boot
| File:lines | Class | Why |
|---|---|---|
| vault-writer.ts:130, 182, 279, 377–474, 487–490 | b | vault markdown stamps — L3 **byte-parity contract** files |
| persistence.ts:854, 985–1002 | a | prune cutoffs + maintenance duration telemetry |
| logger.ts:78, 88, 135, 158, 171 | b | log entry `ts` + logfile day naming → L3 structured logs |
| backtest/runner.ts:62, 160 | a | wall duration measurement (report metadata; excluded from baseline compare) |
| backtest/reporter.ts:53 | a | formats data timestamps (pure) |
| index.ts:318, 452, 939–979 | a | boot wiring, export filenames, IPC stamps — not in the headless driver |
| alpaca-mode.ts:61 · self-eval-store.ts:30 | b | store `updatedAt` stamps (L3) |
| indicator-settings.ts:105 · intel-layout.ts:94 · subsecond-prefs.ts:161 · workspace-state.ts:102 | b | "_Last written_" stamps in vault-format files (L3 byte parity) |
| learning-report.ts:81 · tca.ts:79 | a | pure functions of data timestamps |
| shared/market-hours.ts:49–107 | a | default-param seams; pure given `now` |
| health/health-signals.ts:15 | — | comment (values passed in; pure) |
| rng.ts:37 | b | `randomSeed()` — replay seed comes from the corpus manifest instead |

**Totals: (a) ≈ 96 sites · (b) ≈ 118 sites · (c) 9 sites** (AT cycle timer, sim-fill
×2, fundedTick, replay cursor ×2 + NTP guard + pump timer, candle-buffer bucketing —
the buffer's three call-lines counted as one mechanism). Every (b) site is neutralized
by the single driver-level fake-clock decision; no engine source edits required.

## Handoff to RS-0.7 / RS-1.3

1. RS-0.7's design doc should specify: fake-timer harness installed by the driver
   (clock + timers + `Date`), virtual time advanced to each tick's recorded
   timestamp before applying it, timer callbacks thereby firing in deterministic
   timestamp order between ticks.
2. Corpus manifest carries the sim/PRNG seed (`rng.ts` mulberry32 already exists).
3. Operator ruling queued for RS-1.3: golden treatment of `id-generator` IDs
   (recommend normalize-in-golden over seeding — IDs are identity, not behavior).
4. Rust twin obligation (RS-L1): the Rust engine must reproduce the *same* clock
   semantics (e.g. candle wall-bucketing, cooldown-on-wall-ms) — port the behavior,
   including these quirks, with the Rust `Clock` trait injected at the same seams.
