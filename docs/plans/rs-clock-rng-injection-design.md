# RS-0.7 — Clock / SeededRng Injection Design

```
[TASK]    RS-UP-1 / RS-0.7
[LEDGER]  P-140
[INPUT]   RS-0.6 audit (docs/plans/rs-determinism-audit.md, P-139) — 223 sites:
          ≈96 (a) · ≈118 (b) · 9 (c)
[DATE]    2026-07-24
```

## Design decision in one paragraph

RS-0.6 found the TS engine already carries partial seams (`ctx.nowMs`, `deps.now`,
default-`Date` params, seeded mulberry32 in the sim path) but is timer-driven at the
decision layer, so **per-site injection on the TS side is the wrong tool**: editing
~118 sites would violate the zero-engine-edit rule (plan 0.D) and still not fix the
9 timer races. Instead, determinism is imposed **at the process boundary** on the TS
side (fake timers + faked `Date` installed by the RS-1.3 driver before engine
construction) and **at the constructor boundary** on the Rust side (explicit `Clock`
/ `SeededRng` traits from day 0, RS-1.1). Same recorded timeline, two enforcement
points, one oracle.

## TS side — the golden-capture driver harness (consumed by RS-1.3)

- Driver installs `@sinonjs/fake-timers` (devDependency; part of RS-1.3's sanctioned
  TS-side addition; knip config must acknowledge it) faking: `Date`, `Date.now`,
  `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `queueMicrotask`
  untouched (microtask order is V8-deterministic given an identical event sequence).
- Virtual epoch = first tick timestamp of the corpus session (from `corpus.json`).
- Drive loop per tick: `clock.setSystemTime → advance to tick.ts` (firing any timer
  whose deadline ≤ tick.ts, in deadline order) → apply tick via the ReplaySource
  seam → drain microtasks. Decision/fill timers (`autonomous-trader:131`,
  `trading-engine:1249,1254,742`) thereby fire at deterministic virtual instants
  strictly ordered against tick application — the RS-0.6 category-(c) races collapse.
- ReplaySource wall-anchored cursor (`replay-source.ts:387,392`) reads faked
  `Date.now()` → cursor advances exactly with virtual time; pump pacing becomes
  synchronous-by-construction.
- Sim/PRNG seed: from `corpus.json` manifest → engine's existing `mulberry32(seed)`
  (`services/rng.ts`); `randomSeed()` is never called under the driver.
- Residual `Math.random` under replay: `id-generator.ts:9` (order/trade id suffix)
  and `kill-switch-store.ts:66` (tmp filename — content-irrelevant). **Queued
  operator ruling (RS-1.3): recommend golden-side ID normalization** (stable
  placeholder substitution keyed by first-occurrence order) over seeding —
  IDs are identity, not behavior, and seeding `Math.random` globally would
  mask any *new* nondeterministic call sneaking in later.
- Double-run proof (RS-1.3 CI): two runs, byte-identical goldens by hash. Under this
  harness that check tests real residual nondeterminism, not timer luck.

## Rust side — traits in satex-core (consumed from RS-1.1 onward)

```rust
/// Milliseconds since Unix epoch, UTC — the only time currency in-engine (D-008).
pub trait Clock: Send + Sync {
    fn now_utc_ms(&self) -> i64;
}

/// Deterministic RNG. The production replay implementation MUST be a bit-exact
/// port of TS mulberry32 + its Box-Muller (same f64 expression order, same spare
/// caching) — Appendix B numeric law applies to randomness too.
pub trait SeededRng: Send {
    fn next_f64(&mut self) -> f64;          // [0,1), mulberry32 semantics
    fn next_gaussian(&mut self) -> f64;     // Box-Muller w/ spare, as TS
    fn next_int(&mut self, max: u64) -> u64; // floor(next * max), as TS
}
```

- `SystemClock` (prod) / `FixedClock` + `SteppedClock` (test/replay) in satex-core.
- Constructor-injected everywhere a subsystem owns an RS-0.6 category-(b) site;
  **no global clock statics, no `SystemTime::now()` outside `SystemClock`** —
  enforced by a clippy `disallowed-methods` entry added when satex-core lands
  (`std::time::SystemTime::now`, `chrono::Utc::now` outside the clock module).
- Timer semantics: tokio `time::sleep`/`interval` used only via a driver-pausable
  runtime (`tokio::time::pause()` in replay/parity mode) — the Rust twin of the
  fake-timer harness; tick application order is the recorded order (A.2 contract).

## Injection-point map (RS-0.6 category-(b) groups → owner)

| TS site group (from audit) | Rust owner / injection point |
|---|---|
| Engine funded-overlay clock (1024–1161), gate ctx `nowMs` (1140–1184), position stamps (1210) | `satex-engine` constructor takes `Arc<dyn Clock>`; passes into satex-exec gate context (mirrors existing TS `ctx.nowMs` seam) |
| Sim-bracket fill stamps (2310–2350) + fill-delay timers (1249/1254) | satex-engine sim-fill scheduler on pausable tokio time |
| AutonomousTrader stamps + cooldowns + cycle timer (:131) | `satex-intel::AutonomousTrader::new(clock, rng, …)`; cycle on pausable interval |
| brain/calibration/pattern-learner/tactics stamps | each service constructor takes `&dyn Clock` |
| order-manager session/order/fill stamps (105–520) | satex-exec constructor clock (TS seam :62 becomes mandatory param) |
| risk-gates (196, 332, 483) | satex-risk constructor clock |
| candle buffer wall-bucketing (41–183) | satex-data buffer takes clock; **ports the wall-bucketing quirk as-is** (RS-L1 — same quirk, injected source) |
| replay cursor + pump (387/392/324) | satex-data ReplaySource: cursor derives from injected clock; pump is a pull-driven iterator in parity mode (no timer at all) |
| tick-recorder / vault-writer / logger / store `updatedAt` stamps (L3) | persistence-side services take clock; byte parity via insta vs TS fixtures |
| market-data simulator stamps + seeded stream | `satex-data::Simulator::new(clock, rng)` — rng is the mulberry32 port |
| id-generator | satex-core `IdGen::new(clock, rng)`; golden comparison uses normalized IDs per the RS-1.3 ruling |
| alpaca broker-plane stamps (live/fixture only) | satex-broker-alpaca takes clock; exercised via RS-7.7 fixtures |

Category-(a) sites need nothing; category-(c) sites are eliminated by the two
harnesses above. If RS-1.3's double-run proof still diverges, the divergence is a
new, unclassified source → ledger it, extend this table (audit doc is the census).

## Explicit non-goals

No TS engine source edits (0.D). No global time mocking in production builds. No
`Instant`-based logic on the decision path (wall `UtcMillis` only, D-008). No
swapping mulberry32 for a "better" RNG (Appendix B: a better RNG is a parity bug).
