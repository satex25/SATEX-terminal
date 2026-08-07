//! Unilateral golden read — port of `loadGolden` in `verify.ts` (RS-1.4).
//!
//! Reads a golden stream and judges it against the format's own laws, with no reference
//! stream at all. That is not redundant with the pairwise diff: it catches the failure a
//! pairwise diff is structurally unable to see, namely a defect present in *both* sides.
//! A raw `ord_…` id leaking past the normaliser into both goldens compares equal and is
//! still fatal — it means the goldens carry `Math.random()` output, so the next capture
//! will differ for no engine reason (ledger P-143).
//!
//! ## Nothing here may panic
//!
//! A malformed golden is the *subject* of this module, not an error condition for it. A
//! harness that dies with a stack trace instead of a drift report has told the operator
//! nothing about which record moved, so every failure path below produces a
//! [`Divergence`] and keeps reading. The RS-1.7 mutation matrix judges the oracle by the
//! `field` it names, which is why the field strings, the categories and the order of the
//! findings are ported verbatim rather than rationalised.
//!
//! ## Two deliberate divergences from the TypeScript, both narrowing
//!
//! - `seq` and `tickIndex` are `u64` here (Appendix B.1, documented in `record.rs`). A
//!   value that is not a non-negative integer *or that exceeds `u64::MAX`* is reported as
//!   a malformed envelope, in the same shape the TypeScript reports a non-integer.
//! - Where the TypeScript interpolates `JSON.stringify(value)` into an envelope-type
//!   message, this uses [`show`]. They differ for exactly one input: `JSON.stringify`
//!   renders a non-finite number as `null`, so the TS message for `ts: 1e400` reads
//!   "ts is not a finite number (got null)" — which names the wrong problem. [`show`]
//!   says the value could not be written down and why.

use crate::id::raw_id_in;
use crate::record::{
    Divergence, DivergenceCategory, ENVELOPE_KEYS, GoldenRecord, LoadedGolden, OracleLevel,
    STREAM_FIELD,
};
use crate::value::{JsonValue, canonicalize, js_number_to_string, parse_json, show};

/// Byte-order mark. Stripped from the head of a golden as a transport artifact.
const BOM: char = '\u{FEFF}';

/// How much of an unreadable line a divergence row quotes, in UTF-16 code units.
///
/// Matches `line.slice(0, 120)` on the TypeScript side. Code units rather than characters
/// because that is what `String.prototype.slice` counts; the one place the two
/// implementations cannot agree is a cut that would land *inside* a surrogate pair, where
/// JavaScript emits a lone surrogate and Rust's `String` cannot hold one — this stops one
/// unit short instead.
const LINE_EXCERPT_UNITS: usize = 120;

/// Largest `f64` that is *not* representable as a `u64`, i.e. 2^64.
///
/// `u64::MAX` rounds up to this value when converted to `f64`, so the bound has to be
/// strict: `n < TWO_POW_64` accepts every integral double that fits and rejects 2^64
/// itself.
const TWO_POW_64: f64 = 18_446_744_073_709_551_616.0;

/// Whether `ch` is whitespace by JavaScript's rules rather than Unicode's.
///
/// `String.prototype.trim` strips `WhiteSpace` + `LineTerminator`, which is the Unicode
/// `White_Space` property *plus* U+FEFF and *minus* U+0085. Rust's `char::is_whitespace`
/// is the property alone. The gap is not academic: a line consisting only of a byte-order
/// mark is a blank line to the TypeScript splitter and a parse defect to a naive Rust
/// one, and the two implementations would then disagree about the record count.
fn is_js_whitespace(ch: char) -> bool {
    (ch.is_whitespace() && ch != '\u{85}') || ch == BOM
}

/// The first [`LINE_EXCERPT_UNITS`] UTF-16 code units of `line`.
fn line_head(line: &str) -> String {
    let mut out = String::new();
    let mut units = 0;
    for ch in line.chars() {
        let width = ch.len_utf16();
        if units + width > LINE_EXCERPT_UNITS {
            break;
        }
        out.push(ch);
        units += width;
    }
    out
}

/// Splits golden file text into record lines, absorbing container artifacts only.
///
/// A leading BOM, CRLF endings, a missing or extra trailing newline and blank lines are
/// properties of how the bytes were transported, not of what the engine decided — the
/// same tolerance `readCorpusTape` already applies to corpus tapes. The byte stratum
/// still sees every one of them, which is where they belong.
#[must_use]
pub fn split_golden_lines(text: &str) -> Vec<&str> {
    let body = text.strip_prefix(BOM).unwrap_or(text);
    body.split('\n')
        .map(|raw| raw.strip_suffix('\r').unwrap_or(raw))
        .filter(|line| !line.chars().all(is_js_whitespace))
        .collect()
}

