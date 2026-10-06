//! Experimental Deno/V8 renderer on canvas-html's shared DOM host (Phase 3).
//!
//! Model B from Phase 2: one owned execution thread per renderer. The `JsRuntime`, its
//! Tokio executor, the document and the painter are created, used and dropped on that thread;
//! only Rust-owned strings, numbers, JSON and pixel vectors cross the command channel.
mod document;

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{self, Sender, SyncSender};
use std::thread::{self, JoinHandle, ThreadId};

use anyhow::{Context, Result, bail};
use canvas_dom_host::{DomHost, HostDocument, ScriptError, ScriptRuntime};
use document::Document;
use napi::Error;
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use phase3_engine::DenoRuntime;
use serde_json::{Value, json};

static OPEN: AtomicUsize = AtomicUsize::new(0);
static EXECUTION_THREADS: AtomicUsize = AtomicUsize::new(0);
static PLATFORM_INITIALIZED: AtomicBool = AtomicBool::new(false);

#[napi(object)]
pub struct ExperimentalOptions {
    pub width: u32,
    pub height: u32,
    pub epoch_ms: Option<f64>,
    pub eval_timeout_ms: Option<u32>,
}

struct Renderer {
    runtime: DenoRuntime,
    document: Rc<RefCell<Document>>,
    errors: Vec<String>,
    owner: ThreadId,
    timings: Timings,
}

/// Cumulative nanoseconds per layer, for the Phase 3 cost breakdown.
#[derive(Default)]
struct Timings {
    frame_js: u128,
    layout: u128,
    paint: u128,
    renders: u64,
}

enum Kind {
    Eval(String),
    AdvanceTo(f64),
    Render(bool),
    Errors,
    Clock,
    Stats(bool),
    DropNode(String),
    Stop,
}
enum Response {
    Json(Value),
    Bytes(Vec<u8>),
    Done,
}
struct Command {
    kind: Kind,
    reply: SyncSender<Result<Response>>,
}

fn script(e: ScriptError) -> anyhow::Error {
    anyhow::anyhow!("{e}")
}

impl Renderer {
    fn collect_errors(&mut self) {
        for e in self.runtime.take_errors() {
            if self.errors.len() < 256 {
                self.errors.push(e);
            }
        }
    }

    fn handle(&mut self, kind: Kind) -> Result<Response> {
        if thread::current().id() != self.owner {
            bail!("runtime thread ownership violation");
        }
        let result = match kind {
            Kind::Eval(s) => self.runtime.eval(&s).map(Response::Json).map_err(script),
            Kind::AdvanceTo(t) => self.runtime.advance_to(t).map(|_| Response::Done).map_err(script),
            Kind::Render(png) => self.render(png).map(Response::Bytes),
            Kind::Errors => Ok(Response::Json(json!(self.errors))),
            Kind::Clock => Ok(Response::Json(json!(self.runtime.now()))),
            Kind::Stats(gc) => Ok(Response::Json(json!({
                "ownerThread": format!("{:?}", self.owner),
                "heap": self.runtime.heap_stats(gc),
                "bookkeeping": self.runtime.bookkeeping(),
                "timingsNs": {"frameJs": self.timings.frame_js as f64, "layout": self.timings.layout as f64, "paint": self.timings.paint as f64, "renders": self.timings.renders},
            }))),
            Kind::DropNode(selector) => {
                let mut doc = self.document.borrow_mut();
                let base = doc.base();
                let r: Result<bool, canvas_dom_host::DomError> = (|| {
                    let Some(node) = base.query_first(None, &selector)? else { return Ok(false) };
                    base.drop_node(node)?;
                    Ok(true)
                })();
                r.map(|b| Response::Json(json!(b))).map_err(|e| anyhow::anyhow!("{e}"))
            }
            Kind::Stop => unreachable!("stop is handled by the thread loop"),
        };
        self.collect_errors();
        if let Err(e) = &result {
            if e.to_string().contains("timeout") && self.errors.len() < 256 {
                self.errors.push(format!("{e:#}"));
            }
        }
        result
    }

