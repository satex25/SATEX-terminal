//! Generated-id normalisation — port of `IdNormalizer` in `golden.ts` (RS-1.4).
//!
//! `id-generator.ts` mixes `Date.now()` and `Math.random()` into every order and session
//! id, so a raw id in a golden is raw nondeterminism in a golden. Goldens normalise ids
//! to first-occurrence-ordered placeholders rather than seeding `Math.random()` globally
//! — seeding would make a *new* stray nondeterministic call invisible to the double-run
//! hash proof, which is the one tripwire that catches it (operator ruling 2026-07-25,
//! ledger P-143).
//!
//! ## The pattern, hand-rolled
//!
//! The TypeScript builds `new RegExp("\\b(" + alt + ")_(" + "[0-9a-z]{13,24}" + ")\\b", "g")`.
//! This crate has no regex dependency and is not getting one for a pattern this small, so
//! the scan is written out. Three properties of the JS regex are load-bearing, and every
//! one of them is a trap if you reason about the pattern loosely rather than about what
//! the engine does:
//!
//! 1. **`\b` is a `\w`/non-`\w` boundary and `_` is a word character.** So
//!    `ord_lym6yqrk8f3z001_` does *not* match: the trailing underscore is a word
//!    character sitting where the pattern needs a boundary. Neither does
//!    `ord_lym6yqrk8f3z001A` — `A` is a word character too, even though it is not in the
//!    body class.
//! 2. **The body is greedy, and the trailing `\b` turns "greedy" into "exact".** For a
//!    maximal run of `[0-9a-z]` shorter than 13 or longer than 24 there is no match *at
//!    all*, not a truncated one. The private `Match::find` carries the derivation.
//! 3. **Alternation is ordered, longest prefix first.** `order` is tried before `ord`,
//!    otherwise `order_…` would be read as prefix `ord` against the remainder `er_…`,
//!    which is not an id at all. The sort is by length and stable, matching
//!    `[...prefixes].sort((a, b) => b.length - a.length)`.
//!
//! Scanning bytes rather than characters is safe here and is not a shortcut: the whole
//! word class is ASCII, so a UTF-8 lead or continuation byte is non-word exactly as the
//! UTF-16 code unit JavaScript looks at is non-word, and every byte a match spans is
//! ASCII, so no slice can land mid-character.

use std::collections::HashMap;

use crate::value::{JsonObject, JsonValue};

/// Id prefixes `shortId(prefix)` is called with in the engine (measured 2026-07-25 by
/// grep over `src/main`).
///
/// Only these are normalised, so a market symbol, an enum string or free text can never
/// be mangled into a placeholder by accident. Adding a prefix is a deliberate act: it
/// changes golden bytes, so it invalidates previously captured goldens and needs the
/// RS-1.3 regeneration procedure.
pub const DEFAULT_ID_PREFIXES: [&str; 9] = [
    "ad", "bmk", "edgar", "nws", "ord", "order", "ses", "seed", "seq",
];

/// Shortest id body the pattern accepts.
///
/// A generated body is `base36(ms)` + 4 random base36 + a base36 sequence padded to 3 —
/// 15 characters for any realistic epoch. The bounds stay loose enough for a longer
/// sequence (past 46,655 ids in one process) and tight enough that ordinary words cannot
/// match.
const BODY_MIN: usize = 13;

/// Longest id body the pattern accepts — see [`BODY_MIN`].
const BODY_MAX: usize = 24;

/// Whether `byte` is in JavaScript's `\w` class, `[A-Za-z0-9_]`.
///
/// The underscore is the one that catches people out, and it is the reason a trailing `_`
/// after an otherwise well-formed body suppresses the match entirely.
const fn is_word(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// Whether `byte` is in the id body class, `[0-9a-z]`. Uppercase is deliberately out.
const fn is_body(byte: u8) -> bool {
    byte.is_ascii_digit() || byte.is_ascii_lowercase()
}

/// Whether JavaScript's `\b` holds at byte offset `at` in `bytes`.
///
/// `\b` is true when exactly one side of the position is a word character, treating
/// out-of-range as non-word. Written as the general assertion rather than as "the
/// preceding byte must be non-word" because a caller-supplied prefix is not required to
/// begin with a word character, and the regex evaluates `\b` against whatever is actually
/// at the position, not against what the alternation is about to demand.
fn word_boundary_at(bytes: &[u8], at: usize) -> bool {
    let before = at.checked_sub(1).and_then(|i| bytes.get(i)).copied();
    let after = bytes.get(at).copied();
    before.is_some_and(is_word) != after.is_some_and(is_word)
}

/// One occurrence of the id pattern: the byte range it spans and which prefix matched.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Match {
    /// Byte offset of the first character of the prefix.
    start: usize,
    /// Byte offset one past the last body character.
    end: usize,
    /// Index into the *sorted* prefix list of the alternative that matched.
    prefix: usize,
}

