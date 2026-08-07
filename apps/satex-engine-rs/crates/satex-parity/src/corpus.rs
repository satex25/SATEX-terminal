//! Corpus tape custody: reader, SHA-256 index, and the CI tape synthesizer.
//!
//! RS-UP-1 / RS-1.4, port of `apps/satex-terminal/scripts/oracle/corpus.ts`. A corpus
//! tape is one JSONL file: a header object on line 1 describing the recording, then one
//! object per tick row. The format is what `rs12-corpus-export.py` emitted during the
//! P-143 rescue, and the files it produced are **read-only artifacts** — §5.2 makes a
//! changed SHA-256 an incident rather than a merge conflict. Nothing in this module
//! writes to a recorded tape, and [`CorpusIndex::verify_dir`] is that rule in executable
//! form.
//!
//! ## Why the reader distrusts its own header
//!
//! Every consistency claim the header makes about the rows below it is checked on load:
//! the row count, both timestamp bounds, the ordering, the distinct-symbol count, and
//! the finiteness of every price. The failure the checks exist for is not hypothetical —
//! the P-143 prune deleted 49 of 50 tapes and left manifests behind claiming 13.06 M
//! ticks where 35,658 survived. A reader that trusted the header would have produced a
//! confident-looking golden from a fraction of the intended input.
//!
//! The checks run in the TypeScript reader's order, and the order is load-bearing: an
//! empty tape whose header claims rows is reported as a count mismatch (the P-143 shape),
//! not as "no rows".
//!
//! ## Why [`synthesize_tape`] exists
//!
//! The rescued corpus lives under a gitignored path, so CI cannot see it, but the
//! double-run determinism proof has to run on every push — it is the plan's designated
//! early-warning tripwire (R3). The synthesizer builds a tape from integer arithmetic
//! alone: no RNG, no clock, no floating-point accumulation. The same arguments produce
//! the same bytes on every machine, so CI proves the *mechanism* even when the recorded
//! corpus is absent, and the operator's regeneration run proves it again over the real
//! thing.
//!
//! ## Port notes (RS-L1: behaviour, quirks included)
//!
//! - **Numbers stay `f64`.** `corpus.ts` never asserts that a timestamp or a count is
//!   integral, so Appendix B.1's narrowing licence — which applies "where TS semantics
//!   are integral in practice", as `record.rs` argues for `seq` — does not apply here.
//!   The header's claims are compared with `!==` against row values, and that comparison
//!   is reproduced exactly.
//! - **Header claims are [`Option`], not required fields.** In TypeScript the header is
//!   `JSON.parse(...) as CorpusTapeHeader` — a compile-time claim with no runtime check —
//!   so an absent `tickCount` reaches the count comparison as `undefined` and fails
//!   *there*, with that message. Parsing the header can therefore never fail, and every
//!   rejection comes from the documented check sequence.
//! - **Blank lines are dropped anywhere**, not merely at the end: the TypeScript reader
//!   filters every zero-length line before it looks at any of them. `mutate.ts` names
//!   this tolerance ("the same tolerance `readCorpusTape` already applies").
//! - **One deliberate message divergence.** The TypeScript row loop calls `JSON.parse`
//!   *outside* the `fail()` helper, so a malformed row line escapes as a bare
//!   `SyntaxError` without the `corpus tape <file>:` prefix. Here it is a
//!   [`CorpusError`] like every other rejection. Same verdict, better evidence; no test
//!   in `corpus.test.ts` pins that message.

use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

use crate::value::{JsonObject, JsonValue, canonicalize, js_number_to_string, parse_json, show};

/// Schema tag written by the RS-1.2 exporter. Bump = new reader.
pub const CORPUS_TAPE_SCHEMA: &str = "satex.corpus.tape/1";

/// Schema tag of `corpus-index.json`, the digest manifest beside the tapes.
pub const CORPUS_INDEX_SCHEMA: &str = "satex.corpus.index/1";

/// Which artifact an error is about — the two read paths phrase their failures alike.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CorpusSubject {
    /// A `.jsonl` tape.
    Tape,
    /// A `corpus-index.json` digest manifest.
    Index,
}

impl CorpusSubject {
    /// The noun used in an error message.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tape => "corpus tape",
            Self::Index => "corpus index",
        }
    }
}

/// Why a corpus artifact could not be read.
///
/// A corpus problem is a report, not a crash: an inconsistent tape is an incident to
/// investigate, and a golden captured from a silently-repaired tape would be evidence for
/// a run that never happened. So nothing here panics and nothing here repairs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CorpusError {
    /// Whether the failure is about a tape or the index.
    pub subject: CorpusSubject,
    /// The file the failure is about, as the caller named it.
    pub file: String,
    /// What was inconsistent, in one sentence.
    pub detail: String,
}

impl fmt::Display for CorpusError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Matches `fail()` in corpus.ts: "corpus tape <file>: <detail>".
        write!(
            f,
            "{} {}: {}",
            self.subject.as_str(),
            self.file,
            self.detail
        )
    }
}

impl std::error::Error for CorpusError {}

impl CorpusError {
    fn tape(file: &str, detail: impl Into<String>) -> Self {
        Self {
            subject: CorpusSubject::Tape,
            file: file.to_owned(),
            detail: detail.into(),
        }
    }

    fn index(file: &str, detail: impl Into<String>) -> Self {
        Self {
            subject: CorpusSubject::Index,
            file: file.to_owned(),
            detail: detail.into(),
        }
    }
}

/// Session metadata carried in the tape header.
///
/// The reader never inspects this — `importer.ts` does, when it replays a tape into a
/// database. Every field is [`Option`] for the same reason the header's claims are: the
/// TypeScript declaration is a compile-time assertion, and a tape whose `sessionRow` is
/// missing or malformed is one the TypeScript reader accepts.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct CorpusSessionRow {
    /// Session start, UTC ms.
    pub started_at: Option<f64>,
    /// Session end, UTC ms. Declared `number | null` — an open session has none.
    pub ended_at: Option<f64>,
    /// Equity at session start.
    pub starting_equity: Option<f64>,
    /// Equity at session end. Declared `number | null`.
    pub ending_equity: Option<f64>,
    /// Realised P&L over the session.
    pub realized_pnl: Option<f64>,
    /// Trades closed during the session.
    pub trade_count: Option<f64>,
}

/// The live-tape manifest sealed when the tape was recorded, when the exporter found one.
///
/// This is the artifact P-143 proved cannot be trusted on its own: manifests survived the
/// prune that ate the rows they described.
#[derive(Debug, Clone, PartialEq)]
pub struct LiveTapeManifest {
    /// Digest the engine sealed over the live tick stream.
    pub manifest_hash: String,
    /// Ticks the manifest claims. Compare against the rows, never trust alone.
    pub tick_count: Option<f64>,
    /// First timestamp the manifest claims.
    pub first_ts: Option<f64>,
    /// Last timestamp the manifest claims.
    pub last_ts: Option<f64>,
    /// When the manifest was sealed, UTC ms.
    pub sealed_at: Option<f64>,
}

