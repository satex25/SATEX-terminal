# Data-Feed Switch (Simulator ⇄ Live Alpaca) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-click TopBar control that switches the market data feed between the synthetic `MarketSimulator` and the live Alpaca (paper) data feed at runtime, with reset-to-clean OrderManager reconciliation, a transactional `prepare→commit` swap, a paper-safe interlock, and a UI control unmistakably distinct from the real-capital toggle.

**Architecture:** A new `engine.setDataSource()` reuses the proven `installMarketWiring()`/`uninstallMarketWiring()` primitives (Replay's swap mechanism) and reconciles the `OrderManager` (reset-to-clean paper on →Sim; `syncFromAlpaca` on →Live). Exposed via two IPC channels + a Zustand store + a TopBar source chip. The fallible part (Alpaca connect) runs in `prepare` before any teardown, so a failed switch is a no-op.

**Tech Stack:** TypeScript, Electron main/preload, React 18 + Zustand, Vitest (Node env), Playwright (`_electron`), Zod (IPC validation).

**Spec:** `docs/design/2026-05-24-data-feed-switch.md`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/main/services/order-manager.ts` | Add `resetToPaper()` — the clean-sandbox reset. | Modify |
| `src/main/services/order-manager.test.ts` | `resetToPaper` unit tests. | Modify |
| `src/shared/types.ts` | `DataSource`, `DataSourceStatus`, `DataSourceSetRequest` types. | Modify |
| `src/shared/ipc-schemas.ts` | `DataSourceSetReq` Zod schema. | Modify |
| `src/shared/ipc-channels.ts` | `DATA_SOURCE_GET` / `DATA_SOURCE_SET` channel ids. | Modify |
| `src/main/core/trading-engine.ts` | `dataSource` field, `switchingSource` flag, `setDataSource()`, `getDataSource()`, `submitOrder` gate. | Modify |
| `src/main/core/trading-engine.test.ts` | `setDataSource` unit tests (new file if absent). | Create/Modify |
| `src/main/index.ts` | Register the two IPC handlers. | Modify |
| `src/preload/index.ts` | Bind the two channels. | Modify |
| `src/renderer/stores/dataSourceStore.ts` | Zustand store for `{ source, liveAvailable, switching }`. | Create |
| `src/renderer/components/FeedSwitch.tsx` | The source chip + confirm modal. | Create |
| `src/renderer/components/TopBar.tsx` | Mount `<FeedSwitch/>` right of the PAPER/LIVE toggle. | Modify |
| `src/renderer/globals.css` | `.bb-feed-chip` styles (cyan; distinct from amber). | Modify |
| `tests/e2e/feed-switch.spec.ts` | Opt-in: switch round-trip smoke. | Create |
| `tests/e2e/creds-persistence.spec.ts` | Opt-in: creds survive relaunch. | Create |
| `CHANGELOG.md`, `CLAUDE.md` | Document the feature. | Modify |

**Conventions:** vitest runs in Node env (no jsdom) — main-process + pure logic test cleanly; renderer stores test as plain modules. IPC handlers use `register(IPC.X, validated(Schema, fn))`. Preload uses `ipcRenderer.invoke`. The engine already broadcasts `FEED_STATUS_UPDATE` + `ACCOUNT_UPDATE` on `onFeedStatus` / account changes.

---

## Task 1: `OrderManager.resetToPaper()` (the clean-sandbox reset)

**Files:**
- Modify: `src/main/services/order-manager.ts` (add method after `setSessionStartEquity`, ~line 116)
- Test: `src/main/services/order-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/main/services/order-manager.test.ts`:

```ts
describe('resetToPaper — clean-sandbox reset for the data-feed switch', () => {
  it('clears positions + orders and restores a fresh paper account', () => {
    const om = new OrderManager(50_000)
    const o = om.createOrder({ symbol: 'NVDA', side: 'buy', type: 'market', quantity: 10 })
    om.fillOrder(o.id, 100)
    expect(om.getPosition('NVDA')).toBeDefined()

    om.resetToPaper(100_000)

    expect(om.getPosition('NVDA')).toBeUndefined()
    expect(om.getOrders()).toEqual([])
    const a = om.getAccount()
    expect(a.equity).toBe(100_000)
    expect(a.cash).toBe(100_000)
    expect(a.buyingPower).toBe(100_000 * 2)   // BUYING_POWER_MULT
    expect(a.dailyPnl).toBe(0)
    expect(a.mode).toBe('paper')
    expect(a.openPositions).toEqual([])
  })

  it('defaults to DEFAULT_EQUITY when no argument given', () => {
    const om = new OrderManager(50_000)
    om.resetToPaper()
    expect(om.getAccount().equity).toBe(100_000)   // DEFAULT_EQUITY
  })

  it('preserves an armed kill switch (a reset must never silently re-enable trading)', () => {
    const om = new OrderManager()
    om.armKillSwitch('test')
    om.resetToPaper()
    expect(om.getAccount().killSwitchArmed).toBe(true)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run src/main/services/order-manager.test.ts`
Expected: FAIL — `om.resetToPaper is not a function`.

- [ ] **Step 3: Implement `resetToPaper`**

In `src/main/services/order-manager.ts`, after `setSessionStartEquity` (~line 116) add:

```ts
  /** Reset to a fresh paper sandbox — used by the data-feed switch when
   *  entering Simulator. Clears all positions + orders and rebuilds the
   *  account at `startingEquity`. The kill-switch latch is intentionally
   *  PRESERVED: a feed swap must never silently re-enable trading. */
  resetToPaper(startingEquity = DEFAULT_EQUITY): void {
    this.positions.clear()
    this.orders.clear()
    this.sessionStartEquity = startingEquity
    this.account = {
      equity:           startingEquity,
      cash:             startingEquity,
      buyingPower:      startingEquity * BUYING_POWER_MULT,
      openPositions:    [],
      dailyPnl:         0,
      dailyLossLimitPct: DAILY_LOSS_LIMIT_PCT,
      mode:             'paper',
      killSwitchArmed:  this.account.killSwitchArmed,
      sessionStartedAt: Date.now(),
    }
  }
```

(`DEFAULT_EQUITY`, `BUYING_POWER_MULT`, `DAILY_LOSS_LIMIT_PCT` are already imported at the top of the file.)

- [ ] **Step 4: Run — verify PASS**

Run: `npx vitest run src/main/services/order-manager.test.ts` → PASS (3 new tests).

- [ ] **Step 5: Commit**

```powershell
git add src/main/services/order-manager.ts src/main/services/order-manager.test.ts
git commit -m "feat(feed-switch): OrderManager.resetToPaper clean-sandbox reset"
```

---

## Task 2: Shared types + Zod schema + channel ids

**Files:**
- Modify: `src/shared/types.ts`, `src/shared/ipc-schemas.ts`, `src/shared/ipc-channels.ts`

No standalone test (consumed + type-checked by later tasks; the schema is exercised by the IPC tests indirectly and `npm run typecheck`).

- [ ] **Step 1: Add types**

In `src/shared/types.ts` add:

```ts
export type DataSource = 'simulator' | 'live'

export interface DataSourceStatus {
  source: DataSource
  /** True when Alpaca paper creds are stored — i.e. 'live' is selectable. */
  liveAvailable: boolean
  /** True while a swap is in flight (chip shows a spinner, clicks ignored). */
  switching: boolean
}

export interface DataSourceSetRequest { target: DataSource }
```

- [ ] **Step 2: Add the Zod schema**

In `src/shared/ipc-schemas.ts` (match the file's existing `import { z } from 'zod'` + export style, e.g. `SubsecondPrefsSetReq`):

```ts
export const DataSourceSetReq = z.object({
  target: z.enum(['simulator', 'live']),
}).strict()
```

- [ ] **Step 3: Add channel ids**

In `src/shared/ipc-channels.ts`, in the `IPC` object (near `LIVE_MODE_GET`/`SET`):

```ts
  DATA_SOURCE_GET: 'satex:dataSource:get',
  DATA_SOURCE_SET: 'satex:dataSource:set',
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` → 0 errors.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/types.ts src/shared/ipc-schemas.ts src/shared/ipc-channels.ts
git commit -m "feat(feed-switch): shared DataSource types + IPC schema + channel ids"
```

---

## Task 3: `evaluateDataSourceSwitch` — the pure interlock guard (safety-critical, unit-tested)

The `TradingEngine` is heavy to construct (db, electron paths), so the swap *mechanics* are verified by E2E (Task 8). But the **interlock decision** is safety-critical, so it's extracted into a pure function that IS unit-tested here — the same "keep the testable logic out of the hard-to-test shell" pattern used for the perf canary's `summarizeFrames`.

**Files:**
- Create: `src/main/core/data-source-guard.ts`
- Test: `src/main/core/data-source-guard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/main/core/data-source-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluateDataSourceSwitch } from './data-source-guard'

const base = { current: 'simulator', target: 'live', replayActive: false, realCapitalArmed: false, paperCredsPresent: true } as const

describe('evaluateDataSourceSwitch — feed-switch interlocks', () => {
  it('allows a valid sim→live switch when paper creds exist', () => {
    expect(evaluateDataSourceSwitch({ ...base })).toEqual({ ok: true })
  })
  it('no-ops when already on the target', () => {
    expect(evaluateDataSourceSwitch({ ...base, target: 'simulator' })).toEqual({ ok: true, noop: true })
  })
  it('refuses while replay is active', () => {
    const r = evaluateDataSourceSwitch({ ...base, replayActive: true })
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/replay/i)
  })
  it('refuses while real-capital is armed (paper-safe interlock)', () => {
    const r = evaluateDataSourceSwitch({ ...base, realCapitalArmed: true })
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/real-capital|LIVE/i)
  })
  it('refuses sim→live when paper creds are absent', () => {
    const r = evaluateDataSourceSwitch({ ...base, paperCredsPresent: false })
    expect(r.ok).toBe(false); expect(r.reason).toMatch(/keys|Settings/i)
  })
  it('allows live→sim even with no creds and does not require creds', () => {
    expect(evaluateDataSourceSwitch({ current: 'live', target: 'simulator', replayActive: false, realCapitalArmed: false, paperCredsPresent: false })).toEqual({ ok: true })
  })
  it('replay interlock takes precedence over a missing-creds refusal', () => {
    const r = evaluateDataSourceSwitch({ ...base, replayActive: true, paperCredsPresent: false })
    expect(r.reason).toMatch(/replay/i)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

Run: `npx vitest run src/main/core/data-source-guard.test.ts`
Expected: FAIL — cannot find `./data-source-guard`.

- [ ] **Step 3: Implement the guard**

Create `src/main/core/data-source-guard.ts`:

```ts
import type { DataSource } from '@shared/types'

export interface DataSourceSwitchState {
  current:           DataSource
  target:            DataSource
  replayActive:      boolean
  realCapitalArmed:  boolean
  paperCredsPresent: boolean
}

/** Pure interlock decision for a data-feed switch. Order of precedence:
 *  already-on → replay → real-capital → missing-creds. No I/O. */
export function evaluateDataSourceSwitch(s: DataSourceSwitchState): { ok: boolean; reason?: string; noop?: boolean } {
  if (s.current === s.target) return { ok: true, noop: true }
  if (s.replayActive)         return { ok: false, reason: 'Stop replay before switching the data feed.' }
  if (s.realCapitalArmed)     return { ok: false, reason: 'Disarm ● LIVE real-capital mode before switching the data feed.' }
  if (s.target === 'live' && !s.paperCredsPresent)
                              return { ok: false, reason: 'Add Alpaca paper keys in Settings → Data Source first.' }
  return { ok: true }
}
```

- [ ] **Step 4: Run — verify PASS** (`npx vitest run src/main/core/data-source-guard.test.ts` → 7 pass)

- [ ] **Step 5: Commit**

```powershell
git add src/main/core/data-source-guard.ts src/main/core/data-source-guard.test.ts
git commit -m "feat(feed-switch): pure interlock guard for the data-feed switch + tests"
```

---

## Task 4: `engine.setDataSource()` / `getDataSource()` + swap mechanics

**Files:**
- Modify: `src/main/core/trading-engine.ts`

No unit test here (the engine isn't unit-constructable; behavior is verified by the Task 8 E2E). The safety-critical interlock is already unit-tested via Task 3's guard. Verified locally by `typecheck` + `lint`.

- [ ] **Step 1: Add fields + import**

Add to the imports (near line 51-52, alongside `live-mode`/`alpaca-mode` imports):

```ts
import { evaluateDataSourceSwitch } from './data-source-guard'
import { getAlpacaCreds } from '../services/credential-store'   // if not already imported
import type { DataSource, DataSourceStatus } from '@shared/types'
```

Add class fields (near `private market!: MarketDataSource`, ~line 128):

```ts
  private dataSource: DataSource = 'simulator'
  private switchingSource = false
```

- [ ] **Step 2: Set `dataSource` in `initialize()`**

In `initialize()`, right after the market source is chosen (after the `if (!useAlpaca) {…} else {…}` block, ~line 434, before `installMarketWiring`):

```ts
    this.dataSource = useAlpaca ? 'live' : 'simulator'
```

- [ ] **Step 3: Gate `submitOrder` during a switch**

In `submitOrder` (~line 813), immediately after the existing `if (this.replay) {…}` gate, add:

```ts
    if (this.switchingSource)
      return { ok: false, reason: 'Data feed is switching — retry in a moment.' }
```

- [ ] **Step 4: Add `getDataSource()` + `setDataSource()`**

Add as public methods (near the other status getters, e.g. after `getAlpacaModeStatus`, ~line 1009):

```ts
  getDataSource(): DataSourceStatus {
    return {
      source:        this.dataSource,
      liveAvailable: !!getAlpacaCreds('paper'),
      switching:     this.switchingSource,
    }
  }

  /** Runtime swap between the synthetic simulator and the live Alpaca (paper)
   *  data feed. Structured as PREPARE (fallible — Alpaca REST auth) → COMMIT
   *  (local, atomic). On any failure the engine is never left source-less. */
  async setDataSource(target: DataSource): Promise<{ ok: boolean; reason?: string; source?: DataSource }> {
    const verdict = evaluateDataSourceSwitch({
      current:           this.dataSource,
      target,
      replayActive:      !!this.replay,
      realCapitalArmed:  isLive() || getAlpacaMode() === 'live',
      paperCredsPresent: !!getAlpacaCreds('paper'),
    })
    if (!verdict.ok)   return { ok: false, reason: verdict.reason }
    if (verdict.noop)  return { ok: true, source: target }

    this.switchingSource = true
    this.regime?.pause()
    this.recorder?.pause()
    let toreDown = false
    try {
      if (target === 'live') {
        // PREPARE (fallible): REST auth happens BEFORE any teardown.
        const creds = getAlpacaCreds('paper')!
        const alpaca = new AlpacaClient({
          keyId: creds.keyId, secretKey: creds.secretKey,
          baseUrl: resolveBaseUrl(env.alpacaBaseUrl), dataUrl: env.alpacaDataUrl, feed: creds.feed,
        })
        const acct = await alpaca.getAccount()
        const positions = await alpaca.getPositions()
        // COMMIT (local): tear down old, reconcile to broker truth, wire new.
        this.uninstallMarketWiring(); toreDown = true
        try { (this.market as MarketDataSource & { stop?: () => void }).stop?.() } catch { /* ignore */ }
        this.alpaca = alpaca
        this.alpaca.onTradeUpdate((u) => this.onAlpacaTradeUpdate(u))
        this.om.syncFromAlpaca({ equity: acct.equity, cash: acct.cash, buyingPower: acct.buyingPower }, positions)
        this.om.setSessionStartEquity(acct.equity)
        this.market = new LiveMarket(alpaca)
      } else {
        // → Simulator: no fallible prep; tear down + reset to clean paper.
        this.uninstallMarketWiring(); toreDown = true
        try { (this.market as MarketDataSource & { stop?: () => void }).stop?.() } catch { /* ignore */ }
        this.alpaca = null
        this.om.resetToPaper(DEFAULT_EQUITY)
        this.market = new MarketSimulator(env.rngSeed ?? undefined)
      }
      this.dataSource = target
      this.installMarketWiring(this.market)
      await (this.market as MarketDataSource & { start: () => void | Promise<void> }).start()
      this.marketSubs.push(this.market.onQuotes(q => this.recorder?.ingest(q)))
      this.regime?.resume()
      this.recorder?.resume()
      this.switchingSource = false
      this.seedBroadcastDone = false
      this.broadcastInitialSeed()
      this.broadcastFeedStatus()   // ← fires onFeedStatus → FEED_STATUS_UPDATE (verify exact private name)
      log.info('data source switched', { source: target })
      return { ok: true, source: target }
    } catch (err) {
      // PREPARE failure → nothing torn down, old source intact (clean no-op).
      // COMMIT/start failure after teardown → fall back to a fresh simulator so
      // the engine is never source-less (sim construction/start is local).
      if (toreDown) {
        this.alpaca = null
        this.om.resetToPaper(DEFAULT_EQUITY)
        this.market = new MarketSimulator(env.rngSeed ?? undefined)
        this.dataSource = 'simulator'
        this.installMarketWiring(this.market)
        try { await (this.market as MarketDataSource & { start: () => void | Promise<void> }).start() } catch { /* sim start is local */ }
        this.marketSubs.push(this.market.onQuotes(q => this.recorder?.ingest(q)))
        this.seedBroadcastDone = false
        this.broadcastInitialSeed()
        this.broadcastFeedStatus()
      }
      this.regime?.resume()
      this.recorder?.resume()
      this.switchingSource = false
      log.warn('data source switch failed', { target, toreDown, err: String(err) })
      return { ok: false, reason: `Could not switch to ${target}: ${String(err)}` }
    }
  }
```

**Verification notes for the implementer (existing-API names to confirm against the file):**
- `env` access: `initialize()` reads a local `env` (from `loadEnv()`). If the engine doesn't already keep it on the instance, persist it (`this.env = env`) in `initialize()` and use `this.env` here. (`MarketSimulator` tolerates `new MarketSimulator(undefined)`.)
- `this.broadcastFeedStatus()` — use the engine's existing feed-status emitter (the one behind `onFeedStatus`/`getFeedStatus`); confirm its exact name (it may be private/named differently). Falls into `feedStatusListeners` (`:228`).
- `alpaca.getPositions()` — confirm the method name on `AlpacaClient` (paired with the confirmed `getAccount()` at `alpaca.ts:208`); the live-mode account-sync path already fetches positions, so reuse that if a helper exists.

- [ ] **Step 5: Typecheck + lint + full unit suite**

Run: `npm run typecheck` → 0 errors
Run: `npm run lint` → 0 warnings/errors
Run: `npm test` → all green (no new unit tests here; Task 1 + Task 3 tests pass)

- [ ] **Step 6: Commit**

```powershell
git add src/main/core/trading-engine.ts
git commit -m "feat(feed-switch): engine.setDataSource prepare->commit swap + submitOrder gate"
```

---

## Task 5: IPC handlers + preload bindings

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts` (+ the `window.satex` type decl wherever it lives)

Verified by `typecheck` + the Task 8 E2E (which calls these over real IPC).

- [ ] **Step 1: Register the main-process handlers**

In `src/main/index.ts`, near the Live-mode handlers (~line 794), add (and add `DataSourceSetReq` to the `ipc-schemas` import):

```ts
  // ── Data feed (Simulator ⇄ Live Alpaca data) ─────────────────────────────────
  register(IPC.DATA_SOURCE_GET, ()                                  => engine.getDataSource())
  register(IPC.DATA_SOURCE_SET, validated(DataSourceSetReq, (req)   => engine.setDataSource(req.target)))
```

- [ ] **Step 2: Bind in preload**

In `src/preload/index.ts`, in the exposed API object (near `setLiveMode`, ~line 78):

```ts
  getDataSource: ()                          => ipcRenderer.invoke(IPC.DATA_SOURCE_GET) as Promise<import('@shared/types').DataSourceStatus>,
  setDataSource: (req: import('@shared/types').DataSourceSetRequest) => ipcRenderer.invoke(IPC.DATA_SOURCE_SET, req) as Promise<{ ok: boolean; reason?: string; source?: import('@shared/types').DataSource }>,
```

Add the same two method signatures to the `window.satex` type declaration (the interface the preload `contextBridge.exposeInMainWorld` is typed against — find it next to the existing `setLiveMode` signature and mirror it).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` → 0 errors (confirms the preload types + engine method line up).

- [ ] **Step 4: Commit**

```powershell
git add src/main/index.ts src/preload/index.ts
git commit -m "feat(feed-switch): IPC handlers + preload bindings for data-source get/set"
```

---

## Task 6: Renderer `dataSourceStore`

**Files:**
- Create: `src/renderer/stores/dataSourceStore.ts`
- Test: `src/renderer/stores/dataSourceStore.test.ts`

- [ ] **Step 1: Write the failing test** (Node env; stub `window.satex`)

Create `src/renderer/stores/dataSourceStore.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDataSourceStore } from './dataSourceStore'

beforeEach(() => {
  useDataSourceStore.setState({ source: 'simulator', liveAvailable: true, switching: false })
})
afterEach(() => vi.unstubAllGlobals())

describe('dataSourceStore.setSource', () => {
  it('no-ops when already on the target (no IPC call)', async () => {
    const setDataSource = vi.fn()
    vi.stubGlobal('window', { satex: { setDataSource } })
    const res = await useDataSourceStore.getState().setSource('simulator')
    expect(res.ok).toBe(true)
    expect(setDataSource).not.toHaveBeenCalled()
  })

  it('calls IPC and adopts the returned source on success', async () => {
    vi.stubGlobal('window', { satex: { setDataSource: vi.fn().mockResolvedValue({ ok: true, source: 'live' }) } })
    const res = await useDataSourceStore.getState().setSource('live')
    expect(res.ok).toBe(true)
    expect(useDataSourceStore.getState().source).toBe('live')
    expect(useDataSourceStore.getState().switching).toBe(false)
  })

  it('stays on the prior source + clears switching on refusal', async () => {
    vi.stubGlobal('window', { satex: { setDataSource: vi.fn().mockResolvedValue({ ok: false, reason: 'blocked' }) } })
    const res = await useDataSourceStore.getState().setSource('live')
    expect(res).toEqual({ ok: false, reason: 'blocked' })
    expect(useDataSourceStore.getState().source).toBe('simulator')
    expect(useDataSourceStore.getState().switching).toBe(false)
  })
})
```

- [ ] **Step 2: Run — verify FAIL** (`npx vitest run src/renderer/stores/dataSourceStore.test.ts` → cannot find module)

- [ ] **Step 3: Implement the store**

Create `src/renderer/stores/dataSourceStore.ts`:

```ts
import { create } from 'zustand'
import type { DataSource } from '@shared/types'

interface DataSourceState {
  source:        DataSource
  liveAvailable: boolean
  switching:     boolean
  hydrate:   () => Promise<void>
  setSource: (target: DataSource) => Promise<{ ok: boolean; reason?: string }>
}

export const useDataSourceStore = create<DataSourceState>((set, get) => ({
  source: 'simulator',
  liveAvailable: false,
  switching: false,

  hydrate: async () => {
    const s = await window.satex.getDataSource()
    set({ source: s.source, liveAvailable: s.liveAvailable, switching: s.switching })
  },

  setSource: async (target) => {
    if (get().switching || get().source === target) return { ok: true }
    set({ switching: true })
    try {
      const res = await window.satex.setDataSource({ target })
      set(res.ok && res.source ? { source: res.source, switching: false } : { switching: false })
      return { ok: res.ok, reason: res.reason }
    } catch (e) {
      set({ switching: false })
      return { ok: false, reason: String(e) }
    }
  },
}))
```

- [ ] **Step 4: Run — verify PASS** (`npx vitest run src/renderer/stores/dataSourceStore.test.ts` → 3 pass)

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/stores/dataSourceStore.ts src/renderer/stores/dataSourceStore.test.ts
git commit -m "feat(feed-switch): dataSourceStore (hydrate + optimistic setSource)"
```

---

## Task 7: `FeedSwitch` chip + confirm dialog + TopBar mount

**Files:**
- Create: `src/renderer/components/FeedSwitch.tsx`
- Modify: `src/renderer/components/TopBar.tsx`, `src/renderer/globals.css`

Verified by `typecheck` + `lint` + the Task 8 E2E. Self-contained (inlines a minimal confirm dialog + error line — no dependency on a generic modal component).

- [ ] **Step 1: Create the component**

Create `src/renderer/components/FeedSwitch.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useDataSourceStore } from '../stores/dataSourceStore'
import { useAccountStore } from '../stores/accountStore'

export function FeedSwitch() {
  const { source, liveAvailable, switching, hydrate, setSource } = useDataSourceStore()
  const openPositions = useAccountStore(s => s.account?.openPositions?.length ?? 0)
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { void hydrate() }, [hydrate])

  const onLive = source === 'live'
  const disabled = switching || (!onLive && !liveAvailable)

  async function doSwitch(target: 'simulator' | 'live') {
    setErr(null)
    const res = await setSource(target)
    if (!res.ok && res.reason) setErr(res.reason)
  }

  function handleClick() {
    if (disabled) return
    const target: 'simulator' | 'live' = onLive ? 'simulator' : 'live'
    if (target === 'live' && openPositions > 0) { setConfirm(true); return }
    void doSwitch(target)
  }

  return (
    <>
      <button
        type="button"
        className={`bb-feed-chip ${onLive ? 'live' : 'sim'}${switching ? ' switching' : ''}`}
        onClick={handleClick}
        disabled={disabled}
        aria-label={`Data feed: ${onLive ? 'live Alpaca' : 'simulator'}. Click to switch.`}
        title={
          switching ? 'Switching data feed…'
            : !onLive && !liveAvailable ? 'Add Alpaca paper keys in Settings → Data Source to enable the live feed'
            : onLive ? 'Live Alpaca paper data — click to return to the simulator'
            : 'Simulated data — click to switch to the live Alpaca feed'
        }
      >
        <span className="bb-feed-mark" aria-hidden="true">{onLive ? '◆' : '◇'}</span>
        {onLive ? 'ALPACA' : 'SIM DATA'}
      </button>

      {confirm && (
        <div className="bb-feed-confirm-backdrop" role="dialog" aria-modal="true" onClick={() => setConfirm(false)}>
          <div className="bb-feed-confirm" onClick={(e) => e.stopPropagation()}>
            <p>Switch to the live Alpaca data feed?<br />Your simulated paper positions will be cleared.</p>
            <div className="bb-feed-confirm-actions">
              <button type="button" onClick={() => setConfirm(false)}>Cancel</button>
              <button type="button" className="bb-feed-confirm-go" onClick={() => { setConfirm(false); void doSwitch('live') }}>Switch to live</button>
            </div>
          </div>
        </div>
      )}

      {err && <span className="bb-feed-err" role="alert" title={err} onClick={() => setErr(null)}>⚠ {err}</span>}
    </>
  )
}
```

*(Verify the `accountStore` accessor: `useAccountStore(s => s.account?.openPositions?.length ?? 0)` — `Account.openPositions` is `Position[]`. Match the store's actual shape.)*

- [ ] **Step 2: Add styles**

In `src/renderer/globals.css` add (cyan accent — deliberately NOT the amber `.bb-live` of the money toggle):

```css
.bb-feed-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font: 600 11px/1 ui-monospace, 'JetBrains Mono', monospace; letter-spacing: .06em;
  padding: 5px 11px; border-radius: 6px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--bb-accent) 45%, transparent);
  color: var(--bb-accent); background: color-mix(in srgb, var(--bb-accent) 8%, transparent);
}
.bb-feed-chip.live { background: color-mix(in srgb, var(--bb-accent) 16%, transparent); }
.bb-feed-chip:disabled { opacity: .45; cursor: not-allowed; }
.bb-feed-chip.switching { opacity: .7; }
.bb-feed-mark { font-size: 12px; line-height: 1; }
.bb-feed-err { color: var(--bb-neg); font-size: 11px; margin-left: 8px; cursor: pointer; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-feed-confirm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.bb-feed-confirm { background: var(--bb-surf-1, #14141a); border: 1px solid var(--bb-line, rgba(255,255,255,.14)); border-radius: 10px; padding: 20px 22px; max-width: 380px; color: var(--bb-txt, #e8e8ec); font-size: 13px; }
.bb-feed-confirm-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
.bb-feed-confirm-actions button { padding: 6px 14px; border-radius: 6px; border: 1px solid var(--bb-line, rgba(255,255,255,.18)); background: transparent; color: var(--bb-txt-dim, #9a9aa4); cursor: pointer; font: inherit; }
.bb-feed-confirm-go { border-color: color-mix(in srgb, var(--bb-accent) 55%, transparent) !important; color: var(--bb-accent) !important; }
```

- [ ] **Step 3: Mount in TopBar**

In `src/renderer/components/TopBar.tsx`: add `import { FeedSwitch } from './FeedSwitch'` with the other imports, then insert **immediately after** the `.bb-mode-toggle` `</div>` (the PAPER/LIVE block ends ~line 317) and **before** the `{/* Status pills */}` block (~line 319):

```tsx
      <span className="bb-vrule" />
      <FeedSwitch />
```

- [ ] **Step 4: Gate checks**

Run: `npm run typecheck` → 0 errors
Run: `npm run lint` → 0 warnings/errors
Run: `npm test` → store test + all prior green

- [ ] **Step 5: Commit**

```powershell
git add src/renderer/components/FeedSwitch.tsx src/renderer/components/TopBar.tsx src/renderer/globals.css
git commit -m "feat(feed-switch): TopBar source chip + confirm dialog (mockup C)"
```

---

## Task 8: E2E — feed-switch round-trip + rollback (opt-in)

**Files:**
- Create: `tests/e2e/feed-switch.spec.ts`

Mirrors the perf-canary E2E conventions: isolated throwaway `--user-data-dir`, offscreen window (no focus theft). Drives the real engine over IPC via `window.satex`. A successful **→live** swap needs valid Alpaca paper creds (manual QA); this E2E covers everything testable without them — including the **rollback** path using deliberately-bad creds (real Alpaca 401 → `prepare` fails → stays on Simulator).

- [ ] **Step 1: Create the spec**

Create `tests/e2e/feed-switch.spec.ts`:

```ts
/**
 * SATEX data-feed switch E2E (opt-in). Boots isolated + offscreen under the
 * simulator and exercises the data-source IPC: boot state, no-creds refusal,
 * no-op, and the transactional rollback (bad creds → Alpaca 401 → stays on Sim).
 *   $env:SATEX_E2E_FEED='1'; npx playwright test tests/e2e/feed-switch.spec.ts
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import os from 'os'
import { existsSync, mkdtempSync, rmSync } from 'fs'

const ENABLED    = process.env['SATEX_E2E_FEED'] === '1'
const MAIN_ENTRY = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

test.describe('data-feed switch', () => {
  test.skip(!ENABLED, 'set SATEX_E2E_FEED=1 to run')

  test('boot state, no-creds refusal, no-op, and rollback', async () => {
    test.setTimeout(90_000)
    if (!existsSync(MAIN_ENTRY)) throw new Error('out/main/index.js missing. Run `npm run build` first.')
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'satex-feed-'))
    let app: ElectronApplication | null = null
    const errors: string[] = []
    try {
      app = await electron.launch({
        args: [MAIN_ENTRY, `--user-data-dir=${tmp}`],
        env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production', SATEX_VAULT_ROOT: path.join(tmp, 'vault') },
        timeout: 30_000,
      })
      await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) { try { w.setPosition(-4000,-4000); w.setOpacity(0); w.setSkipTaskbar(true) } catch { /* ignore */ } } })
      const win: Page = await app.firstWindow({ timeout: 20_000 })
      win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      win.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
      await win.waitForLoadState('domcontentloaded', { timeout: 20_000 })
      await win.locator('.bb-watchlist-row').first().waitFor({ state: 'visible', timeout: 20_000 })

      const ds = () => win.evaluate(() => (window as unknown as { satex: { getDataSource(): Promise<{ source: string; liveAvailable: boolean }> } }).satex.getDataSource())
      const set = (target: 'simulator' | 'live') => win.evaluate((t) => (window as unknown as { satex: { setDataSource(r: { target: string }): Promise<{ ok: boolean; reason?: string }> } }).satex.setDataSource({ target: t }), target)

      // Boot = simulator, no creds → live unavailable.
      expect((await ds()).source).toBe('simulator')
      expect((await ds()).liveAvailable).toBe(false)

      // → live refused with no creds; stays on sim.
      const noCreds = await set('live')
      expect(noCreds.ok).toBe(false)
      expect(noCreds.reason ?? '').toMatch(/keys|Settings/i)
      expect((await ds()).source).toBe('simulator')

      // → simulator is a no-op.
      expect((await set('simulator')).ok).toBe(true)

      // Seed BAD paper creds → live becomes "available" → switch attempts a real
      // Alpaca connect → 401 → prepare fails → ROLLBACK leaves us on simulator.
      const saved = await win.evaluate(() => (window as unknown as { satex: { setCredentials(r: unknown): Promise<{ ok: boolean }> } }).satex.setCredentials({ keyId: 'FAKE_KEY_ID', secretKey: 'FAKE_SECRET', feed: 'iex', mode: 'paper' }))
      if (saved.ok) {
        expect((await ds()).liveAvailable).toBe(true)
        const rolled = await set('live')
        expect(rolled.ok).toBe(false)                 // Alpaca rejected the fake creds
        expect((await ds()).source).toBe('simulator') // never left the prior source
      } else {
        console.log('[feed-switch] safeStorage unavailable — skipped the rollback sub-test')
      }

      expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([])
    } finally {
      if (app) { try { await app.close() } catch { /* ignore */ } }
      try { rmSync(tmp, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })
})
```

- [ ] **Step 2: Build + run**

Run: `npm run build`
Run: `$env:SATEX_E2E_FEED='1'; npx playwright test tests/e2e/feed-switch.spec.ts`
Expected: PASS. If `.bb-watchlist-row` selector or `window.satex` method names differ, adjust to the real DOM/API (a one-time empirical check, same as the canary).

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/feed-switch.spec.ts
git commit -m "test(feed-switch): E2E — boot state, no-creds refusal, no-op, rollback"
```

---

## Task 9: E2E — credential persistence across relaunch (opt-in) — the §4 verification

**Files:**
- Create: `tests/e2e/creds-persistence.spec.ts`

Proves the user's requirement: stored Alpaca keys survive close/relaunch, so the live feed stays available. Reuses **one** temp profile across **two** launches.

- [ ] **Step 1: Create the spec**

Create `tests/e2e/creds-persistence.spec.ts`:

```ts
/**
 * SATEX credential-persistence E2E (opt-in). Saves Alpaca paper creds, closes,
 * relaunches the SAME profile, and asserts the creds (and live-feed availability)
 * survived — the safeStorage round-trip that no unit test can cover.
 *   $env:SATEX_E2E_FEED='1'; npx playwright test tests/e2e/creds-persistence.spec.ts
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import os from 'os'
import { existsSync, mkdtempSync, rmSync } from 'fs'

const ENABLED    = process.env['SATEX_E2E_FEED'] === '1'
const MAIN_ENTRY = path.join(__dirname, '..', '..', 'out', 'main', 'index.js')

async function launch(profile: string): Promise<ElectronApplication> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${profile}`],
    env: { ...process.env, USE_SIMULATOR: 'true', NODE_ENV: 'production', SATEX_VAULT_ROOT: path.join(profile, 'vault') },
    timeout: 30_000,
  })
  await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) { try { w.setPosition(-4000,-4000); w.setOpacity(0); w.setSkipTaskbar(true) } catch { /* ignore */ } } })
  return app
}

