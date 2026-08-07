//! `satex-parity` — THE ORACLE (RS-UP-1 / RS-1.4).
//!
//! The measuring instrument every parity claim in the Rust rewrite rests on. It reads
//! the RS-1.2 corpus tapes and the RS-1.3 goldens, compares a candidate decision stream
//! against the recorded one, and emits an Appendix A.4 drift report naming the first
//! thing that moved. It is a dev/CI tool: nothing here is ever linked into the shipping
//! terminal.
//!
//! ## Why this crate is a port, not a design
//!
//! `apps/satex-terminal/scripts/oracle/verify.ts` is the reference implementation, and
//! its own header says so: *"RS-1.4 ports this module to Rust; the mutation matrix in
//! `mutate.ts` is the falsifiability contract both implementations must satisfy."* So
//! RS-L1 governs every module below — the TypeScript behaviour is the specification,
//! quirks included, and a cleaner idea is a ledger entry rather than a diff (RS-L8).
//!
//! ## The two strata, and why conflating them breaks the instrument
//!
//! - **Byte stratum** — SHA-256 over the stream. Both sides came from the same writer,
//!   so any byte difference is signal. This is what the RS-1.3 double-run determinism
//!   proof compares.
//! - **Semantic stratum** — [`diff`]. The two sides came from different language
//!   runtimes, so container properties (key order, whitespace, CRLF, a BOM, `1.0` vs
//!   `1`, `-0` vs `0`, a `\uXXXX` escape vs its literal) carry no decision content and
//!   must never be reported. A harness that flagged them would bury every real
//!   divergence in noise, and the first response to that noise would be to widen a
//!   tolerance somewhere that matters.
//!
//! Neither half means anything alone: a differ that always says "clean" passes every
//! negative control, and one that always says "divergent" passes every positive one.
//! The RS-1.7 matrix (`tests/conformance.rs`) is what proves this one does neither —
//! P-097 applied to our own instrument.
//!
//! ## Module map
//!
//! | Module | Ports | Role |
//! |---|---|---|
//! | [`value`] | `golden.ts` serialisation | JSON model, canonical text, JS number spelling |
//! | [`record`] | `golden.ts` / `verify.ts` types | Envelope + drift-report vocabulary |
//! | [`id`] | `golden.ts` `IdNormalizer` | Generated-id normalisation and leak detection |
//! | [`load`] | `verify.ts` `loadGolden` | Unilateral read: parse + the format's own laws |
//! | [`diff`] | `verify.ts` `diffGoldens` | Pairwise structural comparison |
//! | [`report`] | `verify.ts` `formatDriftReport` | Human summary + Appendix A.4 JSONL |
//! | [`corpus`] | `corpus.ts` | Corpus tape/index reader, SHA-256 custody, synthesizer |

#![forbid(unsafe_code)]
#![deny(missing_docs)]

pub mod corpus;
pub mod diff;
pub mod id;
pub mod load;
pub mod record;
pub mod report;
pub mod value;

pub use diff::diff_goldens;
pub use id::IdNormalizer;
pub use load::{load_golden, split_golden_lines};
pub use record::{
    ABSENT, DEFAULT_MAX_DIVERGENCES, DiffOptions, Divergence, DivergenceCategory, ENVELOPE_KEYS,
    GoldenDiff, GoldenRecord, LoadedGolden, OracleLevel, OracleVerdict, STREAM_FIELD,
};
pub use report::{format_drift_report, verify_golden};
pub use value::{JsonObject, JsonValue, canonicalize, js_number_to_string, parse_json};
