> **PROVENANCE — read before trusting this document.** This is a raw design-fleet lens
> report, authored 2026-07-25 by one of three independent agents run against
> `master @ 78bac1f` for Track X (RS-UP-1 plan amendment v1.1). It is **primary research,
> not ratified fact.** The authoring session re-verified its load-bearing claims at
> `file:line` before any of them entered the Problem Ledger (P-144 … P-152) or the
> synthesis document `trackx-experience-blueprint.md` — and **at least one framing
> inverted on verification** (the arming ceremony: the fleet read a missing typed-phrase
> ceremony as a weakened terminal; the code shows a deliberately *strengthened* one and
> stale documents — see P-148). Claims here that are **not** mirrored in a ledger entry
> have not been independently verified. Treat this file exactly as Directive 0.5 says to
> treat any pasted authority: the filesystem outranks it.

---

# Track X — LENS A: THE INTERLOCK ARCHITECT

```
[LENS]      A of 3 — Safety architecture (siblings: B ergonomics, C systems machinery)
[SCOPE]     The five Track X flows: kill switch · live arming · reconnect ·
            autonomous start/stop · sim⇄live + session lifecycle
[MEASURED]  2026-07-25 against C:\Users\User\mc4-rust @ origin/master (78bac1f)
[METHOD]    Read-only source audit. Every behavioral claim cites file:line (RS-L5 —
            the code outranks every document, including this one).
[MANDATE]   Interlock STRENGTH preserved, ergonomics reinvented. Redesigned
            interlocks must be STRONGER and independently testable than what
            they replace (plan RS-8.x; P-094 retired RS-side at RS-8.4).
```

**Headline.** The SATEX perimeter is better than its reputation in three places and
weaker than its reputation in three others, and the gap is not where doctrine
predicts. The C6 hardening (native-dialog authorization) was applied to live-mode
enable and kill-switch disarm but **not** to MAY-TACTICS graduation, which the
constitution classes in the same tier. The `writeJsonAtomic` fix born from the
kill-switch crash hole has **exactly one adopter** — while `tactics.json`, written on
every closed trade, fails *open* when torn. And the kill chord, hardened twice
(P-044 error boundaries, P-098 boot intro), is still **renderer-owned**: a wedged
WebView removes the panic button entirely, which is precisely when an operator
reaches for it. All three are closable by construction in Rust/Tauri, and closing
them is how this redesign exceeds the current terminal instead of copying it.

---

# 1. THE INVARIANT SET

Each row: where it lives · what it prevents · **non-negotiable core** vs *incidental
TS-era detail*. The core is what Track X must carry forward under any redesign; the
incidental is free to change.

## 1.1 Authorization invariants (the human-presence family)

**I-1 — Native-dialog authorization for live enable.**
`index.ts:832-859`. The renderer may *request* live mode; only a click in a
main-process OS-level dialog can *authorize* it. The docblock at `index.ts:825-831`
records why: this replaced a `confirmPhrase` string-equality check that "any
in-process code could satisfy by hardcoding the known string." Prevents: XSS via
injected news/AI content, devtools-pasted script, or any compromised renderer path
flipping real-capital routing.
**Core:** authorization must originate on a surface the renderer cannot reach,
draw over, or synthesize input into. *Incidental:* Electron's `showMessageBox`, the
two-button layout, the "I accept real capital" label, `noLink: true`.

**I-2 — Native-dialog gate on kill-switch DISARM while live.**
`index.ts:719-745`. Disarming is gated only when `isLive()` is true (`:719`);
the reasoning at `index.ts:703-713` is explicit — a compromised renderer could
otherwise call `window.satex.killSwitch(false)` and submit within the notional cap,
whereas in paper mode the dialog "would just be friction without any safety value."
Refuses outright if no window exists to host the dialog (`:720-723`).
**Core:** reducing protection while capital is live requires an OS-level human act.
*Incidental:* the `isLive()` conditionality (defensible, see G-7), message copy.

