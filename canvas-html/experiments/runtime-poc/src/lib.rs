use anyhow::{Result, bail};
use deno_core::{JsRuntime, OpState, RuntimeOptions, op2, v8};
use serde_json::Value;
use std::time::Instant;

#[derive(Default)]
struct HostState { now_ms: f64, mutations: Vec<Mutation> }

#[derive(Debug)]
pub enum MutationKind { Text, Style(String) }
#[derive(Debug)]
pub struct Mutation { pub id: String, pub kind: MutationKind, pub value: String }

#[op2(fast)]
fn op_poc_set_text(state: &mut OpState, #[string] id: String, #[string] value: String) {
    state.borrow_mut::<HostState>().mutations.push(Mutation {id,kind:MutationKind::Text,value});
}
#[op2(fast)]
fn op_poc_set_style(state: &mut OpState, #[string] id: String, #[string] property: String, #[string] value: String) {
    state.borrow_mut::<HostState>().mutations.push(Mutation {id,kind:MutationKind::Style(property),value});
}

#[op2(fast)]
fn op_now_ms(state: &mut OpState) -> f64 { state.borrow::<HostState>().now_ms }

#[op2(fast)]
fn op_poc_add(a: u32, b: u32) -> u32 { a.wrapping_add(b) }

deno_core::extension!(poc_host, ops = [op_now_ms, op_poc_add, op_poc_set_text, op_poc_set_style]);

// Each instance stays on the creating thread and is dropped there.
// No V8 handles or JsRuntime cross the N-API boundary.
pub struct Runtime { js: Option<JsRuntime>, executor: tokio::runtime::Runtime }

impl Runtime {
    pub fn new() -> Result<Self> {
        let executor = tokio::runtime::Builder::new_current_thread().build()?;
        let guard = executor.enter();
        let mut js = JsRuntime::try_new(RuntimeOptions {
            extensions: vec![poc_host::init()],
            ..Default::default()
        })?;
        js.op_state().borrow_mut().put(HostState::default());
        js.execute_script("poc-bootstrap.js", include_str!("clock.js"))?;
        drop(guard);
        Ok(Self { js: Some(js), executor })
    }
    pub fn eval(&mut self, source: &str) -> Result<Value> {
        let _guard = self.executor.enter();
        let js = self.js.as_mut().expect("runtime alive");
        let global = js.execute_script("poc-eval.js", source.to_owned())?;
        deno_core::scope!(scope, js);
        let local = v8::Local::new(scope, global);
        Ok(deno_core::serde_v8::from_v8(scope, local)?)
    }
    pub fn drain_jobs(&mut self) -> Result<()> {
        self.executor.block_on(
            self.js.as_mut().expect("runtime alive").run_event_loop(Default::default())
        )?;
        Ok(())
    }
    pub fn take_mutations(&mut self) -> Vec<Mutation> {
        std::mem::take(&mut self.js.as_ref().expect("runtime alive").op_state().borrow_mut().borrow_mut::<HostState>().mutations)
    }
    // Absolute, monotonic time. Fresh runtime is required for backward replay.
    pub fn advance_to(&mut self, target_ms: f64) -> Result<()> {
        let current = self.js.as_ref().expect("runtime alive").op_state().borrow().borrow::<HostState>().now_ms;
        if !target_ms.is_finite() || target_ms < current { bail!("invalid virtual time"); }
        self.drain_jobs()?;
        for _ in 0..100_000 {
            let next = self.eval("__pocClock.next()")?;
            let Some(deadline) = next.as_f64().filter(|d| *d <= target_ms) else {
                self.js.as_ref().expect("runtime alive").op_state().borrow_mut().borrow_mut::<HostState>().now_ms = target_ms;
                self.eval("__pocClock.frame(); null")?;
                self.drain_jobs()?;
                return Ok(());
            };
            self.js.as_ref().expect("runtime alive").op_state().borrow_mut().borrow_mut::<HostState>().now_ms = deadline;
            self.eval("__pocClock.tick(); null")?;
            self.drain_jobs()?;
        }
        bail!("timer budget exhausted")
    }
}

impl Drop for Runtime {
    fn drop(&mut self) {
        let _guard = self.executor.enter();
        drop(self.js.take());
    }
}

pub fn smoke() -> Result<Value> {
    let mut r = Runtime::new()?;
    assert_eq!(r.eval("1 + 2")?, 3);
    assert_eq!(r.eval("Deno.core.ops.op_poc_add(20, 22)")?, 42);
    assert_eq!(r.eval("performance.now()")?, 0);
    r.eval("globalThis.jobs=[]; Promise.resolve().then(()=>jobs.push('microtask')); null")?;
    r.drain_jobs()?;
    assert_eq!(r.eval("jobs")?, serde_json::json!(["microtask"]));
    r.eval("globalThis.events=[]; setTimeout(()=>{events.push(performance.now());setTimeout(()=>events.push(performance.now()),5)},10);setTimeout(()=>events.push('second'),10);requestAnimationFrame(t=>events.push(['raf',t])); null")?;
    r.advance_to(9.0)?;
    assert_eq!(r.eval("events")?, serde_json::json!([["raf",9]]));
    r.advance_to(16.6667)?;
    assert_eq!(r.eval("events")?, serde_json::json!([["raf",9],10,"second",15]));
    assert_eq!(r.eval("performance.now()")?, serde_json::json!(16.6667));
    assert_eq!(r.eval("Date.now()")?, serde_json::json!(16));
    assert!(r.advance_to(-1.0).is_err());
    Ok(serde_json::json!({"smoke":"passed","events":r.eval("events")?}))
}

pub fn bench(iterations: u32) -> Result<Value> {
    let start = Instant::now();
    let mut r = Runtime::new()?;
    let create_ms = start.elapsed().as_secs_f64()*1000.0;
    let start = Instant::now();
    for _ in 0..iterations { assert_eq!(r.eval("1 + 2")?, 3); }
    let eval_ms = start.elapsed().as_secs_f64()*1000.0;
    let start = Instant::now();
    assert_eq!(r.eval(&format!("(()=>{{let s=0;for(let i=0;i<{iterations};i++)s=Deno.core.ops.op_poc_add(s,1);return s}})()"))?, iterations);
    let host_loop_ms = start.elapsed().as_secs_f64()*1000.0;
    let start = Instant::now();
    assert_eq!(r.eval("(()=>{let s=0;for(let i=0;i<100000;i++)s+=i;return s})()")?.as_f64(), Some(4999950000.0));
    let arithmetic_ms = start.elapsed().as_secs_f64()*1000.0;
    let start = Instant::now();
    assert_eq!(r.eval("(()=>{let s=0;for(let i=0;i<10000;i++)s+=Date.now();return s})()")?, 0);
    let clock_loop_ms = start.elapsed().as_secs_f64()*1000.0;
    Ok(serde_json::json!({"iterations":iterations,"create_ms":create_ms,"eval_ms":eval_ms,"host_loop_ms":host_loop_ms,"arithmetic_ms":arithmetic_ms,"clock_loop_ms":clock_loop_ms}))
}
