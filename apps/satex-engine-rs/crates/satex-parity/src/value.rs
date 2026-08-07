//! The oracle's JSON value model: parser, canonical serialisation, JS number text.
//!
//! RS-UP-1 / RS-1.4. This is the Rust half of the format contract that
//! `apps/satex-terminal/scripts/oracle/golden.ts` defines on the TypeScript side, and
//! it is deliberately a hand-written parser rather than a `serde_json` wrapper. The
//! oracle needs three behaviours together, and no combination of `serde_json` features
//! provides them:
//!
//! 1. **JS `JSON.parse` overflow semantics.** `1e999` is `Infinity` in JavaScript, not a
//!    syntax error. `verify.ts` leans on exactly that: the value parses, and then
//!    *canonicalisation* rejects it, which is what makes a non-finite float in a golden
//!    an `invariant` finding ("a caught engine bug", Appendix B.3) rather than a `parse`
//!    finding. `serde_json` refuses the literal outright and would report the wrong
//!    divergence category — the mutation matrix has a row for this
//!    (`float-overflow-to-infinity`).
//! 2. **UTF-16 code-unit key ordering.** `canonicalize` sorts object keys the way
//!    `Object.keys(v).sort()` does, which is by UTF-16 code unit. Rust's `BTreeMap`
//!    sorts by UTF-8 bytes — the same thing as Unicode code-point order, which differs
//!    from UTF-16 order for every astral character (see [`utf16_cmp`]).
//! 3. **JS shortest-round-trip number text.** `JSON.stringify(1e21)` is `"1e+21"`;
//!    Rust's `{}` gives `"1000000000000000000000"`. Appendix B.3 makes the JS spelling
//!    the contract wherever golden bytes are compared (see [`js_number_to_string`]).
//!
//! ## Duplicate keys are last-wins, on purpose
//!
//! JSON does not forbid a duplicate object key and does not say which one wins; JS and
//! `serde_json` both keep the last. [`parse_json`] keeps the last too, because RS-L1
//! says port behavior: the `payload-duplicate-json-key` mutation expects the oracle to
//! report a *value* divergence on the shadowed field, which only happens if the reader
//! reads the same payload out of those bytes that the TypeScript reader does. A parser
//! that rejected duplicates would still "catch" the mutation, but it would catch it as
//! the wrong thing, and a reader that kept the *first* would diverge from the writer
//! silently.

use std::cmp::Ordering;
use std::fmt;

/// Maximum container nesting [`parse_json`] will descend.
///
/// Golden payloads are engine state snapshots — the deepest observed is single digits.
/// The bound exists so a malformed or adversarial line cannot overflow the stack of the
/// process whose entire job is to *report* on malformed input rather than die on it.
pub const MAX_DEPTH: usize = 128;

/// A JSON value, shaped for comparison rather than for deserialisation.
///
/// Mirrors `JsonValue` in `golden.ts`. Numbers are `f64` because JS numbers are
/// IEEE-754 binary64 (Appendix B.1) — there is no integer variant to drift against.
#[derive(Debug, Clone, PartialEq)]
pub enum JsonValue {
    /// `null`.
    Null,
    /// `true` / `false`.
    Bool(bool),
    /// Any JSON number. May be non-finite after parsing (`1e999`); canonicalisation is
    /// where that becomes a reported defect.
    Number(f64),
    /// A JSON string, already unescaped.
    String(String),
    /// A JSON array. Position is meaning: element *i* compares with element *i*.
    Array(Vec<JsonValue>),
    /// A JSON object. Key order is retained as parsed but carries no meaning.
    Object(JsonObject),
}

impl JsonValue {
    /// JSON type tag, distinguishing the two things a naive `typeof` calls `object`.
    ///
    /// Matches `jsonTypeOf` in `verify.ts` so a type-change divergence reads identically
    /// in both implementations' reports.
    #[must_use]
    pub fn type_name(&self) -> &'static str {
        match self {
            Self::Null => "null",
            Self::Bool(_) => "boolean",
            Self::Number(_) => "number",
            Self::String(_) => "string",
            Self::Array(_) => "array",
            Self::Object(_) => "object",
        }
    }
}

