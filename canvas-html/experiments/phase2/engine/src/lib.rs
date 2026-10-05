use anyhow::{Result, bail};
use deno_core::{JsRuntime, OpState, RuntimeOptions, op2, v8};
use deno_error::JsErrorBox;
use phase2_host::{DomHost, ScriptRuntime};
use serde_json::{Value, json};
use std::{cell::RefCell, rc::Rc, sync::{Arc, Mutex, Condvar, atomic::{AtomicUsize, Ordering}}, thread::{self, JoinHandle}, time::{Duration, Instant}};

static CREATED: AtomicUsize = AtomicUsize::new(0);
static DROPPED: AtomicUsize = AtomicUsize::new(0);
static WATCHDOGS: AtomicUsize = AtomicUsize::new(0);
struct State { now: f64, host: Rc<RefCell<dyn DomHost>> }
#[op2(fast)]
fn op_phase2_now(state: &mut OpState) -> f64 { state.borrow::<State>().now }
#[op2]
#[string]
fn op_phase2_dom(state: &mut OpState, #[string] request: String) -> Result<String, JsErrorBox> {
    let request=serde_json::from_str(&request).map_err(|e|JsErrorBox::generic(e.to_string()))?;
    let result=state.borrow::<State>().host.borrow_mut().dispatch(request).map_err(|e|JsErrorBox::generic(e.to_string()))?;
    serde_json::to_string(&result).map_err(|e|JsErrorBox::generic(e.to_string()))
}
deno_core::extension!(phase2_ops, ops=[op_phase2_now,op_phase2_dom]);

struct Deadline { until: Option<Instant>, expired: bool, stop: bool }
struct Watchdog { shared: Arc<(Mutex<Deadline>,Condvar)>, thread: Option<JoinHandle<()>> }
impl Watchdog {
    fn new(handle: v8::IsolateHandle) -> Result<Self> {
        let shared=Arc::new((Mutex::new(Deadline {until:None,expired:false,stop:false}),Condvar::new()));
        let other=shared.clone();
        let thread=thread::Builder::new().name("deno-poc-deadline".into()).spawn(move||{
            WATCHDOGS.fetch_add(1,Ordering::SeqCst);
            let (lock,cv)=&*other;let mut state=lock.lock().unwrap();
            loop {
                if state.stop {break;}
                if let Some(until)=state.until {
                    let now=Instant::now();
                    if now>=until {
                        state.until=None;state.expired=true;
                        // rusty_v8 documents IsolateHandle as Send+Sync and this operation as thread-safe.
                        handle.terminate_execution();
                    } else {state=cv.wait_timeout(state,until-now).unwrap().0;}
                } else {state=cv.wait(state).unwrap();}
            }
            WATCHDOGS.fetch_sub(1,Ordering::SeqCst);
        })?;
        Ok(Self{shared,thread:Some(thread)})
    }
    fn start(&self, timeout_ms:u64) {let (m,cv)=&*self.shared;let mut s=m.lock().unwrap();s.expired=false;s.until=Some(Instant::now()+Duration::from_millis(timeout_ms));cv.notify_one();}
    fn finish(&self)->bool {let (m,cv)=&*self.shared;let mut s=m.lock().unwrap();s.until=None;cv.notify_one();s.expired}
}
impl Drop for Watchdog {
    fn drop(&mut self) {
        let (m,cv)=&*self.shared;{let mut s=m.lock().unwrap();s.stop=true;s.until=None;cv.notify_one();}
        if let Some(t)=self.thread.take(){let _=t.join();}
    }
}

