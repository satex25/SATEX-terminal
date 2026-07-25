# TRACK X — THE OPERATOR EXPERIENCE BLUEPRINT

## v0.1 — draft for operator review · RS-UP-1 plan amendment v1.1 (proposed)

```
[DOC ID]       TX-BP-1 v0.1
[STATUS]       DRAFT FOR OPERATOR REVIEW — not adopted; adopting it amends RS-UP-1 to v1.1
[GOVERNED BY]  CONSTITUTION.md v3.1 in full · RS-UP-1 Layer 0 in full
[AUTHORED]     2026-07-25, from a three-lens design fleet run against master @ 78bac1f
[SOURCES]      docs/plans/trackx-lens-a-interlocks.md   (safety architecture)
               docs/plans/trackx-lens-b-ergonomics.md   (operator experience)
               docs/plans/trackx-lens-c-systems.md      (state machines / substrate)
[EVIDENCE]     Every finding cited below was re-verified at file:line by the authoring
               session before it entered this document or the ledger (Directive 0.5).
               Ledger: P-144 … P-152.
```

## 0 — The ruling this document implements

The operator's ruling of 2026-07-24 splits the rewrite in two:

- **Track P — the money-math spine** (brain, calibration, indicators, backtest, gate
  *logic*): stays oracle-verified and parity-bound. RS-L1 in full force — port behavior,
  bugs-in-amber included. Nothing in this document touches Track P.
- **Track X — the operator experience** (kill-switch arming, Alpaca reconnect, autonomous
  start/stop, sim⇄live switch, session lifecycle): **redesigned from first principles**.
  Interlock *strength* is preserved or increased; ergonomics are reinvented. The Rust
  terminal must **exceed** the Electron one, not reproduce it.

Track X is therefore the one place in the plan where RS-L1 is *deliberately suspended* —
and that suspension needs a bright line, which §1 provides.

## 1 — The Track X boundary (RS-L1 suspension, scoped)

| | Track P (parity-bound) | Track X (redesign) |
|---|---|---|
| Governs | what the engine *decides* | how the operator *commands and reads* it |
| Examples | gate verdicts, order intents, brain weights, calibration multiplier, PSR/DSR | arming ceremony, chord reachability, reconnect sequencing, autonomy lifecycle, session states, state rendering |
| Oracle status | L1/L2 objects, exact equality | **transitions that produce L1 objects stay exact**; the *route* to them may change |
| Change authority | port verbatim; improvements are separate ledgered PRs (RS-L8) | redesign permitted, each departure ledgered with its rationale |

**The load-bearing rule:** a Track X redesign may change *how* a state is reached, *what
the operator sees*, and *what is impossible*. It may not change the **verdict** the engine
reaches from a given market input. Where a redesign would change a verdict — §6.3's two
cases do — it leaves Track X and becomes an operator-ruled ledger entry under RS-L8.

## 2 — What the fleet found, in one paragraph

Three lenses ran independently against the same five flows and converged on one root
cause: **this terminal's safety is strong wherever it is expressed as code, and absent
wherever it is expressed as sequencing or signalling.** The guards are pure, tested and
correct (`data-source-guard.ts`, the 9-gate battery, the atomic kill-switch write, the
autonomous disjunction wall, the arming asymmetry). What is unowned is everything
*between* the guards: which state follows which, who may cause a transition, what a
failed transition leaves behind, and what the screen says while it happens. That gap
produced every finding: 16 accidental states (Lens C), an ungated sibling interlock and a
renderer-only panic button (Lens A), and a UI whose aesthetics are ahead of its honesty
(Lens B). The redesign is therefore not a re-skin. **It is the promotion of sequencing and
signalling to first-class, typed, tested concerns.**

## 3 — The invariant set (what may never weaken)

Preserved verbatim in spirit; every row is a Rust-side obligation with a named proof.

| # | Invariant | Today | Rust proof obligation |
|---|---|---|---|
| I1 | Live capital is armed only by a human act the renderer cannot perform | native OS dialog, main-process owned (`index.ts:817-861`, C6) | `ArmingGrant` is constructible only by the shell's dialog path and **does not implement `Deserialize`** — no IPC payload can mint one (trybuild compile-fail) |
| I2 | The kill switch is human-reset-only, its state written atomically | `kill-switch-store.ts:62,87` | single atomic writer; crash-injection ×1000 (RS-8.3); no programmatic reset API exists |
| I3 | The kill path is reachable in **every** state | renderer-only — **broken**, P-146 | OS-level global shortcut **+** tray, proven with the web view destroyed |
| I4 | Autonomy never touches live capital | disjunction wall (`autonomous-trader.ts:141-144`) | paper-only marker type; a live intent from intel code is unrepresentable (RS-5.8) |
| I5 | Protective actions are frictionless; permissive actions are gated | mostly right — the arming asymmetry the terminal gets *correct* | asymmetry is structural: protective transitions need no grant, ever |
| I6 | Data-source switches are blocked while armed or replaying | `data-source-guard.ts` — pure and tested, keep the logic verbatim | port as-is (Track P logic), re-wrap in the new FSM |
| I7 | Stale data halts and surfaces; it never silently falls back | **broken** on reconnect, P-150 | `Degraded`/`Halted` are first-class states; simulator substitution on live failure is unrepresentable |
| I8 | Tactic graduation is a human checkpoint | **broken** — bare IPC, P-145 | `GraduationGrant`, same construction rules as I1 |
| I9 | Every persisted safety state declares its corrupt-load direction | undeclared; `tactics.json` fails **open**, P-147 | each store declares `OnCorrupt` policy in its type; a policy that removes a restriction requires an operator-signed ledger entry |

