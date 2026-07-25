# RS-1.3 — Golden-capture driver: design record and regeneration procedure

**Status:** slices 1–3 shipped. **Plan:** RS-UP-1 §5.2. **Ledger:** P-153 (slice 1), P-154 (slices 2–3).
**Measured:** 2026-07-25, operator hardware, Node-ABI `better-sqlite3`.

---

## 1. What this is

The oracle's capture half. It boots the real `TradingEngine` headless — no Electron
runtime — replays one corpus session on a virtual clock, subscribes to the public
decision stream, and emits a golden JSONL file per Appendix A.3. Rust runs compare
against that file forever after (RS-1.4), and RS-1.7 will perturb it to prove the
comparison can fail.

**Zero engine edits.** Nothing under `src/main` knows the oracle exists. The seam was
measured, not built: `new TradingEngine()` takes no arguments, `initialize()` reads its
world through `env.ts` and `electron`, and every observation the driver needs is already
a public `onX` listener (`trading-engine.ts:899-1044`). The harness supplies a different
world; the engine runs unmodified.

## 2. Module map — `apps/satex-terminal/scripts/oracle/`

| File | Role |
|---|---|
| `golden.ts` | Slice 1. Record envelope, canonical serialisation, `IdNormalizer`, stream hash. |
| `sandbox.ts` | Scratch filesystem tree, pinned environment, closed network with an audit trail. |
| `electron-stub.ts` | The `electron` module the engine sees. Every path lands in the sandbox; every capability refuses. |
| `corpus.ts` | Tape reader with header/row consistency enforcement; deterministic tape synthesizer for CI. |
| `importer.ts` | Corpus → scratch DB, with the P-097 real-database assertions. |
| `capture.ts` | The driver: boot, subscribe, drive the clock, emit the stream. |
| `archive.ts` | Writes `<session>.golden.jsonl` + `<session>.manifest.json`. |

Tests are colocated (`*.test.ts`) and run under the normal `npm test` gate.

## 3. How determinism is obtained

RS-0.6 found the TS replay path is **not** decision-deterministic as it stands: decisions
are timer-driven and the replay cursor is wall-anchored —
`ReplaySource.currentReplayTime()` is literally
`anchorReplayTs + (Date.now() - anchorWallTs) * speed`. RS-0.7's remedy was driver-level
fake timers, and that is what the driver installs.

Under a virtual clock, `Date.now()` advances only when the driver steps it, so the replay
cursor becomes a pure function of how far the driver has stepped. The engine keeps calling
`Date.now()` exactly as it always has. The `VirtualClock` interface is injected, so the
driver never imports a test framework; vitest's fake timers (which are
`@sinonjs/fake-timers`) supply it — **no new dependency was added**.

Generated ids are **normalized, not seeded**. `shortId()` mixes `Date.now()` and
`Math.random()` into every id and keeps a process-wide counter, so two captures produce
genuinely different raw ids. Seeding the global RNG would hide that — and would hide the
*next* stray nondeterministic call too. Normalizing in the golden leaves the double-run
hash live as a tripwire for everything else (operator's normalize-in-golden ruling,
ledger P-143).

### Hermetic by construction

- **Filesystem.** Every `app.getPath(...)` resolves inside one `mkdtemp` root. The root
  carries an `.obsidian/` marker because `resolveVaultRoot()` walks up from
  `app.getAppPath()` looking for exactly that and checks the start directory first — so
  the engine's vault writer cannot climb out into the operator's real vault.
- **Environment.** Simulator forced, seed fixed at `20260725`, broker credentials
  deleted (not blanked — `initialize()` picks `LiveMarket` on `!!keyId && !!secretKey`).
  Restored exactly afterwards, including leaving previously-unset variables unset.
- **Network.** `fetch` is replaced by one that refuses and records. This is not
  theoretical: `EdgarService.start()` arms a 10-second timer, and since virtual time
  advances by the full replay duration, that timer fires on any tape longer than ten
  virtual seconds and reaches for `https://www.sec.gov`. The first spike run of this
  harness logged `edgar poll failed — TypeError: fetch failed`, which succeeded in
  failing only because that machine had no route at that instant. On a connected machine
  it would have injected live SEC filings into the captured decision stream.
- **Authorization.** `dialog.showMessageBox` returns `response: 0`. `index.ts`'s
  LIVE_MODE_SET handler arms only on `response === 1` (adversarial finding C6; ledger
  P-148), so **the harness cannot arm live mode by construction** — and it refuses via
  the same branch a human pressing Cancel takes, not a special harness code.
  `safeStorage.isEncryptionAvailable()` returns `false`, so no stored credential can be
  resolved even if the operator has keys saved.

## 4. What the golden captures

Per Appendix A.3, both strata:

| Level | Kinds |
|---|---|
| **L1 — decisions** | `replay.start`, `gates.verdict`, `order.book`, `autonomy.decision`, `trade.closed`, `feed.status`, `replay.end` |
| **L2 — state** | `account.checkpoint`, `brain.checkpoint`, `calibration.checkpoint`, `session.checkpoint` |

L2 is captured **both ways**, as A.3 requires ("every N ticks + at every L1 event"): the
engine's `onAccount` push covers event-driven changes, and a pulled checkpoint every 4
replay-status pushes (≈2 virtual seconds) covers the rest. The pulled half is not
optional — a replay routes no orders, so the push never fires on its own.

### The decision stream is not deterministic yet — P-155

The archived golden carries **no** `autonomy.decision` records, and `autonomy` defaults
to off. That is not a scoping preference; it is a defect this driver found.

