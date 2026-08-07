# RS Scar-Tissue Port Ledger — RS-UP-1 Appendix B.4

Created at adoption (RS-0.5, ledger P-135, 2026-07-24). One row per constitution-named
scar class and, as porting proceeds, per P-0xx regression pin found in TS tests
(universal porting method step 3). **Milestone exits require zero `pending` rows for
their phases** (plan Layer 7.1; risk R4 tripwire: any module PR merging with an
unfilled row for a scar class it owns is a violation).

Rules: (1) rows are appended and updated, never deleted; (2) `N/A-ruled` requires an
operator-approved ruling cited in the row; (3) every `ported` row cites both the TS
pin (`file:line`) and the passing Rust test path.

| P-id / anchor | Scar class → Rust expression | TS test `file:line` | RS test path | Status |
|---|---|---|---|---|
| PR#6 · P-041 · P-043 · P-046 · P-091 | Leak class → RAII/Drop discipline + drop-order tests | *populate at owning port task* | — | pending |
| P-039 · P-040 · P-041 · P-074 · P-093 | NaN/degenerate/negative-price inputs → proptest strategies | *populate at RS-2.1+* | — | pending |
| P-061 · P-074 | Aliased shared mutable defaults → ownership + fresh-construction pins | `services/rng.ts` (RNG spare state) | `crates/satex-core/src/rng.rs::gaussian_spare_alternation_is_stable` | partial (RNG pinned RS-1.1; broader store-default classes pending RS-2.x/4.x) |
| kill-switch atomic write | tempfile → write → fsync → atomic rename; crash-injection ×1000 | *populate at RS-8.3* | — | pending |
| P-091 · P-103 | Updater consent flags + endpoint pinned `satex25/SATEX-terminal` exact-capitals | *populate at RS-9.5* | — | pending |
| P-097 | False-green harness class → oracle mutation tests (harness must be able to fail) | `scripts/oracle/mutate.ts` (49-class matrix) · `scripts/oracle/mutate.test.ts` | `crates/satex-parity/tests/conformance.rs::the_matrix_holds` — all 49 classes; plus `the_judge_rejects_an_always_clean_oracle` / `…_always_divergent_oracle` / `…_names_the_wrong_field`, which point the judge at deliberately broken verifiers | ported (RS-1.4, P-159; falsifiability re-proved by sabotage: disabling the scalar comparison in `diff.rs` fails 14 of 49 classes) |
| P-044 · P-098 | Blackscreen/kill-chord reachability incl. boot-intro fall-through → Tauri re-proofs | *populate at RS-9.6* | — | pending |
| P-094 | Arming interlock ships WITH tests in Rust (TS gap retired RS-side only) | *populate at RS-8.4* | — | pending |