    /// Same rendering step as the Boa renderer: rAF (frame) first, then style, layout, paint.
    fn render(&mut self, png: bool) -> Result<Vec<u8>> {
        let t0 = std::time::Instant::now();
        self.runtime.frame().map_err(script)?;
        let t1 = std::time::Instant::now();
        let now = self.runtime.now();
        let mut doc = self.document.borrow_mut();
        doc.resolve(now);
        let t2 = std::time::Instant::now();
        let out = doc.paint(png);
        let t3 = std::time::Instant::now();
        self.timings.frame_js += (t1 - t0).as_nanos();
        self.timings.layout += (t2 - t1).as_nanos();
        self.timings.paint += (t3 - t2).as_nanos();
        self.timings.renders += 1;
        out
    }
}

struct ThreadCount;
impl Drop for ThreadCount {
    fn drop(&mut self) {
        EXECUTION_THREADS.fetch_sub(1, Ordering::SeqCst);
    }
}

#[napi]
pub struct ExperimentalDenoRenderer {
    sender: Option<Sender<Command>>,
    thread: Option<JoinHandle<()>>,
    caller: ThreadId,
    runtime_owner: String,
}

impl ExperimentalDenoRenderer {
    fn request(&self, kind: Kind) -> Result<Response> {
        let (reply, receive) = mpsc::sync_channel(1);
        self.sender
            .as_ref()
            .context("renderer is closed")?
            .send(Command { kind, reply })
            .map_err(|_| anyhow::anyhow!("runtime thread disconnected"))?;
        receive.recv().context("runtime thread failed without a response")?
    }

    fn stop(&mut self) -> Result<()> {
        if self.sender.is_none() {
            return Ok(());
        }
        let result = self.request(Kind::Stop);
        self.sender.take();
        let joined = self.thread.take().unwrap().join().map_err(|_| anyhow::anyhow!("runtime thread panicked"));
        OPEN.fetch_sub(1, Ordering::SeqCst);
        joined?;
        result?;
        Ok(())
    }
}

fn json_of(r: Response) -> Value {
    match r {
        Response::Json(v) => v,
        _ => Value::Null,
    }
}

#[napi]
impl ExperimentalDenoRenderer {
    #[napi(constructor)]
    pub fn new(html: String, options: ExperimentalOptions) -> napi::Result<Self> {
        let construct = || -> Result<Self> {
            if !PLATFORM_INITIALIZED.load(Ordering::SeqCst) {
                bail!("call initPlatform() on the Node main thread before creating renderers or workers");
            }
            if options.width == 0 || options.height == 0 || u64::from(options.width) * u64::from(options.height) > 64_000_000 {
                bail!("invalid viewport");
            }
            let epoch = canvas_dom_host::clock::ClockContract::validate_epoch(options.epoch_ms.unwrap_or(0.0)).map_err(anyhow::Error::msg)?;
            let timeout = options.eval_timeout_ms.unwrap_or(1000);
            if timeout == 0 || timeout > 60_000 {
                bail!("evalTimeoutMs must be 1..60000");
            }
            let (sender, receive) = mpsc::channel::<Command>();
            let (startup, started) = mpsc::sync_channel::<Result<String>>(1);
            // Only Send values cross this closure. JsRuntime, Rc and Document are constructed,
            // used and destroyed entirely on this owned thread.
            let thread = thread::Builder::new().name("canvas-html-deno-renderer".into()).spawn(move || {
                EXECUTION_THREADS.fetch_add(1, Ordering::SeqCst);
                let _count = ThreadCount;
                let create = || -> Result<Renderer> {
                    let document = Rc::new(RefCell::new(Document::new(&html, options.width, options.height)));
                    let host: Rc<RefCell<dyn HostDocument>> = document.clone();
                    let runtime = DenoRuntime::new(host, epoch, u64::from(timeout))?;
                    // Stylo starts every animation at the first resolve: that instant is time 0.
                    document.borrow_mut().resolve(0.0);
                    Ok(Renderer { runtime, document, errors: vec![], owner: thread::current().id(), timings: Timings::default() })
                };
                let mut r = match create() {
                    Ok(r) => r,
                    Err(e) => {
                        let _ = startup.send(Err(e));
                        return;
                    }
                };
                let _ = startup.send(Ok(format!("{:?}", r.owner)));
                while let Ok(command) = receive.recv() {
                    if matches!(command.kind, Kind::Stop) {
                        let _ = r.runtime.shutdown();
                        drop(r);
                        let _ = command.reply.send(Ok(Response::Done));
                        return;
                    }
                    let result = r.handle(command.kind);
                    let _ = command.reply.send(result);
                }
                // A disconnected owner still drops the runtime on this thread.
            })?;
            let runtime_owner = match started.recv().context("runtime startup disconnected")? {
                Ok(owner) => owner,
                Err(e) => {
                    let _ = thread.join();
                    return Err(e);
                }
            };
            OPEN.fetch_add(1, Ordering::SeqCst);
            Ok(Self { sender: Some(sender), thread: Some(thread), caller: thread::current().id(), runtime_owner })
        };
        construct().map_err(err)
    }

