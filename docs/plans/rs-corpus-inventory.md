# RS-1.2 — Corpus Inventory (agent half)

```
[TASK]     RS-UP-1 / RS-1.2 [A] — inventory existing TickRecorder recordings
[LEDGER]   P-143
[MEASURED] 2026-07-25 against the LIVE operator database, read-only
           (C:\Users\User\AppData\Roaming\satex-app\satex.db — 7,476,322,304 B)
[METHOD]   python sqlite3, `mode=ro` URI, aggregate queries only; zero writes.
           Export tool: scratchpad/rs12-corpus-export.py (byte-verified output)
[SCOPE]    What the RS-1.3 golden-capture driver can replay TODAY, and what the
           operator must record to reach the plan's ≥20-session target.
```

## Verdict (read this line)

**The corpus the plan assumed does not exist.** 50 sealed tape manifests claim
**13,064,935** ticks across 50 sessions; the `ticks` table contains **35,658 rows for
exactly ONE session**. 49 of 50 manifests are orphaned — their tick rows were deleted by
the engine's own retention prune. The single survivor is a **9.15-minute overnight
window**, and it was ~30 hours old at measurement time against a **48-hour** retention
window that re-arms 30 s after every app boot.

That tape has been exported to prune-immune, SHA-pinned corpus files (§4). Had this task
run a day later, Phase 1 would have started with **zero** replayable recordings.

## 1 — Measured inventory

| Table | Rows | Note |
|---|---|---|
| `ticks` | **35,658** | one `session_id` only: `ses_mrynz0vlkf0x001` |
| `tape_manifest` | 50 | claims 13,064,935 ticks; **49 orphaned** (actual rows = 0) |
| `sessions` | 120 | metadata survives pruning by design |
| `observations` | 36,100,889 | where the 7.48 GB actually lives — not tick tape |
| `crypto_subsecond_candles` | 4,004 | sub-second aggregator output (RS-2.7 fixture value) |
| `replay_bookmarks` | 3 | |
| `orders` | 4 | |

**The only replayable session:**

| Field | Value |
|---|---|
| `session_id` | `ses_mrynz0vlkf0x001` |
| Ticks | 35,658 |
| Symbols | 18 — AAPL AMD AMZN BTC CL DIA ES ETH GC GOOGL IWM META MSFT NQ NVDA QQQ SPY TSLA |
| Window (UTC) | `2026-07-24T08:14:26.709Z` → `2026-07-24T08:23:35.422Z` |
| Duration | 9.15 min (549 s) |
| Density | 3,897 ticks/min (≈ 65/s across 18 symbols) |
| Max inter-tick gap | 318 ms |
| Session equity | start 100,000.00 · trades 0 |

**Regime characterization (honest):** this is an **overnight / pre-RTH** window
(03:14–03:23 America/Chicago). Futures (ES NQ CL GC) and crypto (BTC ETH) carry the
activity; the equity symbols are quiet. It covers **none** of the plan's five regime tags
(trend / chop / gap / halt / WS-drop). Its value is as a **mechanical** corpus session:
enough real multi-symbol tick flow to build and prove the driver, not enough to prove
decision parity across market conditions.

Largest recordings already lost to pruning (manifest claims, rows gone):
`ses_mppbze4kldg8001` 3,896,974 · `ses_mr4j7082z31r001` 1,660,541 ·
`ses_mrnfza71vr0e001` 1,544,854 · `ses_mpxk5fto0wyh001` 1,270,313 · plus 15 `hist_*`
bar-derived days.

## 2 — Root cause of the empty corpus (code-cited, not inferred)

1. `trading-engine.ts:383-386` — `initialize()` schedules background DB maintenance 30 s
   after every boot with `pruneOlderThanMs: 48 * 60 * 60 * 1000`. The docblock
   (`:371-378`) states the intent plainly: 48 h "covers the most recent two trading days
   so yesterday's tape is still replay-ready".
2. `persistence.ts:852-863` (`pruneOldTicks`) and `:917+` (chunked
   `pruneOldSessionTicks`) delete from `ticks` only. The docblock `:843-846` deliberately
   keeps `sessions` rows so "historical PnL and trade counts stay intact".
3. Nothing deletes `tape_manifest` rows on the prune path — only the explicit
   replay-session delete does (`persistence.ts:726-727`, both tables). Hence **orphaned
   manifests**: sealed integrity records for tapes that no longer exist.

