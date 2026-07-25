//! [`IdGen`] — collision-resistant short ids, ported from `services/id-generator.ts`.
//!
//! TS source (verbatim):
//! ```js
//! let counter = 0
//! function shortId(prefix) {
//!   const ts  = Date.now().toString(36)
//!   const rnd = Math.random().toString(36).slice(2, 6)
//!   const seq = (++counter).toString(36).padStart(3, '0')
//!   return `${prefix}_${ts}${rnd}${seq}`
//! }
//! ```
//! The port injects the clock and RNG (RS-0.7) instead of reading `Date.now()` /
//! `Math.random()` globally, and keeps the process-monotonic counter as instance state.
//!
//! **Determinism boundary.** `ts` (base-36 of the injected clock) and `seq` (base-36 of
//! the counter) are bit-exact with JS `Number.prototype.toString(36)` — pinned by test.
//! The 4-char `rnd` segment is a faithful *analog* of `Math.random().toString(36)
//! .slice(2, 6)`: it is the standard fractional base-36 expansion of the injected RNG
//! draw. Under a seed it is fully reproducible; its purpose is collision-resistance, not
//! behavior, and the parity harness normalizes ids in goldens (RS-0.7 ruling), so its
//! exact characters are never a parity object.

use crate::clock::Clock;
use crate::rng::SeededRng;

const BASE36_DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

/// Encodes a non-negative integer as lowercase base-36, matching JS
/// `n.toString(36)` (`0` → `"0"`, `36` → `"10"`, `1234567890` → `"kf12oi"`).
#[must_use]
fn to_base36(mut n: u64) -> String {
    if n == 0 {
        return "0".to_string();
    }
    let mut buf: Vec<u8> = Vec::new();
    while n > 0 {
        buf.push(BASE36_DIGITS[(n % 36) as usize]);
        n /= 36;
    }
    buf.iter().rev().map(|&b| b as char).collect()
}

/// Produces the first four base-36 fractional digits of `x` (`x` in `[0, 1)`) — the
/// analog of JS `(0.x).toString(36).slice(2, 6)`.
#[must_use]
fn frac_base36_4(x: f64) -> String {
    let mut f = x;
    let mut out = String::with_capacity(4);
    for _ in 0..4 {
        f *= 36.0;
        let digit = f.floor();
        // digit is in [0, 36); clamp defends against any f64 edge at the boundary.
        let idx = (digit as usize).min(35);
        out.push(BASE36_DIGITS[idx] as char);
        f -= digit;
    }
    out
}

/// Generates prefixed, collision-resistant ids with an injected [`Clock`] and
/// [`SeededRng`]. Holds the process-monotonic counter (TS module-level `counter`).
#[derive(Debug, Clone)]
pub struct IdGen<C: Clock, R: SeededRng> {
    clock: C,
    rng: R,
    counter: u64,
}

impl<C: Clock, R: SeededRng> IdGen<C, R> {
    /// Creates an id generator. The counter starts at 0 and pre-increments, so the
    /// first id's `seq` is `001` — matching TS `(++counter)`.
    pub const fn new(clock: C, rng: R) -> Self {
        Self {
            clock,
            rng,
            counter: 0,
        }
    }

    /// `${prefix}_${base36(now)}${rnd4}${base36(++counter):0>3}` — the port of
    /// `shortId(prefix)`.
    pub fn short_id(&mut self, prefix: &str) -> String {
        let ms = self.clock.now().as_millis();
        let ts = to_base36(u64::try_from(ms).unwrap_or(0));
        let rnd = frac_base36_4(self.rng.next_f64());
        self.counter += 1;
        let seq = format!("{:0>3}", to_base36(self.counter));
        format!("{prefix}_{ts}{rnd}{seq}")
    }

    /// `shortId('ord')` — a new order id.
    pub fn order_id(&mut self) -> String {
        self.short_id("ord")
    }

    /// `shortId('ses')` — a new session id.
    pub fn session_id(&mut self) -> String {
        self.short_id("ses")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::FixedClock;
    use crate::rng::Mulberry32;
    use crate::time::UtcMillis;

    #[test]
    fn base36_matches_js_to_string_36() {
        // Reference values from node (scratchpad/gen-rng-vectors.mjs).
        assert_eq!(to_base36(0), "0");
        assert_eq!(to_base36(1), "1");
        assert_eq!(to_base36(35), "z");
        assert_eq!(to_base36(36), "10");
        assert_eq!(to_base36(999), "rr");
        assert_eq!(to_base36(1000), "rs");
        assert_eq!(to_base36(46655), "zzz");
        assert_eq!(to_base36(1_234_567_890), "kf12oi");
        assert_eq!(to_base36(1_721_000_000_000), "lym6yqrk");
    }

    fn gen_at(ms: i64, seed: u32) -> IdGen<FixedClock, Mulberry32> {
        IdGen::new(
            FixedClock::new(UtcMillis::new(ms)),
            Mulberry32::from_seed(seed),
        )
    }

    #[test]
    fn short_id_has_ported_structure() {
        let mut g = gen_at(1_721_000_000_000, 1);
        let id = g.short_id("ord");
        // prefix_ + ts("lym6yqrk") + rnd(4) + seq("001")
        assert!(id.starts_with("ord_lym6yqrk"), "got {id}");
        let rest = id.strip_prefix("ord_lym6yqrk").unwrap();
        assert_eq!(rest.len(), 7, "rnd(4)+seq(3): {rest}");
        assert!(rest.ends_with("001"), "first seq is 001: {rest}");
    }

    #[test]
    fn seq_increments_and_pads_to_three() {
        let mut g = gen_at(0, 42);
        let ids: Vec<String> = (0..3).map(|_| g.short_id("x")).collect();
        assert!(ids[0].ends_with("001"));
        assert!(ids[1].ends_with("002"));
        assert!(ids[2].ends_with("003"));
    }

    #[test]
    fn order_and_session_prefixes() {
        let mut g = gen_at(0, 1);
        assert!(g.order_id().starts_with("ord_"));
        assert!(g.session_id().starts_with("ses_"));
    }

    #[test]
    fn same_clock_and_seed_are_reproducible() {
        // The whole point of injection: deterministic ids under replay.
        let mut a = gen_at(1_700_000_000_000, 999);
        let mut b = gen_at(1_700_000_000_000, 999);
        for _ in 0..20 {
            assert_eq!(a.short_id("t"), b.short_id("t"));
        }
    }

    #[test]
    fn id_body_is_all_base36_after_prefix() {
        let mut g = gen_at(1_000_000, 7);
        let id = g.short_id("ord");
        // Every char after the `ord_` prefix (ts + rnd + seq) must be a base-36 digit.
        for c in id.strip_prefix("ord_").unwrap().chars() {
            assert!(
                c.is_ascii_digit() || c.is_ascii_lowercase(),
                "non-base36 char {c} in {id}"
            );
        }
    }
}
