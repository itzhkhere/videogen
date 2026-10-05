use napi_derive::napi;

#[napi]
pub fn init_platform() {
    // Call on the main Node thread before starting workers (common parent).
    deno_core::JsRuntime::init_platform(None);
}

#[napi]
pub fn deno_eval(source: String) -> napi::Result<String> {
    let result = (|| {
        let mut runtime = runtime_poc::Runtime::new()?;
        let value = runtime.eval(&source)?;
        runtime.drain_jobs()?;
        Ok::<_, deno_core::anyhow::Error>(value.to_string())
    })();
    result.map_err(|e| napi::Error::from_reason(format!("{e:#}")))
}

#[napi]
pub fn deno_smoke() -> napi::Result<String> {
    runtime_poc::smoke().map(|v|v.to_string())
        .map_err(|e|napi::Error::from_reason(format!("{e:#}")))
}

#[napi]
pub fn deno_bench(iterations: u32) -> napi::Result<String> {
    runtime_poc::bench(iterations).map(|v|v.to_string())
        .map_err(|e|napi::Error::from_reason(format!("{e:#}")))
}
