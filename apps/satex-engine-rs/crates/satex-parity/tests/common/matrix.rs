//! Shared scaffolding for the RS-1.7 falsifiability matrix (RS-1.4).
//!
//! `apps/satex-terminal/scripts/oracle/mutate.ts` says what this file is for, in the
//! header of the matrix itself: *"RS-1.4's Rust structural-diff engine must reproduce
//! every verdict in this table: report every `divergent: true` row naming the same
//! field, and report nothing for every `divergent: false` row. A Rust implementation
//! that passes only the positive column has built a smoke alarm that goes off when the
//! kettle boils."*
//!
//! ## Why the mutations are re-expressed rather than imported
//!
//! The TypeScript perturbs a *recorded* golden by walking it to find a suitable target
//! (`findScalar`, `underObjectKey`, …). Importing those bytes would mean either adding a
//! fixture-export script to `apps/satex-terminal/` — a fourth TypeScript-side change,
//! where plan §0.D permits exactly three — or committing generated fixtures with no
//! reproducible provenance. So the base golden here is written out in full and each
//! perturbation is a targeted edit against known text. Every anchor string below is
//! unique in the base (pinned by [`anchors_are_unique`] in `conformance.rs`), which is
//! what makes a literal edit as precise as a structural walk and considerably easier to
//! read.
//!
//! ## The base golden is deliberately awkward
//!
//! It carries both strata, a nested payload four levels deep, an array of objects, a
//! normalised id placeholder, a plain zero, a long-precision float and two records that
//! share a `kind` — because every one of those is the target of at least one mutation,
//! and a base that lacked them would make the matrix silently skip rows.

use satex_parity::{
    DiffOptions, Divergence, DivergenceCategory, GoldenDiff, OracleVerdict, verify_golden,
};

/// The reference golden every mutation perturbs.
///
/// Envelope and payload keys are written in canonical (sorted) order, so the base is the
/// text the RS-1.3 writer would actually emit — a base that was already non-canonical
/// would make the key-order negative controls vacuous.
pub const BASE_LINES: [&str; 4] = [
    r#"{"kind":"gate.verdict","level":"L1","payload":{"gates":[{"id":1,"pass":true},{"id":2,"pass":false}],"score":0.5,"symbol":"AAPL"},"seq":0,"tickIndex":0,"ts":1784880866709}"#,
    r#"{"kind":"order.intent","level":"L1","payload":{"nested":{"a":{"b":{"c":1}}},"orderId":"<ord:1>","qty":10,"side":"buy","stop":194.73388140864014},"seq":1,"tickIndex":4,"ts":1784880870709}"#,
    r#"{"kind":"brain.checkpoint","level":"L2","payload":{"calibration":{"samples":30,"winRate":0.6},"drawdown":0,"equity":100000,"weights":[0.75,-0.25]},"seq":2,"tickIndex":8,"ts":1784880874709}"#,
    r#"{"kind":"gate.verdict","level":"L1","payload":{"gates":[{"id":1,"pass":true}],"score":0.25,"symbol":"MSFT"},"seq":3,"tickIndex":12,"ts":1784880878709}"#,
];

/// The base golden as file text: LF-delimited with a trailing newline.
#[must_use]
pub fn base() -> String {
    join(
        &BASE_LINES
            .iter()
            .map(|l| (*l).to_owned())
            .collect::<Vec<_>>(),
    )
}

/// Rejoins record lines into golden file text — LF-delimited, trailing newline.
///
/// Port of `joinLines` in `mutate.ts`, including its empty case: no records means no
/// bytes, not a lone newline.
#[must_use]
pub fn join(lines: &[String]) -> String {
    if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    }
}

/// The base golden split into owned lines, for mutations that work positionally.
#[must_use]
pub fn base_lines() -> Vec<String> {
    BASE_LINES.iter().map(|l| (*l).to_owned()).collect()
}

/// Replaces the first occurrence of `from`, which the caller has pinned as unique enough.
#[must_use]
pub fn once(text: &str, from: &str, to: &str) -> String {
    text.replacen(from, to, 1)
}

/// Rewrites a record line's `"seq":N` to `n`.
///
/// Used by the two renumbering mutations, whose whole point is that the stream stays
/// internally well-formed after a record is added or removed — so the oracle has to catch
/// them by *comparison* rather than by the sequence invariant, which is a strictly harder
/// thing to get right.
#[must_use]
pub fn set_seq(line: &str, n: usize) -> String {
    const KEY: &str = r#""seq":"#;
    let Some(at) = line.find(KEY) else {
        return line.to_owned();
    };
    let start = at + KEY.len();
    let digits = line[start..]
        .chars()
        .take_while(char::is_ascii_digit)
        .count();
    format!("{}{n}{}", &line[..start], &line[start + digits..])
}

/// Which drift-report field a positive control must name.
///
/// The TypeScript uses a `RegExp`; this crate has no regex dependency and the matrix only
/// ever uses three shapes, so they are enumerated. Enumerating also makes the contract
/// legible: `PayloadDeep` exists to prove the differ emits a *path*, not just the word
/// `payload`, which a differ that gave up on nesting would still satisfy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldPattern {
    /// `/^name$/` — the field is exactly this.
    Exact(&'static str),
    /// `/^payload(\.|$)/` — `payload` itself or anything beneath it.
    PayloadPrefix,
    /// `/^payload(\.[^.]+){3,}$/` — at least `n` non-empty segments below `payload`.
    PayloadDeep(usize),
}

