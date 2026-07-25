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

# TRACK X — LENS B: THE OPERATOR-ERGONOMICS REPORT

```
[LENS]      B — Operator Ergonomics (the lived experience)
[PROGRAM]   RS-UP-1 Track X — operator-experience redesign (plan v1.1 amendment)
[MEASURED]  2026-07-25 against C:\Users\User\mc4-rust @ origin/master (78bac1f)
[METHOD]    Read-only study of the five Track X flows through the renderer
            surfaces that communicate them. Every behavioral claim cites
            file:line. Where this report and the code disagree, the code wins
            (RS-L5) — two such disagreements are findings F3 and F5 below.
[NORTH STAR] Constitution P3: a live session must be calm, fast, legible.
             Ease-at-the-open is the product.
```

## 0. THE HEADLINE

The current terminal is **beautifully dressed and dangerously quiet.** It renders a
Black Box aesthetic with 9-step type scales and three themes, and then fails to tell
the operator the two things that matter most: *am I halted?* and *am I about to spend
real money?* Both answers are hidden behind a hover or a menu click.

Eleven findings, ranked by what they cost the operator in a live session:

| # | Finding | Where | Cost |
|---|---|---|---|
| **F1** | **An ARMED kill switch has no ambient indicator.** The only global overlay exists during the 2-second arming hold, then vanishes. | `App.tsx:469-479`, `globals.css:3526` | Operator cannot tell a halted terminal from a running one at a glance |
| **F2** | **"Am I armed for real capital?" is answered in a tooltip.** | `TopBar.tsx:322` | The P1 capital-safety state requires a mouse hover |
| **F3** | **The typed-phrase ceremony does not exist.** Removed 2026-05-16 (C6); the UI still tells the operator to arm it. | `LiveModeModal.tsx:14-19`, `main/index.ts:824-861` vs `TopBar.tsx:178` | Doc + UI drift on the most sacred interaction; RS-8.4 would port a fiction |
| **F4** | **Reconnect is invisible.** A 5-state session machine exists in the engine and never reaches the renderer. | `shared/broker/broker-session.ts:16-20` vs `shared/types.ts:412` | During a live WS drop the operator watches a boolean |
| **F5** | **Five fabricated metrics ship in the status ribbon**, including a hardcoded `SHARPE 2.10`. | `BottomBar.tsx:47,49,50,51,71` | Directive 0.1 violation rendered as fact; poisons trust in every neighbouring number |
| **F6** | **`window.confirm` / `window.alert` walls of text gate the most consequential flows.** | `TopBar.tsx:117-131,156-163,174-181`; `SettingsModal.tsx:136` | OS-default dialogs, unstyled, unreadable, blocking |
| **F7** | **Friction is asymmetric in the wrong direction.** Chord-arm = 2s hold; menu arm/disarm = one click, no confirm. | `App.tsx:215-238` vs `TopBar.tsx:250-253` | The dangerous direction (disarm) is the cheapest action in the app |
| **F8** | **A displayed interlock is inverted and decorative.** | `LiveModeModal.tsx:60,62` | Shows ✗ exactly when the endpoint is correct; never blocks anything |
| **F9** | **The AUTO pill cannot answer "is the loop alive?"** `lastDecisionAt` exists in the type, is never rendered; `pulse` animates on *enabled*, not activity. | `shared/types.ts:444`, `TopBar.tsx:360-366` | A dead 30s loop looks identical to a healthy idle one |
| **F10** | **Armed-state display is stale by construction** — refreshed only when a modal opens or closes. | `App.tsx:139-146` | The one number you must trust updates on an unrelated trigger |
| **F11** | **Paper-only policy is enforced by apology, not by affordance.** | `TopBar.tsx:116-123` | Operator clicks, *then* gets told no |

Three things are genuinely excellent and must survive the rewrite: the 2-second
arm-hold with live progress (`App.tsx:225-238`, `469-479`), the boot gate's
deliberate kill-chord fall-through discipline (`BootIntroSequence.tsx:18-19,133-142`),
and `data-source-guard.ts`'s precedence-ordered pure interlock with human-readable
refusal reasons (`data-source-guard.ts:14-21`). The last one is the model the whole
redesign should copy.

---

## 1. FLOW WALKTHROUGHS — TODAY-SCRIPTS

### Flow 1 — Kill switch: arm / fire / reset

