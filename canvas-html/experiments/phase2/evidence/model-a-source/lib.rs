mod document;
use anyhow::{Result,bail};
use document::Document;
use napi::{bindgen_prelude::Buffer,Error};
use napi_derive::napi;
use phase2_engine::DenoRuntime;
use phase2_host::{DomHost,ScriptRuntime};
use serde_json::{Value,json};
use std::{cell::RefCell,rc::Rc,thread::{self,ThreadId},sync::atomic::{AtomicUsize,Ordering}};

static WRONG_THREAD_DROPS:AtomicUsize=AtomicUsize::new(0);
static OPEN:AtomicUsize=AtomicUsize::new(0);
#[napi(object)]
pub struct ExperimentalOptions {pub width:u32,pub height:u32,pub epoch_ms:Option<f64>,pub eval_timeout_ms:Option<u32>}
struct Renderer {
    runtime:DenoRuntime,
    document:Rc<RefCell<Document>>,
    errors:Vec<String>,
}
impl Renderer {
    fn remember<T>(&mut self,result:Result<T>)->Result<T>{if let Err(e)=&result{if self.errors.len()<256{self.errors.push(format!("{e:#}"));}}result}
}
#[napi]
pub struct ExperimentalDenoRenderer {owner:ThreadId,inner:Option<Renderer>}
impl ExperimentalDenoRenderer {
    fn inner(&mut self)->Result<&mut Renderer>{
        if thread::current().id()!=self.owner{bail!("wrong thread: renderer must remain on its constructor thread");}
        self.inner.as_mut().ok_or_else(||anyhow::anyhow!("renderer is closed"))
    }
}
#[napi]
impl ExperimentalDenoRenderer {
    #[napi(constructor)]
    pub fn new(html:String,options:ExperimentalOptions)->napi::Result<Self>{
        let construct=||->Result<Self>{
            if options.width==0||options.height==0||u64::from(options.width)*u64::from(options.height)>64_000_000{bail!("invalid viewport");}
            let epoch=options.epoch_ms.unwrap_or(0.0);if !epoch.is_finite()||epoch.abs()>8.64e15{bail!("invalid epochMs");}
            let timeout=options.eval_timeout_ms.unwrap_or(1000);if timeout==0||timeout>60_000{bail!("evalTimeoutMs must be 1..60000");}
            let document=Rc::new(RefCell::new(Document::new(&html,options.width,options.height)));
            let host:Rc<RefCell<dyn DomHost>>=document.clone();
            let runtime=DenoRuntime::new(host,epoch,u64::from(timeout))?;
            OPEN.fetch_add(1,Ordering::SeqCst);
            Ok(Self{owner:thread::current().id(),inner:Some(Renderer{runtime,document,errors:vec![]})})
        };
        construct().map_err(err)
    }
    #[napi]
    pub fn eval(&mut self,source:String)->napi::Result<Value>{
        let r=self.inner().map_err(err)?;let result=r.runtime.eval_json(&source);r.remember(result).map_err(err)
    }
    #[napi]
    pub fn seek(&mut self,milliseconds:f64)->napi::Result<()>{
        let r=self.inner().map_err(err)?;let result=r.runtime.advance_to(milliseconds);r.remember(result).map_err(err)
    }
    #[napi]
    pub fn render(&mut self,png:Option<bool>)->napi::Result<Buffer>{
        let r=self.inner().map_err(err)?;let result=r.runtime.drain_jobs();r.remember(result).map_err(err)?;
        let result=r.document.borrow_mut().render(png.unwrap_or(false));r.remember(result).map(Buffer::from).map_err(err)
    }
    #[napi]
    pub fn js_errors(&mut self)->napi::Result<Vec<String>>{Ok(self.inner().map_err(err)?.errors.clone())}
    #[napi]
    pub fn stats(&mut self,collect:Option<bool>)->napi::Result<Value>{
        let owner=format!("{:?}",self.owner);let r=self.inner().map_err(err)?;
        Ok(json!({"ownerThread":owner,"heap":r.runtime.heap_stats(collect.unwrap_or(false))}))
    }
    #[napi]
    pub fn close(&mut self)->napi::Result<()>{
        if thread::current().id()!=self.owner{return Err(Error::from_reason("wrong thread"));}
        if self.inner.take().is_some(){OPEN.fetch_sub(1,Ordering::SeqCst);}Ok(())
    }
}
impl Drop for ExperimentalDenoRenderer {
    fn drop(&mut self){
        let had_runtime=self.inner.is_some();
        if let Some(inner)=self.inner.take(){
            if thread::current().id()==self.owner{drop(inner);OPEN.fetch_sub(1,Ordering::SeqCst);}
            else {
                // Never invoke or drop V8 on a foreign thread. This exceptional leak is
                // counted as a failed lifecycle gate, not treated as successful cleanup.
                WRONG_THREAD_DROPS.fetch_add(1,Ordering::SeqCst);std::mem::forget(inner);
            }
        }
        if std::env::var_os("PHASE2_TRACE_DROPS").is_some(){eprintln!("PHASE2_DROP {}",json!({"hadRuntime":had_runtime,"owner":format!("{:?}",self.owner),"current":format!("{:?}",thread::current().id()),"lifecycle":lifecycle_stats()}));}
    }
}
fn err(e:anyhow::Error)->Error{Error::from_reason(format!("{e:#}"))}
#[napi]
pub fn init_platform(){phase2_engine::init_platform();}
#[napi]
pub fn lifecycle_stats()->Value{json!({"engine":phase2_engine::counters(),"openRenderers":OPEN.load(Ordering::SeqCst),"wrongThreadDrops":WRONG_THREAD_DROPS.load(Ordering::SeqCst)})}
#[napi]
pub fn native_memory()->Value{
    #[cfg(all(target_os="linux",target_env="gnu"))]
    {
        // glibc process-wide allocation counts, not current RSS and not all mmap regions.
        let m=unsafe{libc::mallinfo2()};
        json!({"allocator":"glibc mallinfo2","arena":m.arena,"allocated":m.uordblks,"freeInArenas":m.fordblks,"mapped":m.hblkhd,"mappedRegions":m.hblks})
    }
    #[cfg(not(all(target_os="linux",target_env="gnu")))]
    {json!({"allocator":"unavailable"})}
}
