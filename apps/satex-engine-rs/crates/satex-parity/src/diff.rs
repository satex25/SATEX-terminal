//! Pairwise structural comparison — port of `diffGoldens` in `verify.ts` (RS-1.4).
//!
//! This is the semantic stratum of the oracle: it answers "is this candidate stream the
//! same decision stream the TypeScript engine produced?" with a divergence list rather
//! than a boolean, because RS-L4 says parity is measured and a measurement that cannot
//! name what moved is not one.
//!
//! ## Alignment is by ordinal position, never by `seq`
//!
//! Record *i* of the candidate is compared with record *i* of the reference, and `seq` is
//! compared as ordinary data. Aligning *on* `seq` would let a stream with duplicated or
//! renumbered sequence numbers silently re-align itself into a clean report — and
//! `seq-duplicated`, `seq-records-swapped` and `record-deleted-renumbered` are three of
//! the mutation classes this harness exists to catch.
//!
//! ## What is deliberately *not* a divergence
//!
//! The two sides come from different language runtimes, so properties of the file
//! container carry no decision content: key order, intra-line whitespace, CRLF, a
//! trailing newline, a BOM, `1.0` vs `1`, `-0` vs `0`, a `\uXXXX` escape vs its literal.
//! Every one of those is a negative control in the RS-1.7 matrix. A harness that flagged
//! them would make every real divergence unfindable in the noise, and the first response
//! to that noise would be to widen a tolerance somewhere that matters. The byte stratum
//! still sees all of them — that is what [`GoldenDiff::bytes_equal`] is for.

use crate::load::load_golden;
use crate::record::{
    ABSENT, DiffOptions, Divergence, DivergenceCategory, GoldenDiff, GoldenRecord, STREAM_FIELD,
};
use crate::value::{JsonValue, show, utf16_cmp};

/// Accumulates divergences up to the caller's cap.
///
/// The cap exists because a single deleted record cascades through every later position:
/// without it, one perturbation can emit a divergence per remaining record and the report
/// stops being readable. [`Collector::truncated`] is what keeps the cap honest — a
/// truncated report says so in its first line rather than looking complete.
///
/// Ported quirk worth naming: a cap of `0` collects nothing, and a diff with no collected
/// divergences reads as *clean* in [`crate::report::verify_golden`]. The TypeScript has
/// the same hole. It is preserved here under RS-L1 rather than quietly closed — callers
/// that accept a cap from a user should refuse `0` at their own edge, which is what the
/// CLI does.
struct Collector {
    limit: usize,
    items: Vec<Divergence>,
    truncated: bool,
}

impl Collector {
    fn new(limit: usize) -> Self {
        Self {
            limit,
            items: Vec::new(),
            truncated: false,
        }
    }

    fn push(&mut self, divergence: Divergence) {
        if self.items.len() >= self.limit {
            self.truncated = true;
            return;
        }
        self.items.push(divergence);
    }
}

/// Envelope context copied onto every divergence raised for a record pair.
fn context_of(
    record: &GoldenRecord,
) -> (
    Option<u64>,
    Option<u64>,
    Option<crate::OracleLevel>,
    Option<String>,
) {
    (
        Some(record.seq),
        Some(record.tick_index),
        Some(record.level),
        Some(record.kind.clone()),
    )
}