impl Match {
    /// First occurrence of the pattern at or after `from`, or `None`.
    ///
    /// `prefixes` must already be in alternation order (longest first).
    ///
    /// ## Why testing the maximal run is exactly the regex
    ///
    /// After `prefix_` the engine matches `[0-9a-z]{13,24}` greedily and then asserts
    /// `\b`. Let *r* be the length of the maximal `[0-9a-z]` run starting at the body.
    /// The engine tries body lengths `min(r, 24)` down to `13`; for any length *l* < *r*
    /// the byte at the cursor is still in `[0-9a-z]`, hence a word character, and the
    /// byte before it always is, so `\b` fails. Only *l* = *r* can satisfy the assertion,
    /// and the greedy cap means *l* = *r* is reachable only when *r* ≤ 24. So: match iff
    /// 13 ≤ *r* ≤ 24 and the byte after the run is absent or non-word — which, the run
    /// being maximal, means it is not one of `[A-Z_]`.
    fn find(bytes: &[u8], from: usize, prefixes: &[String]) -> Option<Self> {
        for start in from..=bytes.len() {
            if !word_boundary_at(bytes, start) {
                continue;
            }
            // Ordered alternation *with backtracking*: a longer prefix that matches
            // literally and then fails does not veto a shorter one at the same position,
            // so `\b(order|ord)_…` gets both attempts before the scan moves on.
            for (prefix, text) in prefixes.iter().enumerate() {
                let after_prefix = start + text.len();
                if !bytes[start..].starts_with(text.as_bytes())
                    || bytes.get(after_prefix) != Some(&b'_')
                {
                    continue;
                }
                let body_start = after_prefix + 1;
                let run = bytes[body_start..]
                    .iter()
                    .take_while(|byte| is_body(**byte))
                    .count();
                if !(BODY_MIN..=BODY_MAX).contains(&run) {
                    continue;
                }
                let end = body_start + run;
                if bytes.get(end).copied().is_some_and(is_word) {
                    continue;
                }
                return Some(Self { start, end, prefix });
            }
        }
        None
    }
}

/// Replaces generated ids with first-occurrence-ordered placeholders.
///
/// One instance per golden stream: the numbering is the stream's own order, so the same
/// id always maps to the same placeholder within a run, and two runs that emit the same
/// ids in the same order produce identical text. Counters are per prefix, so an order id
/// and a session id do not share a numbering space.
///
/// Normalising an already-normalised value is a no-op, which makes the transform safe to
/// apply twice (belt and braces in the driver, and required by the differ).
#[derive(Debug, Clone)]
pub struct IdNormalizer {
    /// Alternation order: longest prefix first, ties in declaration order.
    prefixes: Vec<String>,
    /// Raw id → placeholder, in first-occurrence order. That order is the contract, which
    /// is why this is a `Vec` and not the `HashMap` beside it.
    seen: Vec<(String, String)>,
    /// Raw id → its position in [`Self::seen`], so a stream carrying thousands of
    /// distinct ids does not degrade to a linear scan per occurrence.
    index: HashMap<String, usize>,
    /// Prefix → how many distinct ids with that prefix have been numbered so far.
    counters: HashMap<String, u64>,
}

impl Default for IdNormalizer {
    fn default() -> Self {
        Self::build(&DEFAULT_ID_PREFIXES)
    }
}

impl IdNormalizer {
    /// A normaliser over [`DEFAULT_ID_PREFIXES`].
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// A normaliser over a caller-supplied prefix list, or `None` when the list is empty.
    ///
    /// The empty list is refused for the same reason the TypeScript constructor throws on
    /// it: a normaliser that recognises nothing passes every raw id through silently, and
    /// the golden then looks clean while carrying `Math.random()` output.
    #[must_use]
    pub fn with_prefixes(prefixes: &[&str]) -> Option<Self> {
        if prefixes.is_empty() {
            return None;
        }
        Some(Self::build(prefixes))
    }

    /// Builds a normaliser without the emptiness check — the private half both public
    /// constructors share.
    fn build(prefixes: &[&str]) -> Self {
        let mut sorted: Vec<String> = prefixes.iter().map(|p| (*p).to_owned()).collect();
        // Stable, matching `Array.prototype.sort`'s guarantee since ES2019: equal-length
        // prefixes keep declaration order, so the alternation is a pure function of the
        // list and two implementations cannot disagree about which one wins a tie.
        sorted.sort_by_key(|text| std::cmp::Reverse(text.len()));
        Self {
            prefixes: sorted,
            seen: Vec::new(),
            index: HashMap::new(),
            counters: HashMap::new(),
        }
    }