impl FieldPattern {
    /// Whether `field` satisfies the pattern.
    #[must_use]
    pub fn matches(self, field: &str) -> bool {
        match self {
            Self::Exact(name) => field == name,
            Self::PayloadPrefix => field == "payload" || field.starts_with("payload."),
            Self::PayloadDeep(min) => {
                let Some(rest) = field.strip_prefix("payload.") else {
                    return false;
                };
                let segments: Vec<&str> = rest.split('.').collect();
                segments.len() >= min && segments.iter().all(|s| !s.is_empty())
            }
        }
    }
}

/// One named way a golden can be perturbed, with its expected verdict.
pub struct Mutation {
    /// Stable kebab-case id, matching `mutate.ts` exactly — this is the name RS-1.4
    /// reports its coverage against, so a rename here is a silent coverage hole there.
    pub id: &'static str,
    /// `true` = the verifier must report it; `false` = negative control, must not.
    pub divergent: bool,
    /// Pattern the drift report must name in some divergence. `None` for negatives.
    pub expect: Option<FieldPattern>,
    /// Earliest stream position at which the two streams *can* differ. `None` when the
    /// change is file-wide.
    pub target: Option<usize>,
    /// Perturbs the base golden text.
    pub apply: fn(&str) -> String,
}

/// Judges one oracle verdict against what its mutation declared must happen.
///
/// Port of `judgeMutation`. This predicate — not the test that calls it — is the
/// contract, and it lives beside the matrix for the reason RS-1.7 exists: a rule that
/// lives only inside a test body cannot be pointed at a *different* verifier, and
/// pointing it at a deliberately broken one is the only way to show the suite is capable
/// of failing at all (P-097). `conformance.rs` does exactly that.
///
/// The four rules, and why each is here rather than a looser "it exited non-zero":
/// 1. **Exit code** — the verdict a CI job branches on.
/// 2. **At least one divergence** — a non-zero exit with an empty list is a harness that
///    knows something is wrong and cannot say what.
/// 3. **The named field** — Appendix A.4 requires the report to name what moved.
///    Accepting any divergence would let a differ pass by reporting the wrong field.
/// 4. **The earliest index** — anything earlier is noise about untouched records;
///    anything later means the perturbation slipped past and something else was reported.
///
/// Returns the contract violations. Empty means the oracle behaved.
#[must_use]
pub fn judge(mutation: &Mutation, verdict: &OracleVerdict) -> Vec<String> {
    let mut failures = Vec::new();
    let divergences = &verdict.diff.divergences;

    if !mutation.divergent {
        // NEGATIVE CONTROL — the bytes moved, no decision did. Silence is the only pass.
        if verdict.exit_code != 0 {
            failures.push(format!("expected exit 0, got {}", verdict.exit_code));
        }
        for d in divergences {
            failures.push(format!(
                "reported [{}] {} at record {} — {}",
                d.category, d.field, d.index, d.detail
            ));
        }
        return failures;
    }

    // POSITIVE CONTROL — non-zero, and specific about what moved.
    if verdict.exit_code != 1 {
        failures.push(format!("expected exit 1, got {}", verdict.exit_code));
    }
    if divergences.is_empty() {
        failures.push("reported no divergences at all".to_owned());
        return failures;
    }
    if let Some(expect) = mutation.expect
        && !divergences.iter().any(|d| expect.matches(&d.field))
    {
        let mut seen: Vec<&str> = divergences.iter().map(|d| d.field.as_str()).collect();
        seen.sort_unstable();
        seen.dedup();
        failures.push(format!(
            "no divergence named a field matching {expect:?} (fields reported: {})",
            seen.join(", ")
        ));
    }
    if let Some(target) = mutation.target {
        let earliest = divergences
            .iter()
            .map(|d| d.index)
            .min()
            .unwrap_or(usize::MAX);
        if earliest != target {
            failures.push(format!(
                "earliest divergence is at record {earliest}, not at the perturbed record {target}"
            ));
        }
    }
    failures
}

/// Runs one mutation against the base golden and returns both halves of the evidence.
#[must_use]
pub fn run(mutation: &Mutation) -> (String, OracleVerdict) {
    let reference = base();
    let candidate = (mutation.apply)(&reference);
    let verdict = verify_golden(&reference, &candidate, DiffOptions::default());
    (candidate, verdict)
}

/// A verdict fabricated without looking at the input — for proving the judge can fail.
///
/// Two broken oracles are needed, not one: a differ that always says "clean" passes every
/// negative control, and one that always says "divergent" passes every positive one. A
/// judge that only rejected one of them would be half a check.
#[must_use]
pub fn fake_verdict(exit_code: u8, divergences: Vec<Divergence>) -> OracleVerdict {
    OracleVerdict {
        exit_code,
        diff: GoldenDiff {
            divergences,
            truncated: false,
            bytes_equal: exit_code == 0,
            expected_records: BASE_LINES.len(),
            actual_records: BASE_LINES.len(),
        },
        report: String::new(),
    }
}

/// A divergence row with the given field and index, for the fabricated verdicts above.
#[must_use]
pub fn fake_divergence(field: &str, index: usize) -> Divergence {
    Divergence {
        category: DivergenceCategory::Value,
        index,
        seq: None,
        tick_index: None,
        level: None,
        kind: None,
        field: field.to_owned(),
        expected: "<fabricated>".to_owned(),
        actual: "<fabricated>".to_owned(),
        detail: "fabricated by a deliberately broken oracle".to_owned(),
    }
}