**I-3 — The arming asymmetry: protective actions are frictionless, permissive
actions are gated.**
`index.ts:715-718` — arming the kill switch is ungated and immediate ("Arming
(true) stays ungated — it's the panic button", `:709`). `App.tsx:216-221` — disarm
via chord is instant. `index.ts:1001` — `FUNDED_ACCOUNT_TRIGGER_FLAT` is validated
but ungated, correctly, because flattening is protective.
**Core:** this is the single best design principle in the perimeter and the one
Track X must not invert. Direction of risk determines direction of friction.
*Incidental:* which specific channels are gated today.

**I-3b — Chord arm-hold with correct cancellation.**
`App.tsx:222-236` requires a 2 s hold to arm (auto-repeat no-op'd via the timer
ref at `:228`); `App.tsx:264-274` cancels the in-flight hold on release of *any*
chord modifier (K, Shift, Meta, Control); `App.tsx:276-279` also cancels on unmount.
Verified directly — an earlier inference that release did not cancel was wrong.
**Core:** an accident-tolerance mechanism must itself be cancellable and leak-free.
*Incidental:* the 2 s duration and the 50 ms tick cadence — see T-2, where the
existence of hold-friction on a *protective* action is challenged.

**I-4 — Structural interlocks independent of the dialog (defense in depth).**
`live-mode.ts:57-60`: even a direct caller that bypasses the dialog still faces
kill-armed refusal (`:57`), daily-loss-limit refusal (`:58-59`), and notional-cap
range validation (`:60`, hard cap 50 000 at `:18`). The docblock at `:51-56` states
this is deliberate: "direct callers in tests or future code paths can't sidestep
them."
**Core:** the ceremony is not the only wall; the state machine independently
refuses. *Incidental:* the specific cap value, threshold arithmetic form.

## 1.2 State-integrity invariants

**I-5 — Kill-switch armed state survives every restart, atomically.**
`kill-switch-store.ts:62-76` (`writeJsonAtomic`: tmp write → rename, high-entropy
tmp suffix at `:66` to defeat same-millisecond collisions, unlink-on-failure at
`:73`), consumed at `:87`. The docblock at `:44-60` records the exact hole it
closed: bare `writeFileSync` truncates before writing, so a crash mid-write left a
0-byte file, `loadKillSwitchState` hit its `JSON.parse` catch (`:41`), and an armed
kill switch "silently disappears across the crash."
**Core:** a torn write must never present as *less* protection. *Incidental:* JSON
shape, `Math.random` in the tmp name, 2-space formatting.

**I-6 — Arming provenance is not resettable by re-arming.**
`kill-switch-store.ts:84`: `armedAt: armed ? (prev.armed ? prev.armedAt : now) : 0`
— a repeat arm preserves the original arm timestamp.
**Core:** the audit trail of when protection engaged cannot be laundered by
re-issuing the same command. *Incidental:* field name.

**I-7 — Effective live state is a conjunction, not a stored boolean.**
`live-mode.ts:37-39`: `enabled: state.enabled && !paperOnly`, where `paperOnly` is
derived from the *actual* base URL containing `ALPACA_PAPER_HOST`. A stale "enabled"
flag cannot produce live routing against a paper endpoint.
**Core:** capital-routing state is computed from ground truth (the endpoint in
force), never trusted from persistence alone. *Incidental:* substring matching as
the detection mechanism.

## 1.3 Flow interlocks

**I-8 — Data-feed switch interlock, pure and precedence-ordered.**
`data-source-guard.ts:14-21`: already-on → replay-active refusal (`:16`) →
real-capital-armed refusal (`:17`) → missing-paper-creds refusal (`:18-19`). No I/O;
the docblock at `:11-13` names it "the safety-critical core, unit-tested
independently of the heavy engine."
**Core:** no feed identity change while replay is driving the chart or while real
capital is armed; the decision is a pure function of state. *Incidental:* message
strings, the ordering *between* the two refusals (both refuse).

**I-9 — Replay can never price a real order.**
`trading-engine.ts:1115-1118` hard-blocks submission whenever replay is active.
The docblock at `:1108-1114` is instructive: this *replaced* an over-broad
`isLive()` refusal in `startReplay`, so replay now runs freely while live is armed
because "no path exists for a historical-data click to move real capital."
**Core:** historical data must never reach order construction. *Incidental:* where
the block sits (engine vs order-manager). **This is also the repo's best precedent
for reducing ceremony without reducing strength — see T-1.**

**I-10 — No orders during a source swap.**
`trading-engine.ts:1119` blocks on `switchingSource`; the field is documented at
`:209` as "True only during a setDataSource swap — gates submitOrder."
**Core:** while feed identity is indeterminate, order construction is refused.

**I-11 — Freshness, not connection labels, is the trading authority.**
`order-manager.ts:222-230` (Gate 0): rejects when `refPriceAge` exceeds
`MAX_QUOTE_AGE_MS`, **and** treats non-finite age identically to exceeded —
the D6 hardening documented at `:222-227` ("Gate 0 is the LAST place a stale …
refuse", explicitly refusing to "open and let stale-feed orders through").
**Core:** authority to trade derives from data freshness, which is measurable;
session state is presentation. A `CONNECTED` label over a dead feed is still poison.
*Incidental:* the threshold constant, the `undefined`-vs-`NaN` plumbing.

**I-12 — Autonomous paper-only wall as a disjunction.**
`autonomous-trader.ts:141-146` skips the cycle when `isLiveCapitalRouted()`;
wired at `trading-engine.ts:698` as `getAlpacaMode() === 'live' || isLive()` —
*either* wall engaged blocks autonomy, which is the strong form.
`autonomous-trader.ts:148-151` additionally skips when the kill switch is armed.
**Core:** autonomous execution never coexists with real-capital routing, and the
test is a disjunction over every capital indicator. *Incidental:* the check's
location (cycle-time — see G-8) and that it is a runtime predicate at all (see A-5).

**I-13 — MAY-TACTICS graduation requires earned statistics and is never
auto-promoted.**
`tactics.ts:167-180`: refuses below `MIN_TRADES_FOR_ARMED = 30` (`:41`), refuses
non-positive expectancy, refuses win-rate below `MIN_WIN_RATE = 0.45` (`:42`), each
checked individually so the refusal names the unmet clause. Docblock `:163-166`:
"REQUIRES explicit user confirmation via UI — never auto-promoted."
**Core:** promotion to broader autonomy must be preceded by measured eligibility
over an adequate sample. *Incidental:* the floor values.

**I-14 — The drawdown veto is a fail-safe latch, reconstructed at boot.**
`tactics.ts:4-19` documents the running-max latch (P-131, accepted as intentional);
`refresh()` engages the veto above `MAX_DRAWDOWN_VETO = 0.06` (`:43`); the
constructor at `:87-95` reconstructs it from persisted history so "a session that
ended in a drawdown breach would [not] boot with the veto cleared."
**Core:** a restriction errs toward staying on, and survives restart. *Incidental:*
the near-unreachable lift branch (P-131 ruling: acceptable because the gate only
ever blocks).

**I-15 — Chord ownership sits above every containment and presentation boundary.**
The `keydown`/`keyup` listeners are registered on `window` from an effect in `App`
itself (`App.tsx:273-274`), which is *above* both `BootIntroSequence`
(`App.tsx:289`) and `ErrorBoundary` (`App.tsx:323`) in the tree.
**Core (P-044 + P-098):** no failure-containment layer and no presentation layer may
own, occlude, or intercept the chord. *Incidental:* React effect placement — and
critically, *renderer* ownership itself is incidental and must change (G-5).

**I-16 — No order is presumed filled across a teardown.**
`broker-session.ts:94`: `this.orders.failUnacked('broker-session-disconnected')`
on disconnect; state machine transitions at `:81-137` (`CONNECTING` → `CONNECTED`
`:110` / `FAILED` `:116`; "reconnecting wins" precedence `:128-132`).
**Core:** in-flight orders are resolved explicitly at teardown, never abandoned.

**I-17 — Guaranteed process death on quit.**
`index.ts:1176-1195`: `preventDefault` + async teardown + 5 s `.unref()`'d
watchdog forcing `app.exit(0)` (P-072). Rationale at `:1181-1187`: Chromium
children die with the main process, so guaranteed main-process exit guarantees no
orphan holding broker sockets.
**Core:** no orphaned process may survive holding capital-capable connections.
*Incidental:* the 5 s budget, the exit code (see G-9).

**I-18 — Every mutating channel is schema-validated with main-side logging.**
`index.ts:671-694` (`register` wrapper) composed with `validated(...)` on each
payload-bearing perimeter channel (`:699-700`, `:714`, `:820`, `:824`, `:1001`).
**Core:** no unvalidated payload reaches perimeter logic; handler throws leave a
main-side trail. *Incidental:* zod as the validator.

---

# 2. STRENGTH GAPS

Ordered by how much the redesign gains from closing them.

**G-1 — MAY-TACTICS graduation is protected by convention, not by a gate, and is
irreversible.**
`index.ts:880`: `register(IPC.TACTICS_GRADUATE, () => engine.graduateTactics())` —
no dialog, no grant, no human-presence check. Path: `trading-engine.ts:1613-1622` →
`tactics.ts:167-180` → `this.store.graduated = true` (`:177`) → `save` (`:178`).
The constitution places this interlock in the arming tier (§1.4 "The MAY-TACTICS
graduation interlock gates autonomous-tactic promotion the same way"; §2.4 wall
table; §3.7 "MAY-TACTICS interlock — human gate"; §4.4 Rung 3). The code's only
enforcement is the docblock's assertion that confirmation happens "via UI" — which
is exactly the posture `index.ts:825-831` abandoned for live-mode after C6, on the
stated grounds that in-process code can satisfy any in-process check.

Precision matters here: unauthorized graduation does **not** open a capital path.
Mechanically, `armed` makes the entry gate *stricter* (it begins vetoing below
`SIGNAL_QUALITY_FLOOR`, `tactics.ts:44`). The defect is threefold and real anyway:
(a) it is a **persisted, one-way** state change — the docblock at `:22-25` notes
`armed` thereafter "gates on the persisted `graduated` flag ALONE," and I found **no
un-graduate path in the codebase**, so an unauthorized flip is permanent short of
hand-editing `tactics.json`; (b) it is the ladder checkpoint doctrine reserves for a
human; (c) it silently consumes the operator's one-time promotion decision. Any
renderer-reachable code — injected news content, AI-rendered output, a stray
devtools paste — can spend it.

**G-2 — `writeJsonAtomic` has exactly one adopter; three durability tiers coexist.**
Full discipline: `kill-switch-store.ts:87` only. Hand-rolled partial:
`funded-account-store.ts:60-66` does tmp+rename but with a **fixed** `.tmp` name (no
collision defense — the very hazard `kill-switch-store.ts:63-66` guards), no fsync,
no unlink-on-failure. **None:** `live-mode.ts:31`, `tactics.ts:80`,
`alpaca-mode.ts:35`, `self-eval-store.ts:31` are all bare `writeFileSync`. The
arming interlock's own state file is in the last group.

**G-3 — `tactics.json` is the fail-OPEN torn-write case, and it is the
highest-frequency write in the set.**
`tactics.ts:98-101`: `recordOutcome` pushes and calls `save` on **every closed
trade** — orders of magnitude more write events than the kill switch, i.e. the file
most likely to be caught mid-write by a crash. Its corrupt-file default
(`tactics.ts:77`) is `{ version, history: [], graduated: false }`, which fails open
twice over:
1. `graduated: false` → state reverts to `calibrating`, where per `:4-5` "the gate
   is pass-through" — the `SIGNAL_QUALITY_FLOOR` veto stops applying to entries.
2. `history: []` → `metrics()` returns zeros (`:196`) → `refresh()` computes zero
   drawdown → **the drawdown veto is erased**, defeating precisely the boot
   reconstruction that `:87-95` exists to guarantee.

This is the identical failure class the kill switch was fixed for, in the file
written most often, in the direction that removes restrictions. Additionally
`save()` swallows failure at warn (`:81`) and `graduate()` ignores its result
(`:177-179`), so a full disk logs "TACTICS GRADUATED — pre-trade gate now active"
while nothing is persisted and the next boot reverts.

**G-4 — The most sacred module is the least verified.**
`live-mode.ts` has no colocated test file (P-094, still true), no atomic write
(`:31`), and its `load()` silently coerces a stored cap through `|| 500` (`:26`).
The arming interlock is simultaneously the highest-stakes and lowest-assurance code
in the flow set. RS-8.4 exists to retire this; it must not be deferred.

**G-5 — The kill chord dies with the renderer.**
I searched `src/main` for `globalShortcut`, `Tray`, `setApplicationMenu`, and
`accelerator`: **no matches.** `App.tsx:273-274` is the only chord path in the
product. P-044 hardened it against workspace crashes (boundary containment) and
P-098 against the boot intro — both *within* the renderer. Therefore a wedged,
GPU-crashed, or unresponsive WebView removes the panic button entirely, and the arm
path additionally requires 2 s of continuous renderer liveness
(`App.tsx:222-236`) to complete. The constitution calls the chord "always
reachable — even inside error boundaries (P-044) and above the boot intro (P-098)"
(§1.3 P0); the honest reading of the code is "always reachable *provided the
renderer is alive*." That qualifier is the gap, and it bites in exactly the
scenario that motivates a panic button.

**G-6 — Ceremony preconditions are a TOCTOU snapshot, and the ceremony does not
display them.**
`live-mode.ts:57` reads `killArmed` at enable time from a snapshot passed in at
`trading-engine.ts:1526`. But kill-switch state is mutable **without
authorization** in paper mode (`index.ts:719` gates disarm only when `isLive()`).
Sequence: unauthenticated paper-mode disarm → operator later arms live through the
dialog → the kill-armed precondition is satisfied by an act the operator never
authorized. Severity is bounded (the operator does consent to live), but the
ceremony compounds it by showing only endpoint and cap (`index.ts:844-851`) — not
kill-switch state, not daily-P&L headroom against the limit it silently checks, not
feed identity, not open-position count. The operator authorizes with less
information than the interlock uses.

**G-7 — Endpoint and intent are two flips with one gate.**
`ALPACA_MODE_SET` (`index.ts:865`) flips the broker endpoint to live with **no
dialog**, then triggers a reconnect (`trading-engine.ts:1510-1516`). `LIVE_MODE_SET`
(`:824`) is the gated half. The conjunction at `live-mode.ts:38-39` means the
endpoint flip alone cannot route orders — genuinely safe. But elsewhere the same
condition *is* treated as a capital wall: `trading-engine.ts:698` counts
`getAlpacaMode() === 'live'` as `isLiveCapitalRouted`, blocking autonomy. So one
half of the composite real-capital state is ungated while being trusted as a wall
by another subsystem. Inconsistent authority for the same fact.

**G-8 — The paper-only wall is a runtime predicate checked at the wrong moment, and
the capability is unrestricted.**
`autonomous-trader.ts:99-106`: `start()` performs no capital check, returns
`ok: true`, and sets `enabled: true`; the wall is only consulted per-cycle at
`:141`. The operator sees an enabled autonomous trader that silently no-ops every
30 s. Worse, the trader is handed the full submission capability —
`trading-engine.ts:700` passes `submitOrder` directly — so the paper-only property
rests entirely on one `if` continuing to exist. A refactor that drops or inverts
`:141` yields live autonomous execution with no compile-time or type-level
objection. Directionally fail-safe today; structurally fragile.

**G-9 — A wedged teardown is indistinguishable from a clean quit.**
`index.ts:1189-1191` logs the watchdog firing then calls `app.exit(0)`. An external
supervisor, crash reporter, or next-boot heuristic sees success. No breadcrumb is
persisted recording that teardown wedged.

---

# 3. SAFETY THEATER

Candidates for removal in the redesign **with zero loss of strength**. I am
deliberately short here: most friction in this perimeter is load-bearing, and
calling real interlocks theater is how rewrites get less safe.

**T-1 — Precedent, not theater: the retired over-broad replay refusal.**
`trading-engine.ts:1108-1114` records that `startReplay` once refused outright when
`isLive()` was armed, and that this broad prohibition was replaced by a precise hard
block on *submission* (`:1115`). Result: replay became freely usable while live is
armed, with the actual risk eliminated more tightly than before. **This is the
template for every ergonomics decision in Track X** — replace broad prohibitions
with precise blocks at the true risk boundary, and the experience gets better while
the wall gets stronger.

**T-2 — The 2 s hold on arming the kill switch.**
`App.tsx:222-236`. This puts friction on the *protective* direction, contradicting
I-3, on the one control the constitution calls sacred (§3.4). Its stated purpose is
finger-slip tolerance — but the correct place for accident tolerance is a cheap,
instant, unmistakable undo, which already exists (disarm is instant in paper,
`App.tsx:216-221`). The cost is a 2 s window in which the operator believes they
have halted and has not, and a dependency on 2 s of renderer liveness (G-5).
**Redesign:** arm instantly; make the armed state unmissable; keep instant disarm in
paper and grant-gated disarm when live.

**T-3 — Paper-mode ceremony (correctly absent; keep it absent).**
`index.ts:711-713` reasons that gating disarm in paper "would just be friction
without any safety value." Correct, and it should be stated as a design rule so no
lens reintroduces it: ceremony is earned by capital exposure, not by the gravity of
a control's name.

**T-4 — Not theater, keep as-is:** per-enable notional cap re-entry
(`live-mode.ts:60-63`, echoed at `index.ts:846`) is the one number bounding blast
radius; the daily-loss precondition (`live-mode.ts:58-59`); the `noLink: true` /
`defaultId: 0` / `cancelId: 0` dialog posture (`index.ts:840-842`,
`:727-728`) which makes the safe choice the default and the dangerous one deliberate.

---

# 4. THE RUST / TAURI INTERLOCK ARCHITECTURE

Each item names the invariant it carries, the gap it closes, and the proof that
makes it independently testable. This is the section that has to make the Rust
perimeter *stronger* than the TS one, not merely equivalent.

**A-1 — Ceremony as an unforgeable capability token (carries I-1, I-2; closes G-1).**
```rust
// satex-shell (⚠️-adjacent) — the ONLY minting site.
pub struct ArmingGrant { nonce: [u8; 32], preconditions: PreconditionHash, _seal: PhantomData<()> }
```
Non-`Clone`, non-`Copy`, non-`Default`, **no `Deserialize`**, private fields, no
public constructor. Minted only inside the native-dialog handler after a confirmed
click; consumed **by value** by `satex_risk::arm_live(grant, cap)`. Because it has
no `Deserialize` impl, no IPC command, config file, env var, or test hook can
produce one — the "no programmatic completion path" property becomes a type fact
rather than a review promise.
**Proofs (trybuild compile-fail):** external construction fails; `.clone()` fails;
`Default::default()` fails; deserializing from JSON fails. Plus a runtime test that
`arm_live` cannot be reached from any registered command handler signature.
Apply the identical pattern as `GraduationGrant` for MAY-TACTICS — that alone closes
G-1, and adding an operator-only `ungraduate(grant, reason)` closes its
irreversibility.

**A-2 — One atomic-write primitive, mandatory in the perimeter (carries I-5;
closes G-2).**
`satex_persist::AtomicStateFile<T>`: `tempfile::NamedTempFile` on the same volume →
write → **fsync** → `persist()` rename → unlink on any failure path, high-entropy
tmp name. Then make every other route unreachable: clippy `disallowed-methods`
denying `std::fs::write` / `std::fs::File::create` inside `satex-risk`,
`satex-exec`, and the persistence modules backing perimeter state, mirroring the
existing `disallowed_types` wall for `f32` (`clippy.toml`). Every perimeter state
file — kill switch, arming, tactics, funded account, endpoint mode — goes through it.
**Proof:** the RS-8.3 crash-injection harness (kill between write and rename,
×1000) generalized into a reusable test fixture applied to *each* perimeter state
file, asserting the on-disk bytes are always either the complete old or complete new
value. Fsync is the addition over the TS original: rename atomicity without a
durability barrier still loses the write on power loss.

**A-3 — Fail-direction as a type obligation (closes G-3; the highest-value item).**
```rust
pub enum Load<T> { Loaded(T), Missing, Corrupt { detail: String } }
pub trait PerimeterState: Sized { const ON_CORRUPT: CorruptPolicy; fn most_restrictive() -> Self; }
```
Perimeter loaders **may not silently default**. `Corrupt` must resolve to
`most_restrictive()` *and* raise a loud degraded signal to the operator — for the
kill switch that means armed; for tactics it means veto engaged and the entry gate
active, never pass-through. `Missing` (genuine first run) stays distinct from
`Corrupt` (data loss), which the TS `catch` conflates
(`kill-switch-store.ts:41`, `tactics.ts:77`, `live-mode.ts:27`).
**Proof:** one test per state type asserting `ON_CORRUPT` matches its documented
safety direction, so adding a perimeter state file without declaring its
fail-direction does not compile.

**A-4 — The kill chord leaves the WebView (carries I-15; closes G-5 — the
"exceed, don't copy" centerpiece).**
Register the chord as an **OS-level global shortcut in `satex-shell`** with the
handler in Rust, so it is wholly independent of renderer liveness; add redundant
native paths (tray item, application-menu accelerator). Arm instantly (T-2);
require the `ArmingGrant`-class token to disarm while live (I-2). Add a WebView
heartbeat: if the renderer stops reporting, the shell surfaces a native "renderer
unresponsive — kill switch still live, chord active" affordance, converting the
current silent single point of failure into an explicit, still-controllable state.
**Proofs (RS-9.6):** chord arms with the WebView process killed; chord arms during
boot before any frontend JS has run; chord arms while a renderer panic is unhandled;
chord state write survives crash injection (A-2). Each of these is a test the
Electron build cannot pass today.

**A-5 — The paper wall becomes unrepresentable-to-violate (carries I-12;
closes G-8).**
Typestate order intents: `OrderIntent<Paper>` / `OrderIntent<Live>`. `satex-intel`
exports only the `Paper` form and cannot *name* `Live` (module privacy +
crate-level re-export discipline); `satex_exec::submit_live` accepts only
`OrderIntent<Live>`, constructible solely in a module gated behind the arming grant.
The autonomous trader receives a narrow `PaperSubmitter` capability rather than the
full router — replacing `trading-engine.ts:700`'s unrestricted `submitOrder`
hand-off. Additionally, check the capital wall at **start** as well as per cycle, so
"enabled" never means "silently inert."
**Proofs:** trybuild compile-fail asserting `satex-intel` cannot construct or name
`OrderIntent<Live>`; workspace test asserting no crate but `satex-exec` can
construct a broker submission (plan RS-8.2).

**A-6 — Ceremonies carry and re-verify their preconditions (closes G-6).**
The native dialog renders the full decision context — endpoint, per-order cap,
kill-switch state, daily-P&L headroom against the limit, feed identity
(SIM/LIVE/REPLAY), open-position count — and the minted grant embeds a
`PreconditionHash` of that snapshot. `arm_live` recomputes the preconditions and
**rejects if anything changed between mint and use**. This converts I-4's snapshot
check into a bound contract and makes the ceremony informative rather than merely
obstructive: the operator authorizes exactly the state they were shown.

**A-7 — Composite capital state gets one authority and one ceremony (closes G-7).**
Model real-capital routing as a single derived value over (endpoint, intent,
credentials) — the Rust twin of `live-mode.ts:38-39`'s conjunction — and gate
*transitions of that composite* rather than gating one of its two inputs. Any
transition that could increase capital exposure requires the grant; the endpoint
flip stops being a silent half-step.

**A-8 — Freshness stays the authority, with `Unknown` unrepresentable-as-fresh
(carries I-11).**
```rust
pub enum Freshness { Fresh(Duration), Stale(Duration), Unknown }
```
No `Default`, no `Ord` shortcut that could sort `Unknown` as acceptable; the gate
matches exhaustively and refuses on `Stale | Unknown`. The D6 NaN lesson
(`order-manager.ts:222-230`) becomes a compile-enforced property instead of a
defensive branch. Session state (`broker-session.ts:128-137`) remains presentation
only, never an input to trading authority.

**A-9 — Read-only risk limits by visibility (carries §3.4's thrice-stated law).**
`satex-intel` receives `&RiskLimits` with no `&mut` API and no interior mutability;
no setter is exported across the crate boundary.
**Proof:** a workspace test asserting the mutable limit type is not nameable from
any intel crate.

**A-10 — Honest teardown (closes G-9).**
Keep the hard-exit net (I-17), but exit **non-zero** on watchdog fire and persist a
`wedged: true` breadcrumb (through A-2) before exiting, so the next boot can surface
"last shutdown did not complete cleanly" instead of pretending it did.

---

# 5. RED LINES FOR THE OTHER LENSES

Constraints I assert as Lens A. Each cites its authority. A redesign that violates
one of these is not a Track X candidate regardless of how much better it feels.

- **R-1 — Never make a protective action slower or more gated than a permissive
  one.** Arming the kill switch, flattening, disarming live, and halting must always
  be the cheapest paths in the interface. (§3.4 "the kill switch is sacred"; §0.3;
  I-3 as implemented at `index.ts:709`.)
- **R-2 — No arming or graduation path may be completable by any renderer-reachable
  command, test hook, config value, or environment variable.** Authorization
  originates on a native surface only. (§2.4; the C6 rationale at
  `index.ts:825-831`; plan RS-8.4 "no programmatic completion path".)
- **R-3 — The kill chord must be reachable in every UI state *and* must not depend
  on WebView liveness.** No lens may leave chord ownership solely in the renderer.
  (§1.3 P0; P-044; P-098; gap G-5.)
- **R-4 — No perimeter state file may be written non-atomically, and no perimeter
  loader may resolve a corrupt file toward less protection.** (§2.4 atomic-write
  contract; evidence G-2/G-3.)
- **R-5 — Autonomous execution stays paper-only, enforced structurally rather than
  by predicate.** No lens may propose a live-autonomous affordance, not even
  flag-gated or "for testing." (§3.7; RS-L2; plan RS-5.8.)
- **R-6 — No ceremony may be replaced by an in-window modal, a renderer-side typed
  phrase, or any "remember this choice" persistence.** The `confirmPhrase` failure
  is on record (`index.ts:830-831`). (§1.4 "a human ceremony".)
- **R-7 — Degraded and stale feeds HALT-and-surface.** No fallback-to-stale, no
  "last known good" price on the decision path, no treating a `CONNECTED` label as
  freshness. (§3.2 "stale data is poison"; I-11.)
- **R-8 — Every interlock the redesign ships must ship WITH its tests.** The P-094
  precedent means an untested interlock is an unshipped interlock in the Rust world.
  (§2.1; plan RS-8.4.)
- **R-9 — Replay may never price a real order.** (I-9; `trading-engine.ts:1115`.)
- **R-10 — No redesign may widen a risk limit, add an agent- or scheduler-reachable
  path to any interlock, or relocate perimeter logic out of the ⚠️ crates.**
  (§2.4; §3.4 read-only limits; D-013.)

**One request to Lens B (ergonomics):** T-2 and A-4 together mean the arming
experience changes shape — instant arm, unmissable armed state, instant paper
disarm, ceremonial live disarm. The 2 s hold is yours to redesign, but the direction
is fixed by R-1: friction moves off the protective path entirely.

**One request to Lens C (systems):** A-3's fail-direction obligation and A-6's
precondition-hash contract both need to appear in your FSM tables as explicit
guards, and the `Corrupt` load outcome needs to be a first-class *state* in the
kill-switch and tactics machines, not an initialization detail.

---

```
[LENS A — SAFETY ARCHITECTURE]
[Read-only audit. 0 files modified, 0 git operations.]
[Every behavioral claim above cites file:line at mc4-rust @ 78bac1f — verify, don't trust (RS-L5).]
```
