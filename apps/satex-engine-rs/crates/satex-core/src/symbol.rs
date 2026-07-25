//! [`Symbol`] — a validated ticker newtype, plus the engine's crypto-ticker check.

use crate::error::CoreError;
use core::fmt;

/// A market symbol (ticker), guaranteed non-empty and trimmed.
///
/// The TS engine passes symbols as bare `string`s with no central validator, so this
/// newtype adds exactly one kernel invariant — non-empty after trimming — which is a
/// genuine degenerate guard (§2.5.8), not an invented canonical form. **Broker-specific
/// canonicalization is deliberately *not* here**: stripping `BTC/USD` → `BTC` is
/// Alpaca-resolver behavior (`services/alpaca/symbol-resolver.ts:36`) and belongs in
/// `satex-broker-alpaca`, not the kernel.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Symbol(String);

impl Symbol {
    /// Constructs a symbol, trimming surrounding whitespace.
    ///
    /// # Errors
    /// Returns [`CoreError::EmptySymbol`] if the input is empty or whitespace-only.
    pub fn new(raw: &str) -> Result<Self, CoreError> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(CoreError::EmptySymbol);
        }
        Ok(Self(trimmed.to_string()))
    }

    /// Borrows the symbol as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// `true` if this symbol is one of the known crypto tickers — see
    /// [`is_known_crypto_ticker`].
    #[must_use]
    pub fn is_known_crypto_ticker(&self) -> bool {
        is_known_crypto_ticker(&self.0)
    }
}

impl fmt::Display for Symbol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Verbatim port of the engine's localized crypto check at `trading-engine.ts:605`:
/// `/^(BTC|ETH|SOL|XRP|DOGE|ADA|AVAX|LINK|MATIC|ARB)$/i` — a full-string,
/// case-insensitive match against ten tickers.
///
/// **This is a fallback heuristic, not the canonical asset-class source.** The
/// authoritative crypto classification in the TS engine is watchlist metadata
/// (`entry?.assetClass === 'crypto'`, e.g. `ChartPanel.tsx:225`); this ticker list is
/// only used where that metadata is unavailable (chart backfill). Ported here for
/// faithfulness and pinned by test; callers with asset-class metadata must prefer it.
#[must_use]
pub fn is_known_crypto_ticker(symbol: &str) -> bool {
    matches!(
        symbol.to_ascii_uppercase().as_str(),
        "BTC" | "ETH" | "SOL" | "XRP" | "DOGE" | "ADA" | "AVAX" | "LINK" | "MATIC" | "ARB"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_blank() {
        assert_eq!(Symbol::new(""), Err(CoreError::EmptySymbol));
        assert_eq!(Symbol::new("   "), Err(CoreError::EmptySymbol));
        assert_eq!(Symbol::new("\t\n "), Err(CoreError::EmptySymbol));
    }

    #[test]
    fn trims_surrounding_whitespace() {
        assert_eq!(Symbol::new("  NVDA ").unwrap().as_str(), "NVDA");
        assert_eq!(Symbol::new("AAPL").unwrap().as_str(), "AAPL");
    }

    #[test]
    fn crypto_ticker_matches_ts_regex_all_ten_case_insensitive() {
        for t in [
            "BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "MATIC", "ARB",
        ] {
            assert!(is_known_crypto_ticker(t), "{t} should match");
            assert!(
                is_known_crypto_ticker(&t.to_lowercase()),
                "{t} lowercase should match"
            );
        }
    }

    #[test]
    fn crypto_ticker_rejects_equities_and_partials() {
        for t in [
            "NVDA", "AAPL", "BT", "BTCUSD", "BTC/USD", "ETHER", "", "XBTC",
        ] {
            assert!(!is_known_crypto_ticker(t), "{t} should NOT match");
        }
    }

    #[test]
    fn symbol_method_delegates_to_free_fn() {
        assert!(Symbol::new("btc").unwrap().is_known_crypto_ticker());
        assert!(!Symbol::new("nvda").unwrap().is_known_crypto_ticker());
    }
}
