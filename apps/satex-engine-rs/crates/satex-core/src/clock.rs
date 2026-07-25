//! [`Clock`] — the injected wall-clock seam (RS-0.7 determinism design).
//!
//! Every subsystem that needs "now" takes a `&dyn Clock` (or generic `C: Clock`) at
//! construction instead of calling the wall clock directly. Under replay/parity the
//! driver injects a [`SteppedClock`] pinned to the recorded tick timeline, so all the
//! `Date.now()`/`new Date()` sites the RS-0.6 audit classified as *needs-injection*
//! become deterministic for free. The **single sanctioned** `SystemTime::now()` read
//! in the entire workspace lives in [`SystemClock::now`]; everywhere else is denied
//! (the clippy `disallowed-methods` wall lands with the data plane).

use crate::time::UtcMillis;
use std::sync::atomic::{AtomicI64, Ordering};

/// Source of the current UTC instant. `Send + Sync` so it can be shared across the
/// tokio runtime's worker threads.
pub trait Clock: Send + Sync {
    /// Returns the current instant as [`UtcMillis`].
    fn now(&self) -> UtcMillis;
}

/// Production clock — reads the operating-system wall clock. This is the one place in
/// the workspace allowed to call [`std::time::SystemTime::now`].
#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> UtcMillis {
        // Duration since the epoch; a pre-epoch system clock (impossible in practice)
        // saturates to 0 rather than panicking — faithful to `Date.now()` never throwing.
        let since_epoch = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        // as_millis() is u128; real wall-clock ms fits in i64 until year 292 million.
        UtcMillis::new(i64::try_from(since_epoch.as_millis()).unwrap_or(i64::MAX))
    }
}

/// Test/replay clock that always returns the same instant. Useful for pinning a single
/// checkpoint or for constructors that read the clock exactly once.
#[derive(Debug, Clone, Copy)]
pub struct FixedClock(UtcMillis);

impl FixedClock {
    /// Constructs a clock frozen at `at`.
    #[must_use]
    pub const fn new(at: UtcMillis) -> Self {
        Self(at)
    }
}

impl Clock for FixedClock {
    fn now(&self) -> UtcMillis {
        self.0
    }
}

/// Replay clock: returns the current virtual time, advancing by a fixed step on each
/// read. This is the kernel half of the RS-0.7 fake-timer strategy — the golden-capture
/// driver and the parity harness set the start instant to a corpus session's first tick
/// and the step to the recorded tick cadence, making the whole engine's notion of "now"
/// a deterministic function of read count. Uses a single atomic `fetch_add` so it stays
/// correct even when shared across threads (the trait is `Sync`): no two reads can
/// observe the same instant. The counter wraps at `i64::MAX`, which is unreachable in
/// practice (millions of years past any real session start).
#[derive(Debug)]
pub struct SteppedClock {
    current_ms: AtomicI64,
    step_ms: i64,
}

impl SteppedClock {
    /// Creates a stepped clock starting at `start`, advancing `step_ms` per read.
    #[must_use]
    pub fn new(start: UtcMillis, step_ms: i64) -> Self {
        Self {
            current_ms: AtomicI64::new(start.as_millis()),
            step_ms,
        }
    }

    /// Overrides the virtual time (e.g. to pin it to a specific tick's timestamp
    /// before applying that tick). The next [`Clock::now`] returns this value, then
    /// advances by the step.
    pub fn set(&self, at: UtcMillis) {
        self.current_ms.store(at.as_millis(), Ordering::SeqCst);
    }
}

impl Clock for SteppedClock {
    fn now(&self) -> UtcMillis {
        // Atomically return the current instant and advance. `fetch_add` returns the
        // pre-add value — exactly "return now, then step" — with no read/write race.
        let before = self.current_ms.fetch_add(self.step_ms, Ordering::SeqCst);
        UtcMillis::new(before)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_clock_is_after_2020() {
        // 2020-01-01T00:00:00Z in ms. A sane wall clock is well past this.
        assert!(SystemClock.now().as_millis() > 1_577_836_800_000);
    }

    #[test]
    fn fixed_clock_is_constant() {
        let c = FixedClock::new(UtcMillis::new(42));
        assert_eq!(c.now().as_millis(), 42);
        assert_eq!(c.now().as_millis(), 42);
    }

    #[test]
    fn stepped_clock_advances_by_step() {
        let c = SteppedClock::new(UtcMillis::new(1000), 250);
        assert_eq!(c.now().as_millis(), 1000);
        assert_eq!(c.now().as_millis(), 1250);
        assert_eq!(c.now().as_millis(), 1500);
    }

    #[test]
    fn stepped_clock_set_repins() {
        let c = SteppedClock::new(UtcMillis::new(0), 1);
        c.set(UtcMillis::new(9000));
        assert_eq!(c.now().as_millis(), 9000);
        assert_eq!(c.now().as_millis(), 9001);
    }

    #[test]
    fn clock_is_object_safe() {
        let clocks: Vec<Box<dyn Clock>> = vec![
            Box::new(SystemClock),
            Box::new(FixedClock::new(UtcMillis::new(1))),
            Box::new(SteppedClock::new(UtcMillis::new(0), 1)),
        ];
        assert_eq!(clocks.len(), 3);
    }
}