/// Line 1 of a corpus tape.
#[derive(Debug, Clone, PartialEq)]
pub struct CorpusTapeHeader {
    /// Schema tag. Checked against [`CORPUS_TAPE_SCHEMA`] before anything else is read.
    pub schema: String,
    /// Session the tape was recorded from.
    pub session_id: String,
    /// `live-tick-tape` for a recording, `synthetic-tick-tape` from [`synthesize_tape`].
    pub kind: String,
    /// Rows the header claims. Checked against the rows that follow.
    pub tick_count: Option<f64>,
    /// Distinct symbols the header claims. Checked only when it is a number.
    pub symbol_count: Option<f64>,
    /// First timestamp the header claims.
    pub first_ts: Option<f64>,
    /// Last timestamp the header claims.
    pub last_ts: Option<f64>,
    /// Session metadata, when the header carries a `sessionRow` object.
    pub session_row: Option<CorpusSessionRow>,
    /// Manifest sealed when the tape was recorded, when the exporter found one.
    pub live_tape_manifest: Option<LiveTapeManifest>,
    /// The header object exactly as parsed.
    ///
    /// The exporter writes more than this struct names — `tool`, `exportedAt`,
    /// `sourceDb`, `rowOrder`, `perSymbol`, … — and in TypeScript those keys are still
    /// on the object at runtime because the cast erases nothing. Keeping them means a
    /// consumer that needs one is not blocked on a reader change, and it is what
    /// [`CorpusTape::to_jsonl`] re-emits.
    pub raw: JsonObject,
}

/// One tick row. Mirrors the `ticks` table minus `session_id`.
#[derive(Debug, Clone, PartialEq)]
pub struct CorpusTickRow {
    /// Tick timestamp, UTC ms. Non-decreasing across the tape.
    pub ts: f64,
    /// Instrument symbol. Must be non-empty.
    pub symbol: String,
    /// Last traded price.
    pub last: f64,
    /// Best bid.
    pub bid: f64,
    /// Best ask.
    pub ask: f64,
    /// Trade volume.
    pub volume: f64,
    /// Volume-weighted average price.
    pub vwap: f64,
}

/// A validated corpus tape.
#[derive(Debug, Clone, PartialEq)]
pub struct CorpusTape {
    /// Line 1, already checked against the rows.
    pub header: CorpusTapeHeader,
    /// Every tick row, in file order.
    pub rows: Vec<CorpusTickRow>,
}

/// Hex SHA-256 of `bytes` — the corpus index's integrity value.
#[must_use]
pub fn sha256_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        // `{:02x}` per byte is the same lowercase hex `createHash(...).digest('hex')` gives.
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

/// Hex SHA-256 of a file's bytes.
///
/// Port of `sha256File`. Digests the **bytes**, never a decoded string: a tape that is
/// not valid UTF-8 still has a custody digest, and §5.2 is about the bytes on disk.
///
/// # Errors
/// Returns [`CorpusError`] when the file cannot be read.
pub fn sha256_file(file: &Path) -> Result<String, CorpusError> {
    match fs::read(file) {
        Ok(bytes) => Ok(sha256_bytes(&bytes)),
        Err(err) => Err(CorpusError::tape(
            &file.display().to_string(),
            format!("cannot be read ({err})"),
        )),
    }
}

/// JavaScript `String(value)`, with `?? ''` folded in for absent and `null`.
///
/// The TypeScript reader coerces `symbol` this way rather than requiring a string, so a
/// row carrying `{"symbol": 123}` imports as `"123"` instead of being rejected. Porting
/// the coercion rather than the intention is RS-L1; the array case recurses because
/// `Array.prototype.join` calls `String` on each element and renders `null` as empty.
fn js_string(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(JsonValue::Bool(true)) => "true".to_owned(),
        Some(JsonValue::Bool(false)) => "false".to_owned(),
        Some(JsonValue::Number(n)) => js_number_to_string(*n),
        Some(JsonValue::String(s)) => s.clone(),
        Some(JsonValue::Array(items)) => items
            .iter()
            .map(|item| js_string(Some(item)))
            .collect::<Vec<_>>()
            .join(","),
        Some(JsonValue::Object(_)) => "[object Object]".to_owned(),
    }
}

/// How a rejected value is spelled in an error message.
///
/// `JSON.stringify` on the TypeScript side, with one improvement: it renders `Infinity`
/// and `NaN` as `null`, which is actively misleading in a message whose whole subject is
/// that the value is not finite. `1e999` really can reach here — it parses to `Infinity`
/// under JS semantics (see `value.rs`), which is the only way a JSON tape can carry one.
fn describe(value: Option<&JsonValue>) -> String {
    match value {
        None => "undefined".to_owned(),
        Some(JsonValue::Number(n)) if !n.is_finite() => js_number_to_string(*n),
        Some(v) => show(v),
    }
}

/// The object at `value`, or an empty one.
///
/// A row line that is not an object is not special-cased, because in JavaScript it is not
/// special either: `(5)["ts"]` is `undefined`, so the row fails on its first missing
/// field with that message. (`null` is the one shape TypeScript fails differently — a
/// `TypeError` rather than a `fail()` — and it still fails.)
fn as_object(value: &JsonValue) -> JsonObject {
    match value {
        JsonValue::Object(obj) => obj.clone(),
        _ => JsonObject::new(),
    }
}

fn opt_num(obj: &JsonObject, key: &str) -> Option<f64> {
    match obj.get(key) {
        Some(JsonValue::Number(n)) => Some(*n),
        _ => None,
    }
}

fn opt_object<'a>(obj: &'a JsonObject, key: &str) -> Option<&'a JsonObject> {
    match obj.get(key) {
        Some(JsonValue::Object(inner)) => Some(inner),
        _ => None,
    }
}

impl CorpusSessionRow {
    fn from_object(obj: &JsonObject) -> Self {
        Self {
            started_at: opt_num(obj, "startedAt"),
            ended_at: opt_num(obj, "endedAt"),
            starting_equity: opt_num(obj, "startingEquity"),
            ending_equity: opt_num(obj, "endingEquity"),
            realized_pnl: opt_num(obj, "realizedPnl"),
            trade_count: opt_num(obj, "tradeCount"),
        }
    }
}

impl LiveTapeManifest {
    fn from_object(obj: &JsonObject) -> Self {
        Self {
            manifest_hash: js_string(obj.get("manifestHash")),
            tick_count: opt_num(obj, "tickCount"),
            first_ts: opt_num(obj, "firstTs"),
            last_ts: opt_num(obj, "lastTs"),
            sealed_at: opt_num(obj, "sealedAt"),
        }
    }
}