    /// The placeholder for `matched`, allocating the next number for `prefix` on first
    /// sight and returning the remembered one thereafter.
    fn token_for(&mut self, matched: &str, prefix: &str) -> String {
        if let Some(slot) = self.index.get(matched)
            && let Some((_, token)) = self.seen.get(*slot)
        {
            return token.clone();
        }
        let counter = self.counters.entry(prefix.to_owned()).or_insert(0);
        *counter += 1;
        let token = format!("<{prefix}:{counter}>");
        self.index.insert(matched.to_owned(), self.seen.len());
        self.seen.push((matched.to_owned(), token.clone()));
        token
    }

    /// Normalises every id occurrence in `input`, including ids embedded in a message.
    pub fn text(&mut self, input: &str) -> String {
        let bytes = input.as_bytes();
        let mut out = String::new();
        let mut pos = 0;
        // Mirrors a `g`-flagged `String.replace`: scanning resumes at the *end* of the
        // match, never inside it, so an id can never be consumed twice.
        while let Some(hit) = Match::find(bytes, pos, &self.prefixes) {
            let (Some(head), Some(matched)) =
                (input.get(pos..hit.start), input.get(hit.start..hit.end))
            else {
                break; // Unreachable: every match boundary is an ASCII byte offset.
            };
            let Some(prefix) = self.prefixes.get(hit.prefix).cloned() else {
                break; // Unreachable: the index came from this normaliser's own list.
            };
            let token = self.token_for(matched, &prefix);
            out.push_str(head);
            out.push_str(&token);
            pos = hit.end;
        }
        out.push_str(input.get(pos..).unwrap_or(""));
        out
    }

    /// Normalises every string inside a JSON value, structure preserved.
    ///
    /// Object keys are normalised too: ids are used as map keys in the engine (the
    /// in-flight order index), and a raw id leaking through a key would break parity
    /// exactly as a raw value would. The key is normalised *before* its value, which is
    /// the order the TypeScript evaluates `out[this.text(key)] = this.value(…)` in and
    /// therefore the order the per-prefix counters are handed out in.
    pub fn value(&mut self, input: &JsonValue) -> JsonValue {
        match input {
            JsonValue::String(text) => JsonValue::String(self.text(text)),
            JsonValue::Array(items) => {
                JsonValue::Array(items.iter().map(|item| self.value(item)).collect())
            }
            JsonValue::Object(obj) => {
                let mut out = JsonObject::new();
                for (key, value) in obj.iter() {
                    let key = self.text(key);
                    out.insert(key, self.value(value));
                }
                JsonValue::Object(out)
            }
            other => other.clone(),
        }
    }

    /// Ids seen so far, in first-occurrence order — surfaced for drift reports.
    #[must_use]
    pub fn mappings(&self) -> Vec<(String, String)> {
        self.seen.clone()
    }
}

