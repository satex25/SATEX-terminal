//! Data-point provenance — where a value came from and whether its side data is real.
//!
//! Constitution §3.2: *"Every data point carries provenance: timestamp (UTC, ms),
//! source, and a validity judgment. The current sources are exactly three:
//! Simulator (synthetic, SIM-badged), LiveMarket (Alpaca WS), ReplaySource
//! (recorded ticks)."*
//!
//! Two distinct concepts, kept distinct:
//! - [`Source`] — the feed a data point originated from (the SIM-badge ground truth).
//! - [`SideProvenance`] — whether a trade's aggressor side is genuine or inferred,
//!   ported verbatim from `shared/types.ts:38` (`provenance: 'real' | 'inferred'`).
//!
//! The §3.2 *validity judgment* (stale-vs-fresh) is intentionally **not** modeled
//! here: it is computed in the data plane from feed timing, so it lands in
//! `satex-data` (RS-3.4 ingestion law), not the kernel. Modeling it now would be
//! porting an intention rather than a value (RS-L1).

use crate::time::UtcMillis;

/// The feed a market data point originated from — the three runtime sources named
/// in constitution §3.2. This is the ground truth behind the renderer's SIM badge
/// (invariant §2.5.3: badges render only from the canonical gate, never inline).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Source {
    /// Synthetic feed (`Simulator`). Always SIM-badged; deterministic under a seed.
    Simulator,
    /// Authenticated Alpaca WebSocket feed (`LiveMarket`).
    Live,
    /// Recorded ticks played back (`ReplaySource`).
    Replay,
}

impl Source {
    /// `true` for [`Source::Simulator`] — the only synthetic source, and therefore the
    /// one the operator must always see badged. Live and replayed data are both real
    /// market observations (replay is recorded-real), so neither is synthetic.
    #[must_use]
    pub const fn is_synthetic(self) -> bool {
        matches!(self, Source::Simulator)
    }
}

/// Whether a trade's aggressor-side classification is genuine or inferred.
///
/// Verbatim port of `shared/types.ts:38` (`provenance: 'real' | 'inferred'`):
/// `Real` = SIP entitlement (live executed-trade side data), `Inferred` = sim / IEX
/// (side reconstructed, not authoritative). See `renderer/chart/webgl/footprint.ts:10`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SideProvenance {
    /// Authoritative side data from a SIP-entitled live feed.
    Real,
    /// Side data reconstructed from sim or IEX — not authoritative.
    Inferred,
}

/// The §3.2 provenance a data point carries: its [`Source`] and the instant it was
/// observed. (The validity judgment is computed downstream — see the module docs.)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Provenance {
    /// The feed the data point came from.
    pub source: Source,
    /// When the data point was observed, UTC milliseconds.
    pub observed_at: UtcMillis,
}

impl Provenance {
    /// Constructs a provenance record.
    #[must_use]
    pub const fn new(source: Source, observed_at: UtcMillis) -> Self {
        Self {
            source,
            observed_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_simulator_is_synthetic() {
        assert!(Source::Simulator.is_synthetic());
        assert!(!Source::Live.is_synthetic());
        assert!(!Source::Replay.is_synthetic());
    }

    #[test]
    fn provenance_carries_source_and_time() {
        let p = Provenance::new(Source::Replay, UtcMillis::new(1_700_000_000_000));
        assert_eq!(p.source, Source::Replay);
        assert_eq!(p.observed_at.as_millis(), 1_700_000_000_000);
        assert!(!p.source.is_synthetic());
    }

    #[test]
    fn side_provenance_variants_are_distinct() {
        assert_ne!(SideProvenance::Real, SideProvenance::Inferred);
    }
}