impl CorpusTapeHeader {
    /// Reads a header out of a parsed JSON value.
    ///
    /// Never fails: see the module note on why every claim is an [`Option`]. The schema
    /// tag is checked by [`parse_corpus_tape`], not here, so that a caller inspecting a
    /// foreign tape can still see what it claims to be.
    #[must_use]
    pub fn from_value(value: &JsonValue) -> Self {
        let raw = as_object(value);
        Self {
            schema: js_string(raw.get("schema")),
            session_id: js_string(raw.get("sessionId")),
            kind: js_string(raw.get("kind")),
            tick_count: opt_num(&raw, "tickCount"),
            symbol_count: opt_num(&raw, "symbolCount"),
            first_ts: opt_num(&raw, "firstTs"),
            last_ts: opt_num(&raw, "lastTs"),
            session_row: opt_object(&raw, "sessionRow").map(CorpusSessionRow::from_object),
            live_tape_manifest: opt_object(&raw, "liveTapeManifest")
                .map(LiveTapeManifest::from_object),
            raw,
        }
    }
}

/// Spelling of a header claim in a mismatch message: the number, or `undefined`.
fn claim(value: Option<f64>) -> String {
    match value {
        Some(n) => js_number_to_string(n),
        None => "undefined".to_owned(),
    }
}

/// Reads and validates a corpus tape from text.
///
/// `file` names the artifact in error messages; it never touches the filesystem, so a
/// test can exercise every rejection without a fixture on disk.
///
/// Fails on the first inconsistency rather than repairing anything — see [`CorpusError`].
///
/// # Errors
/// Returns [`CorpusError`] when the text is not a tape, or when the header's claims
/// disagree with the rows beneath it.
pub fn parse_corpus_tape(text: &str, file: &str) -> Result<CorpusTape, CorpusError> {
    // Blank lines are dropped wherever they occur — the tolerance `mutate.ts` names.
    let lines: Vec<&str> = text.split('\n').filter(|l| !l.is_empty()).collect();
    let Some(header_line) = lines.first() else {
        return Err(CorpusError::tape(file, "file is empty"));
    };

    let header = match parse_json(header_line) {
        Ok(value) => CorpusTapeHeader::from_value(&value),
        Err(err) => {
            return Err(CorpusError::tape(
                file,
                format!("header line is not JSON ({err})"),
            ));
        }
    };
    if header.schema != CORPUS_TAPE_SCHEMA {
        return Err(CorpusError::tape(
            file,
            format!(
                "unknown schema \"{}\" (this reader understands {CORPUS_TAPE_SCHEMA})",
                header.schema
            ),
        ));
    }

    let mut rows: Vec<CorpusTickRow> = Vec::with_capacity(lines.len().saturating_sub(1));
    for (i, line) in lines.iter().enumerate().skip(1) {
        let value = match parse_json(line) {
            Ok(v) => v,
            // TypeScript lets this escape as a bare SyntaxError; module note explains.
            Err(err) => {
                return Err(CorpusError::tape(
                    file,
                    format!("row {i} is not JSON ({err})"),
                ));
            }
        };
        let raw = as_object(&value);
        let num = |field: &str| -> Result<f64, CorpusError> {
            match raw.get(field) {
                Some(JsonValue::Number(n)) if n.is_finite() => Ok(*n),
                other => Err(CorpusError::tape(
                    file,
                    format!(
                        "row {i} field \"{field}\" is not a finite number (got {})",
                        describe(other)
                    ),
                )),
            }
        };
        let row = CorpusTickRow {
            ts: num("ts")?,
            symbol: js_string(raw.get("symbol")),
            last: num("last")?,
            bid: num("bid")?,
            ask: num("ask")?,
            volume: num("volume")?,
            vwap: num("vwap")?,
        };
        if row.symbol.is_empty() {
            return Err(CorpusError::tape(file, format!("row {i} has no symbol")));
        }
        rows.push(row);
    }

    // The header's own claims, checked against the bytes that follow it. The order is
    // the TypeScript order and is load-bearing — see the module header.
    let count = rows.len();
    #[allow(clippy::cast_precision_loss)]
    let count_f64 = count as f64;
    if header.tick_count != Some(count_f64) {
        return Err(CorpusError::tape(
            file,
            format!(
                "header tickCount {} but file carries {count} rows — tape is truncated or the header is stale",
                claim(header.tick_count)
            ),
        ));
    }
    let (Some(first), Some(last)) = (rows.first(), rows.last()) else {
        return Err(CorpusError::tape(file, "tape carries no tick rows"));
    };
    if header.first_ts != Some(first.ts) {
        return Err(CorpusError::tape(
            file,
            format!(
                "header firstTs {} but first row is {}",
                claim(header.first_ts),
                js_number_to_string(first.ts)
            ),
        ));
    }
    if header.last_ts != Some(last.ts) {
        return Err(CorpusError::tape(
            file,
            format!(
                "header lastTs {} but last row is {}",
                claim(header.last_ts),
                js_number_to_string(last.ts)
            ),
        ));
    }
    for (i, pair) in rows.windows(2).enumerate() {
        let (Some(prev), Some(next)) = (pair.first(), pair.get(1)) else {
            continue;
        };
        if next.ts < prev.ts {
            return Err(CorpusError::tape(
                file,
                format!(
                    "rows are out of order at row {} ({} then {}) — the exporter guarantees ts ASC",
                    i + 1,
                    js_number_to_string(prev.ts),
                    js_number_to_string(next.ts)
                ),
            ));
        }
    }
    if let Some(claimed) = header.symbol_count {
        // Guarded exactly as `typeof header.symbolCount === 'number'` guards it: a header
        // that omits the count skips the check rather than failing it.
        let mut distinct: Vec<&str> = rows.iter().map(|r| r.symbol.as_str()).collect();
        distinct.sort_unstable();
        distinct.dedup();
        #[allow(clippy::cast_precision_loss)]
        let found = distinct.len() as f64;
        if claimed != found {
            return Err(CorpusError::tape(
                file,
                format!(
                    "header symbolCount {} but rows carry {} distinct symbols",
                    js_number_to_string(claimed),
                    distinct.len()
                ),
            ));
        }
    }

    Ok(CorpusTape { header, rows })
}

/// Reads and validates a corpus tape from disk.
///
/// # Errors
/// Returns [`CorpusError`] when the file cannot be read, is not valid UTF-8, or fails any
/// check in [`parse_corpus_tape`].
pub fn read_corpus_tape(file: &Path) -> Result<CorpusTape, CorpusError> {
    let name = file.display().to_string();
    // `fs::read_to_string` refuses invalid UTF-8 where Node's 'utf8' decode substitutes
    // U+FFFD. A tape that needs substitution is corrupt, and §5.2 says so out loud.
    match fs::read_to_string(file) {
        Ok(text) => parse_corpus_tape(&text, &name),
        Err(err) => Err(CorpusError::tape(&name, format!("cannot be read ({err})"))),
    }
}

