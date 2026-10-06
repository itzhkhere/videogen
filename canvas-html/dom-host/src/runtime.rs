use std::fmt;

/// The boundary a script engine adapter implements. Values cross it as JSON: eval results
/// already travel to Node as JSON in both runtimes, and no engine value may outlive the call.
///
/// Scheduling contract (identical in every adapter):
/// - `advance_to(t)` moves visual time to the absolute, monotonic `t` (milliseconds). Timers
///   due on the way run in (deadline, insertion) order at their own deadline; microtasks drain
///   after every callback.
/// - `frame()` is the rendering step: requestAnimationFrame callbacks registered before it
///   starts run in registration order with `performance.now()` as their timestamp, then
///   microtasks drain. A render calls it right before style, layout and paint.
pub trait ScriptRuntime {
    fn eval(&mut self, source: &str) -> Result<serde_json::Value, ScriptError>;
    fn advance_to(&mut self, time_ms: f64) -> Result<(), ScriptError>;
    fn frame(&mut self) -> Result<(), ScriptError>;
    fn drain_jobs(&mut self) -> Result<(), ScriptError>;
    fn shutdown(&mut self) -> Result<(), ScriptError>;
}

#[derive(Clone, Debug, PartialEq)]
pub enum ScriptError {
    /// Script threw; the message includes the stack when the engine provides one.
    Thrown(String),
    /// The execution watchdog stopped the script; the runtime is poisoned.
    Timeout,
    /// The runtime was shut down.
    Closed,
    /// Time may not move backwards, and must be finite.
    InvalidTime(f64),
    /// Anything else (engine setup, budget exhaustion).
    Other(String),
}

impl fmt::Display for ScriptError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ScriptError::Thrown(m) => write!(f, "{m}"),
            ScriptError::Timeout => write!(f, "JavaScript execution timeout; the runtime is poisoned"),
            ScriptError::Closed => write!(f, "renderer is closed"),
            ScriptError::InvalidTime(t) => write!(f, "time must be finite and monotonic, got {t}"),
            ScriptError::Other(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for ScriptError {}