/// Compares two golden streams, semantic stratum.
///
/// Both sides are loaded first, so a defect in the *reference* is reported too. A
/// reference that violates the format is a halt-and-investigate condition: every claim
/// ever measured against it is suspect, and that is louder news than the candidate's
/// divergences.
#[must_use]
pub fn diff_goldens(expected_text: &str, actual_text: &str, opts: DiffOptions) -> GoldenDiff {
    let expected = load_golden(expected_text, "reference");
    let actual = load_golden(actual_text, "candidate");

    let mut out = Collector::new(opts.max_divergences);
    let paired = expected.records.len().min(actual.records.len());

    // The record-count mismatch is emitted FIRST, ahead of the defects and the field
    // walk, for a reason the RS-1.7 matrix found the hard way: a deleted or inserted
    // record shifts every later position, so the per-record rows alone can exhaust the
    // collection cap and bury the one line that says the streams are not the same length.
    // A length change is also the headline an investigator needs before any field diff.
    if expected.records.len() != actual.records.len() {
        let category = if expected.records.len() > actual.records.len() {
            DivergenceCategory::Missing
        } else {
            DivergenceCategory::Extra
        };
        out.push(Divergence {
            category,
            index: paired,
            seq: None,
            tick_index: None,
            level: None,
            kind: None,
            field: STREAM_FIELD.to_owned(),
            expected: format!("{} records", expected.records.len()),
            actual: format!("{} records", actual.records.len()),
            detail: "the two streams carry a different number of records".to_owned(),
        });
    }

    for defect in expected.defects.iter().chain(actual.defects.iter()) {
        out.push(defect.clone());
    }

    for index in 0..paired {
        // A `None` on either side was already reported as a parse/invariant defect;
        // pairing an unreadable record would only restate it in a less useful shape.
        if let (Some(Some(e)), Some(Some(a))) =
            (expected.records.get(index), actual.records.get(index))
        {
            compare_records(index, e, a, &mut out);
        }
    }

    for index in paired..expected.records.len() {
        let record = expected.records.get(index).and_then(Option::as_ref);
        let (seq, tick_index, level, kind) = match record {
            Some(r) => context_of(r),
            None => (None, None, None, None),
        };
        out.push(Divergence {
            category: DivergenceCategory::Missing,
            index,
            seq,
            tick_index,
            level,
            kind,
            field: STREAM_FIELD.to_owned(),
            expected: match record {
                Some(r) => format!("{} @ tick {}", r.kind, r.tick_index),
                None => "<an unreadable record>".to_owned(),
            },
            actual: ABSENT.to_owned(),
            detail: format!(
                "candidate stream ended at {} records; the reference has {}",
                actual.records.len(),
                expected.records.len()
            ),
        });
    }

    for index in paired..actual.records.len() {
        let record = actual.records.get(index).and_then(Option::as_ref);
        let (seq, tick_index, level, kind) = match record {
            Some(r) => context_of(r),
            None => (None, None, None, None),
        };
        out.push(Divergence {
            category: DivergenceCategory::Extra,
            index,
            seq,
            tick_index,
            level,
            kind,
            field: STREAM_FIELD.to_owned(),
            expected: ABSENT.to_owned(),
            actual: match record {
                Some(r) => format!("{} @ tick {}", r.kind, r.tick_index),
                None => "<an unreadable record>".to_owned(),
            },
            detail: format!(
                "candidate stream carries {} records; the reference has {}",
                actual.records.len(),
                expected.records.len()
            ),
        });
    }

    GoldenDiff {
        divergences: out.items,
        truncated: out.truncated,
        bytes_equal: expected_text == actual_text,
        expected_records: expected.records.len(),
        actual_records: actual.records.len(),
    }
}

/// Compares one aligned record pair.
///
/// The envelope is compared field by field before the payload so the first divergence
/// reported for a shifted stream names the envelope field that shifted, which is the
/// fact an investigator needs first.
fn compare_records(index: usize, e: &GoldenRecord, a: &GoldenRecord, out: &mut Collector) {
    let (seq, tick_index, level, kind) = context_of(e);
    let mut at = |category: DivergenceCategory,
                  field: String,
                  expected: String,
                  actual: String,
                  detail: &str| {
        out.push(Divergence {
            category,
            index,
            seq,
            tick_index,
            level,
            kind: kind.clone(),
            field,
            expected,
            actual,
            detail: detail.to_owned(),
        });
    };

    if e.seq != a.seq {
        at(
            DivergenceCategory::Value,
            "seq".to_owned(),
            e.seq.to_string(),
            a.seq.to_string(),
            "stream sequence number differs",
        );
    }
    if e.tick_index != a.tick_index {
        at(
            DivergenceCategory::Value,
            "tickIndex".to_owned(),
            e.tick_index.to_string(),
            a.tick_index.to_string(),
            "record is attributed to a different corpus tick",
        );
    }
    // A raw `f64` comparison rather than a canonical-text one, so `-0` and `0` agree here
    // exactly as they do in the payload. `load_golden` has already refused a non-finite
    // `ts`, so there is no NaN to make this comparison lie.
    if e.ts != a.ts {
        at(
            DivergenceCategory::Value,
            "ts".to_owned(),
            crate::value::js_number_to_string(e.ts),
            crate::value::js_number_to_string(a.ts),
            "virtual clock reading differs",
        );
    }
    if e.level != a.level {
        at(
            DivergenceCategory::Value,
            "level".to_owned(),
            e.level.to_string(),
            a.level.to_string(),
            "record changed oracle stratum — L1 is the zero-tolerance decision stratum (Appendix A.3)",
        );
    }
    if e.kind != a.kind {
        at(
            DivergenceCategory::Value,
            "kind".to_owned(),
            e.kind.clone(),
            a.kind.clone(),
            "record kind differs",
        );
    }

    walk("payload", &e.payload, &a.payload, &mut at);
}