**Path A, the chord (the good path).** Operator presses ⌘⇧K. A centred overlay card
appears: `HOLD ⌘⇧K TO ARM KILL SWITCH`, a progress bar filling over 2,000 ms, and the
hint `release to cancel · cancels all open orders + halts trading`
(`App.tsx:470-478`). Releasing K, Shift, Meta or Control cancels cleanly
(`App.tsx:265-271`). At 2,000 ms it fires `killSwitch(true)` and the overlay
disappears (`App.tsx:227-231`).

Then the screen goes back to looking **completely normal.** This is F1. Grep the
renderer for `killSwitchArmed` and you find five consumers, none of them ambient:
the chord branch (`App.tsx:217`), a modal interlock row (`LiveModeModal.tsx:57`), a
dropdown *label* (`TopBar.tsx:250`), a disabled submit button plus tooltip
(`ExecTicketPanel.tsx:111,225`), and a Markets-table read (`MarketsOverviewPanel.tsx:43`).
The only global overlay class in the stylesheet is `.kill-arm-overlay`
(`globals.css:3526`) — the transient hold card. **There is no persistent HALTED
state.** An operator who arms the switch, steps away for coffee, and returns has to
open the Markets menu and read whether it says "Arm" or "Disarm" to learn whether
their terminal is trading.

