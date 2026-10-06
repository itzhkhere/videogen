//! Experimental Deno/V8 adapter for canvas-html's shared DOM host.
//!
//! Everything here runs on the renderer's owner thread (see the addon): the `JsRuntime`,
//! the Tokio current-thread executor, the op state with the host state, and every V8 handle.
//! The deadline thread only holds V8's thread-safe `IsolateHandle`.

mod ops;

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use canvas_dom_host::clock::ClockContract;
use canvas_dom_host::{ScriptError, ScriptRuntime};
use deno_core::{JsRuntime, RuntimeOptions, v8};
use serde_json::{Value, json};

pub use canvas_dom_host::HostDocument;
pub use ops::HostState;

static CREATED: AtomicUsize = AtomicUsize::new(0);
static DROPPED: AtomicUsize = AtomicUsize::new(0);
static WATCHDOGS: AtomicUsize = AtomicUsize::new(0);

/// Same safety valve as the Boa renderer (`MAX_TIMER_RUNS`).
const MAX_TIMER_RUNS: usize = 100_000;

struct Deadline {
    until: Option<Instant>,
    expired: bool,
    stop: bool,
}

struct Watchdog {
    shared: Arc<(Mutex<Deadline>, Condvar)>,
    thread: Option<JoinHandle<()>>,
}

impl Watchdog {
    fn new(handle: v8::IsolateHandle) -> anyhow::Result<Self> {
        let shared = Arc::new((Mutex::new(Deadline { until: None, expired: false, stop: false }), Condvar::new()));
        let other = shared.clone();
        let thread = thread::Builder::new().name("canvas-html-deno-deadline".into()).spawn(move || {
            WATCHDOGS.fetch_add(1, Ordering::SeqCst);
            let (lock, cv) = &*other;
            let mut state = lock.lock().unwrap();
            loop {
                if state.stop {
                    break;
                }
                if let Some(until) = state.until {
                    let now = Instant::now();
                    if now >= until {
                        state.until = None;
                        state.expired = true;
                        // rusty_v8 documents IsolateHandle as Send + Sync and this call as thread-safe.
                        handle.terminate_execution();
                    } else {
                        state = cv.wait_timeout(state, until - now).unwrap().0;
                    }
                } else {
                    state = cv.wait(state).unwrap();
                }
            }
            WATCHDOGS.fetch_sub(1, Ordering::SeqCst);
        })?;
        Ok(Self { shared, thread: Some(thread) })
    }

    fn start(&self, timeout_ms: u64) {
        let (m, cv) = &*self.shared;
        let mut s = m.lock().unwrap();
        s.expired = false;
        s.until = Some(Instant::now() + Duration::from_millis(timeout_ms));
        cv.notify_one();
    }

    fn finish(&self) -> bool {
        let (m, cv) = &*self.shared;
        let mut s = m.lock().unwrap();
        s.until = None;
        cv.notify_one();
        s.expired
    }
}