/// One row of `corpus-index.json`.
#[derive(Debug, Clone, PartialEq)]
pub struct CorpusIndexEntry {
    /// File name, relative to the index's own directory.
    pub name: String,
    /// Hex SHA-256 the export recorded. A different digest on disk is an incident.
    pub sha256: String,
    /// Byte length the export recorded.
    pub bytes: Option<f64>,
    /// Line count the export recorded.
    pub lines: Option<f64>,
}

/// `corpus-index.json` — the digest manifest that makes §5.2 checkable.
#[derive(Debug, Clone, PartialEq)]
pub struct CorpusIndex {
    /// Schema tag, checked against [`CORPUS_INDEX_SCHEMA`].
    pub schema: String,
    /// Every file the export sealed.
    pub files: Vec<CorpusIndexEntry>,
}

/// Parses a corpus index from text.
///
/// # Errors
/// Returns [`CorpusError`] when the text is not JSON, carries an unknown schema, or has
/// no `files` array.
pub fn parse_corpus_index(text: &str, file: &str) -> Result<CorpusIndex, CorpusError> {
    let value = match parse_json(text) {
        Ok(v) => v,
        Err(err) => return Err(CorpusError::index(file, format!("is not JSON ({err})"))),
    };
    let obj = as_object(&value);
    let schema = js_string(obj.get("schema"));
    if schema != CORPUS_INDEX_SCHEMA {
        return Err(CorpusError::index(
            file,
            format!("unknown schema \"{schema}\" (this reader understands {CORPUS_INDEX_SCHEMA})"),
        ));
    }
    let Some(JsonValue::Array(items)) = obj.get("files") else {
        return Err(CorpusError::index(file, "has no files[] array"));
    };
    let mut files = Vec::with_capacity(items.len());
    for (i, item) in items.iter().enumerate() {
        let entry = as_object(item);
        let name = js_string(entry.get("name"));
        if name.is_empty() {
            return Err(CorpusError::index(file, format!("files[{i}] has no name")));
        }
        let sha256 = js_string(entry.get("sha256"));
        if sha256.is_empty() {
            return Err(CorpusError::index(
                file,
                format!("files[{i}] (\"{name}\") has no sha256 — the custody value is the point"),
            ));
        }
        files.push(CorpusIndexEntry {
            name,
            sha256,
            bytes: opt_num(&entry, "bytes"),
            lines: opt_num(&entry, "lines"),
        });
    }
    Ok(CorpusIndex { schema, files })
}

/// Reads a corpus index from disk.
///
/// # Errors
/// Returns [`CorpusError`] when the file cannot be read or fails [`parse_corpus_index`].
pub fn read_corpus_index(file: &Path) -> Result<CorpusIndex, CorpusError> {
    let name = file.display().to_string();
    match fs::read_to_string(file) {
        Ok(text) => parse_corpus_index(&text, &name),
        Err(err) => Err(CorpusError::index(&name, format!("cannot be read ({err})"))),
    }
}

impl CorpusIndex {
    /// Verifies one recorded file against its digest.
    ///
    /// # Errors
    /// Returns [`CorpusError`] when the index does not list `name`, the file is missing,
    /// or its bytes hash to something other than the digest the export sealed.
    pub fn verify_file(&self, dir: &Path, name: &str) -> Result<(), CorpusError> {
        let index_name = dir.join("corpus-index.json").display().to_string();
        let Some(entry) = self.files.iter().find(|f| f.name == name) else {
            return Err(CorpusError::index(
                &index_name,
                format!("does not list \"{name}\""),
            ));
        };
        let path = dir.join(&entry.name);
        let actual = sha256_file(&path)?;
        if actual != entry.sha256 {
            return Err(CorpusError::index(
                &index_name,
                format!(
                    "\"{}\" hashes to {} but the index recorded {} — §5.2: a changed SHA-256 is an incident, not a merge conflict",
                    entry.name, actual, entry.sha256
                ),
            ));
        }
        Ok(())
    }

    /// Verifies every file the index lists, in index order.
    ///
    /// This is the read-only-artifact rule in executable form, and the Rust twin of the
    /// `verifies every corpus file against the SHA-256 the index recorded` case in
    /// `capture.determinism.test.ts`.
    ///
    /// # Errors
    /// Returns [`CorpusError`] for the first file that is missing or has drifted.
    pub fn verify_dir(&self, dir: &Path) -> Result<(), CorpusError> {
        for entry in &self.files {
            self.verify_file(dir, &entry.name)?;
        }
        Ok(())
    }

    /// The first `tape-*` file the index lists — how a caller finds the recorded tape.
    #[must_use]
    pub fn first_tape(&self) -> Option<&CorpusIndexEntry> {
        self.files.iter().find(|f| f.name.starts_with("tape-"))
    }
}

/// Arguments for a synthesized tape. All integers — see the module header.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SynthesizeOptions {
    /// Session id written into the header.
    pub session_id: String,
    /// Symbols to emit. Must exist in `UNIVERSE` or `ReplaySource` drops them.
    pub symbols: Vec<String>,
    /// Rows per symbol. Total rows = `symbols.len()` × `ticks_per_symbol`.
    ///
    /// Unsigned where TypeScript takes a `number`: the guard there is
    /// `ticksPerSymbol <= 0`, which for a count collapses to "must not be zero", and a
    /// fractional count is unrepresentable rather than silently truncated by the loop.
    pub ticks_per_symbol: u32,
    /// Timestamp of the first row.
    pub start_ts: i64,
    /// Milliseconds between consecutive timestamps.
    pub step_ms: i64,
}

/// Integer price path, in cents, for one symbol at one step.
///
/// A small deterministic zig-zag: prices have to *move* or the indicators the engine
/// computes stay flat and the decision stream says nothing interesting, but the movement
/// must not come from a random source. Everything here is integer arithmetic; the single
/// division by 100 at the call site is the only floating-point operation, and it is exact
/// for these magnitudes on every IEEE-754 platform.
fn price_cents(symbol_index: i64, step: i64) -> i64 {
    let base = 10_000 + symbol_index * 2_500;
    // Two out-of-phase saw waves with coprime periods (17, 29) give a path that trends,
    // reverses, and never repeats over a short tape. Both operands are non-negative, so
    // Rust's truncating `%` and JavaScript's `%` agree.
    let slow = ((step * 7 + symbol_index * 13) % 29) - 14;
    let fast = ((step * 11 + symbol_index * 5) % 17) - 8;
    base + slow * 6 + fast * 2
}

