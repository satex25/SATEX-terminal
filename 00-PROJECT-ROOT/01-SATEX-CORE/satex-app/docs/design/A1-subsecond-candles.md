# A1 — Sub-second candle aggregator (design doc)

**Status:** Draft for review · 2026-05-19  
**Owner:** SATEX trading-engine  
**Tags:** scalping · crypto · aggregator · v0.5 candidate  
**Relates to:** v0.4.3 release · existing 1-second candle pipeline · ChartPanel timeframe rollup

---

## 1. Problem statement

The current SATEX candle pipeline emits **1-second base bars** from
`live-market.ts` and aggregates upward (5s / 15s / 1m / …) inside the
renderer via `ChartPanel.aggregate()`. This is the minimum useful resolution
for swing/momentum playbooks but is too coarse for the scalping strategies
we want to support in v0.5:

- **Order-book sniping** — the trader needs to see the wick that *just*
  printed against the inside bid before it disappears.
- **Cross-venue arbitrage on crypto** — BTC/USD vs. BTC/USDT divergence
  windows can collapse in 200–400 ms.
- **MAY-TACTICS scalp-mode graduation** — tactic backtests demand sub-second
  granularity to evaluate microstructure entries.

We need optional **250 ms and 500 ms** candle resolutions for the subset of
the universe whose upstream feed actually carries sub-second data.

The bar to pass: derivable from existing data sources, no degradation to
the live 1-second pipeline, no increase to footprint memory budget, and an
opt-in UI surface so users who don't scalp aren't penalized.

---

## 2. Data source analysis

| Source | Native granularity | Sub-second derivable? | Why |
|---|---|---|---|
| **IEX equity feed** (Alpaca free tier) | 1 second snapshots | **No** | IEX rate-caps snapshots at 1/s; reconstructing 250 ms candles from 1-second snapshots produces 3 of every 4 buckets empty. Faking the bucket from the snapshot value would synthesize trades that never happened — would poison VWAP and footprint. |
| **Alpaca equity SIP** (paid) | ~100 ms ticks | Yes, but gated by entitlement | Out of scope for v0.5; users without SIP credentials can't access. |
| **Alpaca crypto WS** | ~50–200 ms ticks (no rate cap on free tier) | **Yes** | The existing `alpaca.ts` crypto socket already receives per-trade messages at sub-second intervals. We discard the high-frequency arrival timing today by rolling into 1-second buckets in `LiveMarket.onTick`. |
| **Replay tape (`tape_manifest`)** | as recorded (1 second today) | Only as recorded | Sub-second tapes would require recorder changes — covered in §3.4 below. |

**Conclusion:** Sub-second candles ship for **crypto only** in the initial
release. Equities stay on 1-second base bars until a customer engages SIP.
This is a hard product line, not a soft default — the renderer must show
"≥ 1s only" disabled timeframe buttons for non-crypto symbols.

---

## 3. Aggregator design

### 3.1 New class — `SubSecondCandleAggregator`

Lives in `src/main/services/subsecond-aggregator.ts`. Pure JS, no Electron
dependencies, vitest-testable.

```typescript
interface SubSecondCandle {
  time: number   // bucket start, epoch ms (NOT seconds — sub-second precision lost otherwise)
  open: number
  high: number
  low:  number
  close: number
  volume: number  // sum of trade quantities within bucket
}

class SubSecondCandleAggregator {
  constructor(
    private readonly bucketMs: 250 | 500,
    private readonly onEmit: (symbol: string, candle: SubSecondCandle, isNew: boolean) => void,
  ) {}

  ingestTrade(symbol: string, ts: number, price: number, qty: number): void
  forceRoll(symbol: string): void  // called on disconnect/suspend to seal in-flight buckets
}
```

The aggregator runs **alongside** the existing 1-second pipeline, not as a
replacement. Both consume the same `AlpacaTick` stream; the sub-second path
ignores trade frames where `kind !== 't'` (quote-derived close updates would
fabricate sub-second data the WS never delivered).

### 3.2 Bucketing arithmetic