/// A JSON object: insertion-ordered key/value pairs with last-wins duplicate handling.
///
/// A `Vec` rather than a `BTreeMap` for one load-bearing reason: canonical ordering is
/// UTF-16 code-unit order ([`utf16_cmp`]), and a `BTreeMap<String, _>` would impose
/// UTF-8 byte order at insertion time, which is a different order the moment a key
/// contains an astral character. Sorting happens where it is needed and nowhere else.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct JsonObject {
    entries: Vec<(String, JsonValue)>,
}

impl JsonObject {
    /// An empty object.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Inserts `key`, replacing any existing value **in place** — last value wins, first
    /// position is kept.
    ///
    /// The position is retained rather than moved to the end purely so that a debug
    /// print of a parsed object reads like the bytes it came from; canonical output
    /// sorts, so position never reaches a comparison.
    pub fn insert(&mut self, key: String, value: JsonValue) {
        if let Some(slot) = self.entries.iter_mut().find(|(k, _)| *k == key) {
            slot.1 = value;
        } else {
            self.entries.push((key, value));
        }
    }

    /// The value stored under `key`, if any.
    #[must_use]
    pub fn get(&self, key: &str) -> Option<&JsonValue> {
        self.entries.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    /// Whether `key` is present.
    #[must_use]
    pub fn contains_key(&self, key: &str) -> bool {
        self.get(key).is_some()
    }

    /// Keys in parse order.
    pub fn keys(&self) -> impl Iterator<Item = &str> {
        self.entries.iter().map(|(k, _)| k.as_str())
    }

    /// Key/value pairs in parse order.
    pub fn iter(&self) -> impl Iterator<Item = (&str, &JsonValue)> {
        self.entries.iter().map(|(k, v)| (k.as_str(), v))
    }

    /// Keys in canonical (UTF-16 code-unit) order — the order `canonicalize` emits and
    /// the order a drift report walks an object in.
    #[must_use]
    pub fn sorted_keys(&self) -> Vec<&str> {
        let mut keys: Vec<&str> = self.keys().collect();
        keys.sort_by(|a, b| utf16_cmp(a, b));
        keys
    }

    /// Number of distinct keys.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Whether the object has no keys.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl FromIterator<(String, JsonValue)> for JsonObject {
    fn from_iter<T: IntoIterator<Item = (String, JsonValue)>>(iter: T) -> Self {
        let mut out = Self::new();
        for (k, v) in iter {
            out.insert(k, v);
        }
        out
    }
}

/// Compares two strings by UTF-16 code unit, the order `Array.prototype.sort` gives a
/// list of strings and therefore the order `canonicalize` must emit object keys in.
///
/// This is *not* the same as Rust's byte ordering. UTF-8 byte order equals Unicode
/// code-point order, but UTF-16 encodes astral characters (`U+10000`..) as surrogate
/// pairs in `U+D800..U+DFFF`, which sit *below* `U+E000..U+FFFF`. So `"\u{10000}"`
/// sorts before `"\u{FFFD}"` in JS and after it in Rust's default ordering. Engine field
/// names are ASCII, where the two orders agree — but a golden payload can carry a
/// symbol, a vault path or an error message as a key, and a key-ordering disagreement
/// between writer and reader is exactly the class of bug that makes a parity run
/// unfalsifiable.
#[must_use]
pub fn utf16_cmp(a: &str, b: &str) -> Ordering {
    a.encode_utf16().cmp(b.encode_utf16())
}

/// Why a line could not be read as JSON.
///
/// Carries a byte offset so a parse divergence can point at where the line went wrong
/// rather than only saying that it did.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JsonError {
    /// What went wrong, in one lowercase phrase.
    pub message: String,
    /// Byte offset into the input at which the parser stopped.
    pub offset: usize,
}

impl fmt::Display for JsonError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} at byte {}", self.message, self.offset)
    }
}

impl std::error::Error for JsonError {}

/// Why a value cannot be canonicalised.
///
/// The only cause is a non-finite number, and it is deliberately not merged into
/// [`JsonError`]: a value that parses and then refuses to serialise is a *different*
/// finding — Appendix B.3's caught engine bug — and the two reach the drift report under
/// different divergence categories.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanonError {
    /// What refused to serialise, in one lowercase phrase.
    pub message: String,
}

impl fmt::Display for CanonError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for CanonError {}

