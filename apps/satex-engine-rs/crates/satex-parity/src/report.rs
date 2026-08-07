//! Drift reports — port of `formatDriftReport` / `verifyGolden` in `verify.ts`, plus the
//! Appendix A.4 JSONL rows (RS-1.4).
//!
//! Two renderings of one finding, for two readers who cannot be served by one format:
//!
//! - The **human summary** ([`format_drift_report`]) is what an operator reads at 3am
//!   when a parity job goes red. It is a byte-for-byte port of the TypeScript, wording
//!   and spacing included, because RS-1.7 runs the same mutation matrix against both
//!   implementations and a report that reads differently is a difference a reviewer has
//!   to adjudicate before they can look at the divergence itself.
//! - The **JSONL rows** ([`format_jsonl_report`]) are the archived artifact under
//!   `Vault/00-Audit/parity/`. The TypeScript side never implemented this half, so it is
//!   new work here rather than a port; Appendix A.4 fixes the field list, and everything
//!   below that line is a decision recorded in these doc comments.
//!
//! ## Why the JSONL exists at all when the human report says the same thing
//!
//! Appendix A.1 makes a parity claim reproducible from artifacts — "golden SHA + corpus
//! SHA + engine SHA fully determine a run" — and RS-L4 makes an unarchived claim not a
//! claim. The human report names what moved but carries none of that identity, and
//! cannot: it is a port, and adding columns to it would be exactly the "cleaner idea"
//! RS-L8 sends to the ledger instead of the diff. So the run identity lives in
//! [`ReportContext`], stamped onto every JSONL row.
//!
//! ## The one thing a clean run does not produce
//!
//! Zero divergences means zero JSONL rows — an empty file. That is honest (the schema is
//! a divergence-row schema; a "clean" row would be a fabricated divergence) but it does
//! mean the archived JSONL of a clean run carries no SHAs. Recording the identity of a
//! *clean* run needs a manifest beside the report rather than a row inside it; that is a
//! ledger question, not a thing to smuggle into this schema.

use crate::diff::diff_goldens;
use crate::record::{DiffOptions, Divergence, GoldenDiff, OracleLevel, OracleVerdict};
use crate::value::escape_json_string;

/// One divergence row, rendered. Port of `formatRow`.
///
/// The TypeScript builds the `where` clause as an array of nullable parts, filters the
/// nulls and joins with ` · `. Appending is the same string here because the first part
/// (`record N`) is never absent, so every later part that survives is preceded by exactly
/// one separator.
fn format_row(n: usize, d: &Divergence) -> String {
    let mut place = format!("record {}", d.index);
    if let Some(seq) = d.seq {
        place.push_str(&format!(" · seq {seq}"));
    }
    if let Some(tick) = d.tick_index {
        place.push_str(&format!(" · tick {tick}"));
    }
    if let Some(level) = d.level {
        place.push_str(&format!(" · {level}"));
    }
    if let Some(kind) = &d.kind {
        place.push_str(&format!(" · {kind}"));
    }
    let category = d.category;
    let field = &d.field;
    let expected = &d.expected;
    let actual = &d.actual;
    let detail = &d.detail;
    format!(
        "  {n}. [{category}] {place} · {field}\n       expected {expected}\n         actual {actual}\n       {detail}"
    )
}

/// Human-readable drift report (Appendix A.4's summary half).
///
/// Reports the divergences in stream order so the first row is the first thing that
/// moved — the only row an investigation starts from.
///
/// No trailing newline, matching the TypeScript: this returns a report *value*, and where
/// the line ending goes is the caller's business.
#[must_use]
pub fn format_drift_report(diff: &GoldenDiff) -> String {
    let records = diff.expected_records;
    if diff.divergences.is_empty() {
        // The parenthetical is the whole point of the clean branch. "Semantically equal;
        // bytes differ" is a *pass* across two language runtimes and a *failure* of the
        // RS-1.3 double-run determinism proof, where both sides came from one writer.
        let bytes = if diff.bytes_equal {
            " (byte-identical)"
        } else {
            " (semantically equal; bytes differ)"
        };
        return format!("ORACLE VERDICT: CLEAN — {records} records, no divergences{bytes}");
    }

    let found = diff.divergences.len();
    let more = if diff.truncated { "+" } else { "" };
    let actual_records = diff.actual_records;
    let mut out = format!(
        "ORACLE VERDICT: DIVERGENT — {found}{more} divergence(s) over {records} reference / {actual_records} candidate records"
    );
    for (i, d) in diff.divergences.iter().enumerate() {
        out.push('\n');
        out.push_str(&format_row(i + 1, d));
    }
    if diff.truncated {
        out.push_str(&format!(
            "\n  … capped at {found} divergences; the stream diverges beyond this point."
        ));
    }
    out
}