/// One finding, before the stream label is stamped onto its detail sentence.
///
/// A struct rather than eight positional arguments so that a call site reads as the
/// divergence row it becomes, and so that the row can be checked against the TypeScript
/// line by line.
struct Finding<'a> {
    /// What kind of disagreement this is.
    category: DivergenceCategory,
    /// 0-based stream position.
    index: usize,
    /// Envelope context, when a record was read far enough to have any.
    record: Option<&'a GoldenRecord>,
    /// Dotted path or a sentinel.
    field: &'a str,
    /// What the format required.
    expected: String,
    /// What the stream carried.
    actual: String,
    /// One human sentence naming what moved, without the label prefix.
    detail: String,
}

/// Stamps `label` onto a [`Finding`] and lifts it into a [`Divergence`].
///
/// The label is what stops a defective *reference* from being read as a bad candidate —
/// a reference that violates the format is a halt-and-investigate condition, and the
/// report has to say which side it came from.
fn note(label: &str, finding: Finding<'_>) -> Divergence {
    let Finding {
        category,
        index,
        record,
        field,
        expected,
        actual,
        detail,
    } = finding;
    Divergence {
        category,
        index,
        seq: record.map(|r| r.seq),
        tick_index: record.map(|r| r.tick_index),
        level: record.map(|r| r.level),
        kind: record.map(|r| r.kind.clone()),
        field: field.to_owned(),
        expected,
        actual,
        detail: format!("{label}: {detail}"),
    }
}

/// Reads `value` as a non-negative integer that fits a `u64`, the way `Number.isInteger(v)
/// && v >= 0` does — plus the Appendix B.1 range bound.
fn non_negative_integer(value: &JsonValue) -> Option<u64> {
    let JsonValue::Number(n) = value else {
        return None;
    };
    let n = *n;
    // `is_finite` first: `Number.isInteger` is false for NaN and both infinities, and
    // `fract()` would say `NaN` is non-integral only by accident.
    if !n.is_finite() || n.fract() != 0.0 || !(0.0..TWO_POW_64).contains(&n) {
        return None;
    }
    Some(n as u64)
}

/// Reads one parsed line as a golden record, or says why it is not one.
///
/// Strict in both directions — the serde `deny_unknown_fields` discipline. An extra
/// envelope key is a schema change wearing a passing disguise, and a missing one is a
/// record that would compare equal on everything it still has.
fn read_envelope(value: &JsonValue) -> Result<GoldenRecord, String> {
    let JsonValue::Object(obj) = value else {
        return Err(format!(
            "line is not a JSON object (got {})",
            value.type_name()
        ));
    };
    for key in obj.keys() {
        if !ENVELOPE_KEYS.contains(&key) {
            return Err(format!(
                "unknown envelope key \"{key}\" (the envelope is exactly {})",
                ENVELOPE_KEYS.join(", ")
            ));
        }
    }
    for key in ENVELOPE_KEYS {
        if !obj.contains_key(key) {
            return Err(format!("envelope is missing \"{key}\""));
        }
    }

    let (Some(seq), Some(tick_index), Some(ts), Some(level), Some(kind), Some(payload)) = (
        obj.get("seq"),
        obj.get("tickIndex"),
        obj.get("ts"),
        obj.get("level"),
        obj.get("kind"),
        obj.get("payload"),
    ) else {
        // Unreachable: every key was just confirmed present.
        return Err("envelope lost a key between the presence check and the read".to_owned());
    };

    let Some(read_seq) = non_negative_integer(seq) else {
        return Err(format!(
            "seq is not a non-negative integer (got {})",
            show(seq)
        ));
    };
    let Some(read_tick) = non_negative_integer(tick_index) else {
        return Err(format!(
            "tickIndex is not a non-negative integer (got {})",
            show(tick_index)
        ));
    };
    // `ts` is checked for finiteness but *not* for integrality: `renderRecord` validates
    // seq and tickIndex as integers and leaves ts alone, and a reader must not enforce a
    // rule its writer does not (RS-L1 — port behavior, not intentions). The
    // `ts-sub-millisecond-drift` mutation exists to keep it that way.
    let read_ts = match ts {
        JsonValue::Number(n) if n.is_finite() => *n,
        other => return Err(format!("ts is not a finite number (got {})", show(other))),
    };
    let parsed_level = match level {
        JsonValue::String(text) => OracleLevel::parse(text),
        _ => None,
    };
    let Some(read_level) = parsed_level else {
        return Err(format!(
            "level is not an oracle stratum (got {}, expected \"L1\" or \"L2\")",
            show(level)
        ));
    };
    let read_kind = match kind {
        JsonValue::String(text) if !text.is_empty() => text.clone(),
        other => {
            return Err(format!(
                "kind is not a non-empty string (got {})",
                show(other)
            ));
        }
    };

    Ok(GoldenRecord {
        seq: read_seq,
        tick_index: read_tick,
        ts: read_ts,
        level: read_level,
        kind: read_kind,
        payload: payload.clone(),
    })
}