`getAiDecision` (`trading-engine.ts:1538`) passes `this.depth.get(symbol)` into
`brain.decide()`. `DepthFeedService.jitterFor` churns that ladder with four unseeded
`Math.random()` calls per tick (`depth-feed.ts:87-91`). The brain turns the top of the
ladder into `depth_imbalance` (weight 0.15) and `microprice_dev` (0.10)
(`brain.ts:86-105`). **So a quarter of every confidence score is drawn from an unseeded
RNG.**

Measured with autonomy enabled: two runs, identical symbol, tick index, and virtual
timestamp — confidence `0.3520162749933342` vs `0.36683881944775815`.

This is a **hard blocker for Oracle L1 decision parity**: the Rust engine cannot
reproduce a number drawn from `Math.random()`. It is pinned by a deliberately-failing-
when-fixed test in `capture.determinism.test.ts` so it cannot quietly persist, and it is
filed as ledger **P-155**. The remedy is a seeded RNG in `depth-feed.ts` — an engine
change, so it needs an operator ruling.

An earlier draft of this document described depth as merely "not captured", implying a
harmless side channel. That was wrong: depth is an **input to the decision path**, and
excluding it from the captured stream does not remove it from the computation. Appendix
A.2 requires such sites to be seamed out *or* excluded by explicit ruling rather than
silently tolerated — this is the explicit statement, and the recommendation is to seam,
not to exclude.

`RegimeService` consumes the same depth VPIN and is likewise outside L1/L2 until the seam
lands.

## 5. Measured results (2026-07-25)

Rescued P-143 corpus tape — 35,658 rows, 18 symbols, 9.15 minutes:

| | |
|---|---|
| Golden SHA-256 | `348ec08f312bba2763d2f2806bb6ee681e0eb76f76c9747b5f4a270798cb66d7` |
| Corpus SHA-256 | `1a202d2f52ed8c3f0bebecb2e99677a1a26e66f39df817297e71abe0c5280e55` (verified against the index) |
| Records | 146 (30 L1, 116 L2) · 92 KB |
| Ticks emitted | 35,622 of 35,658 — the balance is consumed by `ReplaySource.warmup()` at the cursor's starting position, which resets `emittedTicks` to 0 before playback |
| End reason | `end-of-tape` |
| Attestation | 1 network attempt blocked (`sec.gov`), **0 dialogs answered** |
| Double-run | **byte-identical**, both runs |

**Risk R3 is measured, and the answer is split.** For the captured surface — gate
verdicts, account/brain/calibration/session state, feed status, replay lifecycle — the TS
replay path *is* reproducible under the RS-0.7 harness design. For the **AI decision
stream it is not**, because of P-155 above. The plan's designated early-warning tripwire
fired, in week one of M1, exactly as it was designed to; §4 has the diagnosis. R3 cannot
be closed until the depth seam lands.

Gates: typecheck **0** · lint **0** · knip **0** · vitest **167 files / 2,188 tests, 0
failed** (baseline before this work: 160 / 2,120).

## 6. Regeneration procedure

Goldens regenerate **only** through this procedure, only when a TS engine change requires
it (R8), and only with review — a regenerated golden invalidates every parity claim made
against its predecessor.

```bash
cd apps/satex-terminal
npm rebuild better-sqlite3          # vitest runs under Node, not Electron
SATEX_ORACLE_WRITE=1 npx vitest run scripts/oracle/capture.determinism.test.ts
```

Writes `Vault/Backtests/goldens/<session>.golden.jsonl` and `<session>.manifest.json`.

Three properties make this safe to automate:

1. **One capture path.** The archived bytes are the bytes the double-run proof just
   compared — the writer archives the *proven* run, not a third capture, so the archive
   cannot disagree with the proof.
2. **The writer refuses bad artifacts.** An empty golden, or one from a run that hit the
   stall budget instead of `end-of-tape`, throws rather than landing on disk. A short
   golden is indistinguishable from a good one once archived, and would be cited as a
   reference forever.
3. **Corpus SHAs are verified first.** §5.2 makes a changed corpus SHA an incident; the
   suite checks every file in `corpus-index.json` before capturing.

### CI

No workflow edit was needed. CI already rebuilds `better-sqlite3` for Node and runs
`npm test`, and `vitest.config.ts` already includes `scripts/**/*.test.ts` — so the
**double-run determinism proof runs on every push**, against a synthetic tape generated
from integer arithmetic (no `Math.random`, no `Date.now`), because the recorded corpus is
gitignored. The corpus case runs on operator hardware and is reported as *skipped* —
never as passed — when the files are absent, and a always-running `corpus availability`
test states out loud which mode the run was in.

## 7. Open — operator decisions

1. **Should goldens be committed?** `Vault/Backtests/*` is gitignored, so the archived
   golden currently lives only on operator hardware — the same exposure that cost 49 of
   50 tapes in P-143. Unlike the corpus (D-017 measured 4.6–12 GB for 20 sessions, which
   disqualified git), a golden is **92 KB**; twenty of them is ~2 MB, which is entirely
   git-appropriate. Recommend a `!Vault/Backtests/goldens/` negation so parity claims can
   cite a committed artifact.
2. **P-155 — seed the depth RNG.** The highest-value of the three. Until
   `depth-feed.ts:87-91` takes a seeded RNG, the AI decision stream cannot enter Oracle
   L1, which means the parity harness measures the engine's *state* but not its
   *judgement*. This is an engine change on a perimeter-adjacent module, so it needs a
   ruling before anyone writes it.
3. **Corpus breadth.** The proof runs against one 9.15-minute session. RS-1.2's ≥20
   sessions across five regime tags still needs operator recordings; that is the M1
   critical path, not this task.
