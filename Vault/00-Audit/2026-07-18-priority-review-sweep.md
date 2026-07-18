# SATEX — Priority-Ordered Review Sweep (credentials focus)

**Date:** 2026-07-18 · **Branch/base:** `master` @ `5312e73` · **Auditor:** Claude Sonnet 5 (Cowork session)
**Ledger record:** P-114 (new) · **Report class:** audit record — scoped, not exhaustive (see §0)

---

## 0 · Scope — read this before the verdict

Operator asked for a full GitHub + local review, a bug scan weighted toward the largest/
most-impactful files, an audit of API-key storage, immediate fixes for anything found, and
an Obsidian update. This report is **honest about coverage**: it is a prioritized pass over
the highest-size and highest-risk files, not a line-by-line read of all ~140 source files
(~60,186 LOC across `src/`). That would not fit one session without either cutting rigor or
running well past what "quickly scanned" implies. What follows is what was actually read
and verified, file by file — no file below was skimmed without opening it.

**Files opened in full:** `credential-store.ts` (365 lines), `ipc-schemas.ts` (394 lines,
entire file). **Files grep-swept + spot-read at the hit:** `trading-engine.ts` (2,734 lines
— timer lifecycle only), `chart-types.ts`, `main/index.ts`, `ChartPanel.tsx`, `SettingsModal.tsx`,
`TopBar.tsx`, `shared/types.ts`. **Codebase-wide pattern sweeps (grep, not per-file reads):**
unbounded `Math.min/max(...spread)`, raw `this.alpaca.*` broker-facet bypass, `as any` count,
credential values reaching `log.*()` calls. **Not covered this pass:** the other ~50 service
modules, 21 panels, 24 stores individually — flagged as follow-up in §5, not silently skipped.

## 1 · Verdict

**No urgent defect.** One real, evidenced hardening gap found (§2) — prepared as a fix,
**not merged**, because it touches two Constitution §2.4 hard walls (Credentials, IPC) that
require explicit operator sign-off regardless of how small the diff is. Everything else
checked came back clean, including the specific thing asked about: **API key storage is
already built to the standard "extremely intelligent" implies** (§3).

## 2 · Finding — IPC `.strict()` gap on the credentials channel (P-114)