/// Recursive structural comparison of two JSON values, emitting dotted paths.
fn walk(
    path: &str,
    e: &JsonValue,
    a: &JsonValue,
    at: &mut impl FnMut(DivergenceCategory, String, String, String, &str),
) {
    let te = e.type_name();
    let ta = a.type_name();
    if te != ta {
        at(
            DivergenceCategory::Value,
            path.to_owned(),
            show(e),
            show(a),
            &format!("value changed JSON type ({te} -> {ta})"),
        );
        return;
    }

    match (e, a) {
        (JsonValue::Array(ev), JsonValue::Array(av)) => {
            if ev.len() != av.len() {
                at(
                    DivergenceCategory::Value,
                    format!("{path}.length"),
                    ev.len().to_string(),
                    av.len().to_string(),
                    "array length differs",
                );
            }
            // Arrays are sequences, not sets: element *i* is compared with element *i*,
            // so a reordering is a divergence rather than a wash. `canonicalize` makes
            // the same promise on the writer side.
            for i in 0..ev.len().min(av.len()) {
                if let (Some(ei), Some(ai)) = (ev.get(i), av.get(i)) {
                    walk(&format!("{path}.{i}"), ei, ai, at);
                }
            }
        }
        (JsonValue::Object(eo), JsonValue::Object(ao)) => {
            // Sorted union: key order is a serialiser detail the format already erases,
            // and the report has to be stable across two runs to be comparable evidence.
            let mut keys: Vec<&str> = eo.keys().chain(ao.keys()).collect();
            keys.sort_by(|x, y| utf16_cmp(x, y));
            keys.dedup();

            for key in keys {
                let field = format!("{path}.{key}");
                match (eo.get(key), ao.get(key)) {
                    (Some(ev), Some(av)) => walk(&field, ev, av, at),
                    (Some(ev), None) => at(
                        DivergenceCategory::Missing,
                        field,
                        show(ev),
                        ABSENT.to_owned(),
                        "key present in the reference, absent in the candidate",
                    ),
                    (None, Some(av)) => at(
                        DivergenceCategory::Extra,
                        field,
                        ABSENT.to_owned(),
                        show(av),
                        "key absent in the reference, present in the candidate",
                    ),
                    (None, None) => {}
                }
            }
        }
        _ => {
            // Scalars compare as canonical text, which is exactly the golden's own
            // equality: it folds `-0` into `0` and `1.0` into `1` (both documented in
            // `golden.ts`) and it separates values that differ by a single ULP.
            let se = show(e);
            let sa = show(a);
            if se != sa {
                at(
                    DivergenceCategory::Value,
                    path.to_owned(),
                    se,
                    sa,
                    "scalar value differs",
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A two-record golden covering both strata, a nested payload, an array and a float.
    fn base() -> String {
        [
            r#"{"kind":"gate.verdict","level":"L1","payload":{"gates":[{"id":1,"pass":true},{"id":2,"pass":false}],"symbol":"AAPL"},"seq":0,"tickIndex":0,"ts":1784880866709}"#,
            r#"{"kind":"brain.checkpoint","level":"L2","payload":{"equity":100000,"weights":[0.5,-0.25]},"seq":1,"tickIndex":4,"ts":1784880870709}"#,
        ]
        .join("\n")
            + "\n"
    }

    fn diff(a: &str, b: &str) -> GoldenDiff {
        diff_goldens(a, b, DiffOptions::default())
    }

    #[test]
    fn a_stream_matches_itself() {
        let d = diff(&base(), &base());
        assert_eq!(d.divergences, Vec::new());
        assert!(d.bytes_equal);
        assert_eq!(d.expected_records, 2);
    }

    #[test]
    fn a_one_ulp_float_change_is_a_divergence() {
        let nudged = base().replace("-0.25", "-0.25000000000000006");
        let d = diff(&base(), &nudged);
        assert!(
            d.divergences
                .iter()
                .any(|x| x.field == "payload.weights.1" && x.category == DivergenceCategory::Value),
            "expected payload.weights.1, got {:?}",
            d.divergences.iter().map(|x| &x.field).collect::<Vec<_>>()
        );
    }

    #[test]
    fn container_only_changes_are_silent() {
        // Key order, whitespace, CRLF, a BOM and a trailing newline are all transport.
        let reordered = r#"{"ts":1784880866709,"tickIndex":0,"seq":0,"payload":{"symbol":"AAPL","gates":[{"pass":true,"id":1},{"pass":false,"id":2}]},"level":"L1","kind":"gate.verdict"}"#.to_owned()
            + "\r\n"
            + r#"{ "kind" : "brain.checkpoint" , "level" : "L2" , "payload" : { "equity" : 1.0e5 , "weights" : [ 0.5 , -0.25 ] } , "seq" : 1 , "tickIndex" : 4 , "ts" : 1784880870709 }"#;
        let d = diff(&base(), &format!("\u{feff}{reordered}"));
        assert_eq!(
            d.divergences,
            Vec::new(),
            "container noise leaked into the report"
        );
        assert!(
            !d.bytes_equal,
            "the byte stratum must still see the difference"
        );
    }

    #[test]
    fn a_length_change_is_the_first_row() {
        let truncated = base().lines().take(1).collect::<Vec<_>>().join("\n");
        let d = diff(&base(), &truncated);
        match d.divergences.first() {
            Some(first) => {
                assert_eq!(first.field, STREAM_FIELD);
                assert_eq!(first.category, DivergenceCategory::Missing);
            }
            None => panic!("a truncated stream must report at least one divergence"),
        }
    }

    #[test]
    fn a_missing_payload_key_is_reported_as_missing_and_an_added_one_as_extra() {
        let dropped = base().replace(r#","symbol":"AAPL""#, "");
        let d = diff(&base(), &dropped);
        assert!(
            d.divergences
                .iter()
                .any(|x| x.field == "payload.symbol" && x.category == DivergenceCategory::Missing)
        );

        let d = diff(&dropped, &base());
        assert!(
            d.divergences
                .iter()
                .any(|x| x.field == "payload.symbol" && x.category == DivergenceCategory::Extra)
        );
    }

    #[test]
    fn a_type_change_names_both_types() {
        let retyped = base().replace(r#""pass":true"#, r#""pass":"true""#);
        let d = diff(&base(), &retyped);
        match d
            .divergences
            .iter()
            .find(|x| x.field == "payload.gates.0.pass")
        {
            Some(found) => assert!(
                found.detail.contains("boolean -> string"),
                "detail was {:?}",
                found.detail
            ),
            None => panic!("a type change must be reported at its path"),
        }
    }

    #[test]
    fn an_array_reordering_is_a_divergence() {
        let swapped = base().replace(
            r#"[{"id":1,"pass":true},{"id":2,"pass":false}]"#,
            r#"[{"id":2,"pass":false},{"id":1,"pass":true}]"#,
        );
        let d = diff(&base(), &swapped);
        assert!(
            d.divergences
                .iter()
                .any(|x| x.field.starts_with("payload.gates.")),
            "array order is meaning, not a wash"
        );
    }

    #[test]
    fn envelope_fields_are_compared_before_the_payload() {
        let moved = base().replace(r#""tickIndex":4"#, r#""tickIndex":5"#);
        let d = diff(&base(), &moved);
        match d.divergences.first() {
            Some(first) => assert_eq!(first.field, "tickIndex"),
            None => panic!("expected a tickIndex divergence"),
        }
    }

    #[test]
    fn the_cap_truncates_and_says_so() {
        let d = diff_goldens(
            &base(),
            &base().replace("AAPL", "MSFT").replace("100000", "99999"),
            DiffOptions { max_divergences: 1 },
        );
        assert_eq!(d.divergences.len(), 1);
        assert!(d.truncated);
    }

    #[test]
    fn a_defect_in_the_reference_is_reported_too() {
        // A reference that violates the format invalidates every claim measured against
        // it — louder news than any candidate divergence.
        let broken = base().replace(r#""seq":1"#, r#""seq":7"#);
        let d = diff(&broken, &broken);
        assert!(
            d.divergences
                .iter()
                .any(|x| x.category == DivergenceCategory::Invariant
                    && x.detail.starts_with("reference:")),
            "expected a reference-side invariant, got {:?}",
            d.divergences
        );
    }
}