/// Cents to a price, the one division in the synthesizer.
#[allow(clippy::cast_precision_loss)]
fn cents_to_price(cents: i64) -> f64 {
    cents as f64 / 100.0
}

/// Builds a deterministic tape.
///
/// Rows are emitted grouped by timestamp with symbols in the given order, which is the
/// shape `readTapeRange` returns them in (`ORDER BY ts ASC`) and the shape the real
/// exporter recorded (`ts ASC, symbol ASC`).
///
/// # Errors
/// Returns [`CorpusError`] when no symbol is given or `ticks_per_symbol` is zero.
pub fn synthesize_tape(opts: &SynthesizeOptions) -> Result<CorpusTape, CorpusError> {
    let file = "<synthesized>";
    if opts.symbols.is_empty() {
        return Err(CorpusError::tape(
            file,
            "synthesizeTape: at least one symbol required",
        ));
    }
    if opts.ticks_per_symbol == 0 {
        return Err(CorpusError::tape(
            file,
            "synthesizeTape: ticksPerSymbol must be positive",
        ));
    }

    let ticks = i64::from(opts.ticks_per_symbol);
    let mut rows: Vec<CorpusTickRow> = Vec::new();
    for step in 0..ticks {
        let ts = opts.start_ts + step * opts.step_ms;
        for (s, symbol) in opts.symbols.iter().enumerate() {
            let index = i64::try_from(s).unwrap_or(i64::MAX);
            let cents = price_cents(index, step);
            rows.push(CorpusTickRow {
                #[allow(clippy::cast_precision_loss)]
                ts: ts as f64,
                symbol: symbol.clone(),
                last: cents_to_price(cents),
                bid: cents_to_price(cents - 2),
                ask: cents_to_price(cents + 2),
                // Volume walks with the step so the tape is not constant anywhere.
                #[allow(clippy::cast_precision_loss)]
                volume: (100 + ((step * 37 + index * 11) % 400)) as f64,
                vwap: cents_to_price(cents + ((step % 3) - 1)),
            });
        }
    }

    let last_ts = opts.start_ts + (ticks - 1) * opts.step_ms;
    #[allow(clippy::cast_precision_loss)]
    let header_obj = {
        let mut session_row = JsonObject::new();
        session_row.insert(
            "startedAt".to_owned(),
            JsonValue::Number((opts.start_ts - 1_000) as f64),
        );
        session_row.insert(
            "endedAt".to_owned(),
            JsonValue::Number((last_ts + 1_000) as f64),
        );
        session_row.insert("startingEquity".to_owned(), JsonValue::Number(100_000.0));
        session_row.insert("endingEquity".to_owned(), JsonValue::Number(100_000.0));
        session_row.insert("realizedPnl".to_owned(), JsonValue::Number(0.0));
        session_row.insert("tradeCount".to_owned(), JsonValue::Number(0.0));

        let mut obj = JsonObject::new();
        obj.insert(
            "schema".to_owned(),
            JsonValue::String(CORPUS_TAPE_SCHEMA.to_owned()),
        );
        obj.insert(
            "sessionId".to_owned(),
            JsonValue::String(opts.session_id.clone()),
        );
        obj.insert(
            "kind".to_owned(),
            JsonValue::String("synthetic-tick-tape".to_owned()),
        );
        obj.insert("tickCount".to_owned(), JsonValue::Number(rows.len() as f64));
        obj.insert(
            "symbolCount".to_owned(),
            JsonValue::Number(opts.symbols.len() as f64),
        );
        obj.insert(
            "firstTs".to_owned(),
            JsonValue::Number(opts.start_ts as f64),
        );
        obj.insert("lastTs".to_owned(), JsonValue::Number(last_ts as f64));
        obj.insert("sessionRow".to_owned(), JsonValue::Object(session_row));
        obj
    };

    // The typed view is derived from the object rather than written twice: one source of
    // truth means `header.raw` and `header.tick_count` cannot drift apart, and the
    // synthesizer exercises the same header reader a recorded tape goes through.
    Ok(CorpusTape {
        header: CorpusTapeHeader::from_value(&JsonValue::Object(header_obj)),
        rows,
    })
}

impl CorpusTape {
    /// Renders the tape as JSONL: the header object, then one object per row.
    ///
    /// The synthesizer's writer, and the reason a round-trip test can exist. It is **not**
    /// a re-emitter for recorded tapes: keys come back in canonical (sorted) order and
    /// numbers in JS shortest-round-trip spelling, so the bytes will not match what
    /// `rs12-corpus-export.py` wrote even though the values do. Writing this over a
    /// recorded artifact would change its SHA-256, which §5.2 calls an incident.
    ///
    /// # Errors
    /// Returns [`CorpusError`] when a value refuses to serialise — the only cause is a
    /// non-finite number, which [`parse_corpus_tape`] already refuses to produce.
    pub fn to_jsonl(&self) -> Result<String, CorpusError> {
        let file = "<in-memory>";
        let mut out = String::new();
        let header = JsonValue::Object(self.header.raw.clone());
        match canonicalize(&header) {
            Ok(text) => out.push_str(&text),
            Err(err) => return Err(CorpusError::tape(file, format!("header {err}"))),
        }
        out.push('\n');
        for (i, row) in self.rows.iter().enumerate() {
            let mut obj = JsonObject::new();
            obj.insert("ts".to_owned(), JsonValue::Number(row.ts));
            obj.insert("symbol".to_owned(), JsonValue::String(row.symbol.clone()));
            obj.insert("last".to_owned(), JsonValue::Number(row.last));
            obj.insert("bid".to_owned(), JsonValue::Number(row.bid));
            obj.insert("ask".to_owned(), JsonValue::Number(row.ask));
            obj.insert("volume".to_owned(), JsonValue::Number(row.volume));
            obj.insert("vwap".to_owned(), JsonValue::Number(row.vwap));
            match canonicalize(&JsonValue::Object(obj)) {
                Ok(text) => out.push_str(&text),
                Err(err) => {
                    return Err(CorpusError::tape(file, format!("row {} {err}", i + 1)));
                }
            }
            out.push('\n');
        }
        Ok(out)
    }
}