/// The exit code a diff earns: 0 when nothing moved, 1 when something did.
///
/// Kept separate from [`verify_golden`] so the mapping is testable without a differ —
/// and because it is the one number a CI job actually branches on.
fn exit_code_for(diff: &GoldenDiff) -> u8 {
    if diff.divergences.is_empty() { 0 } else { 1 }
}

/// Verifies a candidate golden against a reference golden.
///
/// The entry point a parity job calls: a non-zero exit code plus a report that names the
/// exact divergence is the contract RS-1.7 tests and RS-1.4 reimplements in Rust.
#[must_use]
pub fn verify_golden(expected: &str, actual: &str, opts: DiffOptions) -> OracleVerdict {
    let diff = diff_goldens(expected, actual, opts);
    let report = format_drift_report(&diff);
    OracleVerdict {
        exit_code: exit_code_for(&diff),
        diff,
        report,
    }
}

/// Run identity: what makes a parity claim reproducible from artifacts (Appendix A.1).
///
/// Every field is optional and every absent field is emitted as JSON `null` rather than
/// an empty string. A drift report is read months later by someone deciding whether it
/// still describes the current engine, and `""` reads as "this run had no corpus", which
/// is a claim; `null` reads as "nobody recorded it", which is the truth. The distinction
/// is what makes an incomplete report visibly incomplete instead of quietly wrong.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReportContext {
    /// SHA-256 of the corpus tape the session replayed.
    pub corpus_sha: Option<String>,
    /// SHA-256 of the reference golden stream.
    pub golden_sha: Option<String>,
    /// Commit or build identity of the Rust engine that produced the candidate.
    pub rs_sha: Option<String>,
    /// Corpus session identifier the records belong to.
    pub session: Option<String>,
}

/// How much of the divergence stream a JSONL report carries.
///
/// Appendix A.4: "first divergence per subsystem minimum; full stream in verbose mode."
/// Both are real emissions, and which one produced a file is recorded *in* the file — see
/// [`format_jsonl_report`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JsonlMode {
    /// The A.4 minimum: the earliest divergence for each subsystem, in stream order.
    FirstPerSubsystem,
    /// Every divergence the diff collected.
    FullStream,
}

impl JsonlMode {
    /// The mode's wire spelling, as it appears in a row's `context.mode`.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::FirstPerSubsystem => "first-per-subsystem",
            Self::FullStream => "full-stream",
        }
    }
}

/// The subsystem a record's `kind` belongs to.
///
/// Appendix A.4 wants a `subsystem` column and [`Divergence`] has no such field, so it is
/// derived: golden kinds are written `subsystem.event` (`gate.verdict`, `order.intent`,
/// `brain.checkpoint`), and the segment before the first `.` is the subsystem. Deriving
/// beats storing because the golden's `kind` is the only thing either implementation
/// records — a stored subsystem would be a second source of truth that can disagree with
/// the stream it describes, and the writer has no field to keep it honest with.
///
/// Two edges, both reachable through the loader (which only requires `kind` to be a
/// non-empty string):
///
/// - A dotless kind (`k`) is its own subsystem. Nothing is lost — the whole kind *is* the
///   name — and the RS-1.7 fixtures use dotless kinds.
/// - A kind starting with `.` would give an empty head; the whole kind is used instead,
///   because an empty string in the `subsystem` column would read as "unknown", which is
///   what `null` already means here.
///
/// `None` in, `None` out: a divergence with no `kind` is not a record-level finding at
/// all (a parse failure, or a `<stream>` row about the record counts), and naming a
/// subsystem for it would invent one no golden ever wrote.
#[must_use]
pub fn subsystem_of(kind: Option<&str>) -> Option<&str> {
    let kind = kind?;
    match kind.split_once('.') {
        Some((head, _)) if !head.is_empty() => Some(head),
        _ => Some(kind),
    }
}