    /// Indirect eval in the page; the result comes back through JSON (same protocol as Boa).
    #[napi]
    pub fn eval(&self, source: String) -> napi::Result<Value> {
        self.request(Kind::Eval(source)).map(json_of).map_err(err)
    }

    /// Move visual time to the absolute, monotonic `ms`, running due timers in order.
    #[napi]
    pub fn advance_to(&self, ms: f64) -> napi::Result<()> {
        self.request(Kind::AdvanceTo(ms)).map(|_| ()).map_err(err)
    }

    /// The rendering step (rAF, then style, layout, paint). RGBA, or PNG with `png = true`.
    #[napi]
    pub fn render(&self, png: Option<bool>) -> napi::Result<Buffer> {
        match self.request(Kind::Render(png.unwrap_or(false))).map_err(err)? {
            Response::Bytes(v) => Ok(v.into()),
            _ => Err(Error::from_reason("render produced no pixels")),
        }
    }

    #[napi]
    pub fn js_errors(&self) -> napi::Result<Vec<String>> {
        serde_json::from_value(self.request(Kind::Errors).map(json_of).map_err(err)?).map_err(|e| Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn clock_time(&self) -> napi::Result<f64> {
        Ok(self.request(Kind::Clock).map(json_of).map_err(err)?.as_f64().unwrap_or(0.0))
    }

    #[napi]
    pub fn stats(&self, collect: Option<bool>) -> napi::Result<Value> {
        self.request(Kind::Stats(collect.unwrap_or(false))).map(json_of).map_err(err)
    }

    /// Testing only: drop the native node matched by `selector` (see the Boa renderer).
    #[napi(js_name = "_dropNodeForTesting")]
    pub fn drop_node_for_testing(&self, selector: String) -> napi::Result<bool> {
        Ok(self.request(Kind::DropNode(selector)).map(json_of).map_err(err)?.as_bool().unwrap_or(false))
    }

    /// Idempotent. Drops V8, the document and the painter on the owner thread and joins it.
    #[napi]
    pub fn close(&mut self) -> napi::Result<()> {
        self.stop().map_err(err)
    }
}

impl Drop for ExperimentalDenoRenderer {
    fn drop(&mut self) {
        let had_runtime = self.sender.is_some();
        let result = self.stop();
        if let Err(e) = &result {
            eprintln!("PHASE3_CLEANUP_ERROR {e:#}");
        }
        if std::env::var_os("PHASE3_TRACE_DROPS").is_some() {
            eprintln!("PHASE3_DROP {}", json!({"hadRuntime":had_runtime,"owner":format!("{:?}",self.caller),"current":format!("{:?}",thread::current().id()),"runtimeOwner":self.runtime_owner,"cleanupError":result.err().map(|e|e.to_string()),"lifecycle":lifecycle_stats()}));
        }
    }
}

fn err(e: anyhow::Error) -> Error {
    Error::from_reason(format!("{e:#}"))
}

#[napi]
pub fn init_platform() {
    phase3_engine::init_platform();
    PLATFORM_INITIALIZED.store(true, Ordering::SeqCst);
}

#[napi]
pub fn lifecycle_stats() -> Value {
    json!({"engine":phase3_engine::counters(),"openRenderers":OPEN.load(Ordering::SeqCst),"executionThreads":EXECUTION_THREADS.load(Ordering::SeqCst),"wrongThreadDrops":0})
}

#[napi]
pub fn native_memory() -> Value {
    #[cfg(all(target_os = "linux", target_env = "gnu"))]
    {
        let m = unsafe { libc::mallinfo2() };
        json!({"allocator":"glibc mallinfo2","arena":m.arena,"allocated":m.uordblks,"freeInArenas":m.fordblks,"mapped":m.hblkhd,"mappedRegions":m.hblks})
    }
    #[cfg(not(all(target_os = "linux", target_env = "gnu")))]
    {
        json!({"allocator":"unavailable"})
    }
}
