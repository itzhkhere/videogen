import assert from 'node:assert/strict';
import fs from 'node:fs';
import {load,html,options,hash,memory,output,gc} from './common.mjs';
const mode=process.argv[2],before=memory('baseline Node');const a=load(),R=a.ExperimentalDenoRenderer;
const points=[before,memory('addon loaded',a)];
function instance(o={}){return new R(html,{...options,...o});}
function work(r){r.eval('globalThis.count=0;const box=document.getElementById("box");box.style.opacity="0.8";null');for(const t of [0,5,10]){r.eval('count++;box.style.width=(16+count)+"px";null');r.seek(t);assert.equal(r.render().length,options.width*options.height*4);}assert.equal(r.eval('count'),3);}
function clean(){const s=a.lifecycleStats();assert.equal(s.openRenderers,0);assert.equal(s.wrongThreadDrops,0);assert.equal(s.engine.created,s.engine.dropped);assert.equal(s.engine.watchdogs,0);assert.equal(s.executionThreads,0);return s;}
let result={mode,points};
if(mode==='contracts'){
 const r=instance({epochMs:12345});
 assert.deepEqual(r.eval('[window===globalThis,Date.now(),performance.now(),new Date().getTime(),new Date(100).getTime()]'),[true,12345,0,12345,100]);
 assert.deepEqual(r.eval('(()=>{const x=document.querySelector("#box");return [x===document.querySelector("#box"),x===document.getElementById("box"),document.querySelectorAll("#box").length,document.querySelector("#missing"),x.style===x.style,x.tagName]})()'),[true,true,1,null,true,'DIV']);
 r.eval('globalThis.saved=document.getElementById("box");saved.textContent="hello";saved.style.width="23px";saved.style.height="19px";saved.style.background="blue";saved.style.opacity="0.5";saved.style.transform="translateX(12px)";null');
 assert.deepEqual(r.eval('[saved===document.querySelector("#box"),saved.textContent,saved.style.width,saved.style.height,saved.style.background,saved.style.opacity,saved.style.transform,getComputedStyle(saved).width,getComputedStyle(saved).opacity]'),[true,'hello','23px','19px','blue','0.5','translateX(12px)','23px','0.5']);
 assert.throws(()=>r.eval('document.querySelector("[")'),/selector/);
 r.eval('globalThis.events=[];Promise.resolve().then(()=>events.push(["micro",Date.now(),performance.now()]));setTimeout(()=>{events.push(["timer",Date.now(),performance.now()]);Promise.resolve().then(()=>events.push(["timerMicro",Date.now(),performance.now()]));},100);setTimeout(()=>events.push(["peer",Date.now(),performance.now()]),100);requestAnimationFrame(t=>events.push(["raf",Date.now(),t]));null');
 assert.deepEqual(r.eval('events'),[['micro',12345,0]]);r.seek(250);
 assert.deepEqual(r.eval('events'),[['micro',12345,0],['timer',12445,100],['timerMicro',12445,100],['peer',12445,100],['raf',12595,250]]);
 assert.equal(r.eval('Date()===new Date().toString()'),true);
 assert.throws(()=>r.seek(249),/monotonic/);assert.throws(()=>r.eval('throw new Error("ordinary")'),/ordinary/);assert.equal(r.eval('6*7'),42);assert.ok(r.jsErrors().some(s=>s.includes('ordinary')));
 r.close();r.close();assert.throws(()=>r.eval('1'),/closed/);
 const timeout=instance({evalTimeoutMs:100});const start=performance.now();assert.throws(()=>timeout.eval('while(true){}'),/timeout/);result.timeoutMs=performance.now()-start;assert.throws(()=>timeout.render(),/poisoned/);timeout.close();
 const promiseTimeout=instance({evalTimeoutMs:100});assert.throws(()=>promiseTimeout.eval('Promise.resolve().then(()=>{while(true){}});null'),/timeout/);promiseTimeout.close();
 result.contracts='passed';
}else if(mode==='cycles'){
 const groups=[];for(const n of [1,10,100,1000]){const start=performance.now();for(let i=0;i<n;i++){let r=instance();work(r);r.close();}await gc();const p=memory('after '+n+' explicit cycles',a);points.push(p);groups.push({n,elapsedMs:performance.now()-start,lifecycle:clean()});}
 for(let i=0;i<1000;i++){let r=instance();work(r);r=null;if(i%10===9)await gc();}await gc();points.push(memory('after 1000 GC cycles',a));result.groups=groups;result.implicitCycles=1000;
}else if(mode==='long'){
 let r=instance();r.eval('globalThis.n=0;globalThis.box=document.querySelector("#box");null');points.push(memory('one renderer',a,[r]));const count=a.lifecycleStats().engine.created,start=performance.now();
 for(let i=0;i<10000;i++){assert.equal(r.eval('++n'),i+1);r.seek(i);if(i%10===0){r.eval('box.style.width=(16+(n%16))+"px";null');r.render();}if((i+1)%1000===0)points.push(memory('operation '+(i+1),a,[r]));}
 assert.equal(a.lifecycleStats().engine.created,count);assert.equal(r.eval('n'),10000);result.elapsedMs=performance.now()-start;result.operations={eval:10000,seek:10000,render:1000,extraDomEval:1000};result.afterV8Gc=r.stats(true);points.push(memory('after Deno GC',a,[r]));r.close();r=null;await gc();points.push(memory('after close and Node GC',a));
}else if(mode==='simultaneous'){
 for(const n of [1,2,4,8,10,16]){const rs=Array.from({length:n},()=>instance());rs.forEach(work);points.push(memory(n+' live renderers',a,rs));for(const i of [...rs.keys()].filter(i=>i%2===0))rs[i].close();for(const i of [...rs.keys()].filter(i=>i%2===1).reverse())rs[i].close();await gc();clean();}points.push(memory('after all closed',a));
}else if(mode==='determinism'){
 const rows=[];for(let fresh=0;fresh<5;fresh++){const r=instance();r.eval('globalThis.b=document.getElementById("box");globalThis.d=document.getElementById("date");setTimeout(()=>b.style.background="blue",500);function f(t){d.textContent=String(Date.now());b.style.width=(16+t/100)+"px";b.style.transform="translateX("+(t/10)+"px)";requestAnimationFrame(f)}requestAnimationFrame(f);null');
 const frames=[];for(const t of [0,250,500,750,1000]){r.seek(t);const raw=r.render();const frame={t,hash:hash(raw),date:r.eval('d.textContent'),now:r.eval('Date.now()'),performance:r.eval('performance.now()')};assert.equal(frame.date,String(t));frames.push(frame);if(fresh===0)fs.writeFileSync(new URL('../evidence/frames/dom-'+t+'.png',import.meta.url),r.render(true));}r.close();if(rows.length)assert.deepEqual(frames,rows[0]);rows.push(frames);}result.freshInstances=rows;assert.equal(new Set(rows[0].map(f=>f.hash)).size,5);
}else if(mode==='gsap'||mode==='gsap-auto'){
 const r=instance();const source=fs.readFileSync(new URL('../../../test/assets/gsap.min.js',import.meta.url),'utf8');r.eval(source+'\nnull');result.version=r.eval('gsap.version');
 r.eval('globalThis.tween=gsap.to("#box",{x:100,opacity:0.5,duration:1,ease:"none",paused:'+String(mode==='gsap')+'});gsap.ticker.lagSmoothing(0);'+(mode==='gsap'?'gsap.ticker.sleep();':'')+'null');
 const frames=[];for(const t of [0,250,500,750,1000]){r.seek(t);if(mode==='gsap')r.eval('tween.totalTime('+t/1000+',false);null');const state=r.eval('(()=>{const b=document.querySelector("#box");return {opacity:b.style.opacity,transform:b.style.transform,computedOpacity:getComputedStyle(b).opacity,computedTransform:getComputedStyle(b).transform,x:gsap.getProperty(b,"x")}})()');assert.ok(Math.abs(Number(state.computedOpacity)-(1-t/2000))<1e-6,JSON.stringify({t,state}));assert.ok(Math.abs(Number(state.x)-t/10)<1e-6,JSON.stringify({t,state}));frames.push({t,state,hash:hash(r.render())});fs.writeFileSync(new URL('../evidence/frames/gsap-'+t+'.png',import.meta.url),r.render(true));}result.frames=frames;result.console=r.eval('__phase2Console');assert.deepEqual(result.console,[]);result.errors=r.jsErrors();r.close();
}else{throw Error('unknown mode');}
await gc();result.lifecycle=clean();points.push(memory('final',a));output(result);