/// Appendix A.4 divergence rows, one JSON object per line.
///
/// Key order is fixed — the A.4 field list verbatim, then a nested `context` object in a
/// fixed order of its own — because a drift report is evidence and evidence has to be
/// diffable: two runs of the same comparison must produce byte-identical files, and a
/// reviewer comparing yesterday's report with today's must see only the rows that moved.
/// That is the same discipline `canonicalize` enforces on the goldens themselves, applied
/// to the report about them.
///
/// The three things `context` carries beyond the row's own detail are deliberate:
///
/// - `category`, `index`, `seq` and `kind` are the columns A.4's field list has no slot
///   for, and losing them would make a JSONL row strictly weaker evidence than the human
///   row printed beside it.
/// - `mode` and `truncated` are repeated on **every** row because JSONL has no header. A
///   first-per-subsystem file read at face value says "one divergence per subsystem",
///   which is a false green of the exact P-097 shape — the file must be able to say that
///   it is a filtered view of a possibly-capped list, from any single line of it.
///
/// In [`JsonlMode::FirstPerSubsystem`] the surviving row for each subsystem is the
/// earliest one in stream order, and rows keep stream order: the first line of the file
/// stays the first thing that moved.
///
/// Every line, including the last, ends with `\n`, so a report can be concatenated or
/// appended to without joining two rows into one.
#[must_use]
pub fn format_jsonl_report(diff: &GoldenDiff, ctx: &ReportContext, mode: JsonlMode) -> String {
    let mut out = String::new();
    let mut seen: Vec<Option<&str>> = Vec::new();
    for d in &diff.divergences {
        if mode == JsonlMode::FirstPerSubsystem {
            let subsystem = subsystem_of(d.kind.as_deref());
            if seen.contains(&subsystem) {
                continue;
            }
            seen.push(subsystem);
        }
        push_jsonl_row(&mut out, d, ctx, mode, diff.truncated);
        out.push('\n');
    }
    out
}

/// Appends `value` as a JSON string, or `null` when there is nothing to record.
fn push_opt_str(out: &mut String, value: Option<&str>) {
    match value {
        Some(text) => escape_json_string(text, out),
        None => out.push_str("null"),
    }
}

/// Appends `value` as a JSON number, or `null` when the field was not known.
///
/// Written as a decimal integer rather than through [`crate::value::js_number_to_string`]:
/// the value came in as a `u64`, and above 2^53 the JS spelling would round it. Appendix
/// B.1's narrowing is only sound if the report prints what the counter actually held.
fn push_opt_u64(out: &mut String, value: Option<u64>) {
    match value {
        Some(n) => out.push_str(&n.to_string()),
        None => out.push_str("null"),
    }
}