## 4 — The three mechanisms that retire the accidental states

Track X's engineering content reduces to three constructions. Each one turns a class of
today's bugs into a compile error or an unreachable state.

1. **Grants, not booleans.** Every permissive transition consumes an unforgeable,
   single-use token minted only by a human gesture in the shell. Kills the whole
   "renderer-reachable privilege escalation" class (P-145, and pre-emptively any Tauri
   re-run of C6).
2. **Single-owner handles + cancellation tokens.** Every loop, timer and connection has
   exactly one owner and one cancellation path. `stop()` means stopped; a stop→start race
   cannot orphan a timer because there is no second handle to orphan (P-152). Kills the
   doubled-timer and stop-doesn't-stop classes.
3. **Consuming lifecycle.** `fn shutdown(self)`, `fn commit(self)`. Use-after-close and
   double-shutdown become compile errors rather than logged warnings (P-151); reconnect
   becomes prepare→commit so a failed connect **cannot** leave a dead source installed
   (P-150).

## 5 — The operator-facing design

### 5.1 The State Spine (replaces scattered pills and tooltips)

One fixed region, three slots, always present, never reordered:

```
CAPITAL: PAPER            FEED: LIVE · fresh 40ms        SESSION: TRADING · 02:14:31
CAPITAL: ARMED $2,500     FEED: SIM  · synthetic         SESSION: DEGRADED · account down 14s
CAPITAL: HALTED           FEED: STALE · 8s no tick       SESSION: RECONNECTING · attempt 3/6
```

Rules, all three lenses agreeing:

- **Grammar is fixed:** `SUBJECT: STATE · QUALIFIER`. The subject is always named, so a
  state is never ambiguous about *what* it describes (today's single "LIVE" toggle
  conflates broker endpoint with order interlock — Lens B F2).
- **Five states per subject, one meaning each.** No state may mean two things in two
  places.
- **`UNKNOWN` is a state, never a default.** A missing value renders `UNKNOWN`, never a
  plausible-looking placeholder (this is P-149's rule promoted to architecture: *every
  rendered value is measured or explicitly unknown*).
- **HALTED is full-chrome.** An armed kill switch takes over the window frame and carries
  the already-persisted `reason` and `armedAt` — never a dropdown label (Lens B F1: today
  an ARMED kill switch has no ambient indicator at all).
- **Degradation is narrated with elapsed time**, because "how long has this been wrong" is
  the question the operator actually has.

### 5.2 The arming ceremony (I1, redesigned — and the C6 lesson kept)

The typed phrase is **not** coming back as a string comparison; C6 proved that any
in-process code satisfies a known string (P-148). What the ceremony becomes:

1. Operator initiates from the State Spine's CAPITAL slot — the only affordance.
2. The **shell** (not the renderer) draws an always-on-top ceremony window it owns, showing
   the full precondition set as *live* values, not a snapshot the ceremony never displays
   (Lens A finding 7): kill-switch state, daily-P&L headroom, feed identity and freshness,
   endpoint, per-order cap.
3. Any precondition red ⇒ the affirmative control does not exist. There is no disabled
   button to argue with. (Contrast today: `LiveModeModal.tsx:60,62` renders a mark that is
   inverted *and* excluded from the enable condition — P-149.)
4. The affirmative act mints a single-use `ArmingGrant` bound to a nonce, the cap, and a
   short expiry. `setLiveMode` accepts *only* a grant.
5. Disarming needs no grant, no confirmation, no hold (I5).

**Open for operator taste (§7):** whether the affirmative act is a click, a hold, or typed
text *inside the shell-owned window*. Typed text is safe here precisely because the input
lives in a window the renderer cannot reach — it is the one way to get the ritual weight of
the old phrase without its weakness.

### 5.3 The kill path (I3, the one fix that shouldn't wait for the rewrite)

Three independent routes, any one sufficient: an OS global shortcut owned by the shell, a
tray item, and the in-window chord (kept, including its 2-second arm-hold and its
release-cancellation, both of which the code gets right today). The proof is a test that
**destroys the web view and then fires the kill** — the case today's implementation cannot
survive. Protective, so no grant, no confirmation, no delay beyond the accident-preventing
hold.