**Blast radius (measured, not assumed):** `listReplayableSessions`
(`persistence.ts:637-663`) `INNER JOIN`s a live `GROUP BY` over `ticks`, so the
operator's replay picker correctly shows only sessions with real rows — the orphans are
**not** a false-listing bug in the UI. The exposure is:
(a) `ReplaySource`'s constructor **throws** `session … has no tape rows`
    (`replay-source.ts:145-147`) for any code path that opens a session by id without
    going through the picker — a stale bookmark, a saved workspace, or an oracle driver
    handed a manifest-derived id;
(b) 49 dead manifest rows accumulate as permanently unreconcilable integrity records;
(c) **the corpus problem in this document.**

This is filed as its own ledger entry (P-144) with candidate remedies; it is a TS-side
observation, not an RS task, and it stays operator-ruled.

## 3 — Consequence for the plan

- **RS-1.2's [A] half is complete** (this document) and its finding is materially
  different from what the plan expected: there is nothing to inventory, so corpus
  assembly is now **operator-recording-bound**, and RS-1.2's `[O]` half moves onto the
  M1 critical path rather than sitting beside it.
- **RS-1.3 is NOT blocked.** A 9.15-minute, 18-symbol, real multi-symbol tape is
  sufficient to build the driver and to prove every mechanical property M1 asks for:
  headless boot, fake-timer determinism, golden emission, ID normalization, and the
  double-run byte-identical hash proof. Breadth is a Phase-2+ input, not a Phase-1 one.
- **D-017 can now be ruled with real numbers** (§5) instead of estimates.
- **Corpus hygiene becomes a standing rule:** any tape intended as corpus must leave the
  live DB before the next boot's prune. The plan's "corpus files are read-only artifacts;
  a changed SHA is an incident" (5.2) needs a companion rule — *a corpus tape still
  living only in the app database is not yet an artifact.*

## 4 — What was rescued (SHA-pinned artifacts)

Corpus tape format v1 — LF-delimited JSONL: line 1 is a manifest object (schema,
session, counts, bounds, per-symbol stats), lines 2..N+1 are one tick each with fixed key
order (`ts, symbol, last, bid, ask, volume, vwap`), sorted `ts ASC, symbol ASC`. Floats
are written with shortest-round-trip precision, so `JSON.parse` in node yields the
identical IEEE-754 double (Appendix B numeric law).

| File | SHA-256 | Bytes | gzip -9 | Lines |
|---|---|---|---|---|
| `tape-ses_mrynz0vlkf0x001.jsonl` | `1a202d2f52ed8c3f0bebecb2e99677a1a26e66f39df817297e71abe0c5280e55` | 5,507,967 | 1,520,696 (3.6×) | 35,659 |
| `crypto-subsecond-candles.jsonl` | `2341774f89d64846523937b29deb63ef97c7ae630a58c5c62547be1f6448032b` | 551,119 | 85,418 (6.5×) | 4,005 |

Written to two locations (both verified byte-identical after write; 0 NUL, 0 CR-CR, tail
intact, re-parsed):

