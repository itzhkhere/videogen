// Comparable JS workload; creation/eval wrappers still have different scopes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
const require=createRequire(import.meta.url);
const {HtmlRenderer}=require(process.argv[2] || '../index.js');
const deno=require('./deno-napi-coexist/addon.node');
deno.initPlatform();
const samples=[];
for(let i=0;i<10;i++){
 let t=performance.now();const r=new HtmlRenderer({width:10,height:10,systemFonts:false,scripts:true});r.load('<div></div>');const createLoadMs=performance.now()-t;
 t=performance.now();for(let j=0;j<10000;j++)assert.equal(r.eval('1 + 2'),3);const evalMs=performance.now()-t;
 t=performance.now();assert.equal(Number(r.eval('(()=>{let s=0;for(let i=0;i<100000;i++)s+=i;return s})()')),4999950000);const arithmeticMs=performance.now()-t;
 t=performance.now();r.eval('(()=>{let s=0;for(let i=0;i<10000;i++)s+=Date.now();return s})()');const clockLoopMs=performance.now()-t;
 samples.push({boa:{createLoadMs,evalMs,arithmeticMs,clockLoopMs},deno:JSON.parse(deno.denoBench(10000))});
}
console.log(JSON.stringify({description:'Ten alternating samples, both addons in one Node process, no compilation running; no warmup or benchmark tuning',node:process.version,boaAddon:process.argv[2]||'supplied package addon',samples},null,2));
