//! [`CoreError`] — the kernel error taxonomy.
//!
//! Deliberately small: broker, IPC, and persistence errors live in their own crates.
//! This holds only the failure modes the kernel primitives can produce. Hand-rolled
//! (no `thiserror`) to keep `satex-core` dependency-free (D-012).

use core::fmt;

/// Errors produced by `satex-core` primitives.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum CoreError {
    /// A [`crate::Symbol`] was constructed from an empty or whitespace-only string.
    /// Ports the degenerate-input guard spirit of constitution invariant §2.5.8.
    EmptySymbol,
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CoreError::EmptySymbol => write!(f, "symbol must not be empty or whitespace-only"),
        }
    }
}

impl std::error::Error for CoreError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_is_human_readable() {
        assert_eq!(
            CoreError::EmptySymbol.to_string(),
            "symbol must not be empty or whitespace-only"
        );
    }

    #[test]
    fn is_std_error() {
        fn assert_error<E: std::error::Error>(_: &E) {}
        assert_error(&CoreError::EmptySymbol);
    }
}