- `C:\Users\User\mc4\Vault\Backtests\corpus\` — **gitignored** (`.gitignore:141`), so this
  copy is prune-immune but **not** backed up by git. Per the P-014 lesson (untracked
  losses are permanent) this needs an operator-owned second location; see D-017 below.
- the session scratchpad (`…/scratchpad/corpus/`) — volatile; do not rely on it.

`corpus-index.json` alongside them records schema, tool version, per-file SHA-256, byte
count and line count. It is the seed of the plan's `corpus.json` manifest (5.2).

## 5 — D-017 (corpus/golden storage) — measured input for the ruling

Measured cost of real tick tape: **154.5 B/tick raw, 42.6 B/tick gzipped (3.6×)**.

| Scenario | Ticks | Raw | gzip -9 |
|---|---|---|---|
| The surviving 9-min overnight tape | 35,658 | 5.5 MB | 1.5 MB |
| One dense session, low end (observed `ses_mrnfza71vr0e001`) | 1.54 M | ~232 MB | ~64 MB |
| One dense session, high end (observed `ses_mppbze4kldg8001`) | 3.90 M | ~602 MB | ~167 MB |
| **20-session corpus (plan target)** | 31–78 M | **4.6–12 GB** | **1.3–3.3 GB** |
| Bar-derived `hist_` day (12 symbols, 1Min → 4 ticks/bar) | ~23.6 K | ~3.6 MB | ~1.0 MB |
| 20 bar-derived days | ~472 K | ~72 MB | ~20 MB |

**Recommendation (operator rules):** git is out for tick tapes on the plain numbers —
GitHub's hard 100 MB/file limit alone disqualifies a dense session, and LFS would put
multi-GB binary churn in the trading repo's history. Proposed shape:

1. **Corpus and goldens live outside git**, gzipped, under one corpus root, with an
   operator-owned second copy (external drive or cloud) — the Vault copy is gitignored
   and therefore not a backup.
2. **The manifest is tracked** (`corpus.json`, kilobytes): per-session SHA-256, regime
   tags, symbol set, duration, seed. A parity claim cites the manifest SHA; the artifacts
   themselves are addressed by hash, so a corrupted or edited tape is detectable from git
   alone (`Vault/00-Audit/parity/` reports likewise, per Appendix A.4).
3. **Prefer bar-derived `hist_` tapes for breadth** (§6) and reserve full-density live
   tapes for the handful of sessions that genuinely need real microstructure.

## 6 — The two paths to corpus breadth

**Path A — bar-derived synthetic tapes, available immediately, no market hours required.**
`historical-importer.ts` fetches Alpaca historical bars for any calendar day and
materializes them into the same `ticks` tape the replay engine reads, expanding each bar
into **four** synthetic ticks walking `open → high → low → close` at `Δ = barSpan/4`
(`historical-importer.ts:9-22`). Session ids are deterministic
(`hist_<date>_<tf>_<sym-hash>`) and re-import is idempotent (`:23-26`), so a corpus day is
reproducible from `(date, symbols, timeframe)`.

*Honest limits, from the module's own docblock:* "Real intra-bar paths can be more
chaotic" — the microstructure is synthetic. These tapes exercise the replay path, the
candle buffer, the indicator stack, the brain, the gates and the decision loop over real
price geometry, but they **cannot** validate the sub-second aggregator (250 ms crypto
buckets), the depth feed, spread dynamics, or tick-burst clustering. Any corpus session
built this way must carry a `synthetic: bar-derived` tag in the manifest so no parity
claim silently rests on it.

**Path B — live recordings by the operator (RS-1.2 `[O]`, now on the critical path).**
The recorder runs automatically whenever the app runs (`trading-engine.ts:537-539`), so
"recording" means *running the terminal during the target window, then exporting the tape
the same day*.

Requested sessions, in priority order:

| # | Regime tag | What to run | Minimum useful |
|---|---|---|---|
| 1 | `trend` | RTH session on a directional day, from the open | 09:25–11:30 CT |
| 2 | `chop` | RTH session on a range-bound day | 2 h any RTH block |
| 3 | `gap` | Start **before** 09:30 ET so the gap-open prints inside the tape | 09:20–10:30 ET |
| 4 | `ws-drop` | Mid-session, disconnect the network 30–60 s, let it reconnect (paper/sim — no live capital involved) | any 30 min block |
| 5 | `halt` | Opportunistic (LULD halts are unpredictable); otherwise covered by the synthetic adversarial set | — |
| 6 | `overnight` | A longer futures/crypto window than the 9 min we have — the sub-second aggregator's only real evidence | 1 h |

**Non-negotiable per session:** export the tape the same day. The 48-hour prune re-arms
30 s after every boot, and it does not care that a tape is corpus.

**Path C — synthetic adversarial set: agent work, no operator time.** The scar-class
generators (P-039 negative prices, P-040/041/074/093 degenerate and NaN inputs, halt and
gap injections, sequence-gap batches) are ordinary code and are claimed separately as an
RS-1.2 follow-on. They are the only corpus category that needs nothing from the market.

## 7 — Handoff to RS-1.3

1. The driver consumes **corpus files**, never the live operator DB. It materializes a
   tape into a scratch database through the engine's own `insertTickBatch` +
   `upsertTapeManifest`, so the schema and the integrity manifest can never drift from
   production. The operator's 7.5 GB DB is touched read-only, once, by the export tool.
2. Determinism dividend: with the driver's virtual clock pinned to the tape's first tick,
   the engine's own 48-hour prune cutoff (`Date.now() - 48h` under the fake clock)
   computes to *before* the tape's first tick, so background maintenance provably cannot
   delete the corpus mid-run. The fake clock makes the harness safe by construction.
3. Every corpus manifest carries the simulator/PRNG seed. `randomSeed()`
   (`services/rng.ts:36-38`) must never be reached under the driver.
4. Golden ID treatment is **normalize-in-golden**, per the operator ruling of 2026-07-25
   (recorded with P-143): stable placeholders keyed by first-occurrence order.
   `Math.random` stays unseeded so a *new* nondeterministic call still trips the
   double-run hash proof.
```
[STATUS] RS-1.2 [A] COMPLETE — inventory measured, corpus rescued, D-017 quantified.
[BLOCKS] Corpus breadth (RS-1.2 [O]) is operator-bound; RS-1.3 is not blocked.
```