/// Parses one JSON document, with JS `JSON.parse` semantics.
///
/// Differences from `JSON.parse`, both deliberate and both documented at the module
/// header: nesting deeper than [`MAX_DEPTH`] is refused, and a lone surrogate escape is
/// refused (Rust's `String` cannot hold one; JS can, and a golden carrying one would be
/// unrepresentable rather than merely unequal).
///
/// # Errors
/// Returns [`JsonError`] when the text is not exactly one JSON value.
pub fn parse_json(text: &str) -> Result<JsonValue, JsonError> {
    let mut p = Parser {
        bytes: text.as_bytes(),
        pos: 0,
        depth: 0,
    };
    p.skip_ws();
    let value = p.value()?;
    p.skip_ws();
    if p.pos != p.bytes.len() {
        return Err(p.err("trailing content after the JSON value"));
    }
    Ok(value)
}

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
    depth: usize,
}

impl Parser<'_> {
    fn err(&self, message: &str) -> JsonError {
        JsonError {
            message: message.to_owned(),
            offset: self.pos,
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.pos += 1;
        }
    }

    fn expect(&mut self, byte: u8) -> Result<(), JsonError> {
        if self.peek() == Some(byte) {
            self.pos += 1;
            Ok(())
        } else {
            Err(self.err(&format!("expected '{}'", byte as char)))
        }
    }

    fn literal(&mut self, word: &str, value: JsonValue) -> Result<JsonValue, JsonError> {
        if self.bytes[self.pos..].starts_with(word.as_bytes()) {
            self.pos += word.len();
            Ok(value)
        } else {
            Err(self.err("unexpected token"))
        }
    }

    fn value(&mut self) -> Result<JsonValue, JsonError> {
        match self.peek() {
            None => Err(self.err("unexpected end of input")),
            Some(b'n') => self.literal("null", JsonValue::Null),
            Some(b't') => self.literal("true", JsonValue::Bool(true)),
            Some(b'f') => self.literal("false", JsonValue::Bool(false)),
            Some(b'"') => self.string().map(JsonValue::String),
            Some(b'[') => self.array(),
            Some(b'{') => self.object(),
            Some(b'-' | b'0'..=b'9') => self.number(),
            Some(_) => Err(self.err("unexpected token")),
        }
    }

    fn enter(&mut self) -> Result<(), JsonError> {
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return Err(self.err(&format!("nesting deeper than {MAX_DEPTH} levels")));
        }
        Ok(())
    }

    fn array(&mut self) -> Result<JsonValue, JsonError> {
        self.enter()?;
        self.pos += 1; // '['
        let mut out = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b']') {
            self.pos += 1;
            self.depth -= 1;
            return Ok(JsonValue::Array(out));
        }
        loop {
            self.skip_ws();
            out.push(self.value()?);
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    self.depth -= 1;
                    return Ok(JsonValue::Array(out));
                }
                _ => return Err(self.err("expected ',' or ']'")),
            }
        }
    }

    fn object(&mut self) -> Result<JsonValue, JsonError> {
        self.enter()?;
        self.pos += 1; // '{'
        let mut out = JsonObject::new();
        self.skip_ws();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            self.depth -= 1;
            return Ok(JsonValue::Object(out));
        }
        loop {
            self.skip_ws();
            if self.peek() != Some(b'"') {
                return Err(self.err("expected a string key"));
            }
            let key = self.string()?;
            self.skip_ws();
            self.expect(b':')?;
            self.skip_ws();
            let value = self.value()?;
            // Last-wins: the module header explains why this is a port decision and not
            // an oversight.
            out.insert(key, value);
            self.skip_ws();
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    self.depth -= 1;
                    return Ok(JsonValue::Object(out));
                }
                _ => return Err(self.err("expected ',' or '}'")),
            }
        }
    }

    fn hex4(&mut self) -> Result<u16, JsonError> {
        let end = self.pos + 4;
        let Some(slice) = self.bytes.get(self.pos..end) else {
            return Err(self.err("truncated \\u escape"));
        };
        let Ok(text) = std::str::from_utf8(slice) else {
            return Err(self.err("malformed \\u escape"));
        };
        let Ok(code) = u16::from_str_radix(text, 16) else {
            return Err(self.err("malformed \\u escape"));
        };
        self.pos = end;
        Ok(code)
    }

    fn string(&mut self) -> Result<String, JsonError> {
        self.pos += 1; // opening quote
        let mut out = String::new();
        loop {
            let Some(byte) = self.peek() else {
                return Err(self.err("unterminated string"));
            };
            match byte {
                b'"' => {
                    self.pos += 1;
                    return Ok(out);
                }
                // JSON forbids raw control characters inside a string.
                0x00..=0x1F => return Err(self.err("raw control character in string")),
                b'\\' => {
                    self.pos += 1;
                    let Some(esc) = self.peek() else {
                        return Err(self.err("unterminated escape"));
                    };
                    self.pos += 1;
                    match esc {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let unit = self.hex4()?;
                            let ch = if (0xD800..0xDC00).contains(&unit) {
                                // High surrogate — a low surrogate must follow.
                                if self.peek() != Some(b'\\') {
                                    return Err(self.err("lone high surrogate escape"));
                                }
                                self.pos += 1;
                                if self.peek() != Some(b'u') {
                                    return Err(self.err("lone high surrogate escape"));
                                }
                                self.pos += 1;
                                let low = self.hex4()?;
                                if !(0xDC00..0xE000).contains(&low) {
                                    return Err(
                                        self.err("high surrogate not followed by a low surrogate")
                                    );
                                }
                                let scalar = 0x1_0000
                                    + ((u32::from(unit) - 0xD800) << 10)
                                    + (u32::from(low) - 0xDC00);
                                match char::from_u32(scalar) {
                                    Some(c) => c,
                                    None => return Err(self.err("invalid surrogate pair")),
                                }
                            } else if (0xDC00..0xE000).contains(&unit) {
                                return Err(self.err("lone low surrogate escape"));
                            } else {
                                match char::from_u32(u32::from(unit)) {
                                    Some(c) => c,
                                    None => return Err(self.err("invalid \\u escape")),
                                }
                            };
                            out.push(ch);
                        }
                        _ => return Err(self.err("unknown escape")),
                    }
                }
                _ => {
                    // Copy one whole UTF-8 scalar. The input is a `&str`, so the byte
                    // slice is valid UTF-8 and a character boundary always follows.
                    let rest = &self.bytes[self.pos..];
                    let width = utf8_width(byte);
                    let Some(slice) = rest.get(..width) else {
                        return Err(self.err("truncated UTF-8 sequence"));
                    };
                    let Ok(text) = std::str::from_utf8(slice) else {
                        return Err(self.err("malformed UTF-8 sequence"));
                    };
                    out.push_str(text);
                    self.pos += width;
                }
            }
        }
    }

    /// Validates the JSON number grammar, then hands the slice to Rust's `f64` parser.
    ///
    /// Validating first is what keeps `"NaN"`, `"Infinity"`, `"1."` and `"+1"` — all of
    /// which `str::parse::<f64>` accepts and `JSON.parse` rejects — out of the value
    /// model. Overflow is *not* rejected: `str::parse` yields `inf` for `1e999`, which is
    /// precisely the JS behaviour the oracle needs (module header, point 1).
    fn number(&mut self) -> Result<JsonValue, JsonError> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        match self.peek() {
            Some(b'0') => self.pos += 1,
            Some(b'1'..=b'9') => {
                while matches!(self.peek(), Some(b'0'..=b'9')) {
                    self.pos += 1;
                }
            }
            _ => return Err(self.err("expected a digit")),
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(self.err("expected a digit after '.'"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return Err(self.err("expected a digit in the exponent"));
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        let Some(slice) = self.bytes.get(start..self.pos) else {
            return Err(self.err("malformed number"));
        };
        let Ok(text) = std::str::from_utf8(slice) else {
            return Err(self.err("malformed number"));
        };
        match text.parse::<f64>() {
            Ok(n) => Ok(JsonValue::Number(n)),
            Err(_) => Err(self.err("malformed number")),
        }
    }
}

/// Byte length of the UTF-8 scalar starting with `lead`.
fn utf8_width(lead: u8) -> usize {
    match lead {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        _ => 4,
    }
}

/// Renders `value` as the deterministic text a golden line holds.
///
/// Port of `canonicalize` in `golden.ts`: object keys sorted (UTF-16 code unit), arrays
/// left in place, numbers in JS shortest-round-trip form, and a hard refusal for
/// non-finite numbers. That refusal is the point — `JSON.stringify` would emit `null`
/// for a `NaN` and hide a poisoned float, and Appendix B.3 says a non-finite number
/// reaching serialisation is a caught engine bug.
///
/// # Errors
/// Returns [`CanonError`] when the value contains a `NaN` or an infinity.
pub fn canonicalize(value: &JsonValue) -> Result<String, CanonError> {
    let mut out = String::new();
    write_canonical(value, &mut out)?;
    Ok(out)
}

fn write_canonical(value: &JsonValue, out: &mut String) -> Result<(), CanonError> {
    match value {
        JsonValue::Null => out.push_str("null"),
        JsonValue::Bool(true) => out.push_str("true"),
        JsonValue::Bool(false) => out.push_str("false"),
        JsonValue::Number(n) => {
            if !n.is_finite() {
                return Err(CanonError {
                    message: format!(
                        "canonicalize: non-finite number reached serialisation ({})",
                        non_finite_label(*n)
                    ),
                });
            }
            out.push_str(&js_number_to_string(*n));
        }
        JsonValue::String(s) => escape_json_string(s, out),
        JsonValue::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_canonical(item, out)?;
            }
            out.push(']');
        }
        JsonValue::Object(obj) => {
            out.push('{');
            for (i, key) in obj.sorted_keys().into_iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                escape_json_string(key, out);
                out.push(':');
                match obj.get(key) {
                    Some(v) => write_canonical(v, out)?,
                    // Unreachable: `key` came from this object's own key list.
                    None => out.push_str("null"),
                }
            }
            out.push('}');
        }
    }
    Ok(())
}