/// The raw id, if any, that survived normalisation in `text`.
///
/// Implemented by re-running a fresh normaliser rather than by a second copy of the
/// pattern: a duplicated pattern would drift the day a prefix is added to
/// [`DEFAULT_ID_PREFIXES`], and a detector that silently stops detecting is the P-097
/// shape.
#[must_use]
pub fn raw_id_in(text: &str) -> Option<String> {
    let mut probe = IdNormalizer::new();
    if probe.text(text) == text {
        return None;
    }
    probe.mappings().into_iter().next().map(|(raw, _)| raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A realistic generated id: prefix_ + base36(ms) + 4 rnd + 3 seq (id-generator.ts).
    const ORD_A: &str = "ord_lym6yqrk8f3z001";
    const ORD_B: &str = "ord_lym6yqrk9x2q002";
    const SES_A: &str = "ses_lym6yqrkab12001";

    fn norm() -> IdNormalizer {
        IdNormalizer::new()
    }

    #[test]
    fn maps_ids_to_first_occurrence_ordered_placeholders() {
        let mut n = norm();
        assert_eq!(n.text(ORD_A), "<ord:1>");
        assert_eq!(n.text(ORD_B), "<ord:2>");
        assert_eq!(n.text(ORD_A), "<ord:1>", "stable on re-encounter");
    }

    #[test]
    fn counts_per_prefix_so_orders_and_sessions_share_no_numbering_space() {
        let mut n = norm();
        assert_eq!(n.text(SES_A), "<ses:1>");
        assert_eq!(n.text(ORD_A), "<ord:1>");
    }

    #[test]
    fn never_maps_two_different_ids_to_the_same_placeholder() {
        let mut n = norm();
        let mut seen = std::collections::HashSet::new();
        for i in 0..500_u32 {
            // Distinct bodies of legal length; only the id body varies.
            let id = format!("ord_lym6yqrk{i:04}{i:03}");
            seen.insert(n.text(&id));
        }
        assert_eq!(seen.len(), 500);
    }

    #[test]
    fn normalises_ids_embedded_in_a_message_string() {
        let mut n = norm();
        assert_eq!(
            n.text(&format!("submit {ORD_A} for {SES_A} failed")),
            "submit <ord:1> for <ses:1> failed"
        );
    }

    #[test]
    fn leaves_non_ids_untouched() {
        let mut n = norm();
        for text in [
            "NVDA",
            "BTC/USD",
            "buy",
            "order_flow",
            "ord_",
            "ord_short",
            "seq_of_events",
            "a_b",
            "RECONNECTING",
            "",
            "ordinary text",
        ] {
            assert_eq!(n.text(text), text, "{text} must not be normalised");
        }
        assert!(n.mappings().is_empty());
    }

    #[test]
    fn prefers_the_longest_matching_prefix() {
        let mut n = norm();
        assert_eq!(n.text("order_lym6yqrkab12001"), "<order:1>");
    }

    #[test]
    fn alternation_falls_through_when_a_longer_prefix_does_not_apply() {
        // `order` is tried before `ord` at every position. Where `order` does not apply,
        // the scan must fall through to `ord` rather than abandoning the position.
        let mut n = norm();
        assert_eq!(n.text(ORD_A), "<ord:1>");
        // The converse is why the sort exists: `ord` must never claim an `order_` id and
        // leave `er_…` behind, which is not an id at all.
        let mut m = norm();
        assert_eq!(m.text("order_lym6yqrkab12001"), "<order:1>");
        assert_eq!(m.mappings().len(), 1);
    }

    #[test]
    fn is_idempotent() {
        let mut n = norm();
        let once = n.text(&format!("{ORD_A} {SES_A}"));
        assert_eq!(n.text(&once), once);
    }

    #[test]
    fn is_deterministic_across_instances_given_the_same_id_order() {
        let mut a = norm();
        let mut b = norm();
        let sequence = [ORD_A, SES_A, ORD_B, ORD_A];
        let from_a: Vec<String> = sequence.iter().map(|s| a.text(s)).collect();
        let from_b: Vec<String> = sequence.iter().map(|s| b.text(s)).collect();
        assert_eq!(from_a, from_b);
    }

    #[test]
    fn normalises_ids_used_as_object_keys_not_just_values() {
        let mut n = norm();
        let mut inner = JsonObject::new();
        inner.insert("parent".to_owned(), JsonValue::String(SES_A.to_owned()));
        let mut outer = JsonObject::new();
        outer.insert(ORD_A.to_owned(), JsonValue::Object(inner));

        let JsonValue::Object(out) = n.value(&JsonValue::Object(outer)) else {
            panic!("value() must preserve the object shape");
        };
        assert_eq!(out.keys().collect::<Vec<_>>(), vec!["<ord:1>"]);
        let Some(JsonValue::Object(nested)) = out.get("<ord:1>") else {
            panic!("the normalised key must carry the normalised value");
        };
        assert_eq!(
            nested.get("parent"),
            Some(&JsonValue::String("<ses:1>".to_owned()))
        );
    }

    #[test]
    fn walks_arrays_and_nested_structures_leaving_non_strings_alone() {
        let mut n = norm();
        let input = JsonValue::Array(vec![
            JsonValue::String(ORD_A.to_owned()),
            JsonValue::Number(42.0),
            JsonValue::Null,
            JsonValue::Bool(true),
            JsonValue::Array(vec![JsonValue::String(SES_A.to_owned())]),
        ]);
        let expected = JsonValue::Array(vec![
            JsonValue::String("<ord:1>".to_owned()),
            JsonValue::Number(42.0),
            JsonValue::Null,
            JsonValue::Bool(true),
            JsonValue::Array(vec![JsonValue::String("<ses:1>".to_owned())]),
        ]);
        assert_eq!(n.value(&input), expected);
    }

    #[test]
    fn rejects_an_empty_prefix_list() {
        assert!(IdNormalizer::with_prefixes(&[]).is_none());
        assert!(IdNormalizer::with_prefixes(&["ord"]).is_some());
    }

    #[test]
    fn covers_every_prefix_the_engine_actually_uses() {
        // Guards against a prefix being added to id-generator call sites without being
        // taught to the normaliser — which would leak raw randomness into goldens.
        for prefix in DEFAULT_ID_PREFIXES {
            let mut n = norm();
            assert_eq!(
                n.text(&format!("{prefix}_lym6yqrkab12001")),
                format!("<{prefix}:1>")
            );
        }
    }

    #[test]
    fn body_length_is_bounded_at_both_ends() {
        let mut n = norm();
        assert_eq!(
            n.text("ord_abcdefghijkl"),
            "ord_abcdefghijkl",
            "12 is short"
        );
        assert_eq!(n.text("ord_abcdefghijklm"), "<ord:1>", "13 is the floor");
        assert_eq!(n.text(&format!("ord_{}", "a".repeat(BODY_MAX))), "<ord:2>");
        // 25 body characters is not a 24-character match with a stray tail: the greedy
        // body plus the trailing `\b` means there is no match at all.
        let too_long = format!("ord_{}", "a".repeat(BODY_MAX + 1));
        assert_eq!(n.text(&too_long), too_long);
    }

    #[test]
    fn a_trailing_word_character_suppresses_the_match() {
        let mut n = norm();
        // `_` and an uppercase letter are both `\w`, so `\b` fails after the body even
        // though neither is in the body class. This is the trap the module header names.
        for suffixed in [
            "ord_lym6yqrk8f3z001_",
            "ord_lym6yqrk8f3z001A",
            "ord_lym6yqrk8f3z001_tail",
        ] {
            assert_eq!(n.text(suffixed), suffixed, "{suffixed} must not match");
        }
        // A non-word character after the body is fine, and so is end of input.
        assert_eq!(n.text("ord_lym6yqrk8f3z001."), "<ord:1>.");
        assert_eq!(n.text("(ord_lym6yqrk8f3z001)"), "(<ord:1>)");
    }

    #[test]
    fn a_leading_word_character_suppresses_the_match() {
        let mut n = norm();
        for prefixed in [
            "xord_lym6yqrk8f3z001",
            "_ord_lym6yqrk8f3z001",
            "9ord_lym6yqrk8f3z001",
        ] {
            assert_eq!(n.text(prefixed), prefixed, "{prefixed} must not match");
        }
        assert!(n.mappings().is_empty());
    }

    #[test]
    fn the_placeholder_can_never_match_the_pattern() {
        // The idempotence law rests entirely on this: `<` and `:` are non-word, so a
        // placeholder carries no `prefix_body` shape for a second pass to find.
        let mut n = norm();
        for token in ["<ord:1>", "<order:42>", "<seq:1000>"] {
            assert_eq!(n.text(token), token);
        }
        assert!(n.mappings().is_empty());
    }

    #[test]
    fn mappings_are_returned_in_first_occurrence_order() {
        let mut n = norm();
        n.text(&format!("{SES_A} {ORD_A} {ORD_B} {ORD_A}"));
        assert_eq!(
            n.mappings(),
            vec![
                (SES_A.to_owned(), "<ses:1>".to_owned()),
                (ORD_A.to_owned(), "<ord:1>".to_owned()),
                (ORD_B.to_owned(), "<ord:2>".to_owned()),
            ]
        );
    }

    #[test]
    fn non_ascii_neighbours_are_non_word_and_do_not_block_a_match() {
        // A multi-byte character is non-`\w` in JavaScript and its UTF-8 bytes are
        // non-word here, so byte scanning and code-unit scanning agree.
        let mut n = norm();
        assert_eq!(n.text("é ord_lym6yqrk8f3z001 é"), "é <ord:1> é");
        assert_eq!(n.text("🚀ord_lym6yqrk9x2q002🚀"), "🚀<ord:2>🚀");
    }

    #[test]
    fn raw_id_in_finds_the_first_leak_and_nothing_else() {
        assert_eq!(raw_id_in("payload has no ids"), None);
        assert_eq!(raw_id_in("<ord:1> is already normalised"), None);
        assert_eq!(
            raw_id_in(&format!("{SES_A} then {ORD_A}")),
            Some(SES_A.to_owned())
        );
    }

    #[test]
    fn a_custom_prefix_list_normalises_only_its_own_prefixes() {
        let Some(mut n) = IdNormalizer::with_prefixes(&["zz"]) else {
            panic!("a non-empty prefix list must build");
        };
        assert_eq!(n.text("zz_lym6yqrk8f3z001"), "<zz:1>");
        assert_eq!(n.text(ORD_A), ORD_A);
    }
}