impl Drop for Watchdog {
    fn drop(&mut self) {
        let (m, cv) = &*self.shared;
        {
            let mut s = m.lock().unwrap();
            s.stop = true;
            s.until = None;
            cv.notify_one();
        }
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

/// The Deno/V8 script runtime of one renderer. Not `Send`: it is created, used and dropped
/// on the renderer's owner thread.
pub struct DenoRuntime {
    js: Option<JsRuntime>,
    executor: tokio::runtime::Runtime,
    watchdog: Option<Watchdog>,
    timeout_ms: u64,
    poisoned: bool,
    closed: bool,
}

fn thrown(e: impl std::fmt::Display) -> ScriptError {
    ScriptError::Thrown(format!("{e:#}"))
}

impl DenoRuntime {
    pub fn new(doc: Rc<RefCell<dyn HostDocument>>, epoch_ms: f64, timeout_ms: u64) -> anyhow::Result<Self> {
        let executor = tokio::runtime::Builder::new_current_thread().build()?;
        let guard = executor.enter();
        let mut js = JsRuntime::try_new(RuntimeOptions { extensions: vec![ops::canvas_dom_host_ops::init()], ..Default::default() })?;
        js.op_state().borrow_mut().put(HostState {
            now: 0.0,
            clock: ClockContract::new(epoch_ms),
            doc,
            listeners: Default::default(),
            timers: Default::default(),
            intervals: Default::default(),
            errors: Vec::new(),
        });
        js.execute_script("canvas-html-deno-bootstrap.js", include_str!("bootstrap.js"))?;
        let watchdog = Watchdog::new(js.v8_isolate().thread_safe_handle())?;
        drop(guard);
        CREATED.fetch_add(1, Ordering::SeqCst);
        Ok(Self { js: Some(js), executor, watchdog: Some(watchdog), timeout_ms, poisoned: false, closed: false })
    }

    fn bounded<T>(&mut self, operation: impl FnOnce(&mut Self) -> Result<T, ScriptError>) -> Result<T, ScriptError> {
        if self.closed {
            return Err(ScriptError::Closed);
        }
        if self.poisoned {
            return Err(ScriptError::Other("renderer runtime is poisoned after an execution timeout; close it".into()));
        }
        self.watchdog.as_ref().unwrap().start(self.timeout_ms);
        let result = operation(self);
        if self.watchdog.as_ref().unwrap().finish() {
            self.poisoned = true;
            return Err(ScriptError::Timeout);
        }
        result
    }

    /// Run a script and convert its completion value with serde_v8.
    fn raw_eval(&mut self, name: &'static str, source: String) -> Result<Value, ScriptError> {
        let _guard = self.executor.enter();
        let js = self.js.as_mut().unwrap();
        let global = js.execute_script(name, source).map_err(thrown)?;
        deno_core::scope!(scope, js);
        let local = v8::Local::new(scope, global);
        if local.is_undefined() {
            return Ok(Value::Null);
        }
        deno_core::serde_v8::from_v8(scope, local).map_err(thrown)
    }

    fn raw_drain(&mut self) -> Result<(), ScriptError> {
        self.executor
            .block_on(self.js.as_mut().unwrap().run_event_loop(Default::default()))
            .map_err(thrown)
    }

    fn state<R>(&mut self, f: impl FnOnce(&mut HostState) -> R) -> R {
        let state = self.js.as_ref().unwrap().op_state();
        let mut state = state.borrow_mut();
        f(state.borrow_mut::<HostState>())
    }

    pub fn now(&mut self) -> f64 {
        self.state(|s| s.now)
    }

    pub fn take_errors(&mut self) -> Vec<String> {
        if self.js.is_none() {
            return Vec::new();
        }
        self.state(|s| std::mem::take(&mut s.errors))
    }

    pub fn record_error(&mut self, message: String) {
        if self.js.is_some() {
            self.state(|s| s.record_error(message));
        }
    }

    pub fn heap_stats(&mut self, collect: bool) -> Value {
        let Some(js) = self.js.as_mut() else { return json!({"closed": true}) };
        let _guard = self.executor.enter();
        let isolate = js.v8_isolate();
        if collect {
            isolate.low_memory_notification();
        }
        let s = isolate.get_heap_statistics();
        json!({"totalHeap":s.total_heap_size(),"usedHeap":s.used_heap_size(),"external":s.external_memory(),"contexts":s.number_of_native_contexts(),"globalHandles":s.used_global_handles_size(),"poisoned":self.poisoned})
    }

    /// Listener and wrapper bookkeeping, for lifetime audits.
    pub fn bookkeeping(&mut self) -> Value {
        if self.closed || self.poisoned {
            return Value::Null;
        }
        let listeners = self.state(|s| s.listeners.len());
        let js = self.bounded(|r| r.raw_eval("canvas-html-stats.js", "__canvasHtml.stats()".into())).unwrap_or(Value::Null);
        json!({"hostListeners": listeners, "js": js})
    }
}

impl ScriptRuntime for DenoRuntime {
    /// Indirect eval of `source` (same scoping as the Boa renderer's eval), JSON result.
    fn eval(&mut self, source: &str) -> Result<Value, ScriptError> {
        let call = format!("__canvasHtml.evalJson({})", serde_json::to_string(source).unwrap());
        self.bounded(|r| {
            let text = r.raw_eval("canvas-html-eval.js", call)?;
            r.raw_drain()?;
            let text = text.as_str().ok_or_else(|| ScriptError::Other("eval produced no result".into()))?;
            let v: Value = serde_json::from_str(text).map_err(|e| ScriptError::Other(format!("eval result: {e}")))?;
            if let Some(err) = v.get("error") {
                return Err(ScriptError::Thrown(err.as_str().unwrap_or("error").to_string()));
            }
            Ok(v.get("ok").cloned().unwrap_or(Value::Null))
        })
    }

    fn drain_jobs(&mut self) -> Result<(), ScriptError> {
        self.bounded(|r| r.raw_drain())
    }

    /// Timers due up to `target` run at their own deadline in (deadline, insertion) order,
    /// draining microtasks after each; then time rests at `target`.
    fn advance_to(&mut self, target: f64) -> Result<(), ScriptError> {
        if self.closed {
            return Err(ScriptError::Closed);
        }
        let current = self.now();
        if !target.is_finite() || target < current {
            return Err(ScriptError::InvalidTime(target));
        }
        self.bounded(|r| {
            r.raw_drain()?;
            for _ in 0..MAX_TIMER_RUNS {
                let due = r.state(|s| {
                    let (id, deadline) = s.timers.pop_due(target)?;
                    if let Some(interval) = s.intervals.get(&id.0).copied() {
                        s.timers.reschedule(id, deadline + interval.max(1.0));
                    }
                    s.now = s.now.max(deadline);
                    Some(id)
                });
                match due {
                    Some(id) => {
                        r.raw_eval("canvas-html-timer.js", format!("__canvasHtml.runTimer({})", id.0))?;
                        r.raw_drain()?;
                    }
                    None => {
                        r.state(|s| s.now = target);
                        r.raw_drain()?;
                        return Ok(());
                    }
                }
            }
            Err(ScriptError::Other(format!("more than {MAX_TIMER_RUNS} timer callbacks: does the page schedule 0 ms timers in a loop?")))
        })
    }

    /// The rendering step: requestAnimationFrame callbacks, then microtasks.
    fn frame(&mut self) -> Result<(), ScriptError> {
        self.bounded(|r| {
            r.raw_eval("canvas-html-frame.js", "__canvasHtml.frame()".into())?;
            r.raw_drain()
        })
    }

    /// Drop the isolate on this (owner) thread. Idempotent.
    fn shutdown(&mut self) -> Result<(), ScriptError> {
        if self.closed {
            return Ok(());
        }
        self.closed = true;
        // Stop and join the deadline thread while the isolate is still alive.
        drop(self.watchdog.take());
        let _guard = self.executor.enter();
        drop(self.js.take());
        DROPPED.fetch_add(1, Ordering::SeqCst);
        Ok(())
    }
}

impl Drop for DenoRuntime {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

pub fn counters() -> Value {
    json!({"created":CREATED.load(Ordering::SeqCst),"dropped":DROPPED.load(Ordering::SeqCst),"watchdogs":WATCHDOGS.load(Ordering::SeqCst)})
}

pub fn init_platform() {
    JsRuntime::init_platform(None);
}
