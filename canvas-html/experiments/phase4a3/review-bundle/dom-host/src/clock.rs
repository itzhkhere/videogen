//! The deterministic clock contract. Visual time is owned by the host and only moves when the
//! renderer advances it; no adapter may read wall time for visual execution.

/// `Date.now() = floor(epochMs + visualTime)`, `performance.now() = visualTime`,
/// `performance.timeOrigin = epochMs`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ClockContract {
    pub epoch_ms: f64,
}

impl ClockContract {
    pub fn new(epoch_ms: f64) -> Self {
        Self { epoch_ms }
    }

    /// Integer milliseconds, like a browser's `Date.now()`.
    pub fn date_now(&self, visual_ms: f64) -> f64 {
        (self.epoch_ms + visual_ms).floor()
    }

    /// Fractional milliseconds since the origin.
    pub fn performance_now(&self, visual_ms: f64) -> f64 {
        visual_ms
    }

    pub fn time_origin(&self) -> f64 {
        self.epoch_ms
    }

    /// Validates an epoch given by an embedder.
    pub fn validate_epoch(epoch_ms: f64) -> Result<f64, String> {
        if epoch_ms.is_finite() && epoch_ms.abs() <= 8.64e15 {
            Ok(epoch_ms)
        } else {
            Err(format!("epochMs must be a finite time value, got {epoch_ms}"))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contract_values() {
        let c = ClockContract::new(12345.0);
        assert_eq!(c.date_now(0.0), 12345.0);
        assert_eq!(c.date_now(100.75), 12445.0);
        assert_eq!(c.performance_now(100.75), 100.75);
        assert_eq!(c.time_origin(), 12345.0);
        assert!(ClockContract::validate_epoch(f64::NAN).is_err());
    }
}
