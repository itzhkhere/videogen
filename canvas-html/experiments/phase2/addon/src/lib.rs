mod document;
use anyhow::{Result,bail,Context};
use document::Document;
use napi::{bindgen_prelude::Buffer,Error};
use napi_derive::napi;
use phase2_engine::DenoRuntime;
use phase2_host::{DomHost,ScriptRuntime};
use serde_json::{Value,json};
use std::{cell::RefCell,rc::Rc,thread::{self,ThreadId,JoinHandle},sync::{mpsc::{self,Sender,SyncSender},atomic::{AtomicUsize,AtomicBool,Ordering}}};

static OPEN:AtomicUsize=AtomicUsize::new(0);
static EXECUTION_THREADS:AtomicUsize=AtomicUsize::new(0);
static PLATFORM_INITIALIZED:AtomicBool=AtomicBool::new(false);
#[napi(object)]
pub struct ExperimentalOptions {pub width:u32,pub height:u32,pub epoch_ms:Option<f64>,pub eval_timeout_ms:Option<u32>}
struct Renderer {runtime:DenoRuntime,document:Rc<RefCell<Document>>,errors:Vec<String>,owner:ThreadId}
impl Renderer {
    fn remember<T>(&mut self,result:Result<T>)->Result<T>{if let Err(e)=&result{if self.errors.len()<256{self.errors.push(format!("{e:#}"));}}result}
    fn handle(&mut self,kind:Kind)->Result<Response>{
        if thread::current().id()!=self.owner{bail!("runtime thread ownership violation");}
        match kind {
            Kind::Eval(s)=>{let r=self.runtime.eval_json(&s);self.remember(r).map(Response::Json)},
            Kind::Seek(t)=>{let r=self.runtime.advance_to(t);self.remember(r).map(|_|Response::Done)},
            Kind::Render(png)=>{let r=self.runtime.drain_jobs();self.remember(r)?;let r=self.document.borrow_mut().render(png);self.remember(r).map(Response::Bytes)},
            Kind::Errors=>Ok(Response::Json(json!(self.errors))),
            Kind::Stats(gc)=>Ok(Response::Json(json!({"ownerThread":format!("{:?}",self.owner),"heap":self.runtime.heap_stats(gc)}))),
            Kind::Stop=>unreachable!("stop is handled outside renderer"),
        }
    }
}
enum Kind {Eval(String),Seek(f64),Render(bool),Errors,Stats(bool),Stop}
enum Response {Json(Value),Bytes(Vec<u8>),Done}
struct Command {kind:Kind,reply:SyncSender<Result<Response>>}
struct ThreadCount;
impl Drop for ThreadCount{fn drop(&mut self){EXECUTION_THREADS.fetch_sub(1,Ordering::SeqCst);}}
#[napi]
pub struct ExperimentalDenoRenderer {sender:Option<Sender<Command>>,thread:Option<JoinHandle<()>>,caller:ThreadId,runtime_owner:String}
impl ExperimentalDenoRenderer {
    fn request(&self,kind:Kind)->Result<Response>{
        let (reply,receive)=mpsc::sync_channel(1);
        self.sender.as_ref().context("renderer is closed")?.send(Command{kind,reply}).map_err(|_|anyhow::anyhow!("runtime thread disconnected"))?;
        receive.recv().context("runtime thread failed without a response")?
    }
    fn stop(&mut self)->Result<()> {
        if self.sender.is_none(){return Ok(());}
        let result=self.request(Kind::Stop);self.sender.take();
        let joined=self.thread.take().unwrap().join().map_err(|_|anyhow::anyhow!("runtime thread panicked"));
        OPEN.fetch_sub(1,Ordering::SeqCst);joined?;result?;Ok(())
    }
}
#[napi]
impl ExperimentalDenoRenderer {
    #[napi(constructor)]
    pub fn new(html:String,options:ExperimentalOptions)->napi::Result<Self>{
        let construct=||->Result<Self>{
            if !PLATFORM_INITIALIZED.load(Ordering::SeqCst){bail!("call initPlatform() on the Node main thread before creating renderers or workers");}
            if options.width==0||options.height==0||u64::from(options.width)*u64::from(options.height)>64_000_000{bail!("invalid viewport");}
            let epoch=options.epoch_ms.unwrap_or(0.0);if !epoch.is_finite()||epoch.abs()>8.64e15{bail!("invalid epochMs");}
            let timeout=options.eval_timeout_ms.unwrap_or(1000);if timeout==0||timeout>60_000{bail!("evalTimeoutMs must be 1..60000");}
            let (sender,receive)=mpsc::channel::<Command>();let (startup,started)=mpsc::sync_channel::<Result<String>>(1);
            // Only Send values cross this closure. JsRuntime, Rc, and Document are
            // constructed, used, and destroyed entirely on this owned thread.
            let thread=thread::Builder::new().name("deno-poc-renderer".into()).spawn(move||{
                EXECUTION_THREADS.fetch_add(1,Ordering::SeqCst);let _count=ThreadCount;
                let create=||->Result<Renderer>{
                    let document=Rc::new(RefCell::new(Document::new(&html,options.width,options.height)));
                    let host:Rc<RefCell<dyn DomHost>>=document.clone();let runtime=DenoRuntime::new(host,epoch,u64::from(timeout))?;
                    Ok(Renderer{runtime,document,errors:vec![],owner:thread::current().id()})
                };
                let mut r=match create(){Ok(r)=>r,Err(e)=>{let _=startup.send(Err(e));return;}};
                let _=startup.send(Ok(format!("{:?}",r.owner)));
                while let Ok(command)=receive.recv(){
                    if matches!(command.kind,Kind::Stop){drop(r);let _=command.reply.send(Ok(Response::Done));return;}
                    let result=r.handle(command.kind);let _=command.reply.send(result);
                }
                // A disconnected owner still drops the runtime on this thread.
            })?;
            let runtime_owner=match started.recv().context("runtime startup disconnected")?{Ok(owner)=>owner,Err(e)=>{let _=thread.join();return Err(e);}};
            OPEN.fetch_add(1,Ordering::SeqCst);
            Ok(Self{sender:Some(sender),thread:Some(thread),caller:thread::current().id(),runtime_owner})
        };construct().map_err(err)
    }
    #[napi]
    pub fn eval(&self,source:String)->napi::Result<Value>{match self.request(Kind::Eval(source)).map_err(err)?{Response::Json(v)=>Ok(v),_=>unreachable!()}}
    #[napi]
    pub fn seek(&self,milliseconds:f64)->napi::Result<()>{self.request(Kind::Seek(milliseconds)).map(|_|()).map_err(err)}
    #[napi]
    pub fn render(&self,png:Option<bool>)->napi::Result<Buffer>{match self.request(Kind::Render(png.unwrap_or(false))).map_err(err)?{Response::Bytes(v)=>Ok(v.into()),_=>unreachable!()}}
    #[napi]
    pub fn js_errors(&self)->napi::Result<Vec<String>>{match self.request(Kind::Errors).map_err(err)?{Response::Json(v)=>serde_json::from_value(v).map_err(|e|Error::from_reason(e.to_string())),_=>unreachable!()}}
    #[napi]
    pub fn stats(&self,collect:Option<bool>)->napi::Result<Value>{match self.request(Kind::Stats(collect.unwrap_or(false))).map_err(err)?{Response::Json(v)=>Ok(v),_=>unreachable!()}}
    #[napi]
    pub fn close(&mut self)->napi::Result<()>{self.stop().map_err(err)}
}
impl Drop for ExperimentalDenoRenderer {
    fn drop(&mut self){
        let had_runtime=self.sender.is_some();let result=self.stop();
        if let Err(e)=&result{eprintln!("PHASE2_CLEANUP_ERROR {e:#}");}
        if std::env::var_os("PHASE2_TRACE_DROPS").is_some(){eprintln!("PHASE2_DROP {}",json!({"hadRuntime":had_runtime,"owner":format!("{:?}",self.caller),"current":format!("{:?}",thread::current().id()),"runtimeOwner":self.runtime_owner,"cleanupError":result.err().map(|e|e.to_string()),"lifecycle":lifecycle_stats()}));}
    }
}
fn err(e:anyhow::Error)->Error{Error::from_reason(format!("{e:#}"))}
#[napi]
pub fn init_platform(){phase2_engine::init_platform();PLATFORM_INITIALIZED.store(true,Ordering::SeqCst);}
#[napi]
pub fn lifecycle_stats()->Value{json!({"engine":phase2_engine::counters(),"openRenderers":OPEN.load(Ordering::SeqCst),"executionThreads":EXECUTION_THREADS.load(Ordering::SeqCst),"wrongThreadDrops":0})}
#[napi]
pub fn native_memory()->Value{
    #[cfg(all(target_os="linux",target_env="gnu"))]
    {let m=unsafe{libc::mallinfo2()};json!({"allocator":"glibc mallinfo2","arena":m.arena,"allocated":m.uordblks,"freeInArenas":m.fordblks,"mapped":m.hblkhd,"mappedRegions":m.hblks})}
    #[cfg(not(all(target_os="linux",target_env="gnu")))]
    {json!({"allocator":"unavailable"})}
}
