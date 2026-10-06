// Phase 3 benchmark. kinds:
//   boa          production renderer of this checkout (Boa on the shared host)
//   boa-before   pre-Phase-3 production renderer (BOA_ADDON_PATH=<path to its .node>)
//   deno         Phase 3 Deno adapter on the shared host
//   deno-phase2  Phase 2 Deno prototype (its own JSON DomHost; rAF ran at seek)
// Same HTML, 160x64, Inter only. Five samples per warm workload; median reported.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {require,html,options,memory,gc,output} from './common.mjs';
const kind=process.argv[2];
const font=fs.readFileSync(new URL('../../../test/assets/Inter-Regular.otf',import.meta.url));
const gsapSource=fs.readFileSync(new URL('../../../test/assets/gsap.min.js',import.meta.url),'utf8');
let addon,create,close=(r)=>{},advance,stats=()=>null,rpc=null;
if(kind.startsWith('boa')){
 const {HtmlRenderer}=require(kind==='boa'?'../../../index.js':process.env.BOA_ADDON_PATH);
 create=()=>{const r=new HtmlRenderer({...options,scripts:true,systemFonts:false});r.registerFont(font);r.load(html);return r;};
 close=(r)=>r.close?.();advance=(r,ms)=>r.advanceClock(ms);rpc=(r)=>r.clockTime;
}else{
 addon=require(kind==='deno'?'../addon.node':'../../phase2/addon.node');addon.initPlatform();const R=addon.ExperimentalDenoRenderer;
 // Absolute visual time is per renderer.
 const clock=new WeakMap();create=()=>{const r=new R(html,options);clock.set(r,0);return r;};close=(r)=>r.close();
 advance=(r,ms)=>{const t=clock.get(r)+ms;clock.set(r,t);kind==='deno'?r.advanceTo(t):r.seek(t);};
 stats=(r)=>r.stats();if(kind==='deno')rpc=(r)=>r.clockTime();
}
const results={},points=[memory('addon loaded',addon)];
function measure(name,count,fn,extra){for(let i=0;i<Math.min(count,30);i++)fn(i);const samples=[];for(let run=0;run<5;run++){const t=performance.now();for(let i=0;i<count;i++)fn(i);samples.push((performance.now()-t)/count);}const sorted=[...samples].sort((a,b)=>a-b);results[name]={unit:'ms/op',operationsPerSample:count,samples,median:sorted[2],min:sorted[0],max:sorted[4],...extra};}
const constructors=[],firstEvals=[];for(let i=0;i<30;i++){let t=performance.now();let r=create();constructors.push(performance.now()-t);t=performance.now();assert.equal(r.eval('1+2'),3);firstEvals.push(performance.now()-t);close(r);r=null;await gc();}
const distribution=(v)=>({unit:'ms/op',samples:v,median:[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)],first:v[0]});
results.construction=distribution(constructors);results.firstEval=distribution(firstEvals);
let r=create();r.eval('globalThis.b=document.querySelector("#box");globalThis.n=0;globalThis.plain={style:{}};null');for(let i=0;i<200;i++)r.eval('1+2');
measure('warmEval',1000,()=>r.eval('1+2'));
if(rpc)measure('rpcNoJs',1000,()=>rpc(r),{note:'Boa: clockTime getter (no JS). Deno: clockTime() channel round trip (no JS).'});
const loop='(()=>{let sum=0;for(let i=0;i<100000;i++)sum+=i;return sum})()';for(let i=0;i<30;i++)r.eval(loop);assert.equal(r.eval(loop),4999950000);measure('jsLoop100k',30,()=>r.eval(loop));
// Same loop shape with plain JS objects: the JS-execution share of the DOM workloads below.
measure('js100PlainAssignments',10,()=>r.eval('(()=>{for(let i=0;i<100;i++){plain.style.width=(16+i%16)+"px";plain.style.opacity=String(0.5+(i%5)/10);}return plain.style.width})()'));
measure('dom100Mutations',10,()=>r.eval('(()=>{for(let i=0;i<100;i++){b.style.width=(16+i%16)+"px";b.style.opacity=String(0.5+(i%5)/10);}return b.style.width})()'));
measure('querySelector100',10,()=>r.eval('(()=>{let x;for(let i=0;i<100;i++)x=document.querySelector("#box");return x===b})()'));
measure('querySelectorAll100',10,()=>r.eval('(()=>{let x;for(let i=0;i<100;i++)x=document.querySelectorAll("div");return x.length})()'));
measure('getComputedStyle100',10,()=>r.eval('(()=>{let x;for(let i=0;i<100;i++)x=getComputedStyle(b).opacity;return x})()'),{note:'each read resolves style/layout first (clean document after the first)'});
measure('getComputedStyleAfterMutation100',10,()=>r.eval('(()=>{let x;for(let i=0;i<100;i++){b.style.width=(16+i%16)+"px";x=getComputedStyle(b).width;}return x})()'),{note:'mutation then layout-dependent read: one restyle+relayout per iteration'});
measure('getBoundingClientRect100',10,()=>r.eval('(()=>{let x;for(let i=0;i<100;i++)x=b.getBoundingClientRect().width;return x})()'));
measure('seek',1000,()=>advance(r,1));
const before=stats(r);
measure('render',100,()=>r.render());
const after=stats(r);
if(before&&before.timingsNs){const n=after.timingsNs.renders-before.timingsNs.renders;results.renderBreakdown={unit:'ms/op',renders:n,frameJs:(after.timingsNs.frameJs-before.timingsNs.frameJs)/n/1e6,layout:(after.timingsNs.layout-before.timingsNs.layout)/n/1e6,paint:(after.timingsNs.paint-before.timingsNs.paint)/n/1e6,note:'inside the renderer thread; render minus these = channel + Buffer'};}
measure('seekAndRender',100,()=>{advance(r,1);r.render();});
points.push(memory('one live renderer after benchmark',addon,kind==='deno'?[r]:[]));close(r);r=null;await gc();
// GSAP frame: unpaused tween driven by virtual time only (rAF at render for boa/deno; at seek for deno-phase2)
r=create();r.eval(gsapSource+'\n;globalThis.tw=gsap.to("#box",{x:100,opacity:0.5,duration:1000,ease:"none"});gsap.ticker.lagSmoothing(0);null');
measure('gsapFrame',100,()=>{advance(r,1000/60);r.render();},{note:'advance 1/60 s + render, GSAP ticker + CSSPlugin writes + layout + paint'});
results.gsapFrameCheck=r.eval('gsap.getProperty(document.querySelector("#box"),"x")');close(r);r=null;await gc();
points.push(memory('after cleanup',addon));
output({kind,node:process.version,results,points});