/// Reads a golden stream and judges it against the format's own laws. Never panics.
#[must_use]
pub fn load_golden(text: &str, label: &str) -> LoadedGolden {
    let lines = split_golden_lines(text);
    let mut records: Vec<Option<GoldenRecord>> = Vec::with_capacity(lines.len());
    let mut defects: Vec<Divergence> = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        let parsed = match parse_json(line) {
            Ok(value) => value,
            Err(err) => {
                records.push(None);
                defects.push(note(
                    label,
                    Finding {
                        category: DivergenceCategory::Parse,
                        index,
                        record: None,
                        field: STREAM_FIELD,
                        expected: "<a golden record>".to_owned(),
                        actual: line_head(line),
                        detail: format!("record {index} is not valid JSON ({err})"),
                    },
                ));
                continue;
            }
        };

        let record = match read_envelope(&parsed) {
            Ok(record) => record,
            Err(err) => {
                records.push(None);
                defects.push(note(
                    label,
                    Finding {
                        category: DivergenceCategory::Parse,
                        index,
                        record: None,
                        field: STREAM_FIELD,
                        expected: "<a golden record>".to_owned(),
                        actual: line_head(line),
                        detail: format!("record {index} {err}"),
                    },
                ));
                continue;
            }
        };

        // Canonicalising is how a payload gets checked for the values `JSON.parse` will
        // happily produce and the golden writer refuses: `1e400` parses to `Infinity`
        // without a syntax error, and Appendix B.3 says a non-finite float reaching
        // serialisation is a caught engine bug, not a value to compare.
        let canonical_payload = match canonicalize(&record.payload) {
            Ok(text) => text,
            Err(err) => {
                defects.push(note(
                    label,
                    Finding {
                        category: DivergenceCategory::Invariant,
                        index,
                        record: Some(&record),
                        field: "payload",
                        expected: "<a serialisable value>".to_owned(),
                        actual: line_head(line),
                        detail: format!("record {index} payload cannot be canonicalised ({err})"),
                    },
                ));
                records.push(None);
                continue;
            }
        };

        if let Some(leaked) = raw_id_in(&format!("{} {canonical_payload}", record.kind)) {
            // Fatal even when both streams carry it — see the module header. This is the
            // one class a pairwise diff is structurally unable to see.
            defects.push(note(
                label,
                Finding {
                    category: DivergenceCategory::Invariant,
                    index,
                    record: Some(&record),
                    field: "payload",
                    expected: "<a normalised id placeholder>".to_owned(),
                    actual: leaked.clone(),
                    detail: format!(
                        "record {index} carries the un-normalised id \"{leaked}\" — the golden \
                         holds raw Math.random() output and the next capture will differ for no \
                         engine reason (P-143)"
                    ),
                },
            ));
        }

        records.push(Some(record));
    }

    if records.is_empty() {
        defects.push(note(
            label,
            Finding {
                category: DivergenceCategory::Invariant,
                index: 0,
                record: None,
                field: STREAM_FIELD,
                expected: ">= 1 record".to_owned(),
                actual: "0 records".to_owned(),
                detail: "golden carries no records — every comparison against it would pass \
                         vacuously (P-097 class)"
                    .to_owned(),
            },
        ));
    }

    let mut previous: Option<&GoldenRecord> = None;
    for (index, slot) in records.iter().enumerate() {
        let Some(record) = slot.as_ref() else {
            continue;
        };
        let position = u64::try_from(index).unwrap_or(u64::MAX);
        if record.seq != position {
            defects.push(note(
                label,
                Finding {
                    category: DivergenceCategory::Invariant,
                    index,
                    record: Some(record),
                    field: "seq",
                    expected: position.to_string(),
                    actual: record.seq.to_string(),
                    detail: format!(
                        "record {index} carries seq {} — the stream sequence must be gap-free, \
                         duplicate-free and in emission order",
                        record.seq
                    ),
                },
            ));
        }
        if let Some(prev) = previous {
            if record.tick_index < prev.tick_index {
                defects.push(note(
                    label,
                    Finding {
                        category: DivergenceCategory::Invariant,
                        index,
                        record: Some(record),
                        field: "tickIndex",
                        expected: format!(">= {}", prev.tick_index),
                        actual: record.tick_index.to_string(),
                        detail: format!(
                            "record {index} tickIndex went backwards ({} then {}) — replay \
                             applies ticks in recorded order",
                            prev.tick_index, record.tick_index
                        ),
                    },
                ));
            }
            if record.ts < prev.ts {
                defects.push(note(
                    label,
                    Finding {
                        category: DivergenceCategory::Invariant,
                        index,
                        record: Some(record),
                        field: "ts",
                        expected: format!(">= {}", js_number_to_string(prev.ts)),
                        actual: js_number_to_string(record.ts),
                        detail: format!(
                            "record {index} ts went backwards ({} then {}) — the virtual clock \
                             only moves forward",
                            js_number_to_string(prev.ts),
                            js_number_to_string(record.ts)
                        ),
                    },
                ));
            }
        }
        previous = Some(record);
    }

    LoadedGolden {
        label: label.to_owned(),
        records,
        defects,
    }
}