test.describe('credential persistence across relaunch', () => {
  test.skip(!ENABLED, 'set SATEX_E2E_FEED=1 to run')

  test('saved Alpaca paper keys survive close + relaunch', async () => {
    test.setTimeout(120_000)
    if (!existsSync(MAIN_ENTRY)) throw new Error('out/main/index.js missing. Run `npm run build` first.')
    const profile = mkdtempSync(path.join(os.tmpdir(), 'satex-creds-'))

    // ── Launch 1: save creds ──
    let app1: ElectronApplication | null = await launch(profile)
    try {
      const win1: Page = await app1.firstWindow({ timeout: 20_000 })
      await win1.waitForLoadState('domcontentloaded', { timeout: 20_000 })
      await win1.locator('.bb-watchlist-row').first().waitFor({ state: 'visible', timeout: 20_000 })
      const saved = await win1.evaluate(() => (window as unknown as { satex: { setCredentials(r: unknown): Promise<{ ok: boolean; reason?: string }> } }).satex.setCredentials({ keyId: 'PERSIST_TEST_KEY', secretKey: 'PERSIST_TEST_SECRET', feed: 'iex', mode: 'paper' }))
      test.skip(!saved.ok, `safeStorage unavailable on this machine: ${saved.reason ?? ''}`)
      const masked1 = await win1.evaluate(() => (window as unknown as { satex: { getCredentialsMasked(): Promise<{ paperConfigured: boolean }> } }).satex.getCredentialsMasked())
      expect(masked1.paperConfigured).toBe(true)
    } finally {
      if (app1) { try { await app1.close() } catch { /* ignore */ } }
      app1 = null
    }

    // ── Launch 2: same profile, assert persisted ──
    let app2: ElectronApplication | null = await launch(profile)
    try {
      const win2: Page = await app2.firstWindow({ timeout: 20_000 })
      await win2.waitForLoadState('domcontentloaded', { timeout: 20_000 })
      await win2.locator('.bb-watchlist-row').first().waitFor({ state: 'visible', timeout: 20_000 })
      const masked2 = await win2.evaluate(() => (window as unknown as { satex: { getCredentialsMasked(): Promise<{ paperConfigured: boolean }> } }).satex.getCredentialsMasked())
      expect(masked2.paperConfigured, 'paper creds did NOT survive relaunch').toBe(true)
      const ds = await win2.evaluate(() => (window as unknown as { satex: { getDataSource(): Promise<{ liveAvailable: boolean }> } }).satex.getDataSource())
      expect(ds.liveAvailable, 'live feed not available after relaunch despite persisted creds').toBe(true)
    } finally {
      if (app2) { try { await app2.close() } catch { /* ignore */ } }
      try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })
})
```

- [ ] **Step 2: Run**

Run: `$env:SATEX_E2E_FEED='1'; npx playwright test tests/e2e/creds-persistence.spec.ts`
Expected: PASS (or skipped if the machine has no safeStorage). Proves keys persist across relaunch.

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/creds-persistence.spec.ts
git commit -m "test(feed-switch): E2E — Alpaca creds persist across close/relaunch"
```

---

## Task 10: Documentation

**Files:**
- Modify: `CHANGELOG.md` (under the `## Unreleased (v0.6 "Black Box")` section added earlier), `CLAUDE.md`

- [ ] **Step 1: CHANGELOG**

Under the existing `### Added` of `## Unreleased (v0.6 "Black Box")` in `CHANGELOG.md`, append:

```markdown
- **Runtime data-feed switch (Simulator ⇄ Live Alpaca paper data).** A one-click TopBar
  source chip (`◇ SIM DATA` ⇄ `◆ ALPACA`, cyan — distinct from the amber PAPER/LIVE money
  toggle) swaps the market data feed at runtime, no restart. The swap is transactional
  (`prepare`→`commit`: Alpaca REST auth runs before any teardown, so a failed switch is a
  clean no-op) and reconciles the OrderManager to a clean state (→Sim: fresh $100k paper;
  →Live: real Alpaca paper positions/equity via `syncFromAlpaca`). Strictly paper-safe: the
  switch is refused while ● LIVE real-capital is armed or a replay is active, and `submitOrder`
  is gated mid-swap. Stored Alpaca keys persist across relaunch (safeStorage), so the live
  feed stays available with no re-entry — covered by a new persistence E2E.
```

- [ ] **Step 2: CLAUDE.md**

After the `## Renderer perf canary (v0.6)` section in `CLAUDE.md`, add:

```markdown

## Data-feed switch (Simulator ⇄ Live Alpaca)

Runtime market-data-feed toggle in the TopBar (`FeedSwitch.tsx` → `dataSourceStore` → IPC
`DATA_SOURCE_SET` → `engine.setDataSource`). Reconciliation is reset-to-clean (OrderManager
`resetToPaper` on →Sim; `syncFromAlpaca` on →Live). Interlock logic is the pure, unit-tested
`data-source-guard.ts`. Paper-safe (blocked while real-capital armed / replay active).
Opt-in E2Es: `$env:SATEX_E2E_FEED='1'; npx playwright test tests/e2e/feed-switch.spec.ts`
(switch + rollback) and `tests/e2e/creds-persistence.spec.ts` (keys survive relaunch).
Design: `docs/design/2026-05-24-data-feed-switch.md`.
```

- [ ] **Step 3: Commit**

```powershell
git add CHANGELOG.md CLAUDE.md
git commit -m "docs(feed-switch): changelog + CLAUDE notes"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- §3.1 swap (prepare→commit, interlocks, gate) → Tasks 3 (guard) + 4 (engine). §3.2 `resetToPaper` → Task 1. §3.3 submitOrder gate → Task 4 Step 3. §3.4 IPC/preload → Task 5. §3.5 store + chip + confirm → Tasks 6 + 7. §4 creds persistence → Task 9 (E2E) + documented. §6 rollback → Task 4 (catch) + Task 8 (rollback test). §8 testing → Tasks 1,3,6 (unit) + 8,9 (E2E). §9 acceptance → covered; #7 (persistence) = Task 9.

**2. Placeholder scan** — no TBD/TODO. Three explicit "verify exact existing-API name" notes in Task 4 (`env` access, `broadcastFeedStatus` emitter name, `alpaca.getPositions`) are concrete verification instructions against named existing code, not placeholders — unavoidable without reading the full 1900-line engine, and flagged precisely. The first-run selector/API check in Tasks 8/9 mirrors the canary's accepted empirical step.

**3. Type consistency** — `DataSource` (`'simulator'|'live'`), `DataSourceStatus` (`source/liveAvailable/switching`), `DataSourceSetRequest` (`{target}`) are defined in Task 2 and used identically in Tasks 4 (engine), 5 (IPC/preload), 6 (store), 7 (component). `setDataSource(target)` signature matches across engine (Task 4), IPC handler (Task 5: `req.target`), and store (`window.satex.setDataSource({target})`). `resetToPaper(startingEquity?)` matches Task 1 ↔ Task 4. The guard's `evaluateDataSourceSwitch` shape matches Task 3 ↔ Task 4's call site.

**Known empirical steps** (unavoidable, scoped): Task 4's three existing-API name confirmations; the live-connect *success* path needs real paper creds (manual QA) — the E2E covers boot/refusal/no-op/rollback without them.