pub struct DenoRuntime {
    js: Option<JsRuntime>,
    executor: tokio::runtime::Runtime,
    watchdog: Option<Watchdog>,
    timeout_ms: u64,
    poisoned: bool,
}
impl DenoRuntime {
    pub fn new(host: Rc<RefCell<dyn DomHost>>, epoch_ms:f64,timeout_ms:u64)->Result<Self> {
        let executor=tokio::runtime::Builder::new_current_thread().build()?;
        let guard=executor.enter();
        let mut js=JsRuntime::try_new(RuntimeOptions{extensions:vec![phase2_ops::init()],..Default::default()})?;
        js.op_state().borrow_mut().put(State{now:0.0,host});
        js.execute_script("phase2-epoch.js",format!("globalThis.__phase2Epoch={epoch_ms};"))?;
        js.execute_script("phase2-bootstrap.js",include_str!("bootstrap.js"))?;
        let watchdog=Watchdog::new(js.v8_isolate().thread_safe_handle())?;
        drop(guard);CREATED.fetch_add(1,Ordering::SeqCst);
        Ok(Self{js:Some(js),executor,watchdog:Some(watchdog),timeout_ms,poisoned:false})
    }
    fn bounded<T>(&mut self, operation:impl FnOnce(&mut Self)->Result<T>)->Result<T> {
        if self.poisoned {bail!("renderer runtime is poisoned after execution timeout; close it");}
        self.watchdog.as_ref().unwrap().start(self.timeout_ms);
        let result=operation(self);
        if self.watchdog.as_ref().unwrap().finish() {self.poisoned=true;bail!("JavaScript execution timeout; renderer runtime is poisoned");}
        result
    }
    fn raw_eval(&mut self, source:&str)->Result<Value> {
        let _guard=self.executor.enter();let js=self.js.as_mut().unwrap();
        let global=js.execute_script("phase2-eval.js",source.to_owned())?;
        deno_core::scope!(scope,js);let local=v8::Local::new(scope,global);
        if local.is_undefined() {return Ok(Value::Null);}
        Ok(deno_core::serde_v8::from_v8(scope,local)?)
    }
    fn raw_drain(&mut self)->Result<()> {self.executor.block_on(self.js.as_mut().unwrap().run_event_loop(Default::default()))?;Ok(())}
    fn set_time(&mut self,t:f64) {
        let state=self.js.as_ref().unwrap().op_state();let mut state=state.borrow_mut();
        let state=state.borrow_mut::<State>();state.now=t;state.host.borrow_mut().set_time(t);
    }
    pub fn heap_stats(&mut self,collect:bool)->Value {
        let _guard=self.executor.enter();let isolate=self.js.as_mut().unwrap().v8_isolate();
        if collect {isolate.low_memory_notification();}
        let s=isolate.get_heap_statistics();
        json!({"totalHeap":s.total_heap_size(),"usedHeap":s.used_heap_size(),"physicalHeap":s.total_physical_size(),"external":s.external_memory(),"malloced":s.malloced_memory(),"contexts":s.number_of_native_contexts(),"globalHandles":s.used_global_handles_size(),"poisoned":self.poisoned})
    }
}
impl ScriptRuntime for DenoRuntime {
    fn eval_json(&mut self,source:&str)->Result<Value> {self.bounded(|r|{let v=r.raw_eval(source)?;r.raw_drain()?;Ok(v)})}
    fn drain_jobs(&mut self)->Result<()> {self.bounded(|r|r.raw_drain())}
    fn advance_to(&mut self,target:f64)->Result<()> {
        let current=self.js.as_ref().unwrap().op_state().borrow().borrow::<State>().now;
        if !target.is_finite()||target<current {bail!("seek requires finite monotonic time; backward replay needs a fresh renderer");}
        self.bounded(|r|{
            r.raw_drain()?;
            for _ in 0..100_000 {
                let next=r.raw_eval("__phase2Clock.next()")?;
                if let Some(t)=next.as_f64().filter(|t|*t<=target) {r.set_time(t);r.raw_eval("__phase2Clock.tick();null")?;r.raw_drain()?;}
                else {r.set_time(target);r.raw_eval("__phase2Clock.frame();null")?;r.raw_drain()?;return Ok(());}
            }
            bail!("timer callback budget exhausted")
        })
    }
}
impl Drop for DenoRuntime {
    fn drop(&mut self) {
        // Stop/join the deadline thread while the isolate is still alive.
        drop(self.watchdog.take());let _guard=self.executor.enter();drop(self.js.take());
        DROPPED.fetch_add(1,Ordering::SeqCst);
    }
}
pub fn counters()->Value {json!({"created":CREATED.load(Ordering::SeqCst),"dropped":DROPPED.load(Ordering::SeqCst),"watchdogs":WATCHDOGS.load(Ordering::SeqCst)})}
pub fn init_platform(){JsRuntime::init_platform(None);}