/// How JS spells a non-finite number, for the refusal message.
fn non_finite_label(n: f64) -> &'static str {
    if n.is_nan() {
        "NaN"
    } else if n > 0.0 {
        "Infinity"
    } else {
        "-Infinity"
    }
}

/// Appends `s` as a JSON string literal with `JSON.stringify` escaping.
///
/// Escapes exactly what JS escapes: the two structural characters, the five short
/// control escapes, and any remaining control character as `\u00XX`. Printable non-ASCII
/// is emitted literally, which is why the `format-unicode-escaped` mutation is a
/// negative control — `"é"` and `"é"` parse to the same string and canonicalise to
/// the same bytes.
pub fn escape_json_string(s: &str, out: &mut String) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

/// Renders a finite `f64` exactly as JavaScript's `String(x)` / `JSON.stringify(x)` does.
///
/// Implements ECMA-262 `Number::toString` (radix 10) on top of Rust's shortest
/// round-trip formatter. Rust's `{}` already agrees with JS across most of the range,
/// but the two disagree at both ends — JS switches to exponent form at `1e21` and below
/// `1e-6`, Rust does not — and the disagreement is silent, which is the worst kind. The
/// digits themselves come from `{:e}`, which is the same shortest-round-trip digit
/// string JS computes; only the *placement* of the decimal point is re-derived here.
///
/// `-0.0` renders as `"0"`, matching `String(-0)`. The sign of zero is therefore not a
/// golden object — documented on the TypeScript side too, and the reason
/// `format-negative-zero` is a negative control.
///
/// # Panics
/// Never for finite input. Non-finite input returns the JS spelling of the non-finite
/// value rather than panicking, so a caller that skips the [`canonicalize`] guard gets
/// readable evidence instead of an abort.
#[must_use]
pub fn js_number_to_string(x: f64) -> String {
    if x.is_nan() {
        return "NaN".to_owned();
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity" } else { "-Infinity" }.to_owned();
    }
    if x == 0.0 {
        return "0".to_owned(); // covers -0.0: String(-0) === "0"
    }
    if x < 0.0 {
        return format!("-{}", js_number_to_string(-x));
    }

    // `{:e}` yields the shortest digit string that round-trips, in `d[.ddd]e±exp` form.
    let sci = format!("{x:e}");
    let Some((mantissa, exponent)) = sci.split_once('e') else {
        return sci;
    };
    let Ok(exp10) = exponent.parse::<i32>() else {
        return sci;
    };
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = i32::try_from(digits.len()).unwrap_or(i32::MAX);
    // ECMA-262: k digits, value = s × 10^(n−k), so n is the position of the decimal point.
    let n = exp10 + 1;

    if k <= n && n <= 21 {
        let zeros = usize::try_from(n - k).unwrap_or(0);
        return format!("{digits}{}", "0".repeat(zeros));
    }
    if 0 < n && n <= 21 {
        let split = usize::try_from(n).unwrap_or(0);
        let (head, tail) = digits.split_at(split.min(digits.len()));
        return format!("{head}.{tail}");
    }
    if -6 < n && n <= 0 {
        let zeros = usize::try_from(-n).unwrap_or(0);
        return format!("0.{}{digits}", "0".repeat(zeros));
    }
    // Exponential form. JS writes an explicit '+' for a positive exponent.
    let e = n - 1;
    let sign = if e >= 0 { '+' } else { '-' };
    let magnitude = e.unsigned_abs();
    if k == 1 {
        format!("{digits}e{sign}{magnitude}")
    } else {
        let (head, tail) = digits.split_at(1);
        format!("{head}.{tail}e{sign}{magnitude}")
    }
}