- `bucket = Math.floor(ts / bucketMs) * bucketMs`
- New bucket → emit prior (sealed) candle, open a fresh in-flight bucket.
- Same bucket → mutate the in-flight candle (high = max, low = min, close, volume += qty).

The existing 1-second `aggregate()` in `ChartPanel.tsx:117` is the proven
algorithm — sub-second is the same shape with a smaller denominator.

### 3.3 Storage

A new SQLite table:

```sql
CREATE TABLE IF NOT EXISTS crypto_subsecond_candles (
  session_id TEXT    NOT NULL,
  symbol     TEXT    NOT NULL,
  bucket_ms  INTEGER NOT NULL,  -- 250 or 500
  ts         INTEGER NOT NULL,  -- bucket start (epoch ms)
  open       REAL    NOT NULL,
  high       REAL    NOT NULL,
  low        REAL    NOT NULL,
  close      REAL    NOT NULL,
  volume     REAL    NOT NULL,
  PRIMARY KEY (session_id, symbol, bucket_ms, ts)
);
```

Schema migration is **idempotent-additive**, matching the existing
`persistence.ts` policy (see [[satex-v0-4-stabilization-release-series]]).

### 3.4 Retention

- **1 000 buckets** per `(symbol, bucket_ms)` pair.
- At 250 ms → ~4 min of history; at 500 ms → ~8 min.
- Rationale: scalp strategies only consult the last ~30–60 seconds. The
  upper-tier 1s+ candles in the existing pipeline cover everything older.
- Eviction runs once per minute (`recorder.tickRecorder` already has a
  similar cadence) — drop oldest rows beyond the cap per `(symbol, bucket_ms)`.
- Replay tapes do **not** include sub-second candles in v0.5 (file size +
  manifest reseal cost too high). Sub-second is **live-only** for now.

### 3.5 Emission to renderer

A new IPC channel pair:

```
SUBSECOND_CANDLES_UPDATE  (push, main → renderer)
SUBSECOND_CANDLES_GET     (invoke, renderer → main, returns last N buckets)
```

Diff-gated: only emit when the in-flight bucket's close moves OR a new
bucket opens. This avoids the 4× emission rate that naive "emit per tick"
would cause.

---

## 4. Renderer impact

### 4.1 Chart library

`lightweight-charts` v5 supports arbitrary timeframes. The series data
shape is `{ time: <ms or epoch>, open, high, low, close }`; passing
millisecond timestamps to a candle series is supported.

The existing `ChartPanel.aggregate()` would gain a fast path when the
target bucket is sub-second: bypass the local rollup, fetch directly from
the new IPC channel.

### 4.2 Quantitative load estimate

Current 1-second pipeline at steady state:

- 18 symbols × 1 emit/s × 50 ms batching coalesce = **~360 events/s**
  reaching the renderer.

Sub-second crypto layer (3 crypto symbols × 4 emits/s at 250 ms):

- 3 × 4 = **12 additional events/s** (an order of magnitude below the
  existing live pipeline).
- At 500 ms: 3 × 2 = 6 additional events/s.

**4× increase** referenced in the original sketch only happens if we
naively emit per-tick (no coalesce). With 50 ms batching matching the
existing `BATCH_MS = 50` constant from `src/shared/constants.ts:11`, the
event rate stays well below the 60fps frame budget. The chart's
`setData()` rebuild on bucket roll is the load-bearing cost; for 1 000
buckets × 3 symbols that's ~3 ms once per second per symbol, comfortably
within the v0.4.3 frame budget (median 4–6 ms).

### 4.3 UI surface

- New timeframe buttons `250ms` / `500ms` in `CHART_TIMEFRAMES` array
  (`src/shared/constants.ts`).
- Buttons **disabled** when the focused symbol is not crypto.
  Tooltip: "Sub-second data is currently crypto-only. SIP equity feed
  required for sub-second equities."
- Visual marker on the chart legend when sub-second mode is active so the
  user is never confused about which resolution they're looking at.

---