**Path B, the menu (the bad path).** Markets → "Arm kill switch" /
"Disarm kill switch" is a single click straight to
`window.satex?.killSwitch(!account.killSwitchArmed)` (`TopBar.tsx:250-253`). No
2-second hold. No confirmation. The ceremony the chord enforces is bypassed entirely
by the dropdown — and critically, **disarm is instant on both paths**
(`App.tsx:217-221`). The code comments this as intentional ("operators need the fast
path back to trading", `App.tsx:78-79`), and that instinct is right for *fire*
direction ergonomics — but resuming a halted session after a daily-loss auto-arm is
not a keystroke-grade decision. F7.

**Reset.** The store persists `armed` across restarts by design
(`kill-switch-store.ts:4-6`), and default-on-corrupt is disarmed
(`kill-switch-store.ts:11`) — correct choices. But the renderer never shows
`armedAt` or `reason` (both stored, `kill-switch-store.ts:23-25`), so the operator
cannot see *why* or *when* the halt happened. If the engine auto-armed on a
daily-loss breach overnight, the morning experience is: everything looks fine,
orders silently refuse, and the explanation is one field the UI declines to render.

### Flow 2 — Live-capital arming

**What the docs promise vs what happens.** The constitution (§2.4) and plan RS-8.4
both describe a "typed-phrase native dialog." **That ceremony was deleted on
2026-05-16** as adversarial finding C6: the renderer-side string check was bypassable
by any in-process code, so it was replaced with a native Electron message box
(`LiveModeModal.tsx:11-19`; handler at `main/index.ts:824-861`). The replacement is
*better security* — the OS-level dialog is unreachable from renderer XSS
(`main/index.ts:826-831`) — but nobody updated the story. Worse, the terminal itself
still instructs the operator to *"arm the typed-phrase interlock"* inside a live
confirmation dialog (`TopBar.tsx:178`). **The app documents a ritual it no longer
performs.** F3, and it directly threatens Track P: RS-8.4 as written would port a
ceremony that does not exist.

**The today-script.** Markets → "● LIVE mode (real capital)" opens `LiveModeModal`
(`TopBar.tsx:236-238`). The operator sees a red warning block, an "Interlocks" grid
of three check rows, a notional-cap input defaulting to `500`, and a "Final
confirmation" explainer (`LiveModeModal.tsx:112-153`). Clicking **Enable Live Mode**
flips the button to `Awaiting native confirmation…` (`LiveModeModal.tsx:103`) and a
native OS dialog appears with `Cancel` / `I accept real capital`
(`main/index.ts:839`), listing endpoint, per-order cap, and three lines of plain
consequence (`main/index.ts:844-851`). That dialog copy is the best-written text in
the entire flow.

**Where it degrades.** The third interlock row — "Broker endpoint" — is computed as
`status?.paperOnly === false ? false : true` (`LiveModeModal.tsx:60`). Read it twice:
when you are *not* paper-only, i.e. genuinely pointed at the live endpoint,
`endpointOk` is **false** and the row renders a red ✗. And `allOk` never includes it
anyway (`LiveModeModal.tsx:62`), so it gates nothing. A safety checklist with an
inverted, non-binding row is worse than no row: it teaches the operator to ignore red
marks. F8.

Then the operator closes the modal and returns to a terminal whose only statement
about real-capital arming is a **tooltip** on the mode toggle:
`Order interlock: ARMED | not armed` (`TopBar.tsx:322`). The visible toggle shows
PAPER/LIVE for the *endpoint* (`TopBar.tsx:327-335`), which is a different concept:
you can be on the live endpoint with orders still blocked, and the button looks the
same either way. Two distinct states, one control, one hover to disambiguate. F2 —
and it is the most expensive illegibility in the product.

Compounding it, `App.tsx:139-146` refreshes `liveMode` only when the `modal` value
changes. Any engine-side change to arming while no modal is opening or closing leaves
the TopBar's prop stale. F10.

### Flow 3 — Alpaca reconnect during a live session

**What the engine knows.** `SessionState` is a real 5-state machine —
`DISCONNECTED | CONNECTING | CONNECTED | RECONNECTING | FAILED`
(`shared/broker/broker-session.ts:16-20`) — with a listener API
(`onStateChange`, `:49`), a concrete implementation that transitions on reconnect
signals (`main/services/alpaca/broker-session.ts:131-135`), and dedup'd snapshots.

**What the operator sees.** Nothing of it. Grep the renderer for `RECONNECTING`:
zero hits. No IPC channel carries session state — the 124-channel inventory has no
session-state row, and `SystemStatus` flattens the whole machine into
`connected: boolean` alongside `latencyMs` and a separate `crypto.connected`
(`shared/types.ts:411-423`). The status cluster renders a crypto dot, a latency pill
that turns amber above 50 ms, and nothing else (`TopBar.tsx:377-390`). F4.

So the live-session reconnect script is: quotes stop moving. The LAT pill may or may
not change. The operator does not know whether the socket is retrying, how many
attempts have failed, how long it has been degraded, or whether their open positions
are still being reconciled. The constitution's own doctrine — *"stale data is poison;
degrade loudly, never silently"* (§3.2) — is satisfied inside the engine and lost at
the IPC boundary.

**The manual escape hatch is worse.** Markets → "Reconnect Alpaca stream" is
fire-and-forget: `onClick: () => window.satex?.reconnectAlpaca?.()`
(`TopBar.tsx:256`) — no await, no busy state, no toast, no failure path. The operator
clicks a menu item and receives zero acknowledgement that anything happened. The same
action inside Settings *does* have busy state and a result message
(`SettingsModal.tsx:146-147,214,339-352`), which proves the pattern exists and the
TopBar path simply skipped it.

### Flow 4 — Autonomous start / stop

**Today-script.** Two entry points: the Markets dropdown row (`TopBar.tsx:242-245`)
and the AUTO status pill, which is *also* a toggle (`TopBar.tsx:364`). Both call
`toggleAutonomous()`.

If the operator is on the live endpoint or the interlock is armed, the function fires
a `window.alert` telling them autonomous is paper-only and instructing them to go
flip two other controls (`TopBar.tsx:116-123`). **The refusal arrives after the
click.** The pill looked identical to an enabled-capable pill a moment earlier. F11:
policy enforced by apology instead of by a visibly-unavailable affordance with an
inline reason.

Otherwise they get a `window.confirm` containing a five-bullet wall of text —
"Cycles every 30 seconds… Will keep running while you sleep until you turn it off"
(`TopBar.tsx:124-131`). The content is genuinely important; the vehicle is an
unstyled OS dialog in the middle of a designed terminal. F6.

**Monitoring, once running.** The pill shows `approvedCount/signalsFired` with a
tooltip adding rejects (`TopBar.tsx:359-366`). The cycle is 30 seconds
(`autonomous-trader.ts:52`, timer at `:131`). `AutonomousStatus` carries
`lastDecisionAt` and `cooldownsActive` (`shared/types.ts:442-448`) — **neither is
rendered anywhere.** So the operator cannot answer "is it deciding right now?" or
"when did it last think?", which over a 30-second cycle is the difference between a
healthy idle loop and a wedged one. The `pulse` animation is bound to
`autonomous?.enabled` (`TopBar.tsx:365`), so it pulses steadily whether or not cycles
are actually firing: **a liveness indicator that lies.** F9.

### Flow 5 — Sim ⇄ live data feed, and the session lifecycle

**The feed switch.** Correctly demoted out of the TopBar (P-087) into Settings →
"Market Data Feed", with an explicit rationale preserved in the code
(`TopBar.tsx:338-342`), a LIVE ALPACA / SIMULATOR chip, and hint copy that carefully
distinguishes market data from the real-capital toggle
(`SettingsModal.tsx:507-525`). The interlock behind it is the cleanest code in this
study: `evaluateDataSourceSwitch` is pure, precedence-ordered, and every refusal is a
sentence the operator can act on — *"Stop replay before switching the data feed."*,
*"Disarm ● LIVE real-capital mode before switching the data feed."*
(`data-source-guard.ts:14-21`).

Two frictions. The clearing of simulated positions goes through `confirm()` again
(`SettingsModal.tsx:136`), and the switch is *only* discoverable inside a modal —
while the per-symbol SIM badges that provide ambient awareness live in the Watchlist,
driven off `FeedStatus` whose pessimistic default is `equity:'off', futures:'synthetic',
crypto:'off'` until the first push (`feedStore.ts:22`). That default is the right
safety posture, but it means the first ~1.5 s of every session displays a feed state
that is deliberately wrong, with nothing marking it as not-yet-known.

**Session lifecycle.** Cold boot is a standby gate — framed plate, live UTC, corner
metadata, breathing `PRESS ANY KEY TO CONTINUE`, risk line, OPTIONS button into
Settings (`StandbyGateFrame.tsx:1-70`) — then an ~8.2 s boot ceremony, with the
terminal warming underneath and mounting on dissolve (`App.tsx:284-294`). The
keyboard handling here is exemplary and should be preserved verbatim in spirit: the
gate listener ignores bare modifiers and chords and never calls `preventDefault` or
`stopPropagation`, precisely so the kill chord falls through
(`BootIntroSequence.tsx:18-19,133-142`), with a `holdKeys` prop suppressing
arm-on-keypress while a modal is open (`App.tsx:292`).

One gap at the end of the session: the FEED corner of the gate is a hardcoded string,
`FEED  ALPACA` (`StandbyGateFrame.tsx:66`) — shown identically when the session will
in fact boot on the simulator. And session end has an exit *reflection* prompt for
closed trades (`ExitReflectionModal.tsx:1-17`, no-nag by design — good) but **no
session close-out at all**: no "here is your day" summary, no halt-state reconciliation,
no confirmation that the tape sealed and the vault wrote. The quit path is a graceful
`before-quit` teardown with a watchdog (`main/index.ts:1173-1175`), invisible to the
operator, who just watches the window disappear.

---

## 2. THE LEGIBILITY CONTRACT

Per flow, the questions the screen must answer **instantly, ambiently, without a
hover or a click** — and today's verdict.

| Question the operator must never have to ask | Today | Evidence |
|---|---|---|
| **Is trading halted right now?** | ✗ Fails — menu-only | `TopBar.tsx:250`; no ambient state (F1) |
| **Why and when was it halted?** | ✗ Fails — `reason`/`armedAt` stored, never rendered | `kill-switch-store.ts:23-25` |
| **Can my next click spend real money?** | ✗ Fails — tooltip | `TopBar.tsx:322` (F2) |
| **Which of the two "live" things am I in?** | ✗ Fails — one control, two concepts | `TopBar.tsx:313-336` vs `LiveModeModal` |
| **Is this price real, simulated, or stale?** | ~ Partial — per-symbol SIM badges, but no session-level statement; pessimistic default unmarked | `feedStore.ts:22` |
| **Is my broker connection healthy, retrying, or dead?** | ✗ Fails — boolean + latency only | `shared/types.ts:412` (F4) |
| **How long have I been degraded?** | ✗ Fails — not modelled in the renderer | — |
| **Is the autonomous loop deciding right now?** | ✗ Fails — pulse lies, `lastDecisionAt` unrendered | `TopBar.tsx:365` (F9) |
| **Is my per-order cap what I think it is?** | ~ Partial — visible only inside the modal | `LiveModeModal.tsx:109` |
| **Are the numbers on my screen measured?** | ✗ **Fails hard** — 5 hardcoded values | `BottomBar.tsx:47,49,50,51,71` (F5) |

That last row deserves its own paragraph, because it is the one finding that
undermines every other surface. `LIQ DEPTH: top-of-book · ok`, `CVD: buy-init bias`,
`SLIPPAGE: 1.4 bp · good`, `SHARPE: 2.10 · rolling`, and `LOG: ● tape · ok` are
**string literals** in a component documented as a "ribbon of session metrics"
(`BottomBar.tsx:1-8`). Five of twelve items are decorative. A hardcoded Sharpe of
2.10 sits three panels away from the DISCIPLINE panel whose entire purpose is honest,
significance-deflated edge reporting (P-096/P-100). Directive 0.1 says never
fabricate; this is fabrication rendered in monospace at 30 px, permanently, to the
person deciding how much size to take. It is off-perimeter and routes no order — and
it is still the most corrosive thing in the UI, because an operator who learns that
*some* numbers are props cannot fully trust *any* of them.

---

## 3. FIRST-PRINCIPLES REDESIGN

Design rule for the whole track: **ceremony scales with irreversibility, legibility
never scales down.** Ceremony is for actions that move money or halt a business.
Legibility is unconditional — every safety-relevant state is ambient, always, at
zero interaction cost.

### 3.1 A permanent State Spine

Replace the scattered pills with one **always-visible spine** occupying the
highest-priority strip of chrome (top-right of the TopBar, before the clocks). It
renders, at all times, three tokens in fixed positions:

```
[ CAPITAL: PAPER ]  [ FEED: LIVE ]  [ SESSION: CONNECTED · 34ms ]
[ CAPITAL: ARMED  ]  [ FEED: SIM  ]  [ SESSION: RECONNECTING 2/5 · 18s ]
```

Rules: fixed slot order, so position alone carries meaning; each token states its
*subject* and its *state* (never a bare colour); no token is ever absent — unknown
renders as `—` with a "resolving" treatment, never as a default that looks like an
answer (fixes the `feedStore.ts:22` invisible-pessimism gap). CAPITAL is the union of
endpoint and interlock, resolved to what the operator actually needs: can a click
spend real money, yes or no. This kills F2 and the two-concepts-one-control problem
outright.

### 3.2 HALTED is a full-chrome state, not a menu label

When the kill switch is armed, the terminal **looks halted**: a persistent top-edge
band across the full window width reading
`HALTED · 14:32:07 · daily-loss breach · ⌘⇧K to resume` — pulling `reason` and
`armedAt` straight from state the store already keeps
(`kill-switch-store.ts:23-25`). Order-entry affordances render disabled *in place*
with the halt reason inline rather than a tooltip. The band survives every workspace
switch and every error boundary — the P-044 lineage applies to the *indicator* as
much as the chord.

Arming keeps the 2-second hold exactly as built (`App.tsx:225-238`) — it is the best
interaction in the app. The menu path adopts the same hold rather than bypassing it,
so one action has one cost (fixes F7).

**Resuming becomes the ceremony.** Disarming after a *manual* halt stays cheap: one
hold, no dialog. Disarming after an *auto* halt (daily-loss, drawdown) requires
acknowledging the reason — a single native confirmation naming the breach and the
number. The asymmetry inverts to point the right way: cheap to stop, deliberate to
restart.

### 3.3 Reconnect: narrate the machine

Ship the session FSM to the renderer as a first-class event — this is an IPC delta
Lens C should carry into RS-9.2 — and let the SESSION token narrate it honestly:

- `CONNECTED · 34ms` — steady, quiet.
- `RECONNECTING · attempt 2/5 · 18s degraded` — amber, with an elapsed clock, because
  duration is what the operator actually reasons about.
- `FAILED · trading halted · [Reconnect]` — an inline action, not a menu hunt.

Every state names its consequence for *trading*, not just for the socket. Manual
reconnect gets the busy/result treatment that already exists in Settings
(`SettingsModal.tsx:339-352`) instead of the silent fire-and-forget
(`TopBar.tsx:256`). And per §3.2 doctrine, if the feed is stale the terminal says so
loudly at the quote level — a stale price must never render as a fresh one.

### 3.4 Autonomous: show the heartbeat, gate by affordance

The AUTO token becomes a heartbeat, not a counter:

```
AUTO · ON · next cycle 12s · last decision 3m ago · 4/17 approved · 2 cooldowns
```

Bind the pulse to *actual cycle activity* rather than to `enabled` (fixes the lying
animation, `TopBar.tsx:365`), and render `lastDecisionAt` and `cooldownsActive` —
both already in the type (`shared/types.ts:444,447`). A loop that has not decided in
three cycles surfaces as degraded on its own.

Replace the post-click alert with a pre-click truth: when the endpoint is live or the
interlock is armed, the toggle renders **unavailable with its reason attached** —
`AUTO · unavailable · paper-only policy` — so the operator learns the rule without
being scolded by an OS dialog (fixes F11 and part of F6). Enabling keeps a
confirmation, because "runs while you sleep" is genuinely consequential — but as a
styled in-app confirmation carrying the same four facts, with the 30-second cycle and
the paper-only wall stated as *properties*, not as a bulleted warning.

### 3.5 Feed switch and session lifecycle

Keep the switch in Settings (P-087 was right) and keep `evaluateDataSourceSwitch`'s
refusal sentences verbatim — they are the house style for every interlock message in
the redesign. Move the position-clearing confirmation out of `confirm()` into a
styled dialog that *shows what will be cleared* (n positions, notional) instead of
describing it.

Boot: the standby gate's corner metadata must tell the truth — `FEED  SIMULATOR`
when that is what will boot, replacing the hardcoded `ALPACA`
(`StandbyGateFrame.tsx:66`). Preserve the chord fall-through discipline exactly
(`BootIntroSequence.tsx:133-142`).

Close: add a **session close-out** the operator reads in five seconds — the day's
realized P&L, trade count, halt events with reasons, feed provenance for the session,
and explicit confirmation that the tape sealed and the vault wrote. The engine
already computes all of it; the operator currently gets a disappearing window
(`main/index.ts:1173-1175`). Ending a session should feel like closing a book, not
like a process exiting.

### 3.6 Retire the OS dialogs

Every `window.alert` / `window.confirm` / `window.prompt` in these flows
(`TopBar.tsx:117,124,134,139,156,167,174,186,196,213`; `SettingsModal.tsx:136`) is
replaced by in-app, themed, keyboard-navigable dialogs — **except** the real-capital
authorization, which stays native and OS-rendered for exactly the C6 reason
(`main/index.ts:826-831`). The distinction becomes a design signal in itself: *if the
dialog is drawn by the operating system, real money is involved.* One unmistakable
visual exception, earned.

---

## 4. THE ARMING CEREMONY, REIMAGINED

This is the product's most sacred interaction and it currently ends in a generic
message box titled "SATEX — Enable LIVE trading."

First, resolve F3 honestly: **the typed phrase is gone, and the native dialog is
stronger.** The plan's RS-8.4 language and the constitution's §2.4 wording must be
corrected to "native OS-rendered authorization dialog with no programmatic completion
path," and `TopBar.tsx:178`'s stale instruction deleted. Then design the ceremony the
architecture actually supports.

**Three beats, and only three.**

**Beat 1 — Preparation (in-app, reversible, honest).** The live-mode panel states the
consequence in one sentence, then shows the interlocks as a **binding** checklist:
kill switch, daily-loss headroom with the real numbers, credentials present, endpoint
identity. Every row is enforced in the enable predicate — no decorative rows, no
inverted logic (fixes F8). Rows that block render with the *action that clears them*
attached, in `data-source-guard`'s voice: "Kill switch armed — hold ⌘⇧K to disarm."
The per-order cap is set here, with the $50,000 hard ceiling stated as a property of
the system (`live-mode.ts:18`).

**Beat 2 — Authorization (native, unmistakable, unbypassable).** The OS dialog stays,
and its copy gets promoted from adequate to unambiguous. It must name: the endpoint,
the per-order cap, the account's real equity, and the *scope* of what is being
authorized. Current copy already carries the right instinct — "Only your click on the
button below can authorize this. No renderer process, AI output, or injected script
can bypass this dialog." (`main/index.ts:849-850`) — which is worth keeping nearly
verbatim, because it tells the operator *why* the ugly OS dialog is the trustworthy
one. Buttons stay asymmetric: `Cancel` as default (`defaultId: 0`,
`main/index.ts:840`), authorization as the deliberate reach.

**Beat 3 — Confirmation (ambient, permanent, quiet).** On authorization, the CAPITAL
token flips to `ARMED` and *stays* legible for the entire armed session — this is the
ceremony's real payload. Not a toast that fades; a state. Alongside it, the armed
session carries its cap ambiently (`ARMED · $500/order`), so the operator never has
to reopen a modal to recall the boundary they set.

**Disarming stays one click, forever.** The current code gets this right and says so
(`LiveModeModal.tsx:21-22`) — friction on the way *out* of danger is an
anti-feature.

What makes this feel sacred is not added ritual. It is: a checklist that actually
binds, a dialog the operator understands the provenance of, and a state that never
lets them forget. Theater would be a typed phrase re-added for atmosphere after the
architecture stopped needing it.

---

## 5. CROSS-FLOW COHERENCE — ONE STATE VOCABULARY

The five flows currently speak five dialects: `● LIVE mode (real capital)`,
`LIVE ALPACA`, `PAPER`, `SIM`, `ARMED`, `not armed`, `○ Autonomous trader`,
`策 VETO`. Some are dots, some are words, some are kanji, and `LIVE` means two
different things in two adjacent controls.

**One grammar, applied everywhere:**

`SUBJECT: STATE · QUALIFIER` — always in that order, always with the subject named.
`CAPITAL: ARMED · $500/order`. `FEED: SIM`. `SESSION: RECONNECTING · 18s`.
`AUTO: ON · next 12s`. No bare colour, no bare dot, no orphaned adjective.

**Five states, one meaning each, one treatment each:**

| State | Meaning (invariant across all flows) | Treatment |
|---|---|---|
| **LIVE / ARMED** | Real money is reachable | The only place the danger accent appears; persistent, never decorative |
| **PAPER** | Real behaviour, no real money | Calm neutral — the default resting state of the terminal |
| **SIM** | Synthetic data — nothing here is a real market observation | Distinct from PAPER; visible at session level *and* per symbol |
| **DEGRADED** | Real but not trustworthy right now (reconnecting, stale, unknown) | Amber, always carries elapsed duration |
| **HALTED** | Trading is stopped and will not resume without a human | Full-chrome band, carries reason + timestamp |

Three cross-cutting rules that make the vocabulary load-bearing:

1. **PAPER is the visual resting state.** The terminal should look calm by default so
   that LIVE and HALTED are unmistakable by contrast. Today the danger accent is
   spent on decoration, which spends the operator's alarm budget.
2. **Unknown is a state, not a default.** `—` with a resolving treatment, never a
   confident-looking guess (`feedStore.ts:22`, `StandbyGateFrame.tsx:66`).
3. **Every number is measured or absent.** No placeholders in operator-facing chrome,
   ever — delete F5's five literals rather than "improve" them. If a metric is not
   wired, the honest render is `—`, exactly as `DisciplinePanel` already does through
   its headless, unit-tested interpretation layer (`DisciplinePanel.tsx:10-13`). That
   panel is the pattern: thin shell, all judgment in testable pure code, `fmtRelTime`
   for recency. Every surface in this report should be rebuilt to that standard.

---

## 6. HANDOFF NOTES

**To Lens C (systems):** two structural asks. (1) The session FSM needs an IPC
channel — `SessionState` exists and is listenable
(`shared/broker/broker-session.ts:16-20,49`) but has no route to the renderer; the
SESSION token in §3.3 depends on it, and it is a genuine addition to the RS-1.6
inventory rather than a re-shape. (2) Kill-switch `reason` and `armedAt` need to
reach the renderer for the HALTED band (§3.2); they are already persisted
(`kill-switch-store.ts:23-25`).

**To Lens A (interlocks):** F3 is a shared finding and I have deliberately not ruled
on it — the typed-phrase-vs-native-dialog correction is a constitutional and plan-text
change (§2.4, RS-8.4) and belongs in your red lines. F8's inverted `endpointOk` is a
live defect in a displayed interlock, and F7's arm/disarm asymmetry is an interlock
question as much as an ergonomic one.

**Ledger candidates from this study** (none filed — read-only lens, operator's call):
F5 (fabricated BottomBar metrics, Directive 0.1, off-perimeter but shipping), F8
(inverted non-binding interlock row), F3 (doc/UI drift on the arming ceremony, blocks
faithful RS-8.4 porting), F4 (session state not exposed — RS-9.2 scope item).

**Two things I did not evaluate**, being outside this lens: whether the redesigned
flows preserve interlock *strength* (Lens A owns that), and what the Tauri-native
implementation of the ambient chrome costs (Lens C). My designs assume both are
satisfiable and none of them weakens a human gate — every ceremony above is either
preserved, moved to the more-secure surface, or made harder in the direction that
resumes risk.

---

```
[LENS B COMPLETE — 2026-07-25]
[VERDICT: the terminal's aesthetics are ahead of its honesty. Track X's real
 opportunity is not new ceremony — it is making the five states the operator
 lives inside impossible to misread, and deleting every number that isn't true.]
```