/// Appends one Appendix A.4 row. Key order here *is* the schema.
fn push_jsonl_row(
    out: &mut String,
    d: &Divergence,
    ctx: &ReportContext,
    mode: JsonlMode,
    truncated: bool,
) {
    out.push_str("{\"corpus_sha\":");
    push_opt_str(out, ctx.corpus_sha.as_deref());
    out.push_str(",\"golden_sha\":");
    push_opt_str(out, ctx.golden_sha.as_deref());
    out.push_str(",\"rs_sha\":");
    push_opt_str(out, ctx.rs_sha.as_deref());
    out.push_str(",\"session\":");
    push_opt_str(out, ctx.session.as_deref());
    out.push_str(",\"tick_index\":");
    push_opt_u64(out, d.tick_index);
    out.push_str(",\"level\":");
    push_opt_str(out, d.level.map(OracleLevel::as_str));
    out.push_str(",\"subsystem\":");
    push_opt_str(out, subsystem_of(d.kind.as_deref()));
    out.push_str(",\"field\":");
    escape_json_string(&d.field, out);
    // `expected` / `actual` stay strings even when they hold the ABSENT sentinel. JSON
    // `null` is unavailable for "no value here": the canonical text of a genuine JSON
    // null is the string `null`, so the two would be indistinguishable — and the sentinel
    // is the same text the human row prints, which keeps the two halves cross-checkable.
    out.push_str(",\"expected\":");
    escape_json_string(&d.expected, out);
    out.push_str(",\"actual\":");
    escape_json_string(&d.actual, out);
    out.push_str(",\"context\":{\"category\":");
    escape_json_string(d.category.as_str(), out);
    out.push_str(",\"index\":");
    out.push_str(&d.index.to_string());
    out.push_str(",\"seq\":");
    push_opt_u64(out, d.seq);
    out.push_str(",\"kind\":");
    push_opt_str(out, d.kind.as_deref());
    out.push_str(",\"detail\":");
    escape_json_string(&d.detail, out);
    out.push_str(",\"mode\":");
    escape_json_string(mode.as_str(), out);
    out.push_str(",\"truncated\":");
    out.push_str(if truncated { "true" } else { "false" });
    out.push_str("}}");
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::record::{ABSENT, DivergenceCategory, STREAM_FIELD};

    /// A fully-populated `value` divergence — every envelope column present.
    fn moved() -> Divergence {
        Divergence {
            category: DivergenceCategory::Value,
            index: 0,
            seq: Some(0),
            tick_index: Some(0),
            level: Some(OracleLevel::L1),
            kind: Some("order.intent".to_owned()),
            field: "payload.stop".to_owned(),
            expected: "101.25".to_owned(),
            actual: "101.26".to_owned(),
            detail: "scalar value differs".to_owned(),
        }
    }

    /// A second divergence in a different subsystem, one stream position later.
    fn checkpoint() -> Divergence {
        Divergence {
            category: DivergenceCategory::Missing,
            index: 1,
            seq: Some(1),
            tick_index: Some(1),
            level: Some(OracleLevel::L2),
            kind: Some("brain.checkpoint".to_owned()),
            field: "payload.weights.2".to_owned(),
            expected: "0.5".to_owned(),
            actual: ABSENT.to_owned(),
            detail: "key present in the reference, absent in the candidate".to_owned(),
        }
    }

    /// A finding with no record behind it: no seq, no tick, no level, no kind.
    fn bare() -> Divergence {
        Divergence {
            category: DivergenceCategory::Parse,
            index: 3,
            seq: None,
            tick_index: None,
            level: None,
            kind: None,
            field: STREAM_FIELD.to_owned(),
            expected: ABSENT.to_owned(),
            actual: ABSENT.to_owned(),
            detail: "candidate: line is not a JSON object (got array)".to_owned(),
        }
    }

    fn diff(divergences: Vec<Divergence>, truncated: bool, bytes_equal: bool) -> GoldenDiff {
        GoldenDiff {
            divergences,
            truncated,
            bytes_equal,
            expected_records: 2,
            actual_records: 2,
        }
    }

    /// The expectations below are not hand-written: they are what the TypeScript
    /// `formatDriftReport` printed for these exact fixtures, captured from node.
    #[test]
    fn clean_report_separates_the_two_strata() {
        assert_eq!(
            format_drift_report(&diff(vec![], false, true)),
            "ORACLE VERDICT: CLEAN — 2 records, no divergences (byte-identical)"
        );
        assert_eq!(
            format_drift_report(&diff(vec![], false, false)),
            "ORACLE VERDICT: CLEAN — 2 records, no divergences (semantically equal; bytes differ)"
        );
    }

    #[test]
    fn a_row_is_a_four_line_block_with_the_envelope_on_the_first() {
        assert_eq!(
            format_drift_report(&diff(vec![moved()], false, false)),
            "ORACLE VERDICT: DIVERGENT — 1 divergence(s) over 2 reference / 2 candidate records\n  1. [value] record 0 · seq 0 · tick 0 · L1 · order.intent · payload.stop\n       expected 101.25\n         actual 101.26\n       scalar value differs"
        );
    }

    #[test]
    fn absent_envelope_context_leaves_no_empty_separators() {
        // The trap the TypeScript's filter-then-join exists to avoid: a naive template
        // would print `record 3 ·  ·  · <stream>` here.
        let mut only = diff(vec![bare()], false, false);
        only.actual_records = 1;
        assert_eq!(
            format_drift_report(&only),
            "ORACLE VERDICT: DIVERGENT — 1 divergence(s) over 2 reference / 1 candidate records\n  1. [parse] record 3 · <stream>\n       expected <absent>\n         actual <absent>\n       candidate: line is not a JSON object (got array)"
        );
    }

    #[test]
    fn truncation_marks_the_count_and_adds_the_tail() {
        let mut capped = diff(vec![moved(), checkpoint()], true, false);
        capped.expected_records = 20;
        capped.actual_records = 19;
        assert_eq!(
            format_drift_report(&capped),
            "ORACLE VERDICT: DIVERGENT — 2+ divergence(s) over 20 reference / 19 candidate records\n  1. [value] record 0 · seq 0 · tick 0 · L1 · order.intent · payload.stop\n       expected 101.25\n         actual 101.26\n       scalar value differs\n  2. [missing] record 1 · seq 1 · tick 1 · L2 · brain.checkpoint · payload.weights.2\n       expected 0.5\n         actual <absent>\n       key present in the reference, absent in the candidate\n  … capped at 2 divergences; the stream diverges beyond this point."
        );
    }

    #[test]
    fn rows_are_numbered_from_one_in_stream_order() {
        let report = format_drift_report(&diff(vec![moved(), checkpoint(), bare()], false, false));
        let numbers: Vec<&str> = report
            .lines()
            .filter(|l| l.starts_with("  1.") || l.starts_with("  2.") || l.starts_with("  3."))
            .collect();
        assert_eq!(numbers.len(), 3);
        assert!(numbers[2].starts_with("  3. [parse]"), "{report}");
    }

    #[test]
    fn exit_code_is_one_iff_something_diverged() {
        assert_eq!(exit_code_for(&diff(vec![], false, true)), 0);
        assert_eq!(exit_code_for(&diff(vec![moved()], false, false)), 1);
        // Byte equality does not enter the verdict: two streams that leaked the same raw
        // id are byte-identical and both worthless (verify.test.ts, ledger P-143).
        assert_eq!(exit_code_for(&diff(vec![bare()], false, true)), 1);
    }

    #[test]
    fn subsystem_is_the_segment_before_the_first_dot() {
        assert_eq!(subsystem_of(Some("gate.verdict")), Some("gate"));
        assert_eq!(subsystem_of(Some("order.intent")), Some("order"));
        assert_eq!(subsystem_of(Some("brain.checkpoint")), Some("brain"));
        assert_eq!(subsystem_of(Some("a.b.c")), Some("a"));
    }

    #[test]
    fn subsystem_of_a_dotless_or_leading_dot_kind_is_the_whole_kind() {
        assert_eq!(subsystem_of(Some("k")), Some("k"));
        assert_eq!(subsystem_of(Some(".verdict")), Some(".verdict"));
    }

    #[test]
    fn a_stream_level_row_has_no_subsystem() {
        assert_eq!(subsystem_of(None), None);
    }

    fn context() -> ReportContext {
        ReportContext {
            corpus_sha: Some("c0ffee".to_owned()),
            golden_sha: Some("g01d".to_owned()),
            rs_sha: Some("deadbeef".to_owned()),
            session: Some("2026-07-22-open".to_owned()),
        }
    }

    #[test]
    fn a_jsonl_row_holds_the_appendix_field_list_in_order() {
        let rows = format_jsonl_report(
            &diff(vec![moved()], false, false),
            &context(),
            JsonlMode::FullStream,
        );
        assert_eq!(
            rows,
            "{\"corpus_sha\":\"c0ffee\",\"golden_sha\":\"g01d\",\"rs_sha\":\"deadbeef\",\"session\":\"2026-07-22-open\",\"tick_index\":0,\"level\":\"L1\",\"subsystem\":\"order\",\"field\":\"payload.stop\",\"expected\":\"101.25\",\"actual\":\"101.26\",\"context\":{\"category\":\"value\",\"index\":0,\"seq\":0,\"kind\":\"order.intent\",\"detail\":\"scalar value differs\",\"mode\":\"full-stream\",\"truncated\":false}}\n"
        );
    }

    #[test]
    fn unrecorded_run_identity_is_null_rather_than_empty() {
        let rows = format_jsonl_report(
            &diff(vec![moved()], false, false),
            &ReportContext::default(),
            JsonlMode::FullStream,
        );
        assert!(
            rows.starts_with(
                "{\"corpus_sha\":null,\"golden_sha\":null,\"rs_sha\":null,\"session\":null,"
            ),
            "{rows}"
        );
    }

    #[test]
    fn a_stream_row_nulls_every_record_column() {
        let rows = format_jsonl_report(
            &diff(vec![bare()], false, false),
            &ReportContext::default(),
            JsonlMode::FullStream,
        );
        assert!(
            rows.contains("\"tick_index\":null,\"level\":null,\"subsystem\":null,"),
            "{rows}"
        );
        assert!(rows.contains("\"seq\":null,\"kind\":null,"), "{rows}");
    }

    #[test]
    fn the_absent_sentinel_stays_a_string() {
        // `null` is taken: it is the canonical text of a genuine JSON null.
        let rows = format_jsonl_report(
            &diff(vec![checkpoint()], false, false),
            &ReportContext::default(),
            JsonlMode::FullStream,
        );
        assert!(
            rows.contains("\"expected\":\"0.5\",\"actual\":\"<absent>\""),
            "{rows}"
        );
    }

    #[test]
    fn first_per_subsystem_keeps_the_earliest_row_of_each() {
        let mut second_order = moved();
        second_order.index = 2;
        second_order.field = "payload.qty".to_owned();
        let rows = format_jsonl_report(
            &diff(
                vec![moved(), checkpoint(), second_order, bare()],
                false,
                false,
            ),
            &ReportContext::default(),
            JsonlMode::FirstPerSubsystem,
        );
        let lines: Vec<&str> = rows.lines().collect();
        assert_eq!(lines.len(), 3, "{rows}");
        assert!(lines[0].contains("\"subsystem\":\"order\""), "{rows}");
        assert!(lines[0].contains("\"field\":\"payload.stop\""), "{rows}");
        assert!(lines[1].contains("\"subsystem\":\"brain\""), "{rows}");
        // The kindless row is its own bucket, so a stream-level finding is never the row
        // the summary mode drops.
        assert!(lines[2].contains("\"subsystem\":null"), "{rows}");
    }

    #[test]
    fn full_stream_keeps_every_row_and_says_which_mode_wrote_it() {
        let mut second_order = moved();
        second_order.index = 2;
        let all = diff(
            vec![moved(), checkpoint(), second_order, bare()],
            false,
            false,
        );
        let rows = format_jsonl_report(&all, &ReportContext::default(), JsonlMode::FullStream);
        assert_eq!(rows.lines().count(), 4, "{rows}");
        assert_eq!(
            rows.matches("\"mode\":\"full-stream\"").count(),
            4,
            "{rows}"
        );
    }

    #[test]
    fn every_row_carries_the_cap_because_jsonl_has_no_header() {
        let rows = format_jsonl_report(
            &diff(vec![moved(), checkpoint()], true, false),
            &ReportContext::default(),
            JsonlMode::FullStream,
        );
        assert_eq!(rows.matches("\"truncated\":true").count(), 2, "{rows}");
    }

    #[test]
    fn every_line_is_newline_terminated_and_a_clean_run_writes_none() {
        let rows = format_jsonl_report(
            &diff(vec![moved(), checkpoint()], false, false),
            &context(),
            JsonlMode::FullStream,
        );
        assert!(rows.ends_with('\n'), "{rows}");
        assert_eq!(rows.matches('\n').count(), 2, "{rows}");
        assert_eq!(
            format_jsonl_report(
                &diff(vec![], false, true),
                &context(),
                JsonlMode::FullStream
            ),
            ""
        );
    }

    #[test]
    fn a_detail_sentence_with_a_quote_stays_one_parseable_line() {
        let mut quoted = bare();
        quoted.detail = "unknown envelope key \"extra\"\n\ttab".to_owned();
        let rows = format_jsonl_report(
            &diff(vec![quoted], false, false),
            &ReportContext::default(),
            JsonlMode::FullStream,
        );
        assert_eq!(rows.lines().count(), 1, "{rows}");
        assert!(
            rows.contains("\"detail\":\"unknown envelope key \\\"extra\\\"\\n\\ttab\""),
            "{rows}"
        );
    }

    #[test]
    fn two_runs_of_one_comparison_are_byte_identical() {
        // The property that makes an archived report diffable evidence rather than a
        // narrative: nothing in the emission depends on hash iteration order or time.
        let all = diff(vec![moved(), checkpoint(), bare()], true, false);
        let once = format_jsonl_report(&all, &context(), JsonlMode::FirstPerSubsystem);
        let twice = format_jsonl_report(&all, &context(), JsonlMode::FirstPerSubsystem);
        assert_eq!(once, twice);
    }
}