## 5. Risk assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Renderer frame stalls during high-volatility crypto print | Med | High | 50 ms coalesce + diff-gated emission keeps event rate bounded. Add a perf canary that asserts P95 chart frame time < 16 ms during the load test. |
| SQLite write amplification (4×–10× row count) | Low | Med | Retention cap at 1 000 buckets per (symbol, bucket_ms). Eviction job already proven by `tickRecorder`. WAL mode handles concurrent reads. |
| User confusion ("why doesn't equity show 250ms?") | High | Low | Disabled-button + tooltip pattern. Also: add a one-time onboarding tooltip on the first crypto chart view that explains the constraint. |
| Data integrity — sub-second candles drift from broker truth | Low | High | Sub-second buckets are aggregated from the same `kind === 't'` trade frames the 1-second pipeline already uses. No new data source. The integrity invariant (only `kind === 't'` updates volume/VWAP) carries through unchanged. |
| Replay incompatibility | Low | Low | Sub-second is live-only in v0.5; replay still shows 1-second candles for crypto. Acceptable for the initial release. |
| Power-event lifecycle (laptop suspend mid-bucket) | Med | Med | Reuse the v0.4.3 B11 pattern — `powerMonitor` events trigger `aggregator.forceRoll(symbol)` so the in-flight bucket is sealed before suspend. Wake-up opens fresh buckets. |

---

## 6. Implementation plan (if approved)

### Sprint 1 — Aggregator + storage + tests (3 days)

1. `src/main/services/subsecond-aggregator.ts` — pure class with vitest cases.
2. `src/main/services/persistence.ts` — additive table migration.
3. Wire aggregator into `live-market.ts` for `assetClass === 'crypto'` symbols only.
4. `src/main/services/subsecond-aggregator.test.ts` — bucket math, force-roll, retention.

**Exit gate:** 95%+ test coverage on the aggregator, no impact on existing 164/164 tests.

### Sprint 2 — Renderer integration + UI toggle (3 days)

1. New IPC channels in `ipc-channels.ts`, preload bindings.
2. `CHART_TIMEFRAMES` += `['250ms', '500ms']` with `CHART_TIMEFRAME_MS` map.
3. ChartPanel timeframe button conditional rendering + tooltip copy.
4. New store: `useSubSecondCandlesStore` or extend `marketStore` (TBD — bias toward extending to avoid sprawl).

**Exit gate:** Manual QA on BTC chart with 250 ms toggle. Frame time P95 < 16 ms across 5-minute scalp session.

### Sprint 3 — Performance tuning + retention enforcement (2 days)

1. Retention eviction job on a 60-second cadence (`tickRecorder` pattern).
2. ✅ **Delivered (v0.6, 2026-05-23)** — Perf canary, generalised to a renderer frame-budget
   harness (`tests/e2e/renderer-perf.spec.ts`). Asserts p50 ≤ 16 ms + p95 ≤ 10 ms on the Trade
   `ChartPanel` under simulator load (TICK_HZ=20 supplies the "20 trades/sec"). See
   `docs/design/2026-05-22-renderer-perf-budget.md`.
3. Telemetry — log the sub-second emit rate at INFO once per minute so we
   can spot pathological symbols in production logs.

**Exit gate:** v0.5 release-candidate build with sub-second mode opt-in via
the timeframe button. CHANGELOG entry. Memory budget check — heap delta <
20 MB at steady state across a 1-hour session.

---

## Open questions

1. **Should we expose 100 ms?** Alpaca crypto WS arrivals can be faster than
   100 ms during volatile prints. Lower bound risks degenerate empty
   buckets when traffic is calm. Recommend: hold at 250 ms / 500 ms for
   v0.5, revisit if user feedback demands it.
2. **MAY-TACTICS integration.** The scalp tactic pre-existed as a stub.
   Does it consume the sub-second feed in v0.5 or does v0.5 ship as
   "data layer only" and v0.6 wires the tactic? Recommend: data layer
   only, prove the renderer holds, then integrate.
3. **Replay sub-second.** Punted to v0.6. Confirm scope by §5 risk.

---

*Reviewed checklist (fill before merging):*

- [ ] CEO review for scope/ambition (v0.5 framing)
- [ ] Eng review for IPC + persistence design
- [ ] Performance review with target hardware (i7-1185G7 / Win11)
- [ ] Risk-gates owner sign-off on feed-integrity invariants
