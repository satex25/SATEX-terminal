//! [`UtcMillis`] — the single in-engine time currency (decision D-008).
//!
//! JavaScript `Date.now()` and every engine timestamp is an integer count of
//! milliseconds since the Unix epoch (UTC). The TS engine passes these around as
//! plain `number`; this newtype makes the unit and the epoch explicit and keeps
//! `chrono` confined to the display/parse edges (it is intentionally not a
//! dependency of this crate). Arithmetic is saturating so a degenerate input can
//! never panic on overflow — a poisoned timestamp is surfaced as data, not a crash.

use core::fmt;

/// A UTC instant, counted in whole milliseconds since the Unix epoch.
///
/// Mirrors the `number` millisecond timestamps the TS engine uses everywhere
/// (`Date.now()`, quote `timestamp`, session `startedAt`, …). Values before the
/// epoch are representable (negative), matching JS semantics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct UtcMillis(i64);

impl UtcMillis {
    /// The Unix epoch, `1970-01-01T00:00:00Z`.
    pub const EPOCH: UtcMillis = UtcMillis(0);

    /// Wraps a raw millisecond count.
    #[must_use]
    pub const fn new(ms: i64) -> Self {
        Self(ms)
    }

    /// Returns the raw millisecond count.
    #[must_use]
    pub const fn as_millis(self) -> i64 {
        self.0
    }

    /// Returns whole seconds since the epoch, truncated toward negative infinity —
    /// the equivalent of `Math.floor(ms / 1000)` used by the synthetic-backfill and
    /// aggregation paths (e.g. `trading-engine.ts:2683`).
    #[must_use]
    pub const fn as_seconds_floor(self) -> i64 {
        self.0.div_euclid(1000)
    }

    /// Adds a signed millisecond delta, saturating at the `i64` bounds.
    #[must_use]
    pub const fn saturating_add_ms(self, delta_ms: i64) -> Self {
        Self(self.0.saturating_add(delta_ms))
    }

    /// `self - other` in milliseconds, saturating at the `i64` bounds. Used for age
    /// and staleness checks (`Date.now() - lastTickAt`, `refPriceAge`, …).
    #[must_use]
    pub const fn diff_ms(self, other: Self) -> i64 {
        self.0.saturating_sub(other.0)
    }
}

impl fmt::Display for UtcMillis {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}ms", self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_and_as_millis_round_trip() {
        assert_eq!(
            UtcMillis::new(1_721_000_000_000).as_millis(),
            1_721_000_000_000
        );
        assert_eq!(UtcMillis::EPOCH.as_millis(), 0);
        assert_eq!(UtcMillis::new(-5).as_millis(), -5);
    }

    #[test]
    fn seconds_floor_matches_js_math_floor_div_1000() {
        // Math.floor(1234 / 1000) === 1 ; Math.floor(-1 / 1000) === -1 (floor, not trunc)
        assert_eq!(UtcMillis::new(1234).as_seconds_floor(), 1);
        assert_eq!(UtcMillis::new(1000).as_seconds_floor(), 1);
        assert_eq!(UtcMillis::new(999).as_seconds_floor(), 0);
        assert_eq!(UtcMillis::new(-1).as_seconds_floor(), -1);
    }

    #[test]
    fn arithmetic_saturates_and_does_not_panic() {
        assert_eq!(
            UtcMillis::new(1000).saturating_add_ms(500).as_millis(),
            1500
        );
        assert_eq!(
            UtcMillis::new(i64::MAX).saturating_add_ms(1).as_millis(),
            i64::MAX
        );
        assert_eq!(
            UtcMillis::new(i64::MIN).diff_ms(UtcMillis::new(i64::MAX)),
            i64::MIN
        );
    }

    #[test]
    fn diff_ms_is_ordered() {
        let a = UtcMillis::new(2000);
        let b = UtcMillis::new(1500);
        assert_eq!(a.diff_ms(b), 500);
        assert_eq!(b.diff_ms(a), -500);
        assert!(a > b);
    }
}
