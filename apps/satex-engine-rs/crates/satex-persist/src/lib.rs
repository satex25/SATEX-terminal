//! Persistence: rusqlite (WAL) behind a dedicated-thread actor, VaultWriter (byte-compatible markdown), settings, learnings pruning, tracing-to-vault log bridge (Phase 4).
//!
//! Stubbed at RS-0.2 (workspace scaffold, ledger P-136). Compiles empty by design;
//! implementation lands at the plan task named above. Governed by RS-UP-1 +
//! CONSTITUTION v3.1 — read `docs/plans/2026-07-22-satex-rs-rewrite-ultraplan.md`
//! Layer 0 before claiming any task in this crate.

#![forbid(unsafe_code)]
