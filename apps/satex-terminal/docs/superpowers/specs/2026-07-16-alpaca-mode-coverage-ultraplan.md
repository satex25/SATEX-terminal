---
type: ultraplan
date: 2026-07-16
target: apps/satex-terminal/src/main/services/alpaca-mode.ts
ledger: P-094 (remaining safe pick, second of three)
author: work-layer (Opus 4.8, unattended)
---

# Ultraplan — `alpaca-mode.ts` characterization coverage (P-094)

## Layer 1 — Objective
Close the zero-coverage gap on `alpaca-mode.ts` (65 LOC), the second of P-094's
three remaining safe autonomous picks (`self-eval-store.ts` shipped 2026-07-16
02:25; `alpaca-mode.ts` next-cheapest; `persistence.ts` remains for a future
session with its own blueprint). Lock in the module's real contract before any
future edit can silently invert it.

## Layer 2 — Domain map
- **File under test:** `src/main/services/alpaca-mode.ts`.
- **Role:** persists which Alpaca REST base URL (`paper-api` vs `api`) the
  engine targets. Explicitly NOT the live-capital arming interlock — the file's
  own header comment says the actual flip still requires `live-mode.ts`'s
  typed-phrase + notional-cap + kill-switch-disarmed check. This module only
  chooses a URL string; it cannot arm anything by itself.
- **Consumers:** whatever constructs the Alpaca REST client reads
  `resolveBaseUrl()`; the mode itself is read via `getAlpacaMode()`, set via
  `setAlpacaMode()`. No perimeter file imports this module for arming logic.
- **Perimeter check (CONSTITUTION §2.4):** off-perimeter. Not
  `order-manager.ts`, `risk-gates.ts`, `kill-switch-store.ts`, `live-mode.ts`,
  or `services/alpaca/order-router.ts`. Test-only change to a URL-selection
  helper — matches the `self-eval-store.ts` / `auto-update.ts` precedent class.

## Layer 3 — Task tree
1. Assert subject file unchanged (`git diff -- alpaca-mode.ts` empty) before
   and after.
2. Write `src/main/services/alpaca-mode.test.ts` mirroring the
   `self-eval-store.test.ts` harness: `vi.mock('electron')` for
   `app.getPath`, real `fs` on a per-test temp dir, `vi.resetModules()` +
   dynamic import per case (module-singleton `state = load()` pattern).
3. Byte-scan the new file (0 NUL, 0 CRCR, intact tail).
4. Run vitest scoped to the new file; typecheck node+web; eslint scoped.
5. Ledger + CHANGELOG entries.

## Layer 4 — Dependency DAG
1 → 2 → 3 → 4 → 5 (strictly linear; no parallel groups, single-file target).

## Layer 5 — Execution specs (what the suite must lock in)
- **Default-paper contract:** absent file, malformed JSON, and a stored object
  missing `mode` all read as `'paper'` (`getAlpacaMode()` and
  `resolveBaseUrl()` both) — a false `'live'` default would be the dangerous
  direction, so this is the highest-value assertion in the suite.
- **`updatedAt` coercion:** missing/falsy `updatedAt` on disk coerces to `0`,
  never `undefined`/`NaN` (mirrors the `self-eval-store.ts` `|| 0` pattern).
- **Stored `'live'` is honored:** a persisted `{mode:'live'}` round-trips
  through `getAlpacaMode()` and `resolveBaseUrl()` → `LIVE_BASE_URL`.
- **`resolveBaseUrl` override precedence (the module's most intricate logic,
  per its own inline comment referencing the 2026-05-13T17:27 live incident):**
  - no override → follows persisted mode (paper and live cases).
  - override === the canonical paper URL or canonical live URL → NOT treated
    as an override; falls through to persisted-mode logic (this is the exact
    bug class the comment documents — a naive "any env var wins" would break
    the UI toggle).
  - override === empty string → falsy, treated as no override, falls through.
  - override === a non-canonical URL (e.g. a staging proxy) → wins outright,
    regardless of persisted mode.
- **`setAlpacaMode` round-trip:** sets in-memory state, persists JSON with a
  fresh numeric `updatedAt`, returns `{ok:true, baseUrl}` matching the new
  mode (both directions: paper→live, live→paper).
- **Write-failure swallowed:** pointing `userData` at a file (ENOTDIR write
  target, same technique as `self-eval-store.test.ts`) must not throw from
  `setAlpacaMode`, and the in-memory mode must still reflect the set (matches
  the subject's `try { fs.writeFileSync } catch { log.error }` shape — no
  rethrow).

## Layer 6 — Risk audit
- **Blast radius:** zero. New test file only; subject file byte-unchanged
  (asserted in Layer 3/gates).
- **Perimeter risk:** none — confirmed in Layer 2.
- **False-confidence risk:** the override-precedence tests are the one place
  a shallow suite could rubber-stamp wrong behavior (e.g. asserting "override
  always wins" would pass superficially but miss the canonical-URL carve-out
  that the file's comment says was a real production bug). Explicit test
  cases for both the canonical-URL non-override and the non-canonical-URL
  override close that gap.
- **Sandbox risk:** none beyond the standard P-099 write law (bash-mount only)
  and the 45s call ceiling (single small file, not a concern here).

## Layer 7 — Assembled plan
Execute Layer 3 tasks 1→5 in order, gate after task 4, ledger + CHANGELOG at
task 5. No approval node required — matches the standing P-094 disposition for
this file (safe autonomous pick, explicitly not `live-mode.ts`/`tactics.ts`).
