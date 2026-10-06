import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load,html,options,hash,memory,output,gc} from './common.mjs';
const mode=process.argv[2],before=memory('baseline Node');const a=load(),R=a.ExperimentalDenoRenderer;
const points=[before,memory('addon loaded',a)];
function instance(o={}){return new R(html,{...options,...o});}
function work(r){r.eval('globalThis.count=0;globalThis.box=document.getElementById("box");box.style.opacity="0.8";null');for(const t of [0,5,10]){r.eval('count++;box.style.width=(16+count)+"px";null');r.advanceTo(t);assert.equal(r.render().length,options.width*options.height*4);}assert.equal(r.eval('count'),3);}
function clean(){const s=a.lifecycleStats();assert.equal(s.openRenderers,0);assert.equal(s.wrongThreadDrops,0);assert.equal(s.engine.created,s.engine.dropped);assert.equal(s.engine.watchdogs,0);assert.equal(s.executionThreads,0);return s;}
let result={mode,points};
if(mode==='contracts'){
 // Runtime lifecycle contracts (DOM/time contracts are in ../contract and run on both engines)
 const r=instance();assert.throws(()=>r.eval('throw new Error("ordinary")'),/ordinary/);assert.equal(r.eval('6*7'),42);
 assert.throws(()=>r.advanceTo(-1),/monotonic|finite/);r.close();r.close();assert.throws(()=>r.eval('1'),/closed/);
 const timeout=instance({evalTimeoutMs:100});const start=performance.now();assert.throws(()=>timeout.eval('while(true){}'),/timeout/);result.timeoutMs=performance.now()-start;assert.throws(()=>timeout.render(),/poisoned/);assert.ok(timeout.jsErrors().some(e=>/timeout/.test(e)));timeout.close();
 const promiseTimeout=instance({evalTimeoutMs:100});assert.throws(()=>promiseTimeout.eval('Promise.resolve().then(()=>{while(true){}});null'),/timeout/);promiseTimeout.close();
 const timerTimeout=instance({evalTimeoutMs:100});timerTimeout.eval('setTimeout(()=>{while(true){}},10)');assert.throws(()=>timerTimeout.advanceTo(20),/timeout/);timerTimeout.close();
 const rafTimeout=instance({evalTimeoutMs:100});rafTimeout.eval('requestAnimationFrame(()=>{while(true){}})');assert.throws(()=>rafTimeout.render(),/timeout/);rafTimeout.close();
 result.contracts='passed';
}else if(mode==='cycles'){
 const groups=[];for(const n of [1,10,100,1000]){const start=performance.now();for(let i=0;i<n;i++){let r=instance();work(r);r.close();}await gc();const p=memory('after '+n+' explicit cycles',a);points.push(p);groups.push({n,elapsedMs:performance.now()-start,lifecycle:clean()});}
 for(let i=0;i<1000;i++){let r=instance();work(r);r=null;if(i%10===9)await gc();}await gc();points.push(memory('after 1000 GC cycles',a));result.groups=groups;result.implicitCycles=1000;
}else if(mode==='long'){
 let r=instance();r.eval('globalThis.n=0;globalThis.box=document.querySelector("#box");null');points.push(memory('one renderer',a,[r]));const count=a.lifecycleStats().engine.created,start=performance.now();
 for(let i=0;i<10000;i++){assert.equal(r.eval('++n'),i+1);r.advanceTo(i);if(i%10===0){r.eval('box.style.width=(16+(n%16))+"px";null');r.render();}if((i+1)%1000===0)points.push(memory('operation '+(i+1),a,[r]));}
 assert.equal(a.lifecycleStats().engine.created,count);assert.equal(r.eval('n'),10000);result.elapsedMs=performance.now()-start;result.operations={eval:10000,seek:10000,render:1000,extraDomEval:1000};result.afterV8Gc=r.stats(true);points.push(memory('after Deno GC',a,[r]));r.close();r=null;await gc();points.push(memory('after close and Node GC',a));
}else if(mode==='simultaneous'){
 for(const n of [1,2,4,8,10,16]){const rs=Array.from({length:n},()=>instance());rs.forEach(work);points.push(memory(n+' live renderers',a,rs));for(const i of [...rs.keys()].filter(i=>i%2===0))rs[i].close();for(const i of [...rs.keys()].filter(i=>i%2===1).reverse())rs[i].close();await gc();clean();}points.push(memory('after all closed',a));
}else{throw Error('unknown mode');}
await gc();result.lifecycle=clean();points.push(memory('final',a));output(result);