/// Canonical text, or a readable placeholder when the value refuses to serialise.
///
/// Port of `show` in `verify.ts`. A drift report is evidence: a row whose `expected`
/// column is a stack trace is worse than one that says, in place, that the value could
/// not be written down and why.
#[must_use]
pub fn show(value: &JsonValue) -> String {
    match canonicalize(value) {
        Ok(text) => text,
        Err(err) => format!("<unserialisable: {err}>"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(text: &str) -> JsonValue {
        match parse_json(text) {
            Ok(v) => v,
            Err(e) => panic!("expected {text} to parse, got {e}"),
        }
    }

    fn canon(text: &str) -> String {
        match canonicalize(&parse(text)) {
            Ok(s) => s,
            Err(e) => panic!("expected {text} to canonicalise, got {e}"),
        }
    }

    #[test]
    fn parses_the_scalar_types() {
        assert_eq!(parse("null"), JsonValue::Null);
        assert_eq!(parse("true"), JsonValue::Bool(true));
        assert_eq!(parse("false"), JsonValue::Bool(false));
        assert_eq!(parse("-1.5e2"), JsonValue::Number(-150.0));
        assert_eq!(parse(r#""hi""#), JsonValue::String("hi".to_owned()));
    }

    #[test]
    fn rejects_what_json_parse_rejects() {
        for bad in [
            "NaN",
            "Infinity",
            "-Infinity",
            "+1",
            "1.",
            ".5",
            "01",
            "1e",
            "{\"a\":1,}",
            "[1,]",
            "'a'",
            "{a:1}",
            "",
            "1 2",
        ] {
            assert!(parse_json(bad).is_err(), "{bad} should not parse");
        }
    }

    #[test]
    fn overflow_parses_to_infinity_rather_than_failing() {
        // The `float-overflow-to-infinity` mutation depends on this: the value must
        // reach canonicalisation so the defect is reported as an invariant, not a parse.
        let value = parse("1e999");
        assert_eq!(value, JsonValue::Number(f64::INFINITY));
        assert!(canonicalize(&value).is_err());
        assert_eq!(parse("-1e999"), JsonValue::Number(f64::NEG_INFINITY));
        // Underflow is a plain zero in JS too.
        assert_eq!(parse("1e-999"), JsonValue::Number(0.0));
    }

    #[test]
    fn duplicate_keys_keep_the_last_value() {
        assert_eq!(canon(r#"{"a":1,"b":2,"a":3}"#), r#"{"a":3,"b":2}"#);
    }

    #[test]
    fn canonical_text_sorts_keys_and_preserves_array_order() {
        assert_eq!(canon(r#"{"b":1,"a":2}"#), r#"{"a":2,"b":1}"#);
        assert_eq!(canon("[3,1,2]"), "[3,1,2]");
    }

    #[test]
    fn container_only_differences_canonicalise_identically() {
        // These four pairs are the negative controls of the RS-1.7 matrix: the bytes
        // move, the decision does not.
        for (a, b) in [
            (r#"{"a":1,"b":2}"#, r#"{"b":2,"a":1}"#), // key order
            (r#"{"a":1.0}"#, r#"{"a":1}"#),           // float integer form
            (r#"{"a":-0}"#, r#"{"a":0}"#),            // negative zero
            (r#"{"a":1.5e2}"#, r#"{"a":150}"#),       // exponent notation
            (r#"{"a":"é"}"#, "{\"a\":\"é\"}"),        // unicode escape
            (r#"{ "a" : 1 }"#, r#"{"a":1}"#),         // whitespace
        ] {
            assert_eq!(canon(a), canon(b), "{a} and {b} should agree");
        }
    }

    #[test]
    fn one_ulp_is_a_difference() {
        let base = 195.297_178_392_976_2_f64;
        let nudged = f64::from_bits(base.to_bits() + 1);
        assert_ne!(js_number_to_string(base), js_number_to_string(nudged));
    }

    #[test]
    fn js_number_text_matches_javascript() {
        // Values chosen at the boundaries where Rust's `{}` and JS disagree; the
        // expectations are what `String(x)` produces in node.
        for (value, expected) in [
            (0.0, "0"),
            (-0.0, "0"),
            (1.0, "1"),
            (-1.5, "-1.5"),
            (150.0, "150"),
            (100.0, "100"),
            (0.1, "0.1"),
            (123.456, "123.456"),
            (1e20, "100000000000000000000"),
            (1e21, "1e+21"),
            (1.5e21, "1.5e+21"),
            (1e-6, "0.000001"),
            (1e-7, "1e-7"),
            (5e-324, "5e-324"),
            (1.797_693_134_862_315_7e308, "1.7976931348623157e+308"),
            (0.000_001_5, "0.0000015"),
            (1234567890123456789.0, "1234567890123456800"),
        ] {
            assert_eq!(js_number_to_string(value), expected, "for {value:?}");
        }
    }

    #[test]
    fn js_number_text_round_trips() {
        // Property: whatever spelling we choose, it must read back as the same f64.
        // Deterministic LCG — no `rand` dependency, and a failure is reproducible.
        let mut state: u64 = 0x2026_0806_0000_0001;
        for _ in 0..20_000 {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            let candidate = f64::from_bits(state);
            if !candidate.is_finite() {
                continue;
            }
            let text = js_number_to_string(candidate);
            match text.parse::<f64>() {
                Ok(back) => assert_eq!(
                    back.to_bits(),
                    candidate.to_bits(),
                    "{candidate:?} rendered as {text}"
                ),
                Err(e) => panic!("{candidate:?} rendered as unparsable {text} ({e})"),
            }
        }
    }

    #[test]
    fn utf16_order_is_not_utf8_order() {
        let astral = "\u{10000}";
        let bmp = "\u{FFFD}";
        assert_eq!(utf16_cmp(astral, bmp), Ordering::Less);
        assert_eq!(astral.cmp(bmp), Ordering::Greater);
    }

    #[test]
    fn strings_escape_the_way_json_stringify_does() {
        let mut out = String::new();
        escape_json_string("a\"b\\c\nd\te\u{1}f\u{8}g é", &mut out);
        // `\u{1}` has no short escape so it takes the `\u00XX` form; `\u{8}` has one
        // (`\b`) and must take it. Printable non-ASCII is emitted literally.
        // The six-character `` escape is built rather than written inline: spelled
        // literally it is the kind of thing an editor or a patch tool helpfully turns
        // back into the control character it describes, and the test would then assert
        // the bug it exists to catch.
        let esc = format!("{}u0001", '\\');
        assert_eq!(out, format!(r#""a\"b\\c\nd\te{esc}f\bg é""#));
    }

    #[test]
    fn surrogate_pairs_decode_and_lone_surrogates_are_refused() {
        assert_eq!(parse(r#""😀""#), JsonValue::String("😀".to_owned()));
        assert!(parse_json(r#""\ud83d""#).is_err());
        assert!(parse_json(r#""\ude00""#).is_err());
    }

    #[test]
    fn nesting_is_bounded() {
        let deep = format!("{}{}", "[".repeat(MAX_DEPTH + 1), "]".repeat(MAX_DEPTH + 1));
        assert!(parse_json(&deep).is_err());
        let ok = format!("{}{}", "[".repeat(MAX_DEPTH), "]".repeat(MAX_DEPTH));
        assert!(parse_json(&ok).is_ok());
    }

    #[test]
    fn raw_control_characters_are_refused_inside_strings() {
        assert!(parse_json("\"a\nb\"").is_err());
    }

    #[test]
    fn show_reports_rather_than_panics_on_a_poisoned_float() {
        let poisoned = JsonValue::Number(f64::NAN);
        assert!(show(&poisoned).starts_with("<unserialisable:"));
    }
}
