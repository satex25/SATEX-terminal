//! The golden record envelope and the drift-report vocabulary.
//!
//! RS-UP-1 / RS-1.4. Every type here is a port of a declaration in
//! `apps/satex-terminal/scripts/oracle/golden.ts` or `verify.ts`, and the field names,
//! the category names and the two sentinel strings are kept verbatim so a Rust drift
//! report and a TypeScript drift report describe the same finding in the same words.
//! That matters more than it looks: the RS-1.7 mutation matrix judges an oracle by the
//! *field it names*, so a rename here is a silent conformance failure there.
//!
//! ## One deliberate narrowing (Appendix B.1)
//!
//! `seq` and `tickIndex` are JS numbers on the writing side and `u64` here. Appendix B.1
//! permits integer narrowing "where TS semantics are integral in practice", as a
//! reviewed decision: `renderRecord` already refuses both fields unless
//! `Number.isInteger(v) && v >= 0`, so the writer cannot emit a value outside the
//! non-negative integers. The narrowing's one observable edge is a value above
//! `u64::MAX` — 18 quintillion records into a stream that carries thousands — which the
//! loader reports as a malformed envelope rather than silently truncating. `ts` is
//! **not** narrowed: it stays `f64` because the writer explicitly does not require it to
//! be integral, and the `ts-sub-millisecond-drift` mutation exists to keep it that way.

use crate::value::JsonValue;

/// Oracle strata (Appendix A.3). L3 artifacts are compared as files, not as records.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum OracleLevel {
    /// Decisions — gate verdicts, order intents, fills, kill/halt events. Zero tolerance.
    L1,
    /// State checkpoints — brain weights, calibration, equity, session state.
    L2,
}

impl OracleLevel {
    /// The stratum's wire spelling, as it appears in a golden line.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::L1 => "L1",
            Self::L2 => "L2",
        }
    }

    /// Reads a stratum from its wire spelling.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "L1" => Some(Self::L1),
            "L2" => Some(Self::L2),
            _ => None,
        }
    }
}

impl std::fmt::Display for OracleLevel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A single golden observation — one JSON object per line in the golden stream.
#[derive(Debug, Clone, PartialEq)]
pub struct GoldenRecord {
    /// 0-based position in the golden stream. Monotonic, gap-free.
    pub seq: u64,
    /// Index of the corpus tick being applied when this record was emitted.
    pub tick_index: u64,
    /// Virtual clock reading, UTC ms — the recorded timeline, never wall time.
    pub ts: f64,
    /// Which parity stratum this record belongs to.
    pub level: OracleLevel,
    /// Subsystem + event, e.g. `gate.verdict`, `order.intent`, `brain.checkpoint`.
    pub kind: String,
    /// The observed value. Must contain no NaN/Infinity and no un-normalised id.
    pub payload: JsonValue,
}

/// What kind of disagreement a [`Divergence`] records.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DivergenceCategory {
    /// A line could not be read as a golden record at all.
    Parse,
    /// A stream broke one of the format's own laws, judged without a reference.
    Invariant,
    /// Both sides have the value; the values differ.
    Value,
    /// The reference has a record or key the candidate does not.
    Missing,
    /// The candidate has a record or key the reference does not.
    Extra,
}

impl DivergenceCategory {
    /// The lowercase tag a drift report prints in square brackets.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Parse => "parse",
            Self::Invariant => "invariant",
            Self::Value => "value",
            Self::Missing => "missing",
            Self::Extra => "extra",
        }
    }
}

impl std::fmt::Display for DivergenceCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Stand-in for "there is no value here", so a report never prints a bare `undefined`.
pub const ABSENT: &str = "<absent>";

/// Field path used when the finding is about the stream rather than one record.
pub const STREAM_FIELD: &str = "<stream>";

/// The exact top-level keys a golden record carries. Anything else is a defect.
///
/// Sorted, matching `ENVELOPE_KEYS` in `verify.ts` — the order is quoted verbatim into
/// the "the envelope is exactly …" message an unknown key produces.
pub const ENVELOPE_KEYS: [&str; 6] = ["kind", "level", "payload", "seq", "tickIndex", "ts"];

/// How many divergences a diff collects before it stops and says so.
pub const DEFAULT_MAX_DIVERGENCES: usize = 100;

/// One Appendix A.4 divergence row.
///
/// `expected` / `actual` are *canonical text*, not live values: a report is evidence and
/// has to survive being written to a file, and canonical text is the same text the golden
/// itself would carry for that value.
#[derive(Debug, Clone, PartialEq)]
pub struct Divergence {
    /// What kind of disagreement this is.
    pub category: DivergenceCategory,
    /// 0-based stream position — the alignment key. Not the record's own `seq`.
    pub index: usize,
    /// Envelope context from the reference side; `None` when no record could be read.
    pub seq: Option<u64>,
    /// Corpus tick the record was attributed to, when known.
    pub tick_index: Option<u64>,
    /// Oracle stratum of the record, when known.
    pub level: Option<OracleLevel>,
    /// Record kind, when known.
    pub kind: Option<String>,
    /// Dotted path: `seq`, `level`, `payload.stop`, `payload.gates.3.status`.
    pub field: String,
    /// Canonical text of the reference side, or [`ABSENT`].
    pub expected: String,
    /// Canonical text of the candidate side, or [`ABSENT`].
    pub actual: String,
    /// One human sentence naming what moved.
    pub detail: String,
}

/// A golden stream read from text, with whatever the read found wrong with it.
#[derive(Debug, Clone, PartialEq)]
pub struct LoadedGolden {
    /// Name used in defect messages — `reference` or `candidate` at the diff level.
    pub label: String,
    /// One entry per line, `None` where the line could not be read as a record.
    pub records: Vec<Option<GoldenRecord>>,
    /// Parse and invariant findings, judged without reference to any other stream.
    pub defects: Vec<Divergence>,
}

/// The verdict of one golden comparison.
#[derive(Debug, Clone, PartialEq)]
pub struct GoldenDiff {
    /// Findings in stream order — the first row is the first thing that moved.
    pub divergences: Vec<Divergence>,
    /// True when the cap was hit and [`Self::divergences`] is a prefix, not the whole story.
    pub truncated: bool,
    /// Byte-stratum result: are the two texts literally identical?
    pub bytes_equal: bool,
    /// Records read from the reference stream.
    pub expected_records: usize,
    /// Records read from the candidate stream.
    pub actual_records: usize,
}

/// A verifier run: the diff, a human report, and the exit code a CI job would use.
#[derive(Debug, Clone, PartialEq)]
pub struct OracleVerdict {
    /// 0 when the candidate reproduces the reference, 1 otherwise.
    pub exit_code: u8,
    /// The comparison this verdict summarises.
    pub diff: GoldenDiff,
    /// Human-readable drift report (Appendix A.4's summary half).
    pub report: String,
}

/// Options for a golden comparison.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiffOptions {
    /// Collection cap. A deleted record cascades through every later position.
    pub max_divergences: usize,
}

impl Default for DiffOptions {
    fn default() -> Self {
        Self {
            max_divergences: DEFAULT_MAX_DIVERGENCES,
        }
    }
}
