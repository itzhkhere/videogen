import {Worker} from 'node:worker_threads';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {require,load,html,options,memory,gc,output} from './common.mjs';
const kind=process.argv[2],before=memory('baseline Node');let addon,R;if(kind==='deno'){addon=load();R=addon.ExperimentalDenoRenderer;}else{({HtmlRenderer:R}=loadBoa());}
const font=fs.readFileSync(new URL('../../../test/assets/Inter-Regular.otf',import.meta.url));
function create(){if(kind==='deno')return new R(html,options);const r=new R({...options,scripts:true,systemFonts:false});r.registerFont(font);r.load(html);return r;}
function close(r){if(kind==='deno')r.close();}
const results={},points=[before,memory('addon loaded',addon)];
function measure(name,count,fn){for(let i=0;i<Math.min(count,30);i++)fn(i);const samples=[];for(let run=0;run<5;run++){const t=performance.now();for(let i=0;i<count;i++)fn(i);samples.push((performance.now()-t)/count);}const sorted=[...samples].sort((a,b)=>a-b);results[name]={unit:'ms/op',operationsPerSample:count,samples,median:sorted[2],min:sorted[0],max:sorted[4]};}
const constructors=[],firstEvals=[];for(let i=0;i<30;i++){let t=performance.now();let r=create();constructors.push(performance.now()-t);t=performance.now();assert.equal(r.eval('1+2'),3);firstEvals.push(performance.now()-t);close(r);r=null;await gc();}
function distribution(v){return {unit:'ms/op',samples:v,median:[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)],first:v[0]};}
results.construction=distribution(constructors);results.firstEval=distribution(firstEvals);
let r=create();r.eval('globalThis.b=document.querySelector("#box");globalThis.n=0;null');for(let i=0;i<200;i++)r.eval('1+2');
measure('warmEval',1000,()=>r.eval('1+2'));
const loop='(()=>{let sum=0;for(let i=0;i<100000;i++)sum+=i;return sum})()';for(let i=0;i<30;i++)r.eval(loop);assert.equal(r.eval(loop),4999950000);measure('jsLoop100k',30,()=>r.eval(loop));
measure('dom100Mutations',10,()=>r.eval('(()=>{for(let i=0;i<100;i++){b.style.width=(16+i%16)+"px";b.style.opacity=String(0.5+(i%5)/10);}return b.style.width})()'));
let timeline=0;measure('seek',1000,()=>{if(kind==='deno')r.seek(++timeline);else r.advanceClock(1);});
measure('render',100,()=>r.render());measure('seekAndRender',100,()=>{if(kind==='deno')r.seek(++timeline);else r.advanceClock(1);r.render();});
points.push(memory('one live renderer after benchmark',addon,kind==='deno'?[r]:[]));if(kind==='deno')r.stats(true);close(r);r=null;await gc();points.push(memory('after cleanup',addon));
let rs=Array.from({length:10},()=>create());points.push(memory('10 live renderers',addon,kind==='deno'?rs:[]));rs.forEach(close);rs=null;await gc();points.push(memory('10 renderer cleanup',addon));
output({kind,node:process.version,results,points,notes:{construction:'includes document parsing and Inter registration, Deno constructor or Boa constructor+load',seek:'no pending timers/rAF; monotonic 1ms steps',render:'same mutated document; no callbacks; 160x64 RGBA',dom:'100 inline width/opacity assignments including same JSON-return boundary; no layout in timed script',script:'no timers in timed workloads',workerStartup:'measured separately'}});