`ipc-schemas.ts`'s own header states the threat model in plain language: a compromised
renderer (XSS via injected news/AI content) could call `window.satex.*` with hostile
shapes, and "these schemas are the wall." 17 of ~25 object schemas in the file enforce that
wall with `.strict()` (Zod's reject-unknown-keys mode) — several with comments citing real
adversarial findings from a 2026-05-16 review (C1: a renderer tried smuggling
`triggeredBy:'stop-loss'` to bypass gates; C6: a renderer-supplied `confirmPhrase` was
bypassable via devtools). Two schemas were quietly not on that list:

- **`CredentialsSetReq`** — the channel that carries the actual Alpaca API key + secret,
  `satex:credentials:set`. The single highest-value target for the exact threat the file's
  own header names, and the one the operator specifically asked about.
- **`AlpacaModeSetReq`** — the paper/live endpoint switch, adjacent to the live-mode arming
  perimeter.

Both were still going through `validated()` — real type and length bounds were enforced,
this was never an unvalidated channel — but without `.strict()` an extra unrecognized field
gets silently dropped instead of rejected. Lower severity than a missing gate, but a real
gap against the file's own stated convention.

**One documentation correction alongside this:** the 2026-07-16 beta-readiness sweep's
summary table claimed "Zod `.strict()` on payload channels" for all IPC. That wasn't
accurate — this session's full read of the file shows it wasn't universal. That same
report's narrower §3 claim ("every payload channel `validated()`") *was* and remains
correct; only the broader claim needed correcting. Filed as part of P-114 rather than a
separate entry, since it's the same evidence.

**Fix prepared, not shipped.** Two lines (`.strict()` appended, matching the existing
convention exactly), verified against both real call sites — `SettingsModal.tsx`
`savePaper()`/`saveLive()` (lines 231–234, 255–258) send exactly `{keyId, secretKey, feed,
mode}`, `TopBar.tsx:185` sends exactly `{mode: target}` — neither sends anything beyond the
declared shape, so this is behavior-preserving for real traffic. `.strict()` does not
change Zod's inferred TypeScript type, only runtime parse behavior, so it's typecheck-
neutral by construction. Branch `fix/p114-ipc-strict-credentials-alpacamode`, bundle
`mc4/p114-ipc-strict-credentials-alpacamode.bundle` at repo root. **This needs your
review and sign-off before it becomes a PR** — full detail in `PROBLEM-LEDGER.md` P-114.

Six lower-risk schemas (`CandlesGetReq`, `VaultCheckpointReq`, `ReplayStartReq`,
`HistoricalImportReq`, `IndicatorSettingsSetReq`, `WorkspaceStateSetReq` — reads, UI state,
replay control, none credentials- or arming-adjacent) have the same gap. Not fixed this
pass — their call sites weren't individually verified, and batch-applying `.strict()`
without checking each one first would be exactly the kind of unverified change this
project's own doctrine warns against. Named as a follow-up, not silently left out.

## 3 · API key / credential storage audit — the specific ask

`credential-store.ts`, read in full. Verdict: **already built the way "extremely
intelligent" implies.**

- **Encryption is not optional.** Every read and write goes through Electron `safeStorage`
  (OS keychain — DPAPI on Windows). If `safeStorage.isEncryptionAvailable()` is false, the
  store **hard-refuses** both read and write rather than falling back to plaintext — this
  was a deliberate fix for a real 2026-05-16 finding (C7) where a broken DPAPI used to
  silently write live API keys to disk in cleartext with only a log warning. That failure
  mode is now structurally closed off.
- **Persists until explicitly changed** — exactly "save until otherwise edited or updated."
  Dual slots (paper/live) so both key pairs can be configured side-by-side; nothing expires
  or resets on its own.
- **Self-healing migration.** If a user ever pasted keys directly into a plaintext
  `.env.local` (a documented dev-mode path), the store detects them on next boot, migrates
  them into encrypted storage, and strips the plaintext residue from disk — automatically,
  without the user having to know it happened.
- **Never logged.** Grepped the entire `src/` tree for any `log.*()` call touching a
  `secret`/`apiKey`-named value — zero hits. The LLM-config path has an explicit inline
  comment: `log.info('llm config saved', ...)  // never log the key`.
- **Masked on display.** `getAlpacaCredsMasked()` only ever returns a truncated
  `ABCD…WXYZ` form to the renderer; the renderer never receives a full key back.
- **The one gap found lives one layer up**, at the IPC boundary this key travels over on
  its way in (§2), not in the storage mechanism itself.

## 4 · Defect-class spot checks (clean)

| Class | Where checked | Result |
|---|---|---|
| Unbounded `Math.min/max(...spread)` | Codebase-wide grep, both live non-test/non-comment hits read in context | `chart-types.ts:128-129` bounded by a `slice(-n)` window (`n` = line-break count, small); `index.ts:581` bounded by HMM state count (fixed small set). Neither is the P-108 class. |
| Broker-facet bypass | Codebase-wide grep for `this.alpaca.{submitOrder,cancelOrder,getAccount}` | **Zero** call-sites outside the broker facets — the order-path choke point still holds. |
| Timer/listener leak class | `trading-engine.ts` (largest file, 2,734 lines) — every `setInterval`/`setTimeout` assignment | 10 named interval properties, all 12 (10 intervals + 2 batch timeouts) explicitly cleared in the shutdown block (`trading-engine.ts:809-821`); `replayStatusTimer` additionally cleared on its own stop path. `ChartPanel.tsx`'s one `ResizeObserver` (1,685 lines, largest renderer file) disconnects on dispose with a comment noting it was a prior leak, now fixed. |
| Unsafe casts | Codebase-wide `as any` count | 3, same as the 2026-07-16 count — 2 in test files, 1 in `DrawingModel.ts`. No growth. |

## 5 · Not covered this pass — named, not hidden

The remaining ~50 service modules, 21 panels, and 24 stores were not individually opened.
If a genuinely exhaustive sweep is wanted, the next-highest-value targets by size are
`alpaca.ts` (850 lines, broker integration), `replay-source.ts` (737), `vault-writer.ts`
(611), `order-manager.ts` (568 — perimeter, already covered by prior sessions' audits per
the ledger history), and `risk-gates.ts` (486 — same). Say the word and this continues from
exactly this list.

---

*Every number above was measured this session — file line counts via `wc -l`, grep hit
counts via the tool output, call-site shapes via direct reads. Nothing in this report is
asserted without a file:line behind it.*
