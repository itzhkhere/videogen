//! Engine-neutral contracts; no layout or JavaScript engine dependencies.
use anyhow::Result;
use serde_json::Value;
pub trait DomHost {
    fn dispatch(&mut self, request: Value) -> Result<Value>;
    fn set_time(&mut self, milliseconds: f64);
}
pub trait ScriptRuntime {
    fn eval_json(&mut self, source: &str) -> Result<Value>;
    fn advance_to(&mut self, milliseconds: f64) -> Result<()>;
    fn drain_jobs(&mut self) -> Result<()>;
}