/// Absolute path of the recorded corpus directory, resolved from this crate's manifest.
///
/// `crates/satex-parity` → repo root is four levels up, the same walk
/// `capture.determinism.test.ts` does from `scripts/oracle`. The directory is gitignored
/// (ledger P-143), so this path exists on operator hardware and not in CI.
#[must_use]
pub fn recorded_corpus_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../../Vault/Backtests/corpus")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every case in `corpus.test.ts` is ported below, plus the quirks that file does not
    /// pin (JS `String()` coercion of `symbol`, blank-line tolerance, the `symbolCount`
    /// guard) and the two custody cases from `capture.determinism.test.ts`.
    fn num(x: f64) -> JsonValue {
        JsonValue::Number(x)
    }

    fn str_val(x: &str) -> JsonValue {
        JsonValue::String(x.to_owned())
    }

    fn object(pairs: Vec<(&str, JsonValue)>) -> JsonValue {
        let mut obj = JsonObject::new();
        for (k, v) in pairs {
            obj.insert(k.to_owned(), v);
        }
        JsonValue::Object(obj)
    }

    /// Replaces one field of an object literal — how the TypeScript tests mutate fixtures.
    fn with_field(value: &JsonValue, key: &str, field: JsonValue) -> JsonValue {
        let mut obj = as_object(value);
        obj.insert(key.to_owned(), field);
        JsonValue::Object(obj)
    }

    fn tick(ts: f64, symbol: &str, last: f64) -> JsonValue {
        object(vec![
            ("ts", num(ts)),
            ("symbol", str_val(symbol)),
            ("last", num(last)),
            ("bid", num(last - 0.1)),
            ("ask", num(last + 0.1)),
            ("volume", num(100.0)),
            ("vwap", num(last)),
        ])
    }

    fn good_tape() -> Vec<JsonValue> {
        vec![
            object(vec![
                ("schema", str_val(CORPUS_TAPE_SCHEMA)),
                ("sessionId", str_val("ses_test0000000001")),
                ("kind", str_val("live-tick-tape")),
                ("tickCount", num(2.0)),
                ("symbolCount", num(1.0)),
                ("firstTs", num(1000.0)),
                ("lastTs", num(2000.0)),
                (
                    "sessionRow",
                    object(vec![
                        ("startedAt", num(900.0)),
                        ("endedAt", num(2100.0)),
                        ("startingEquity", num(100_000.0)),
                        ("endingEquity", num(100_000.0)),
                        ("realizedPnl", num(0.0)),
                        ("tradeCount", num(0.0)),
                    ]),
                ),
            ]),
            tick(1000.0, "AAPL", 195.5),
            tick(2000.0, "AAPL", 195.7),
        ]
    }

    /// Renders fixture lines the way `writeTape` does: one JSON value per line, trailing
    /// newline included.
    fn text(lines: &[JsonValue]) -> String {
        let mut out = String::new();
        for line in lines {
            match canonicalize(line) {
                Ok(rendered) => out.push_str(&rendered),
                Err(err) => panic!("test fixture is unserialisable: {err}"),
            }
            out.push('\n');
        }
        out
    }

    fn read(lines: &[JsonValue]) -> Result<CorpusTape, CorpusError> {
        parse_corpus_tape(&text(lines), "tape.jsonl")
    }

    /// The rejection message, or a panic naming the tape that was wrongly accepted.
    fn rejection(lines: &[JsonValue]) -> String {
        match read(lines) {
            Ok(tape) => panic!("expected a rejection, read {} rows", tape.rows.len()),
            Err(err) => err.to_string(),
        }
    }

    fn synth(symbols: &[&str], ticks: u32, start_ts: i64, step_ms: i64) -> CorpusTape {
        let opts = SynthesizeOptions {
            session_id: "ses_synth00000001".to_owned(),
            symbols: symbols.iter().map(|s| (*s).to_owned()).collect(),
            ticks_per_symbol: ticks,
            start_ts,
            step_ms,
        };
        match synthesize_tape(&opts) {
            Ok(tape) => tape,
            Err(err) => panic!("synthesize_tape refused {symbols:?}: {err}"),
        }
    }

    #[test]
    fn reads_the_header_and_every_tick_row() {
        let tape = match read(&good_tape()) {
            Ok(t) => t,
            Err(err) => panic!("well-formed tape was rejected: {err}"),
        };
        assert_eq!(tape.header.session_id, "ses_test0000000001");
        assert_eq!(tape.rows.len(), 2);
        assert_eq!(tape.rows[0].ts, 1000.0);
        assert_eq!(tape.rows[0].symbol, "AAPL");
        assert_eq!(tape.rows[0].last, 195.5);
        // The unvalidated half of the header still comes through for `importer.ts`.
        match tape.header.session_row {
            Some(row) => assert_eq!(row.starting_equity, Some(100_000.0)),
            None => panic!("sessionRow was dropped"),
        }
    }

    #[test]
    fn rejects_a_tape_whose_schema_tag_is_not_the_one_this_reader_understands() {
        let mut lines = good_tape();
        lines[0] = with_field(&lines[0], "schema", str_val("satex.corpus.tape/2"));
        assert!(rejection(&lines).contains("schema"));
    }

    #[test]
    fn rejects_a_truncated_tape() {
        // The exact shape of the P-143 near-disaster: a prune ate rows out from under a
        // manifest that still claimed the original count.
        let lines = good_tape()[..2].to_vec();
        let message = rejection(&lines);
        assert!(
            message.contains("tickCount 2 but file carries 1 rows"),
            "{message}"
        );
    }

    #[test]
    fn rejects_a_tape_whose_bounds_disagree_with_its_rows() {
        let mut lines = good_tape();
        lines[0] = with_field(&lines[0], "lastTs", num(9999.0));
        assert!(rejection(&lines).contains("lastTs"));

        let mut lines = good_tape();
        lines[0] = with_field(&lines[0], "firstTs", num(1.0));
        assert!(rejection(&lines).contains("firstTs"));
    }

    #[test]
    fn rejects_rows_that_are_not_in_non_decreasing_timestamp_order() {
        // Three rows with the two interior ones swapped: the first and last timestamps
        // still match the header, so only the ordering rule can reject this tape.
        let mut lines = good_tape();
        lines[0] = with_field(&lines[0], "tickCount", num(4.0));
        lines.splice(
            2..2,
            [tick(1700.0, "AAPL", 195.6), tick(1500.0, "AAPL", 195.55)],
        );
        let message = rejection(&lines);
        assert!(message.contains("out of order at row 2"), "{message}");
    }

    #[test]
    fn rejects_a_row_carrying_a_non_finite_price_rather_than_importing_it() {
        let mut lines = good_tape();
        lines[1] = with_field(&lines[1], "last", JsonValue::Null);
        let message = rejection(&lines);
        assert!(
            message.contains("\"last\" is not a finite number (got null)"),
            "{message}"
        );

        // A missing field is `undefined`, exactly as the template string renders it.
        let mut lines = good_tape();
        let mut obj = as_object(&lines[1]);
        obj.insert("vwap".to_owned(), JsonValue::Null);
        lines[1] = JsonValue::Object(obj);
        assert!(rejection(&lines).contains("\"vwap\""));
    }

    #[test]
    fn an_overflowing_literal_reaches_the_reader_as_infinity() {
        // `1e999` is `Infinity` under JS `JSON.parse` semantics (value.rs), which is the
        // only way a JSON tape can carry a non-finite price. TypeScript spells it `null`
        // in the message because that is what `JSON.stringify(Infinity)` gives; the port
        // spells it `Infinity`, which is the thing the message is about.
        let header = match canonicalize(&good_tape()[0]) {
            Ok(t) => t,
            Err(err) => panic!("fixture header is unserialisable: {err}"),
        };
        let tape = format!(
            "{header}\n{{\"ts\":1000,\"symbol\":\"AAPL\",\"last\":1e999,\"bid\":1,\"ask\":1,\"volume\":1,\"vwap\":1}}\n"
        );
        match parse_corpus_tape(&tape, "tape.jsonl") {
            Ok(_) => panic!("a tape carrying Infinity was accepted"),
            Err(err) => assert!(err.to_string().contains("(got Infinity)"), "{err}"),
        }
    }

    #[test]
    fn rejects_a_row_with_no_symbol_and_coerces_one_that_is_not_a_string() {
        let mut lines = good_tape();
        lines[1] = with_field(&lines[1], "symbol", JsonValue::Null);
        assert!(rejection(&lines).contains("row 1 has no symbol"));

        // `String(raw['symbol'] ?? '')` imports a number as its JS text — RS-L1: the
        // coercion is the behaviour, whatever the declared type says.
        let mut lines = good_tape();
        lines[1] = with_field(&lines[1], "symbol", num(123.0));
        lines[2] = with_field(&lines[2], "symbol", num(123.0));
        match read(&lines) {
            Ok(tape) => assert_eq!(tape.rows[0].symbol, "123"),
            Err(err) => panic!("a numeric symbol should coerce, not fail: {err}"),
        }
    }

    #[test]
    fn blank_lines_are_dropped_wherever_they_occur() {
        // The tolerance `mutate.ts` names when it inserts a blank line between records.
        let base = text(&good_tape());
        let with_gap = base.replace("\n{\"ask\"", "\n\n{\"ask\"");
        assert_ne!(with_gap, base, "fixture rewrite did not take");
        match parse_corpus_tape(&with_gap, "tape.jsonl") {
            Ok(tape) => assert_eq!(tape.rows.len(), 2),
            Err(err) => panic!("blank lines should be tolerated: {err}"),
        }
    }

    #[test]
    fn rejects_an_empty_file_and_a_header_that_is_not_json() {
        match parse_corpus_tape("", "tape.jsonl") {
            Ok(_) => panic!("an empty file was accepted"),
            Err(err) => assert_eq!(err.to_string(), "corpus tape tape.jsonl: file is empty"),
        }
        match parse_corpus_tape("{oops\n", "tape.jsonl") {
            Ok(_) => panic!("a non-JSON header was accepted"),
            Err(err) => assert!(err.to_string().contains("header line is not JSON"), "{err}"),
        }
    }

    #[test]
    fn a_header_claim_that_is_absent_fails_where_it_is_compared() {
        // Not at parse time: the TypeScript header is an unchecked cast, so `undefined`
        // reaches the comparison and the message names the claim that was missing.
        let mut obj = as_object(&good_tape()[0]);
        let mut lines = good_tape();
        obj.insert("tickCount".to_owned(), JsonValue::Null);
        lines[0] = JsonValue::Object(obj);
        let message = rejection(&lines);
        assert!(
            message.contains("tickCount undefined but file carries 2 rows"),
            "{message}"
        );
    }

    #[test]
    fn the_symbol_count_check_is_guarded_but_the_others_are_not() {
        let mut lines = good_tape();
        lines[0] = with_field(&lines[0], "symbolCount", num(7.0));
        assert!(rejection(&lines).contains("symbolCount 7 but rows carry 1 distinct symbols"));

        // `typeof header.symbolCount === 'number'` — a header that omits it skips the
        // check rather than failing it, and that asymmetry is the ported behaviour.
        let mut header = as_object(&good_tape()[0]);
        header.insert("symbolCount".to_owned(), str_val("1"));
        let mut lines = good_tape();
        lines[0] = JsonValue::Object(header);
        match read(&lines) {
            Ok(tape) => assert_eq!(tape.rows.len(), 2),
            Err(err) => panic!("a non-numeric symbolCount should be skipped: {err}"),
        }
    }

    #[test]
    fn an_empty_tape_is_reported_as_a_count_mismatch_not_as_no_rows() {
        // Check order is load-bearing: the P-143 shape (header claims rows, file has
        // none) must read as the truncation it is.
        let lines = good_tape()[..1].to_vec();
        assert!(rejection(&lines).contains("tickCount 2 but file carries 0 rows"));

        // Only a header that claims zero reaches the "no tick rows" message.
        let mut lines = good_tape()[..1].to_vec();
        lines[0] = with_field(&lines[0], "tickCount", num(0.0));
        assert!(rejection(&lines).contains("tape carries no tick rows"));
    }

    #[test]
    fn sha256_is_stable_across_reads_and_changes_when_a_byte_changes() {
        let bytes = text(&good_tape()).into_bytes();
        let first = sha256_bytes(&bytes);
        assert_eq!(sha256_bytes(&bytes), first);
        let mut nudged = bytes.clone();
        nudged.push(b' ');
        assert_ne!(sha256_bytes(&nudged), first);
        // Pinned against the NIST vector so a wiring mistake cannot hide behind agreement
        // with itself.
        assert_eq!(
            sha256_bytes(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn synthesize_produces_the_requested_shape() {
        let tape = synth(&["AAPL", "MSFT"], 5, 10_000, 250);
        assert_eq!(tape.rows.len(), 10);
        assert_eq!(tape.header.tick_count, Some(10.0));
        assert_eq!(tape.header.symbol_count, Some(2.0));
        assert_eq!(tape.header.first_ts, Some(10_000.0));
        assert_eq!(tape.header.last_ts, Some(10_000.0 + 4.0 * 250.0));
        assert_eq!(tape.header.kind, "synthetic-tick-tape");
    }

    #[test]
    fn synthesize_emits_rows_in_non_decreasing_order_with_symbols_grouped() {
        let tape = synth(&["AAPL", "MSFT"], 3, 0, 100);
        let stamps: Vec<f64> = tape.rows.iter().map(|r| r.ts).collect();
        let mut sorted = stamps.clone();
        sorted.sort_by(f64::total_cmp);
        assert_eq!(stamps, sorted);
        assert_eq!(tape.rows[0].symbol, "AAPL");
        assert_eq!(tape.rows[1].symbol, "MSFT");
        assert_eq!(tape.rows[0].ts, tape.rows[1].ts);
    }

    #[test]
    fn synthesize_is_byte_identical_across_calls() {
        // The property CI depends on: integer arithmetic alone, so two builds of the same
        // arguments produce the same bytes on every machine.
        let a = synth(&["AAPL", "MSFT", "NVDA"], 40, 1_700_000_000_000, 250);
        let b = synth(&["AAPL", "MSFT", "NVDA"], 40, 1_700_000_000_000, 250);
        assert_eq!(a, b);
        match (a.to_jsonl(), b.to_jsonl()) {
            (Ok(left), Ok(right)) => {
                assert_eq!(left.as_bytes(), right.as_bytes());
                assert_eq!(
                    sha256_bytes(left.as_bytes()),
                    sha256_bytes(right.as_bytes())
                );
            }
            (left, right) => panic!("a synthesized tape refused to serialise: {left:?} {right:?}"),
        }
    }

    #[test]
    fn synthesize_produces_prices_that_actually_move() {
        let tape = synth(&["AAPL"], 50, 0, 250);
        let mut distinct: Vec<String> = tape
            .rows
            .iter()
            .map(|r| js_number_to_string(r.last))
            .collect();
        distinct.sort();
        distinct.dedup();
        assert!(distinct.len() > 5, "prices barely move: {distinct:?}");
        for row in &tape.rows {
            assert!(row.last.is_finite());
            assert!(row.bid <= row.ask);
        }
    }

    #[test]
    fn a_synthesized_tape_survives_its_own_reader() {
        let tape = synth(&["AAPL", "MSFT"], 8, 5_000, 250);
        let jsonl = match tape.to_jsonl() {
            Ok(text) => text,
            Err(err) => panic!("synthesized tape refused to serialise: {err}"),
        };
        match parse_corpus_tape(&jsonl, "synthetic.jsonl") {
            Ok(reread) => {
                assert_eq!(reread.rows, tape.rows);
                assert_eq!(reread.header.first_ts, tape.header.first_ts);
                assert_eq!(reread.header.last_ts, tape.header.last_ts);
            }
            Err(err) => panic!("synthesized tape failed its own reader: {err}"),
        }
    }

    #[test]
    fn synthesize_refuses_a_tape_it_could_not_make() {
        let empty = SynthesizeOptions {
            session_id: "ses_synth00000001".to_owned(),
            symbols: Vec::new(),
            ticks_per_symbol: 4,
            start_ts: 0,
            step_ms: 250,
        };
        match synthesize_tape(&empty) {
            Ok(_) => panic!("a symbol-less tape was synthesized"),
            Err(err) => assert!(
                err.to_string().contains("at least one symbol required"),
                "{err}"
            ),
        }
        let no_ticks = SynthesizeOptions {
            symbols: vec!["AAPL".to_owned()],
            ticks_per_symbol: 0,
            ..empty
        };
        match synthesize_tape(&no_ticks) {
            Ok(_) => panic!("a row-less tape was synthesized"),
            Err(err) => assert!(err.to_string().contains("must be positive"), "{err}"),
        }
    }

    #[test]
    fn the_index_reader_refuses_a_foreign_schema_and_a_missing_digest() {
        let good = format!(
            "{{\"schema\":\"{CORPUS_INDEX_SCHEMA}\",\"files\":[{{\"name\":\"t.jsonl\",\"sha256\":\"ab\",\"bytes\":3,\"lines\":1}}]}}"
        );
        match parse_corpus_index(&good, "corpus-index.json") {
            Ok(index) => {
                assert_eq!(index.files.len(), 1);
                assert_eq!(index.files[0].sha256, "ab");
                assert_eq!(index.files[0].bytes, Some(3.0));
            }
            Err(err) => panic!("a well-formed index was rejected: {err}"),
        }
        let foreign = good.replace(CORPUS_INDEX_SCHEMA, "satex.corpus.index/2");
        match parse_corpus_index(&foreign, "corpus-index.json") {
            Ok(_) => panic!("a foreign index schema was accepted"),
            Err(err) => assert!(err.to_string().contains("unknown schema"), "{err}"),
        }
        let no_digest = good.replace(",\"sha256\":\"ab\"", "");
        match parse_corpus_index(&no_digest, "corpus-index.json") {
            Ok(_) => panic!("an index row with no digest was accepted"),
            Err(err) => assert!(err.to_string().contains("has no sha256"), "{err}"),
        }
    }

    /// The recorded corpus is gitignored (P-143), so this case runs on operator hardware
    /// and **skips** in CI rather than failing — a missing artifact is not a defect, but a
    /// present artifact that has drifted is (§5.2).
    #[test]
    fn the_recorded_tape_still_matches_the_digest_the_index_sealed() {
        const RECORDED_TAPE: &str = "tape-ses_mrynz0vlkf0x001.jsonl";
        const RECORDED_SHA: &str =
            "1a202d2f52ed8c3f0bebecb2e99677a1a26e66f39df817297e71abe0c5280e55";

        let dir = recorded_corpus_dir();
        let index_path = dir.join("corpus-index.json");
        if !index_path.exists() {
            eprintln!(
                "skipping recorded-corpus case: {} is absent",
                index_path.display()
            );
            return;
        }
        let index = match read_corpus_index(&index_path) {
            Ok(index) => index,
            Err(err) => panic!("{err}"),
        };
        // Every file the index lists, against the digest the export sealed.
        if let Err(err) = index.verify_dir(&dir) {
            panic!("{err}");
        }
        match index.first_tape() {
            Some(entry) => {
                assert_eq!(entry.name, RECORDED_TAPE);
                assert_eq!(entry.sha256, RECORDED_SHA);
            }
            None => panic!("corpus index carries no tape- file"),
        }
        match sha256_file(&dir.join(RECORDED_TAPE)) {
            Ok(digest) => assert_eq!(digest, RECORDED_SHA),
            Err(err) => panic!("{err}"),
        }

        // The header checked against the 35,658 rows that survived the prune.
        let tape = match read_corpus_tape(&dir.join(RECORDED_TAPE)) {
            Ok(tape) => tape,
            Err(err) => panic!("{err}"),
        };
        assert_eq!(tape.rows.len(), 35_658);
        assert_eq!(tape.header.tick_count, Some(35_658.0));
        assert_eq!(tape.header.symbol_count, Some(18.0));
        assert_eq!(tape.header.first_ts, Some(1_784_880_866_709.0));
        assert_eq!(tape.header.last_ts, Some(1_784_881_415_422.0));
        assert_eq!(tape.header.session_id, "ses_mrynz0vlkf0x001");
        // The manifest P-143 proved cannot be trusted alone — here it agrees with the
        // rows, which is the only reason this tape is usable as an oracle input.
        match tape.header.live_tape_manifest {
            Some(manifest) => assert_eq!(manifest.tick_count, Some(35_658.0)),
            None => panic!("recorded tape carries no liveTapeManifest"),
        }
    }
}
