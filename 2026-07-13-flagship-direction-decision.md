# Flagship Direction Decision — The Conviction Layer

**Date:** 2026-07-13
**Type:** Design decision (Track B, §2.7 planning doctrine)
**Status:** DECIDED — awaiting branch + /ultraplan for the code-touching half
**Verified against:** `apps/satex-terminal/src/main/services/{brain,calibration,self-eval,pattern-learner}.ts`, `PROBLEM-LEDGER.md` (P-096, P-098, P-099), `ARCHITECTURE.md` §4 ladder position

## The three options on the table

1. **Command cockpit (UI/UX)** — read-only renderer work, zero perimeter contact, highest wow, lowest risk.
2. **Self-improving strategy brain** — extends `brain.ts` (SGD, 7 features) + `calibration.ts` (downgrade-only multiplier, `MIN_SAMPLES=30`, `MULT_FLOOR=0.5`) + `self-eval.ts` (P-096 statistical-significance layer, SHIPPED 2026-07-10). Touches the learning core — needs a plan + human sign-off.
3. **Risk & safety intelligence** — the most mature domain already: 9 risk gates + 3 walls, `RiskGatePanel.tsx` already exists, `KillSwitch` already sacred. Least *new ground*, most sensitive to touch.

Picking one and shelving the other two is the wrong frame. They aren't competitors — they're three views of one differentiator SATEX can own outright.

## The wedge nobody else has

Every retail and most prop terminals show a trader *numbers*: P&L, win rate, an indicator stack. None show a trader their own **calibrated psychological state** — conviction that had to be earned, humility that is automatic, and process discipline rendered as a live instrument. That gap is the opportunity, and SATEX already has the raw material for it sitting unused in the services layer:

- `calibration.ts` already computes a Brier score and a reliability curve and enforces "confidence can only be scaled down, never up" — this is Mark Douglas's *probabilistic mindset* (supreme confidence in the process, zero attachment to any single trade) already encoded as a downgrade-only multiplier.
- `self-eval.ts` (P-096) already ranks strategies by statistically-significant edge, not raw Sharpe — this is Van Tharp's *expectancy over win-rate* doctrine, already shipped.
- CONSTITUTION §3.6 already prescribes the exact loss/win classification every Market Wizard describes: investigate high-confidence losses, discount low-confidence wins ("luck is not skill"), shrink on losing streaks, audit for overfit on winning streaks. This is written down as doctrine — verify whether `pattern-learner.ts` actually implements the classification behavior yet, or whether it's still prose waiting for code. (First `/ultraplan` question for Track B.)

None of this is visible to the operator today. It's computed and thrown away.

## Final decision: build the Conviction Layer, cockpit-first

**Option 4.** Not a fourth track — a sequencing of the three that ships the safe part first and stages the risky part properly:

**Now (Track A, this session, read-only, zero perimeter contact):** Ship a new cockpit surface — working name **DISCIPLINE** panel, Black Box mono aesthetic, `--bb-*` tokens, sits beside `AIInsightsPanel` and `RiskGatePanel` — that renders the psychology-mapped data that already exists: Brier/reliability curve from `calibration.ts`, the P-096 significance-adjusted expectancy from `self-eval.ts`, and a live win/loss classification feed once verified against `pattern-learner.ts`. Composite readout: one number, "process discipline," alongside the existing SIM/SUB badges. This is pure rendering — no learning-core code changes, no plan required beyond the ordinary gate bar.

**Next (Track B, after the bell, branch + plan + human sign-off):** If `pattern-learner.ts` doesn't yet implement the §3.6 classification, that becomes the first `/ultraplan`-gated build — because it touches the learning core (Option 2's substance), and per §2.7 that's mandatory before code lands.

**Ongoing (Track 3, folded in, not shelved):** Risk state rides the same cockpit surface as ever-present ground truth beside conviction — it doesn't get its own initiative because it doesn't need one; it needs to stay exactly as boring and untouchable as it already is.

## On "extreme confidence"

Worth saying plainly rather than nodding along: the architecture is deliberately the opposite of extreme confidence in any single signal — `MULT_FLOOR = 0.5`, `MIN_SAMPLES = 30`, downgrade-only, forever. That's not a limitation to design around, it's the trait every Market Wizard shares and every blown-up trader lacks. The confidence that should be extreme is confidence *in the gates* — never flinching at a properly-sized loss, never second-guessing a green gate, never overriding the calibration multiplier because a signal "feels" right. That's the trader psychology worth building: quiet certainty in the process, total neutrality about any individual trade's outcome. The DISCIPLINE panel's job is to make that mindset visible, not to manufacture false conviction the calibration engine would immediately discount anyway.

## Why this is the most impressive achievable state

A terminal that can point at its own dashboard and say, with a straight face, "my confidence is earned, my losses are graded, and my risk limits are read-only to the part of me that wants to be right" is not a common thing to show a funded-account evaluator. It's the version of SATEX that looks like it was built by someone who has read every trading psychology book that matters and then had the discipline to encode it in TypeScript instead of just believing it.
