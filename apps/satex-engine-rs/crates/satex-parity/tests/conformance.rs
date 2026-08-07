//! The RS-1.7 falsifiability matrix, applied to the Rust oracle (RS-UP-1 / RS-1.4).
//!
//! 49 classes: 36 positive controls the oracle must catch *and name*, 13 negative
//! controls it must stay silent about. The ids match
//! `apps/satex-terminal/scripts/oracle/mutate.ts` one for one, because that file is the
//! contract and this is the Rust column of it.
//!
//! P-097 is the scar this suite discharges: a check that cannot fail is worse than no
//! check, because it reports success. So the suite tests itself too — [`the_judge_rejects_an_always_clean_oracle`]
//! and [`the_judge_rejects_an_always_divergent_oracle`] point the judge at two
//! deliberately broken verifiers and demand it reject both. Without those two tests the
//! other 49 rows prove only that *something* ran.

#[path = "common/matrix.rs"]
mod matrix;

use matrix::{
    FieldPattern::{Exact, PayloadDeep, PayloadPrefix},
    Mutation, base, base_lines, fake_divergence, fake_verdict, join, judge, once, run, set_seq,
};

/// Positive controls that move a payload value.
fn payload_mutations() -> Vec<Mutation> {
    vec![
        Mutation {
            id: "payload-scalar-ulp-nudge",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(0),
            // The next representable double above 0.5. The single hardest thing the
            // differ has to see, and the reason scalars compare as canonical text.
            apply: |t| once(t, r#""score":0.5,"#, r#""score":0.5000000000000001,"#),
        },
        Mutation {
            id: "payload-scalar-precision-truncated",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(1),
            apply: |t| once(t, "194.73388140864014", "194.73388140864"),
        },
        Mutation {
            id: "payload-scalar-bool-flip",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(0),
            apply: |t| once(t, r#""pass":true"#, r#""pass":false"#),
        },
        Mutation {
            id: "payload-scalar-string-flip",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(0),
            apply: |t| once(t, r#""symbol":"AAPL""#, r#""symbol":"TSLA""#),
        },
        Mutation {
            id: "payload-scalar-type-to-null",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(1),
            apply: |t| once(t, r#""qty":10"#, r#""qty":null"#),
        },
        Mutation {
            id: "payload-scalar-number-to-string",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(1),
            apply: |t| once(t, r#""qty":10"#, r#""qty":"10""#),
        },
        Mutation {
            id: "payload-nested-deep-scalar",
            divergent: true,
            // Four segments below `payload`: proves the report emits a path, not a noun.
            expect: Some(PayloadDeep(3)),
            target: Some(1),
            apply: |t| once(t, r#""c":1"#, r#""c":2"#),
        },
        Mutation {
            id: "payload-object-key-removed",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(0),
            apply: |t| once(t, r#","symbol":"AAPL""#, ""),
        },
        Mutation {
            id: "payload-object-key-added",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(0),
            apply: |t| once(t, r#""score":0.5,"#, r#""extra":true,"score":0.5,"#),
        },
        Mutation {
            id: "payload-array-reordered",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(0),
            apply: |t| {
                once(
                    t,
                    r#"[{"id":1,"pass":true},{"id":2,"pass":false}]"#,
                    r#"[{"id":2,"pass":false},{"id":1,"pass":true}]"#,
                )
            },
        },
        Mutation {
            id: "payload-array-element-removed",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(0),
            apply: |t| {
                once(
                    t,
                    r#"[{"id":1,"pass":true},{"id":2,"pass":false}]"#,
                    r#"[{"id":1,"pass":true}]"#,
                )
            },
        },
        Mutation {
            id: "payload-duplicate-json-key",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(1),
            // JSON does not forbid a duplicate key and does not say which wins; JS and
            // serde both keep the last, so a reader that kept the first would read a
            // different payload out of identical bytes.
            apply: |t| once(t, r#""qty":10"#, r#""qty":10,"qty":11"#),
        },
        Mutation {
            id: "payload-array-to-object",
            divergent: true,
            expect: Some(PayloadPrefix),
            target: Some(2),
            apply: |t| once(t, r#"[0.75,-0.25]"#, r#"{"0":0.75,"1":-0.25}"#),
        },
    ]
}

/// Positive controls that move an envelope field.
fn envelope_mutations() -> Vec<Mutation> {
    vec![
        Mutation {
            id: "envelope-kind-corrupted",
            divergent: true,
            expect: Some(Exact("kind")),
            target: Some(0),
            apply: |t| once(t, r#""kind":"gate.verdict""#, r#""kind":"gate.verdictX""#),
        },
        Mutation {
            id: "envelope-level-l1-demoted",
            divergent: true,
            expect: Some(Exact("level")),
            target: Some(0),
            apply: |t| once(t, r#""level":"L1""#, r#""level":"L2""#),
        },
        Mutation {
            id: "envelope-level-l2-promoted",
            divergent: true,
            expect: Some(Exact("level")),
            target: Some(2),
            apply: |t| once(t, r#""level":"L2""#, r#""level":"L1""#),
        },
        Mutation {
            id: "envelope-key-removed",
            divergent: true,
            // A record missing an envelope key is not a record; it fails to load, so the
            // finding is stream-level rather than field-level.
            expect: Some(Exact("<stream>")),
            target: Some(0),
            apply: |t| once(t, r#","ts":1784880866709"#, ""),
        },
        Mutation {
            id: "envelope-key-unknown-added",
            divergent: true,
            expect: Some(Exact("<stream>")),
            target: Some(0),
            apply: |t| once(t, r#","seq":0"#, r#","extra":1,"seq":0"#),
        },
    ]
}

/// Positive controls that move the shape of the stream rather than one field.
fn stream_mutations() -> Vec<Mutation> {
    vec![
        Mutation {
            id: "seq-duplicated",
            divergent: true,
            expect: Some(Exact("seq")),
            target: Some(1),
            apply: |t| once(t, r#""seq":1"#, r#""seq":0"#),
        },
        Mutation {
            id: "seq-gap-introduced",
            divergent: true,
            expect: Some(Exact("seq")),
            target: Some(1),
            apply: |t| once(t, r#""seq":1"#, r#""seq":9"#),
        },
        Mutation {
            id: "seq-records-swapped",
            divergent: true,
            expect: Some(Exact("seq")),
            target: Some(0),
            apply: |_| {
                let mut lines = base_lines();
                lines.swap(0, 1);
                join(&lines)
            },
        },
        Mutation {
            id: "tick-index-drift",
            divergent: true,
            expect: Some(Exact("tickIndex")),
            target: Some(1),
            apply: |t| once(t, r#""tickIndex":4"#, r#""tickIndex":5"#),
        },
        Mutation {
            id: "tick-index-regressed",
            divergent: true,
            expect: Some(Exact("tickIndex")),
            target: Some(2),
            apply: |t| once(t, r#""tickIndex":8"#, r#""tickIndex":3"#),
        },
        Mutation {
            id: "ts-drift-one-millisecond",
            divergent: true,
            expect: Some(Exact("ts")),
            target: Some(1),
            apply: |t| once(t, r#""ts":1784880870709"#, r#""ts":1784880870710"#),
        },
        Mutation {
            id: "ts-sub-millisecond-drift",
            divergent: true,
            expect: Some(Exact("ts")),
            target: Some(1),
            // `ts` is checked for finiteness but deliberately not for integrality — the
            // writer does not require it, so the reader must not either (RS-L1).
            apply: |t| once(t, r#""ts":1784880870709"#, r#""ts":1784880870709.5"#),
        },
        Mutation {
            id: "ts-regressed",
            divergent: true,
            expect: Some(Exact("ts")),
            target: Some(2),
            apply: |t| once(t, r#""ts":1784880874709"#, r#""ts":1784880868000"#),
        },
        Mutation {
            id: "record-deleted",
            divergent: true,
            // The stream is left internally inconsistent, so the sequence invariant fires
            // at the deletion point before any length arithmetic does.
            expect: Some(Exact("seq")),
            target: Some(1),
            apply: |_| {
                let mut lines = base_lines();
                lines.remove(1);
                join(&lines)
            },
        },
        Mutation {
            id: "record-deleted-renumbered",
            divergent: true,
            // Renumbering repairs the invariant, so only comparison can catch this —
            // strictly harder, and the reason both variants are in the matrix.
            expect: Some(Exact("<stream>")),
            target: Some(1),
            apply: |_| {
                let mut lines = base_lines();
                lines.remove(1);
                let renumbered: Vec<String> = lines
                    .iter()
                    .enumerate()
                    .map(|(i, line)| set_seq(line, i))
                    .collect();
                join(&renumbered)
            },
        },
        Mutation {
            id: "record-inserted-duplicate",
            divergent: true,
            expect: Some(Exact("seq")),
            target: Some(2),
            apply: |_| {
                let mut lines = base_lines();
                let copy = lines.get(1).cloned().unwrap_or_default();
                lines.insert(2, copy);
                join(&lines)
            },
        },
        Mutation {
            id: "record-inserted-renumbered",
            divergent: true,
            expect: Some(Exact("<stream>")),
            target: Some(2),
            apply: |_| {
                let mut lines = base_lines();
                let copy = lines.get(1).cloned().unwrap_or_default();
                lines.insert(2, copy);
                let renumbered: Vec<String> = lines
                    .iter()
                    .enumerate()
                    .map(|(i, line)| set_seq(line, i))
                    .collect();
                join(&renumbered)
            },
        },
        Mutation {
            id: "stream-truncated-tail",
            divergent: true,
            expect: Some(Exact("<stream>")),
            target: Some(3),
            apply: |_| {
                let mut lines = base_lines();
                lines.pop();
                join(&lines)
            },
        },
        Mutation {
            id: "stream-emptied",
            divergent: true,
            // The vacuous pass, one layer up: every comparison against an empty golden
            // would succeed for lack of anything to compare.
            expect: Some(Exact("<stream>")),
            target: Some(0),
            apply: |_| String::new(),
        },
        Mutation {
            id: "id-normalization-bypass",
            divergent: true,
            // Fatal even though only one side carries it: a raw id means the golden holds
            // `Math.random()` output and the next capture differs for no engine reason.
            expect: Some(PayloadPrefix),
            target: Some(1),
            apply: |t| once(t, r#""<ord:1>""#, r#""ord_m1a2b3c4d5e6f""#),
        },
        Mutation {
            id: "float-overflow-to-infinity",
            divergent: true,
            // Parses fine (JS `JSON.parse` yields Infinity) and dies at canonicalisation,
            // which is what makes it an invariant finding on `payload` rather than a parse
            // finding on the line.
            expect: Some(Exact("payload")),
            target: Some(2),
            apply: |t| once(t, r#""equity":100000"#, r#""equity":1e999"#),
        },
        Mutation {
            id: "float-nan-literal",
            divergent: true,
            expect: Some(Exact("<stream>")),
            target: Some(2),
            apply: |t| once(t, r#""equity":100000"#, r#""equity":NaN"#),
        },
        Mutation {
            id: "line-not-json",
            divergent: true,
            expect: Some(Exact("<stream>")),
            target: Some(2),
            apply: |_| {
                let mut lines = base_lines();
                if let Some(slot) = lines.get_mut(2) {
                    *slot = "not json at all".to_owned();
                }
                join(&lines)
            },
        },
    ]
}

/// Negative controls: the bytes move, no decision does. Silence is the only pass.
///
/// These are half the suite's value. A differ that reported them would bury every real
/// divergence in noise, and the first response to that noise would be to widen a
/// tolerance somewhere that matters.
fn format_mutations() -> Vec<Mutation> {
    vec![
        Mutation {
            id: "format-payload-key-order-reversed",
            divergent: false,
            expect: None,
            target: None,
            apply: |t| {
                once(
                    t,
                    r#"{"gates":[{"id":1,"pass":true},{"id":2,"pass":false}],"score":0.5,"symbol":"AAPL"}"#,
                    r#"{"symbol":"AAPL","score":0.5,"gates":[{"id":1,"pass":true},{"id":2,"pass":false}]}"#,
                )
            },
        },
        Mutation {
            id: "format-envelope-key-order-reversed",
            divergent: false,
            expect: None,
            target: None,
            apply: |_| {
                let mut lines = base_lines();
                if let Some(slot) = lines.get_mut(0) {
                    *slot = r#"{"ts":1784880866709,"tickIndex":0,"seq":0,"payload":{"gates":[{"id":1,"pass":true},{"id":2,"pass":false}],"score":0.5,"symbol":"AAPL"},"level":"L1","kind":"gate.verdict"}"#.to_owned();
                }
                join(&lines)
            },
        },
        Mutation {
            id: "format-whitespace-inserted",
            divergent: false,
            expect: None,
            target: None,
            apply: |t| t.replace(",\"", ", \"").replace("\":", "\": "),
        },
        Mutation {
            id: "format-crlf-line-endings",
            divergent: false,
            expect: None,
            target: None,
            apply: |t| t.replace('\n', "\r\n"),
        },
        Mutation {
            id: "format-trailing-newline-removed",
            divergent: false,
            expect: None,
            target: None,
            apply: |t| t.trim_end_matches('\n').to_owned(),
        },
        Mutation {
            id: "format-bom-prefixed",
            divergent: false,
            expect: None,
            target: None,
            apply: |t| format!("\u{feff}{t}"),
        },
        Mutation {
            id: "format-blank-line-inserted",
            divergent: false,
            expect: None,
            target: None,
            apply: |_| {
                let mut lines = base_lines();
                lines.insert(1, String::new());
                join(&lines)
            },
        },
        Mutation {
            id: "format-unicode-escaped",
            divergent: false,
            expect: None,
            target: None,
            // The escape is assembled rather than written literally: spelled inline it is
            // the kind of sequence an editor or patch tool turns back into the character
            // it denotes, which would silently convert this control into a no-op.
            apply: |t| {
                let esc = format!("{}u0041", '\\');
                once(t, r#""AAPL""#, &format!(r#""{esc}APL""#))
            },
        },
        Mutation {
            id: "format-line-whitespace-padded",
            divergent: false,
            expect: None,
            target: None,
            apply: |_| {
                let mut lines = base_lines();
                if let Some(slot) = lines.get_mut(0) {
                    *slot = format!("  {slot}  ");
                }
                join(&lines)
            },
        },
        Mutation {
            id: "format-excess-precision",
            divergent: false,
            expect: None,
            target: None,
            apply: |t| once(t, r#""score":0.5,"#, r#""score":0.50000000000000000001,"#),
        },
        Mutation {
            id: "format-negative-zero",
            divergent: false,
            expect: None,
            target: None,
            // `String(-0)` is `"0"`, so the sign of zero is not a golden object.
            apply: |t| once(t, r#""drawdown":0"#, r#""drawdown":-0"#),
        },
        Mutation {
            id: "format-float-integer-form",
            divergent: false,
            expect: None,
            target: None,
            apply: |t| once(t, r#""equity":100000"#, r#""equity":100000.0"#),
        },
        Mutation {
            id: "format-exponent-notation",
            divergent: false,
            expect: None,
            target: None,
            apply: |t| once(t, r#""equity":100000"#, r#""equity":1e5"#),
        },
    ]
}

/// The full matrix — the falsifiability contract for the SATEX golden oracle.
fn matrix() -> Vec<Mutation> {
    let mut all = payload_mutations();
    all.extend(envelope_mutations());
    all.extend(stream_mutations());
    all.extend(format_mutations());
    all
}

#[test]
fn the_matrix_covers_the_declared_classes() {
    let all = matrix();
    assert_eq!(all.len(), 49, "mutate.ts declares 49 classes");
    let divergent = all.iter().filter(|m| m.divergent).count();
    assert_eq!(divergent, 36, "36 positive controls");
    assert_eq!(all.len() - divergent, 13, "13 negative controls");

    let mut ids: Vec<&str> = all.iter().map(|m| m.id).collect();
    ids.sort_unstable();
    let unique = {
        let mut u = ids.clone();
        u.dedup();
        u.len()
    };
    assert_eq!(unique, ids.len(), "mutation ids must be unique");

    // A positive control with no expected field would pass by reporting anything at all.
    for m in all.iter().filter(|m| m.divergent) {
        assert!(m.expect.is_some(), "{} must declare a field", m.id);
    }
    for m in all.iter().filter(|m| !m.divergent) {
        assert!(m.expect.is_none(), "{} is a negative control", m.id);
    }
}

#[test]
fn the_base_golden_is_clean_against_itself() {
    let verdict =
        satex_parity::verify_golden(&base(), &base(), satex_parity::DiffOptions::default());
    assert_eq!(verdict.exit_code, 0, "report was: {}", verdict.report);
    assert!(verdict.diff.divergences.is_empty());
    assert!(verdict.diff.bytes_equal);
}

#[test]
fn anchors_are_unique() {
    // Each literal edit below stands in for a structural walk; that substitution is only
    // sound while the anchor occurs exactly as often as the mutation assumes.
    let text = base();
    for (anchor, count) in [
        (r#""score":0.5,"#, 1),
        ("194.73388140864014", 1),
        (r#""symbol":"AAPL""#, 1),
        (r#""qty":10"#, 1),
        (r#""c":1"#, 1),
        (r#""equity":100000"#, 1),
        (r#""drawdown":0"#, 1),
        (r#""<ord:1>""#, 1),
        (r#""seq":1"#, 1),
        (r#""tickIndex":4"#, 1),
        (r#""tickIndex":8"#, 1),
        (r#""ts":1784880870709"#, 1),
        (r#""ts":1784880874709"#, 1),
        (r#""level":"L2""#, 1),
        (r#"[0.75,-0.25]"#, 1),
        (r#"[{"id":1,"pass":true},{"id":2,"pass":false}]"#, 1),
        // Deliberately shared: the `once` helper takes the first, which is record 0.
        (r#""pass":true"#, 2),
        (r#""kind":"gate.verdict""#, 2),
        (r#""level":"L1""#, 3),
    ] {
        assert_eq!(
            text.matches(anchor).count(),
            count,
            "anchor {anchor:?} occurs an unexpected number of times"
        );
    }
}

#[test]
fn every_mutation_moves_the_text() {
    // A mutation that silently changed nothing would make its row a vacuous pass — the
    // failure `mutate.ts` guards with "the suite asserts the text moved before it asserts
    // anything about the verdict".
    let reference = base();
    for m in matrix() {
        let candidate = (m.apply)(&reference);
        assert_ne!(candidate, reference, "{} did not change the golden", m.id);
    }
}

#[test]
fn the_matrix_holds() {
    let mut broken: Vec<String> = Vec::new();
    for m in matrix() {
        let (_, verdict) = run(&m);
        for failure in judge(&m, &verdict) {
            broken.push(format!("{}: {failure}", m.id));
        }
    }
    assert!(
        broken.is_empty(),
        "the oracle failed {} of 49 mutation classes:\n{}",
        broken.len(),
        broken.join("\n")
    );
}

#[test]
fn the_judge_rejects_an_always_clean_oracle() {
    // A differ that always says "clean" passes every negative control. If the judge did
    // not reject it here, the 13 silent rows above would prove nothing.
    let clean = fake_verdict(0, Vec::new());
    for m in matrix().into_iter().filter(|m| m.divergent) {
        assert!(
            !judge(&m, &clean).is_empty(),
            "{} was accepted by an oracle that reports nothing",
            m.id
        );
    }
}

#[test]
fn the_judge_rejects_an_always_divergent_oracle() {
    // And one that always says "divergent" passes every positive control.
    let noisy = fake_verdict(1, vec![fake_divergence("payload.anything", 0)]);
    for m in matrix().into_iter().filter(|m| !m.divergent) {
        assert!(
            !judge(&m, &noisy).is_empty(),
            "{} was accepted by an oracle that reports everything",
            m.id
        );
    }
}

#[test]
fn the_judge_rejects_an_oracle_that_names_the_wrong_field() {
    // Rule 3 of the judge in isolation: catching the right record while naming the wrong
    // thing is the failure mode an investigator cannot recover from.
    let misnamed = fake_verdict(1, vec![fake_divergence("kind", 0)]);
    let payload_class = matrix()
        .into_iter()
        .find(|m| m.id == "payload-scalar-ulp-nudge");
    match payload_class {
        Some(m) => assert!(!judge(&m, &misnamed).is_empty()),
        None => panic!("payload-scalar-ulp-nudge must exist"),
    }
}