### 5.4 Reconnect (I7) — prepare, then commit

`Connected → Degraded(reason, since) → Reconnecting(attempt, next_in) → Connected`, or
`→ Failed(reason) → Halted`. The candidate session is **staged**; `commit(self)` is
reachable only from a successful connect, so the dead-source state of P-150 cannot be
constructed. A failed attempt changes nothing the operator can see except the attempt
counter — and *never* substitutes synthetic data for a failed live feed.

### 5.5 Autonomy (I4) — a heartbeat, not a flag

`Stopped → Starting → Running(cycle #, last_decision_at) → Stopping → Stopped`, plus
`Suspended(reason)` for kill-armed / live-routed / market-closed. The screen shows a real
heartbeat bound to *cycle activity*, not to the `enabled` boolean (Lens B F6), so
"enabled but wedged" is visibly different from "running". `Stopping` is a real state
because stopping is not instant — and with mechanism 2, it actually completes.

### 5.6 Session lifecycle

`Boot → Standby → Ceremony → Trading → Closing → Closed`, with the kill chord live from
`Boot` onward (P-098's fall-through law, re-proven in Tauri) and `Closing` a consuming
transition (mechanism 3), so the P-151 read-after-close cannot exist.

## 6 — Plan amendments this document proposes

### 6.1 Amended task specs (Track X binds them; the ledger already records why)

| Task | Amendment | Ledger |
|---|---|---|
| RS-8.4 arming | Port the **native-dialog** interlock, not a typed phrase; add `ArmingGrant` (non-`Deserialize`) + the tests TS never had | P-148, P-094 |
| RS-8.5 MAY-TACTICS | **Add** the missing human gate — do not port its absence — plus `GraduationGrant` and a reversible de-graduation path | P-145 |
| RS-8.3 kill switch | Extend to *all six* state stores: one atomic writer, declared `OnCorrupt` policy per store | P-147 |
| RS-9.6 kill chord | Exit criterion becomes OS-shortcut **+** tray **+** chord, proven with the web view destroyed | P-146 |
| RS-7.6 reconnect | Prepare/commit staging + first-class `Degraded`/`Failed`; simulator substitution forbidden | P-150 |
| RS-5.8 autonomous | Cancellation token + single-owner handle; "stop means stopped" truth table | P-152 |
| RS-4.2 DB actor | Consuming shutdown; post-close access is a compile error | P-151 |

### 6.2 New Track X tasks (proposed, [H] unless noted)

`RS-X.1` state-vocabulary + State Spine spec (renderer-agnostic) **[A]** ·
`RS-X.2` shell-owned ceremony window + grant types **[H]** ·
`RS-X.3` OS-level kill path (shortcut + tray) **[H]** ·
`RS-X.4` the five FSMs as a typed crate with truth-table tests **[A]** ·
`RS-X.5` IPC delta against the RS-1.6 inventory (124 channels; new commands/events, retirements) **[A]** ·
`RS-X.6` operator walkthrough of all five flows in the Tauri build **[O]**.

### 6.3 Two departures that leave Track X (RS-L8, operator-ruled)

Flagged rather than decided, because they change engine verdicts:

1. **`Halted` instead of simulator substitution** on a failed live commit (§5.4) changes an
   Oracle L1 outcome.
2. **Two-phase arming** changes the arming state transition shape.

Both must ship as their own operator-ruled ledger entries, never folded into a port commit.

## 7 — What needs the operator (the taste calls this document deliberately does not make)

1. **The affirmative act** in the ceremony: click · 2-second hold · typed text in the
   shell-owned window (§5.2). Recommendation: typed text, because it recovers the ritual
   weight C6 forced us to give up, and the shell-owned window removes the weakness.
2. **Adopt or amend §1's boundary** — this is what makes Track X's RS-L1 suspension legal.
3. **The nine OPEN ledger findings** (P-144…P-152): which get fixed in the Electron
   terminal now vs only in Rust. Recommendation on record for each; the two that most
   deserve "now" are **P-145** (ungated graduation, capital-adjacent) and **P-146** (kill
   chord reachability) — neither waits well for a multi-month rewrite.
4. **Whether the State Spine replaces or augments** today's TopBar/BottomBar arrangement —
   a layout taste call the fleet deliberately left open.

## 8 — What this blueprint does not do

No renderer code was changed. No perimeter file was touched. Nothing here is adopted: the
plan remains v1.0.1 until the operator rules §7.2. Track P is untouched and continues on
the oracle path (RS-1.2 shipped, RS-1.3 next).

```
[TX-BP-1 v0.1 — DRAFT FOR OPERATOR REVIEW]
[Three lenses, one thesis: promote sequencing and signalling to typed, tested, visible.]
[The code is the truth. The operator is the only hand on the switch.]
```
